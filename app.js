// アプリケーションの状態管理
let slides = [{ content: "" }];
let currentSlideIndex = 0;
let stopwatchInterval = null;
let stopwatchTime = 0; // 秒単位
let isRunning = false;
let touchStartX = 0;
let touchEndX = 0;

// DOM要素の取得
const memoContent = document.getElementById("memoContent");
const currentPageEl = document.getElementById("currentPage");
const totalPagesEl = document.getElementById("totalPages");
const stopwatchDisplay = document.getElementById("stopwatchDisplay");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const addSlideBtn = document.getElementById("addSlideBtn");
const deleteSlideBtn = document.getElementById("deleteSlideBtn");
const memoContainer = document.getElementById("memoContainer");
const importBtn = document.getElementById("importBtn");
const importModal = document.getElementById("importModal");
const importTextarea = document.getElementById("importTextarea");
const importConfirmBtn = document.getElementById("importConfirmBtn");
const importCancelBtn = document.getElementById("importCancelBtn");

// 初期化
function init() {
  loadFromStorage();
  updateDisplay();
  updatePageCounter();
  updateDeleteButton();
  attachEventListeners();
}

// localStorageからデータを読み込み
function loadFromStorage() {
  const savedSlides = localStorage.getItem("presentationSlides");
  if (savedSlides) {
    slides = JSON.parse(savedSlides);
  }

  const savedIndex = localStorage.getItem("currentSlideIndex");
  if (savedIndex !== null) {
    currentSlideIndex = parseInt(savedIndex, 10);
  }
}

// localStorageにデータを保存
function saveToStorage() {
  localStorage.setItem("presentationSlides", JSON.stringify(slides));
  localStorage.setItem("currentSlideIndex", currentSlideIndex.toString());
}

// 表示を更新
function updateDisplay() {
  memoContent.textContent = slides[currentSlideIndex].content;
  adjustFontSize();
}

// 文字数に応じてフォントサイズを自動調整
function adjustFontSize() {
  const textLength = memoContent.textContent.length;
  let fontSize;
  
  if (textLength < 50) {
    fontSize = '2.5rem';
  } else if (textLength < 100) {
    fontSize = '2rem';
  } else if (textLength < 200) {
    fontSize = '1.5rem';
  } else if (textLength < 300) {
    fontSize = '1.2rem';
  } else {
    fontSize = '1rem';
  }
  
  memoContent.style.fontSize = fontSize;
}

// ページカウンターを更新
function updatePageCounter() {
  currentPageEl.textContent = currentSlideIndex + 1;
  totalPagesEl.textContent = slides.length;
}

// 削除ボタンの表示/非表示を更新
function updateDeleteButton() {
  if (slides.length > 1) {
    deleteSlideBtn.classList.add("visible");
  } else {
    deleteSlideBtn.classList.remove("visible");
  }
}

// 現在のスライドの内容を保存
function saveCurrentSlide() {
  slides[currentSlideIndex].content = memoContent.textContent;
  saveToStorage();
}

// スライドを追加
function addSlide() {
  saveCurrentSlide();
  slides.push({ content: "" });
  currentSlideIndex = slides.length - 1;
  updateDisplay();
  updatePageCounter();
  updateDeleteButton();
  saveToStorage();
  memoContent.focus();
}

// スライドを削除
function deleteSlide() {
  if (slides.length <= 1) return;

  slides.splice(currentSlideIndex, 1);

  if (currentSlideIndex >= slides.length) {
    currentSlideIndex = slides.length - 1;
  }

  updateDisplay();
  updatePageCounter();
  updateDeleteButton();
  saveToStorage();
}

// 次のスライドへ
function nextSlide() {
  saveCurrentSlide();
  if (currentSlideIndex < slides.length - 1) {
    currentSlideIndex++;
    updateDisplay();
    updatePageCounter();
  }
}

// 前のスライドへ
function prevSlide() {
  saveCurrentSlide();
  if (currentSlideIndex > 0) {
    currentSlideIndex--;
    updateDisplay();
    updatePageCounter();
  }
}

// ストップウォッチの時間をフォーマット
function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

// ストップウォッチを更新
function updateStopwatch() {
  stopwatchDisplay.textContent = formatTime(stopwatchTime);
}

