const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { value: '', textContent: '', style: { setProperty() {} }, handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; }, setAttribute() {}, focus() {} });
  return elements.get(id);
}
const store = new Map();
const context = vm.createContext({
  document: { getElementById: element, documentElement: { style: { setProperty() {} } }, addEventListener() {} },
  localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
  requestAnimationFrame() {}, cancelAnimationFrame() {}, ResizeObserver: class { observe() {} }, setInterval() {}, Date,
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
assert.equal(element('readingDeadline').textContent, '→1:23');
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

const reader = element('memoContainer');
reader.scrollTop = 0;
reader.getBoundingClientRect = () => ({left:0,width:390});
const event = (x,y=200) => ({isPrimary:true,button:0,pointerId:1,clientX:x,clientY:y,target:{closest:()=>null}});
vm.runInContext('currentSlideIndex=0',context);
reader.handlers.pointerdown(event(350)); reader.handlers.pointerup(event(350));
assert.equal(vm.runInContext('currentSlideIndex',context),1);
reader.handlers.pointerdown(event(30)); reader.handlers.pointerup(event(30));
assert.equal(vm.runInContext('currentSlideIndex',context),0);
reader.handlers.pointerdown(event(350)); reader.handlers.pointermove(event(350,250)); reader.handlers.pointerup(event(350));
assert.equal(vm.runInContext('currentSlideIndex',context),0);
reader.handlers.pointerdown(event(350)); reader.handlers.pointercancel(); reader.handlers.pointerup(event(350));
assert.equal(vm.runInContext('currentSlideIndex',context),0);
reader.handlers.pointerdown(event(350)); reader.scrollTop=30; reader.handlers.pointerup(event(350));
assert.equal(vm.runInContext('currentSlideIndex',context),0);
vm.runInContext('displayMode="fit";save();displayMode="readable";load()',context);
assert.equal(vm.runInContext('displayMode',context),'fit');
console.log('PASS: left/right taps, drag/cancel/scroll guards, display preference persistence');

vm.runInContext('currentSlideIndex=0;resetTiming();updateTimer()',context);
assert.equal(element('paceStatus').textContent,'開始前');
vm.runInContext('elapsed=70000;updateTimer()',context);
assert.equal(element('paceStatus').textContent,'遅れ+10秒');
assert.equal(element('pageTiming').textContent,'頁+10秒');
vm.runInContext('navigate(1);updateTimer()',context);
assert.equal(element('paceStatus').textContent,'遅れ+10秒');
assert.equal(element('pageTiming').textContent,'頁−23秒');
vm.runInContext('elapsed=98000;updateTimer()',context);
assert.equal(element('paceStatus').textContent,'遅れ+15秒');
assert.equal(element('pageTiming').textContent,'頁+5秒');
assert.equal(element('paceProgress').value,1);
vm.runInContext('navigate(-1);updateTimer()',context);
assert.equal(element('pageTiming').textContent,'頁+10秒');
vm.runInContext('resetTiming();updateTimer()',context);
assert.equal(element('paceStatus').textContent,'開始前');
assert.equal(element('pageTiming').textContent,'頁−60秒');
assert.equal(element('paceProgress').value,0);
vm.runInContext('slides.push({content:"Third",durationSeconds:30});elapsed=70000;navigate(1);elapsed=80000;navigate(1);updateTimer()',context);
assert.equal(element('paceStatus').textContent,'余裕−3秒');
console.log('PASS: carried lateness, page overtime, revisits, reset, and recovery');

vm.runInContext('currentSlideIndex=0;resetTiming();elapsed=50000;navigate(1);updateTimer()',context);
assert.equal(element('paceStatus').textContent,'余裕−10秒');
assert.equal(element('pageTiming').textContent,'頁−23秒');
vm.runInContext('elapsed=73000;updateTimer()',context);
assert.equal(element('paceStatus').textContent,'余裕−10秒');
assert.equal(element('pageTiming').textContent,'頁±0秒');
vm.runInContext('elapsed=83000;updateTimer()',context);
assert.equal(element('paceStatus').textContent,'差±0秒');
assert.equal(element('pageTiming').textContent,'頁+10秒');
vm.runInContext('elapsed=88000;updateTimer()',context);
assert.equal(element('paceStatus').textContent,'遅れ+5秒');
assert.equal(element('pageTiming').textContent,'頁+15秒');
console.log('PASS: signed headroom, exact boundary, and headroom consumed by overtime');
