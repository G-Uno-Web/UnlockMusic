/**
 * 主界面逻辑：文件管理、Worker 调度、结果展示与下载
 */
/* global createZip */

const $ = (sel) => document.querySelector(sel);

// ---------- 支持格式展示 ----------
const FORMAT_GROUPS = [
  { name: 'QQ音乐', icon: '🐧', exts: '.qmc0 .qmc2 .qmc3 .qmc4 .qmc6 .qmc8 .qmcflac .qmcogg .tkm .cache .tm0 .tm2 .tm3 .tm6' },
  { name: 'QQ音乐（新版/桌面端）', icon: '🎵', exts: '.mflac .mflac0 .mgg .mgg0 .mgg1 .mggl .mmp4' },
  { name: 'Moo 音乐', icon: '🎧', exts: '.bkcmp3 .bkcm4a .bkcflac .bkcwav .bkcape .bkcogg .bkcwma' },
  { name: '网易云音乐', icon: '☁️', exts: '.ncm（含缓存 .uc）' },
  { name: '酷狗音乐', icon: '🐕', exts: '.kgm .kgma .vpr' },
  { name: '酷我音乐', icon: '🎤', exts: '.kwm' },
  { name: '虾米音乐', icon: '🦐', exts: '.xm' },
  { name: '咪咕音乐', icon: '🐱', exts: '.mg3d' },
  { name: '喜马拉雅', icon: '📻', exts: '.x2m .x3m' },
  { name: '微云导出', icon: '💾', exts: '.666c6163 .6d7033 .6f6767 .6d3461 .776176（十六进制后缀）' },
  { name: '原始格式（直通补标签）', icon: '📂', exts: '.mp3 .flac .wav .m4a .ogg' },
];

const ALL_CHIPS = [
  'ncm', 'qmc0', 'qmcflac', 'qmcogg', 'mflac', 'mgg', 'mflac0', 'mgg1',
  'kgm', 'vpr', 'kwm', 'xm', 'bkcmp3', 'tm0', 'cache', 'uc', 'mg3d',
  'x2m', 'x3m', 'mp3', 'flac',
];

function initFormatDisplay() {
  const chips = $('#formatChips');
  chips.innerHTML = ALL_CHIPS.map((c) => `<span class="chip">.${c}</span>`).join('');
  const groups = $('#formatGroups');
  groups.innerHTML = FORMAT_GROUPS.map(
    (g) => `
    <div class="format-group">
      <h3><span>${g.icon}</span>${g.name}</h3>
      <p>${g.exts}</p>
    </div>`
  ).join('');
}

// ---------- 状态 ----------
let fileSeq = 0;
const files = new Map(); // id -> {id, name, size, status, progress, error, result, blob, url, coverUrl}

// ---------- Worker 池 ----------
class WorkerPool {
  constructor(size) {
    this.workers = [];
    this.queue = [];
    this.busy = new Set();
    for (let i = 0; i < size; i++) {
      const w = new Worker('js/worker.js');
      w.onmessage = (e) => this.onMessage(e.data, w);
      w.onerror = (e) => console.error('worker error', e.message);
      this.workers.push(w);
    }
  }
  submit(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.dispatch();
    });
  }
  dispatch() {
    if (!this.queue.length) return;
    const free = this.workers.find((w) => !this.busy.has(w));
    if (!free) return;
    const { task, resolve, reject } = this.queue.shift();
    this.busy.add(free);
    free._current = { resolve, reject, id: task.id, onProgress: task.onProgress };
    free.postMessage(
      { type: 'decrypt', id: task.id, name: task.name, buffer: task.buffer, fetchCover: task.fetchCover },
      [task.buffer]
    );
  }
  onMessage(msg, worker) {
    const current = worker._current;
    if (!current || msg.id !== current.id) return;
    if (msg.type === 'progress') {
      if (current.onProgress) current.onProgress(msg);
      return;
    }
    this.busy.delete(worker);
    worker._current = null;
    if (msg.type === 'result') current.resolve(msg);
    else if (msg.type === 'error') current.reject(new Error(msg.message));
    this.dispatch();
  }
}

const POOL_SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
let pool = null;