// ストップウォッチをスタート
function startStopwatch() {
  if (!isRunning) {
    isRunning = true;
    stopwatchInterval = setInterval(() => {
      stopwatchTime++;
      updateStopwatch();
    }, 1000);
  }
}

// ストップウォッチを停止
function stopStopwatch() {
  if (isRunning) {
    isRunning = false;
    clearInterval(stopwatchInterval);
  }
}

// ストップウォッチをリセット
function resetStopwatch() {
  stopStopwatch();
  stopwatchTime = 0;
  updateStopwatch();
}

// インポートモーダルを開く
function openImportModal() {
  importModal.classList.add("show");
  importTextarea.value = "";
  importTextarea.focus();
}

// インポートモーダルを閉じる
function closeImportModal() {
  importModal.classList.remove("show");
  importTextarea.value = "";
}

// メモをインポート
function importMemos() {
  const text = importTextarea.value.trim();
  
  if (!text) {
    closeImportModal();
    return;
  }
  
  // 空行（改行2つ以上）で分割
  const newSlides = text
    .split(/\n\s*\n/)
    .map(content => content.trim())
    .filter(content => content.length > 0)
    .map(content => ({ content }));
  
  if (newSlides.length === 0) {
    closeImportModal();
    return;
  }
  
  // 現在のスライドを保存してから置き換え
  slides = newSlides;
  currentSlideIndex = 0;
  
  updateDisplay();
  updatePageCounter();
  updateDeleteButton();
  saveToStorage();
  
  closeImportModal();
}


// イベントリスナーを設定
function attachEventListeners() {
  // メモの内容が変更されたら保存 & フォントサイズ調整
  memoContent.addEventListener("input", () => {
    saveCurrentSlide();
    adjustFontSize();
  });

  // ストップウォッチコントロール
  startBtn.addEventListener("click", startStopwatch);
  stopBtn.addEventListener("click", stopStopwatch);
  resetBtn.addEventListener("click", resetStopwatch);

  // スライド追加
  addSlideBtn.addEventListener("click", addSlide);

  // スライド削除
  deleteSlideBtn.addEventListener("click", deleteSlide);

  // インポートモーダル
  importBtn.addEventListener("click", openImportModal);
  importConfirmBtn.addEventListener("click", importMemos);
  importCancelBtn.addEventListener("click", closeImportModal);
  
  // モーダル外クリックで閉じる
  importModal.addEventListener("click", (e) => {
    if (e.target === importModal) {
      closeImportModal();
    }
  });

  // タップで次のスライドへ（メモエリア以外）
  document.body.addEventListener("click", (e) => {
    const isInMemoArea = memoContainer.contains(e.target);
    const isStopwatch = e.target.closest(".stopwatch-container");
    const isPageCounter = e.target.closest(".page-counter");
    const isAddBtn = e.target.closest(".add-slide-btn");
    const isDeleteBtn = e.target.closest(".delete-slide-btn");
    
    if (!isInMemoArea && !isStopwatch && !isPageCounter && !isAddBtn && !isDeleteBtn) {
      nextSlide();
    }
  });

  // スワイプジェスチャー（タッチデバイス）
  document.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    },
    { passive: true }
  );

  // マウスホイール/トラックパッドでのスクロール
  let scrollTimeout;
  document.addEventListener(
    "wheel",
    (e) => {
      // メモエリア内でのスクロールは除外
      if (memoContainer.contains(e.target)) return;

      e.preventDefault();

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (e.deltaX > 30) {
          nextSlide();
        } else if (e.deltaX < -30) {
          prevSlide();
        }
      }, 50);
    },
    { passive: false }
  );

  // キーボードショートカット
  document.addEventListener("keydown", (e) => {
    // メモ編集中は除外
    if (document.activeElement === memoContent) return;

    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      nextSlide();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prevSlide();
    }
  });
}

// スワイプ処理
function handleSwipe() {
  const swipeThreshold = 50;
  const diff = touchStartX - touchEndX;

  if (Math.abs(diff) > swipeThreshold) {
    if (diff > 0) {
      // 左スワイプ → 次へ
      nextSlide();
    } else {
      // 右スワイプ → 前へ
      prevSlide();
    }
  }
}

// アプリケーション初期化
init();
