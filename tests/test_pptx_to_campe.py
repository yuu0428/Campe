import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('converter', Path(__file__).resolve().parents[1] / 'scripts/pptx_to_campe.py')
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class NotesTests(unittest.TestCase):
    def test_duration_and_paragraphs(self):
        note = 'このスライド：23秒\n\n一段落目。\n\n二段落目。'
        self.assertEqual(converter.parse_note(note, 60), {'content': '一段落目。\n\n二段落目。', 'durationSeconds': 23})

    def test_colon_and_japanese_time(self):
        for time_range in ['1:00〜1:23', '1分00秒〜1分23秒', '１：００～１：２３']:
            self.assertEqual(converter.parse_note(time_range + '\n本文', 60)['durationSeconds'], 23)

    def test_end_only(self):
        self.assertEqual(converter.parse_note('1分23秒までに読み切る。\n原稿', 60)['durationSeconds'], 23)

    def test_no_guesses(self):
        for note in ['原稿しかありません', 'このスライド：0秒\n原稿', '1:60〜2:00\n原稿', '1:00〜1:23\nこのスライド：99秒\n原稿', 'このスライド：23秒\n']:
            with self.subTest(note=note), self.assertRaises(ValueError):
                converter.parse_note(note, 60)

    def test_speech_numbers_untouched(self):
        result = converter.parse_note('このスライド：23秒\n1回10分の作業が30秒になりました。', 0)
        self.assertEqual(result['content'], '1回10分の作業が30秒になりました。')

    def test_gaps_rejected(self):
        with self.assertRaises(ValueError):
            converter.parse_note('1:10〜1:23\n原稿', 60)

    def test_readable_format(self):
        self.assertEqual(converter.format_text({'slides': [{'content': '本文\n\n続き', 'durationSeconds': 23}]}), '【Campe原稿 v1】\n\n【スライド 1｜23秒】\n本文\n\n続き\n')


if __name__ == '__main__':
    unittest.main()