// ---------- UI ----------
function toast(message, type = 'info', duration = 3200) {
  const container = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

function outputName(entry) {
  const r = entry.result;
  if (!r) return entry.name;
  const artist = (r.artist || '').trim();
  const title = (r.title || '').trim();
  let base;
  if (artist && title) base = `${artist} - ${title}`;
  else if (title) base = title;
  else base = entry.name.replace(/\.[^.]+$/, '');
  return sanitizeFilename(base) + '.' + r.ext;
}

function updateSummary() {
  const list = [...files.values()];
  const done = list.filter((f) => f.status === 'done').length;
  const failed = list.filter((f) => f.status === 'error').length;
  const pending = list.length - done - failed;
  let text = `共 ${list.length} 个文件`;
  if (done) text += ` · 已解锁 ${done}`;
  if (failed) text += ` · 失败 ${failed}`;
  if (pending) text += ` · 处理中 ${pending}`;
  $('#summaryText').textContent = text;
  $('#downloadAllBtn').disabled = done === 0;
}

function ensureVisible() {
  $('#toolbar').hidden = false;
  $('#results').hidden = false;
}

function renderRow(entry) {
  let tr = document.getElementById('row-' + entry.id);
  const tbody = $('#fileTableBody');
  if (!tr) {
    tr = document.createElement('tr');
    tr.id = 'row-' + entry.id;
    tbody.prepend(tr);
  }
  tr.className = entry.status === 'error' ? 'row-error' : '';

  if (entry.status === 'processing') {
    const pct = Math.round((entry.progress || 0) * 100);
    tr.innerHTML = `
      <td class="col-cover"><div class="cover">🎵</div></td>
      <td class="col-title">
        <div class="cell-title">${escapeHtml(entry.name)}</div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="status-text">${escapeHtml(entry.stage || '正在读取...')}</div>
      </td>
      <td colspan="4"></td>
      <td><button class="icon-btn danger" data-act="remove" title="移除">${ICONS.remove}</button></td>`;
  } else if (entry.status === 'error') {
    tr.innerHTML = `
      <td class="col-cover"><div class="cover">⚠️</div></td>
      <td class="col-title">
        <div class="cell-title">${escapeHtml(entry.name)}</div>
        <div class="error-text">${escapeHtml(entry.error)}</div>
      </td>
      <td colspan="4"></td>
      <td><button class="icon-btn danger" data-act="remove" title="移除">${ICONS.remove}</button></td>`;
  } else {
    const r = entry.result;
    const cover = entry.coverUrl
      ? `<img src="${entry.coverUrl}" alt="">`
      : (r.pictureUrl ? `<img src="${r.pictureUrl}" alt="" onerror="this.remove()">` : '🎵');
    tr.innerHTML = `
      <td class="col-cover"><div class="cover">${cover}</div></td>
      <td class="col-title">
        <div class="cell-title" title="${escapeHtml(r.title || '')}">${escapeHtml(r.title || entry.name)}</div>
        <div class="cell-filename">${escapeHtml(entry.name)}</div>
      </td>
      <td class="cell-artist" title="${escapeHtml(r.artist || '')}">${escapeHtml(r.artist || '—')}</td>
      <td class="cell-album" title="${escapeHtml(r.album || '')}">${escapeHtml(r.album || '—')}</td>
      <td><span class="ext-badge">${escapeHtml(r.ext)}</span></td>
      <td class="cell-size">${formatSize(entry.size)}</td>
      <td>
        <div class="actions">
          <button class="icon-btn" data-act="play" title="试听">${ICONS.play}</button>
          <button class="icon-btn" data-act="download" title="下载">${ICONS.download}</button>
          <button class="icon-btn danger" data-act="remove" title="移除">${ICONS.remove}</button>
        </div>
      </td>`;
  }
  updateSummary();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const ICONS = {
  play: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  remove: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

// ---------- 解密流程 ----------
const STAGE_TEXT = {
  start: '正在解密...',
  decrypt: '正在解密...',
  done: '即将完成...',
};

async function handleFiles(fileList) {
  if (!pool) pool = new WorkerPool(POOL_SIZE);
  const fetchCover = true;
  const jobs = [];

  for (const file of fileList) {
    const dot = file.name.lastIndexOf('.');
    const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
    const entry = {
      id: ++fileSeq,
      name: file.name,
      size: file.size,
      status: 'processing',
      progress: 0,
      stage: '正在读取...',
      ext,
    };
    files.set(entry.id, entry);
    ensureVisible();
    renderRow(entry);

    jobs.push(
      (async () => {
        try {
          const buffer = await file.arrayBuffer();
          entry.stage = '正在解密...';
          renderRow(entry);
          let lastRender = 0;
          const result = await pool.submit({
            id: entry.id,
            name: entry.name,
            buffer,
            fetchCover,
            onProgress: (msg) => {
              entry.progress = msg.pct || 0;
              entry.stage = STAGE_TEXT[msg.stage] || '正在解密...';
              const now = performance.now();
              if (now - lastRender > 120) {
                lastRender = now;
                renderRow(entry);
              }
            },
          });
          entry.status = 'done';
          entry.progress = 1;
          entry.result = result;
          entry.blob = new Blob([result.buffer], { type: result.mime });
          entry.url = URL.createObjectURL(entry.blob);
          if (result.picture) {
            entry.coverUrl = URL.createObjectURL(new Blob([result.picture.buffer], { type: result.picture.mime }));
          }
          // 立即保存模式
          if (instantSaveDir) await saveToDirectory(entry);
          renderRow(entry);
        } catch (err) {
          entry.status = 'error';
          entry.error = err.message || String(err);
          renderRow(entry);
        }
      })()
    );
  }
  await Promise.all(jobs);
}

// ---------- 立即保存（File System Access API）----------
let instantSaveDir = null;

async function saveToDirectory(entry) {
  const name = outputName(entry);
  const fh = await instantSaveDir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(entry.blob);
  await w.close();
}

function setupInstantSave() {
  const label = $('#instantSaveLabel');
  const toggle = $('#instantSaveToggle');
  if (!window.showDirectoryPicker) return; // 不支持则隐藏
  label.hidden = false;
  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      try {
        instantSaveDir = await window.showDirectoryPicker({ mode: 'readwrite' });
        toast('已开启立即保存：解锁完成后将自动写入所选文件夹', 'success');
      } catch (e) {
        toggle.checked = false;
        instantSaveDir = null;
      }
    } else {
      instantSaveDir = null;
    }
  });
}

