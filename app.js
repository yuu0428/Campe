"use strict";

const $ = (id) => document.getElementById(id);
const reader = $("memoContainer");
const editDialog = $("editDialog");
const importDialog = $("importDialog");
let slides = [{ content: "" }];
let currentSlideIndex = 0;
let fontSize = 28;
let elapsed = 0;
let startedAt = null;
let pointerStart = null;
let storageFailed = false;

function report(message) {
  $("status").textContent = message;
  $("status").hidden = !message;
}

function load() {
  try {
    const saved = localStorage.getItem("presentationSlides");
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.length === 0 ||
          !parsed.every((slide) => slide && typeof slide.content === "string")) {
        throw new Error("Invalid saved slides");
      }
      slides = parsed.map(({ content, durationSeconds }) => ({
        content,
        durationSeconds: Number.isInteger(durationSeconds) && durationSeconds >= 1 && durationSeconds <= 86400 ? durationSeconds : null,
      }));
    }
    const index = Number(localStorage.getItem("currentSlideIndex"));
    currentSlideIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, slides.length - 1)) : 0;
    const size = Number(localStorage.getItem("campeFontSize"));
    if (Number.isFinite(size) && size >= 20 && size <= 48) fontSize = size;
  } catch {
    report("保存済みの原稿を読み込めませんでした。元の保存データはまだ変更していません。");
  }
}

function save() {
  try {
    localStorage.setItem("presentationSlides", JSON.stringify(slides));
    localStorage.setItem("currentSlideIndex", String(currentSlideIndex));
    localStorage.setItem("campeFontSize", String(fontSize));
    if (storageFailed) report("");
    storageFailed = false;
  } catch {
    storageFailed = true;
    report("端末に保存できません。画面を閉じる前に原稿をコピーしてください。");
  }
}

function updateScrollHint() {
  $("scrollHint").hidden = reader.scrollHeight <= reader.clientHeight + reader.scrollTop + 8;
}

function readingSeconds(slide) {
  return slide.durationSeconds ?? Math.ceil(Array.from(slide.content.replace(/\s/g, "")).length / 5);
}

