/**
 * 食堂残数管理システム v2.0
 * - 効果音対応
 * - Undo機能
 * - 設定データ駆動
 * - addEventListener化
 */

// ===== 定数 =====
const DEFAULT_COUNT = 20;
const LOW_STOCK_THRESHOLD = 3;
const UNDO_STACK_MAX = 30;

// ===== メニュー定義（ここを変えればメニュー追加・変更可能） =====
const MENU_CONFIG = [
    { key: 'a', label: 'A定食',     shortcut: 'a' },
    { key: 'b', label: 'B定食',     shortcut: 's' },
    { key: 'n', label: '麺類',      shortcut: 'd' },
    { key: 'c', label: 'カレーライス', shortcut: 'f' },
];

// ===== 状態 =====
let menuState = {};
let undoStack = [];

// 初期状態を構築
MENU_CONFIG.forEach(m => {
    menuState[m.key] = {
        count: DEFAULT_COUNT,
        initialCount: DEFAULT_COUNT,
    };
});

// ===== 効果音 =====
const sounds = {};
const SOUND_FILES = {
    tapDown: 'sounds/tap_down.wav',
    tapUp: 'sounds/tap_up.wav',
    warning: 'sounds/warning.wav',
    soldout: 'sounds/soldout.wav',
    reset: 'sounds/reset.wav',
};

function preloadSounds() {
    Object.entries(SOUND_FILES).forEach(([name, src]) => {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.volume = 0.5;
        sounds[name] = audio;
    });
}

function playSound(name) {
    const audio = sounds[name];
    if (!audio) return;
    // 即座に再生するため、currentTimeをリセット
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

// ===== LocalStorage =====
function loadState() {
    const saved = localStorage.getItem('menuState_v2');
    if (!saved) return;
    try {
        const parsed = JSON.parse(saved);
        for (const key in parsed) {
            if (menuState[key]) {
                menuState[key] = { ...menuState[key], ...parsed[key] };
            }
        }
    } catch (e) {
        console.error('Failed to parse saved state', e);
    }
}

function saveState() {
    localStorage.setItem('menuState_v2', JSON.stringify(menuState));
}

// ===== DOM構築 =====
function buildDashboard() {
    const dashboard = document.getElementById('dashboard');
    const settingsForm = document.getElementById('settings-form');

    MENU_CONFIG.forEach(m => {
        // カード
        const card = document.createElement('div');
        card.id = `card-${m.key}`;
        card.className = 'menu-card';
        card.innerHTML = `
            <h2 class="menu-label">${m.label}</h2>
            <div class="count-window">
                <div id="count-${m.key}" class="count-strip">${menuState[m.key].count}</div>
            </div>
            <button class="add-button" data-key="${m.key}">＋</button>
        `;
        card.addEventListener('click', (e) => {
            // ＋ボタンクリックは別処理
            if (e.target.closest('.add-button')) return;
            handleUpdate(m.key, 'down');
        });
        dashboard.appendChild(card);

        // 設定フォーム
        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `
            <label>${m.label}</label>
            <input type="number" id="setting-${m.key}" min="0" />
        `;
        settingsForm.appendChild(group);
    });

    // ＋ボタンのイベント（イベント委譲）
    dashboard.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-button');
        if (btn) {
            e.stopPropagation();
            handleUpdate(btn.dataset.key, 'up');
        }
    });
}

// ===== Undo機能 =====
function pushUndo(key, prevCount) {
    undoStack.push({ key, prevCount, timestamp: Date.now() });
    if (undoStack.length > UNDO_STACK_MAX) {
        undoStack.shift();
    }
    updateUndoButton();
}

function performUndo() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    const item = menuState[action.key];
    item.count = action.prevCount;
    triggerSlotAnimation(action.key, item.count, 'up');
    updateCardStyle(action.key);
    saveState();
    updateUndoButton();
    playSound('tapUp');
}

function updateUndoButton() {
    const btn = document.getElementById('undo-btn');
    btn.disabled = undoStack.length === 0;
}