// ---------- 下载 ----------
function triggerDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30 * 1000);
}

async function downloadAll() {
  const done = [...files.values()].filter((f) => f.status === 'done');
  if (!done.length) return;
  const btn = $('#downloadAllBtn');
  btn.disabled = true;
  btn.textContent = '正在打包...';
  try {
    const zipFiles = [];
    const used = new Set();
    for (const entry of done) {
      let name = outputName(entry);
      // 避免重名
      if (used.has(name)) {
        const dot = name.lastIndexOf('.');
        name = name.slice(0, dot) + ' (' + entry.id + ')' + name.slice(dot);
      }
      used.add(name);
      zipFiles.push({ name, data: new Uint8Array(await entry.blob.arrayBuffer()) });
    }
    const zipBlob = createZip(zipFiles);
    triggerDownload(zipBlob, 'unlocked-music.zip');
    toast(`已打包 ${zipFiles.length} 个文件`, 'success');
  } catch (e) {
    toast('打包失败: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      全部下载 (ZIP)`;
    updateSummary();
  }
}

// ---------- 试听 ----------
const previewAudio = $('#previewAudio');
let playingId = null;

function togglePlay(entry, btn) {
  if (playingId === entry.id) {
    previewAudio.pause();
    return;
  }
  previewAudio.src = entry.url;
  previewAudio.play();
  playingId = entry.id;
  document.querySelectorAll('.icon-btn.playing').forEach((b) => {
    b.classList.remove('playing');
    b.innerHTML = ICONS.play;
  });
  btn.classList.add('playing');
  btn.innerHTML = ICONS.pause;
}
previewAudio.addEventListener('ended', () => {
  playingId = null;
  document.querySelectorAll('.icon-btn.playing').forEach((b) => {
    b.classList.remove('playing');
    b.innerHTML = ICONS.play;
  });
});
previewAudio.addEventListener('pause', () => {
  playingId = null;
  document.querySelectorAll('.icon-btn.playing').forEach((b) => {
    b.classList.remove('playing');
    b.innerHTML = ICONS.play;
  });
});

// ---------- 事件绑定 ----------
function setupEvents() {
  const zone = $('#uploadZone');
  const input = $('#fileInput');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (input.files.length) handleFiles([...input.files]);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    })
  );
  zone.addEventListener('drop', (e) => {
    const dropped = [...e.dataTransfer.files];
    if (dropped.length) handleFiles(dropped);
  });

  // 全窗口拖拽支持
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  $('#downloadAllBtn').addEventListener('click', downloadAll);
  $('#clearBtn').addEventListener('click', () => {
    for (const entry of files.values()) {
      if (entry.url) URL.revokeObjectURL(entry.url);
      if (entry.coverUrl) URL.revokeObjectURL(entry.coverUrl);
    }
    files.clear();
    $('#fileTableBody').innerHTML = '';
    $('#toolbar').hidden = true;
    $('#results').hidden = true;
  });

  // 表格操作（事件委托）
  $('#fileTableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = parseInt(tr.id.replace('row-', ''), 10);
    const entry = files.get(id);
    if (!entry) return;
    const act = btn.dataset.act;
    if (act === 'remove') {
      if (entry.url) URL.revokeObjectURL(entry.url);
      if (entry.coverUrl) URL.revokeObjectURL(entry.coverUrl);
      files.delete(id);
      tr.remove();
      if (!files.size) {
        $('#toolbar').hidden = true;
        $('#results').hidden = true;
      }
      updateSummary();
    } else if (act === 'download') {
      triggerDownload(entry.blob, outputName(entry));
    } else if (act === 'play') {
      togglePlay(entry, btn);
    }
  });
}

// ---------- 启动 ----------
initFormatDisplay();
setupEvents();
setupInstantSave();