function formatTarget(seconds) {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}分${seconds % 60}秒` : `${seconds}秒`;
}

function updateReadingTarget() {
  const duration = readingSeconds(slides[currentSlideIndex]);
  const target = slides.slice(0, currentSlideIndex + 1).reduce((sum, slide) => sum + readingSeconds(slide), 0);
  $("readingDuration").textContent = `このページ：${duration}秒${slides[currentSlideIndex].durationSeconds == null ? "（目安）" : ""}`;
  $("readingDeadline").textContent = `開始から${formatTarget(target)}までに読み切る`;
}

function render() {
  updateReadingTarget();
  $("memoContent").textContent = slides[currentSlideIndex].content;
  $("emptyState").hidden = slides[currentSlideIndex].content.length > 0;
  $("currentPage").textContent = String(currentSlideIndex + 1);
  $("totalPages").textContent = String(slides.length);
  $("pageLabel").textContent = `${currentSlideIndex + 1} / ${slides.length}`;
  $("prevBtn").disabled = currentSlideIndex === 0;
  $("nextBtn").disabled = currentSlideIndex === slides.length - 1;
  document.documentElement.style.setProperty("--memo-size", `${fontSize}px`);
  $("smallerBtn").disabled = fontSize <= 20;
  $("largerBtn").disabled = fontSize >= 48;
  reader.scrollTop = 0;
  requestAnimationFrame(updateScrollHint);
}

function navigate(direction) {
  if (editDialog.open || importDialog.open) return;
  const next = currentSlideIndex + direction;
  if (next < 0 || next >= slides.length) return;
  currentSlideIndex = next;
  render();
  save();
}

function prepareEditor() {
  $("editTitle").textContent = `${currentSlideIndex + 1}ページ目を編集`;
  $("editTextarea").value = slides[currentSlideIndex].content;
  $("durationInput").value = slides[currentSlideIndex].durationSeconds ?? "";
  $("durationInput").setCustomValidity("");
  $("deleteSlideBtn").disabled = slides.length <= 1;
}

function openEditor() {
  prepareEditor();
  editDialog.showModal();
  $("editTextarea").focus();
}

$("editBtn").addEventListener("click", openEditor);
$("emptyEditBtn").addEventListener("click", openEditor);
$("editTextarea").addEventListener("input", () => {
  slides[currentSlideIndex].content = $("editTextarea").value;
  save();
});
$("durationInput").addEventListener("input", () => {
  const input = $("durationInput");
  input.setCustomValidity("");
  if (input.validity.badInput) return;
  const value = input.value === "" ? null : Number(input.value);
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 86400)) {
    input.setCustomValidity("1〜86400の整数を入力してください。");
    return;
  }
  slides[currentSlideIndex].durationSeconds = value;
  updateReadingTarget();
  save();
});
editDialog.addEventListener("close", render);
$("addSlideBtn").addEventListener("click", () => {
  slides.splice(currentSlideIndex + 1, 0, { content: "" });
  currentSlideIndex++;
  save();
  prepareEditor();
  $("editTextarea").focus();
});
$("deleteSlideBtn").addEventListener("click", () => {
  if (slides.length <= 1) return;
  if (slides[currentSlideIndex].content && !confirm("このページの原稿を削除しますか？")) return;
  slides.splice(currentSlideIndex, 1);
  currentSlideIndex = Math.min(currentSlideIndex, slides.length - 1);
  save();
  prepareEditor();
});

function parseImport(text) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized.startsWith("【Campe原稿")) {
    return normalized.split(/\n[\t \u3000]*\n(?:[\t \u3000]*\n)*/).map((content) => ({ content: content.trim() })).filter(({ content }) => content);
  }
  const lines = normalized.split("\n");
  if (lines.shift() !== "【Campe原稿 v1】") throw new Error("対応していないCampe原稿の形式です。");
  const result = [];
  let current = null;
  for (const line of lines) {
    const match = /^【スライド ([1-9]\d*)｜([1-9]\d*)秒】$/.exec(line);
    if (match) {
      if (Number(match[1]) !== result.length + 1 || Number(match[2]) > 86400) throw new Error("スライド番号または秒数が不正です。");
      current = { content: "", durationSeconds: Number(match[2]) };
      result.push(current);
    } else if (/^【スライド/.test(line)) {
      throw new Error("スライドの区切り行を確認してください。");
    } else if (current) {
      current.content += line + "\n";
    } else if (line.trim()) {
      throw new Error("最初のスライドの区切りがありません。");
    }
  }
  if (!result.length || result.some((slide) => !slide.content.trim())) throw new Error("原稿が空のスライドがあります。");
  return result.map((slide) => ({ ...slide, content: slide.content.replace(/^\n+|\n+$/g, "") }));
}

function openImport() {
  $("importError").hidden = true;
  $("importTextarea").value = "";
  importDialog.showModal();
  $("importTextarea").focus();
}
$("importBtn").addEventListener("click", openImport);
$("emptyImportBtn").addEventListener("click", openImport);
$("importConfirmBtn").addEventListener("click", () => {
  const text = $("importTextarea").value.replace(/\r\n?/g, "\n").trim();
  if (!text) { $("importTextarea").focus(); return; }
  let imported;
  try { imported = parseImport(text); } catch (error) {
    $("importError").textContent = error.message;
    $("importError").hidden = false;
    return;
  }
  if (slides.some(({ content }) => content.trim()) && !confirm("現在の全ページを、入力した原稿に置き換えますか？")) return;
  slides = imported;
  currentSlideIndex = 0;
  save();
  render();
  importDialog.close();
});

$("prevBtn").addEventListener("click", () => navigate(-1));
$("nextBtn").addEventListener("click", () => navigate(1));
for (const [id, delta] of [["smallerBtn", -2], ["largerBtn", 2]]) {
  $(id).addEventListener("click", () => {
    fontSize = Math.max(20, Math.min(48, fontSize + delta));
    const scrollTop = reader.scrollTop;
    render();
    reader.scrollTop = scrollTop;
    save();
  });
}
reader.addEventListener("scroll", updateScrollHint, { passive: true });
new ResizeObserver(updateScrollHint).observe(reader);
reader.addEventListener("pointerdown", (event) => {
  pointerStart = event.isPrimary && event.pointerType === "touch" ? { x: event.clientX, y: event.clientY } : null;
});
reader.addEventListener("pointercancel", () => { pointerStart = null; });
reader.addEventListener("pointerup", (event) => {
  if (!pointerStart) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.abs(dx) > 70 && Math.abs(dy) < 35) navigate(dx < 0 ? 1 : -1);
});
document.addEventListener("keydown", (event) => {
  if (editDialog.open || importDialog.open || event.isComposing || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest("button, textarea, input, select, [contenteditable=true]")) return;
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault();
    navigate(event.key === "ArrowRight" ? 1 : -1);
  }
});

function updateTimer() {
  const seconds = Math.floor((elapsed + (startedAt === null ? 0 : Date.now() - startedAt)) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const parts = [minutes, seconds % 60].map((part) => String(part).padStart(2, "0"));
  if (hours > 0) parts.unshift(String(hours).padStart(2, "0"));
  $("stopwatchDisplay").textContent = parts.join(":");
  $("startBtn").textContent = startedAt === null ? (elapsed > 0 ? "再開" : "開始") : "一時停止";
}
$("startBtn").addEventListener("click", () => {
  if (startedAt === null) startedAt = Date.now();
  else { elapsed += Date.now() - startedAt; startedAt = null; }
  updateTimer();
});
$("resetBtn").addEventListener("click", () => {
  if ((startedAt !== null || elapsed > 0) && !confirm("経過時間をリセットしますか？")) return;
  elapsed = 0;
  startedAt = null;
  updateTimer();
});
setInterval(updateTimer, 250);
document.addEventListener("visibilitychange", updateTimer);
load();
render();
updateTimer();
