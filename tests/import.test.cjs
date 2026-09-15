const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { value: '', textContent: '', style: { setProperty() {} }, addEventListener() {}, focus() {} });
  return elements.get(id);
}
const store = new Map();
const context = vm.createContext({
  document: { getElementById: element, documentElement: { style: { setProperty() {} } }, addEventListener() {} },
  localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
  requestAnimationFrame() {}, ResizeObserver: class { observe() {} }, setInterval() {}, Date,
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
const parse = (text) => JSON.parse(JSON.stringify(context.parseImport(text)));
const valid = '【Campe原稿 v1】\n\n【スライド 1｜60秒】\n一段落目。\n\n二段落目。\n\n【スライド 2｜23秒】\n次の原稿。';
const expected = [{ content: '一段落目。\n\n二段落目。', durationSeconds: 60 }, { content: '次の原稿。', durationSeconds: 23 }];
assert.deepEqual(parse(valid), expected);
assert.deepEqual(parse(valid.replaceAll('\n', '\r\n')), expected);
assert.deepEqual(parse('普通の原稿\n\n次の原稿'), [{content:'普通の原稿'}, {content:'次の原稿'}]);
for (const text of [valid.replace('2｜', '3｜'), valid.replace('23秒', '0秒'), valid.replace('v1', 'v2'), '【Campe原稿 v1】\n\n【スライド 1｜23秒】', valid.replace('23秒','999999秒')]) assert.throws(() => parse(text));
context.input = valid;
vm.runInContext('slides = parseImport(input); currentSlideIndex=1;render();save();load();render()',context);
assert.equal(element('readingDeadline').textContent, '開始から1分23秒までに読み切る');
assert.equal(element('memoContent').textContent, '次の原稿。');
if (process.argv[2]) {
  const imported = parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(imported.length, 10);
  assert.deepEqual(imported.map(s=>s.durationSeconds), [24,19,5,31,48,33,42,2,33,23]);
  assert.equal(imported.reduce((sum,s)=>sum+s.durationSeconds,0),260);
  assert.ok(imported[0].content.includes('\n\n'));
  assert.ok(!imported.some(s=>s.content.includes('【進行目安')));
}
console.log('PASS: text import, paragraph preservation, timing, validation, legacy text, persistence, supplied deck');
