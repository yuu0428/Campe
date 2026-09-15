#!/usr/bin/env python3
"""Extract existing speaker notes and timings without rewriting the speech."""
import argparse
import posixpath
import re
import sys
import unicodedata
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

NS = {'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
TIME = r'(?:\d+\s*:\s*\d{2}|\d+\s*分(?:\s*\d+\s*秒)?|\d+\s*秒)'
RANGE = re.compile(rf'^(?:【?(?:進行目安|目安|時間)】?\s*[:：]?\s*)?({TIME})\s*[〜～~–—−\-]\s*({TIME})(.*)$')
DURATION = re.compile(rf'^(?:この(?:スライド|ページ)|所要時間|読む時間|読み上げ時間|持ち時間)\s*[:：]\s*(?:約\s*)?({TIME})\s*[。.]?$')
DEADLINE = re.compile(rf'^(?:発表開始から\s*)?({TIME})\s*までに(?:次のスライドへ|読み切る|読み終える|発表を終える)[。.]?$')


def seconds(text):
    text = re.sub(r'\s', '', text)
    if ':' in text:
        minute, second = map(int, text.split(':'))
        if second >= 60:
            raise ValueError('時刻の秒は60未満にしてください')
        return minute * 60 + second
    match = re.fullmatch(r'(?:(\d+)分)?(?:(\d+)秒)?', text)
    if not match or not any(match.groups()):
        raise ValueError(f'時間を解釈できません: {text}')
    return int(match[1] or 0) * 60 + int(match[2] or 0)


def parse_note(note, previous_end):
    """Only remove recognized timing lines at the beginning of the notes."""
    lines = note.split('\n')
    starts, ends, durations = [], [], []
    body_start = 0
    for index, raw in enumerate(lines):
        line = unicodedata.normalize('NFKC', raw).strip()
        if not line:
            body_start = index + 1
            continue
        if line.startswith('【進行目安') and line.endswith('】'):
            body_start = index + 1
            continue
        match = RANGE.fullmatch(line)
        if match:
            start, end = seconds(match[1]), seconds(match[2])
            suffix = match[3].strip()
            if suffix and not re.fullmatch(r'[（(]この(?:スライド|ページ):\s*約?\s*' + TIME + r'(?:・切り替えの間を含む)?[）)]', suffix):
                raise ValueError(f'時間行の形式を確認してください: {raw}')
            starts.append(start)
            ends.append(end)
            durations.append(end - start)
            if suffix:
                duration = re.search(r':\s*約?\s*(' + TIME + ')', suffix)
                durations.append(seconds(duration[1]))
        elif (match := DURATION.fullmatch(line)):
            durations.append(seconds(match[1]))
        elif (match := DEADLINE.fullmatch(line)):
            ends.append(seconds(match[1]))
        else:
            break
        body_start = index + 1
    content = '\n'.join(lines[body_start:]).strip('\n')
    if not content.strip():
        raise ValueError('発表原稿がありません')
    if starts and any(start != previous_end for start in starts):
        raise ValueError('開始時刻が前ページの終了時刻と一致しません')
    if ends:
        durations.extend(end - previous_end for end in ends)
    if not durations:
        raise ValueError('冒頭の秒数を読み取れません。例「このスライド：23秒」または「0:24〜0:43」')
    if len(set(durations)) != 1 or not 1 <= durations[0] <= 86400:
        raise ValueError('所要時間と終了時刻が矛盾しているか、秒数が範囲外です')
    return {'content': content, 'durationSeconds': durations[0]}


def relationships(archive, part):
    folder, name = posixpath.split(part)
    relpart = posixpath.join(folder, '_rels', name + '.rels')
    if relpart not in archive.namelist():
        return {}
    result = {}
    for rel in ET.fromstring(archive.read(relpart)):
        if rel.get('TargetMode') == 'External':
            continue
        target = rel.get('Target', '')
        resolved = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(folder, target))
        result[rel.get('Id')] = (rel.get('Type', ''), resolved)
    return result


def note_text(archive, part):
    root = ET.fromstring(archive.read(part))
    paragraphs = []
    for shape in root.findall('.//p:sp', NS):
        placeholder = shape.find('.//p:ph', NS)
        if placeholder is not None and placeholder.get('type') != 'body':
            continue
        for paragraph in shape.findall('./p:txBody/a:p', NS):
            fragments = []
            for node in paragraph.iter():
                if node.tag == '{' + NS['a'] + '}t':
                    fragments.append(node.text or '')
                elif node.tag == '{' + NS['a'] + '}br':
                    fragments.append('\n')
            paragraphs.append(''.join(fragments))
    return '\n'.join(paragraphs)


def convert(path):
    slides, problems = [], []
    previous_end = 0
    with ZipFile(path) as archive:
        if sum(info.file_size for info in archive.infolist()) > 500_000_000:
            raise ValueError('展開後のサイズが大きすぎます')
        presentation = 'ppt/presentation.xml'
        rels = relationships(archive, presentation)
        order = ET.fromstring(archive.read(presentation)).findall('./p:sldIdLst/p:sldId', NS)
        if not order:
            raise ValueError('スライドがありません')
        for number, slide in enumerate(order, 1):
            try:
                slide_part = rels[slide.get('{' + NS['r'] + '}id')][1]
                notes = [target for kind, target in relationships(archive, slide_part).values() if kind.endswith('/notesSlide')]
                if len(notes) != 1:
                    raise ValueError('発表者ノートが見つかりません')
                result = parse_note(note_text(archive, notes[0]), previous_end)
                slides.append(result)
                previous_end += result['durationSeconds']
            except (ValueError, KeyError) as error:
                problems.append(f'{number}ページ目: {error}')
    if problems:
        raise ValueError('\n'.join(problems))
    return {'format': 'campe-notes', 'version': 1, 'slides': slides}


def format_text(result):
    blocks = ["【Campe原稿 v1】"]
    for number, slide in enumerate(result["slides"], 1):
        if re.search(r"^【スライド .*】$", slide["content"], re.MULTILINE):
            raise ValueError("原稿に区切り行と同じ形式の行が含まれています")
        blocks.append(f"【スライド {number}｜{slide['durationSeconds']}秒】\n{slide['content']}")
    return "\n\n".join(blocks) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pptx', type=Path)
    parser.add_argument('-o', '--output', type=Path)
    args = parser.parse_args()
    try:
        result = convert(args.pptx)
        text = format_text(result)
        if args.output:
            args.output.write_text(text, encoding='utf-8')
            print(f"{len(result['slides'])}ページ / {sum(s['durationSeconds'] for s in result['slides'])}秒 → {args.output}")
        else:
            print(text, end='')
    except (ValueError, KeyError, OSError, BadZipFile, ET.ParseError) as error:
        print(f'変換できませんでした。原稿や秒数は推測していません。\n{error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