// ===== 更新処理 =====
function handleUpdate(key, direction) {
    const item = menuState[key];
    const prevCount = item.count;

    if (direction === 'up') {
        item.count++;
        pushUndo(key, prevCount);
        triggerSlotAnimation(key, item.count, 'up');
        playSound('tapUp');
    } else if (direction === 'down' && item.count > 0) {
        item.count--;
        pushUndo(key, prevCount);
        triggerSlotAnimation(key, item.count, 'down');

        // 効果音の選択
        if (item.count === 0) {
            playSound('soldout');
        } else if (item.count <= LOW_STOCK_THRESHOLD) {
            playSound('warning');
        } else {
            playSound('tapDown');
        }
    } else {
        return;
    }

    updateCardStyle(key);
    animatePress(`card-${key}`);
    saveState();
}

// ===== 表示アニメーション =====
function triggerSlotAnimation(key, newValue, direction) {
    const container = document.getElementById(`count-${key}`);
    container.innerHTML = '';

    const el = document.createElement('div');

    if (newValue === 0) {
        el.innerText = '完売御礼';
        el.classList.add('sold-out-text');
    } else {
        el.innerText = newValue;
    }

    el.classList.add(direction === 'down' ? 'slide-down' : 'slide-up');
    container.appendChild(el);
}

// ===== 警告スタイル =====
function updateCardStyle(key) {
    const item = menuState[key];
    const card = document.getElementById(`card-${key}`);
    card.classList.toggle('low-stock', item.count <= LOW_STOCK_THRESHOLD);
}

// ===== 押下フィードバック =====
function animatePress(cardId) {
    const card = document.getElementById(cardId);
    card.classList.add('active-press');
    setTimeout(() => card.classList.remove('active-press'), 100);
}

// ===== キーボード操作 =====
const shortcutMap = {};
MENU_CONFIG.forEach(m => {
    shortcutMap[m.shortcut] = m.key;
});

document.addEventListener('keydown', (e) => {
    // モーダルが開いている場合はショートカット無効
    if (document.getElementById('settings-modal').classList.contains('show')) return;

    const pressed = e.key.toLowerCase();
    if (shortcutMap[pressed]) {
        const direction = e.shiftKey ? 'up' : 'down';
        handleUpdate(shortcutMap[pressed], direction);
    }
    // Ctrl+Z で Undo
    if ((e.ctrlKey || e.metaKey) && pressed === 'z') {
        e.preventDefault();
        performUndo();
    }
});

// ===== 設定モーダル =====
const modal = document.getElementById('settings-modal');

function openSettings() {
    MENU_CONFIG.forEach(m => {
        document.getElementById(`setting-${m.key}`).value = menuState[m.key].initialCount;
    });
    modal.classList.add('show');
}

function closeSettings() {
    modal.classList.remove('show');
}

function saveSettings() {
    MENU_CONFIG.forEach(m => {
        const val = parseInt(document.getElementById(`setting-${m.key}`).value, 10);
        if (!isNaN(val) && val >= 0) {
            menuState[m.key].initialCount = val;
            menuState[m.key].count = val;
        }
    });

    undoStack = [];
    updateUndoButton();
    saveState();
    closeSettings();

    MENU_CONFIG.forEach(m => {
        triggerSlotAnimation(m.key, menuState[m.key].count, 'up');
        updateCardStyle(m.key);
    });

    playSound('reset');
}

// ===== イベントリスナー =====
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('btn-cancel').addEventListener('click', closeSettings);
document.getElementById('btn-save').addEventListener('click', saveSettings);
document.getElementById('undo-btn').addEventListener('click', performUndo);

window.addEventListener('click', (e) => {
    if (e.target === modal) closeSettings();
});

// ===== 初期化 =====
window.addEventListener('load', () => {
    preloadSounds();
    buildDashboard();
    loadState();

    MENU_CONFIG.forEach(m => {
        triggerSlotAnimation(m.key, menuState[m.key].count, 'up');
        updateCardStyle(m.key);
    });
});
