/* Form nhập liệu: render 47 field, điều hướng bàn phím, autosave, derived realtime. */

import {
  api, toast, showTip, hideTip, guideHtml, escapeHtml, fmtNumber, fmtInt,
  debounce, markActiveNav, downloadUrl, session, initSession,
} from './common.js';

const state = {
  schema: null,
  columnsByKey: {},
  guide: {},
  videos: [],
  counts: {},
  current: null,      // payload của video đang mở
  currentId: null,
  focusIndex: 0,      // vị trí trong tabOrder
  tabOrder: [],
  pendingFields: {},  // field chờ autosave
  saving: false,
  dirtyGuard: false,
};

const els = {};

init().catch((err) => {
  console.error(err);
  toast('Không tải được app: ' + err.message, 'error');
});

async function init() {
  markActiveNav();
  await initSession();
  cacheEls();

  state.schema = await api.get('/api/meta/schema');
  state.schema.columns.forEach((c) => { state.columnsByKey[c.key] = c; });
  state.guide = state.schema.quick_guide || {};
  state.tabOrder = state.schema.tab_order.filter((k) => state.columnsByKey[k]);

  fillCoders();
  bindEvents();
  buildForm();

  await refreshList();
  const startId = new URLSearchParams(location.search).get('video')
    || state.videos[0]?.video_id;
  if (startId) await loadVideo(startId);
  else showEmpty();
}

function cacheEls() {
  els.list = document.getElementById('video-list');
  els.counts = document.getElementById('sidebar-counts');
  els.search = document.getElementById('search');
  els.filterStatus = document.getElementById('filter-status');
  els.filterCoder = document.getElementById('filter-coder');
  els.form = document.getElementById('form-root');
  els.derived = document.getElementById('derived-panel');
  els.meta = document.getElementById('metastrip');
  els.saveState = document.getElementById('save-state');
}

function fillCoders() {
  // Coder đang nhập = tài khoản đăng nhập (badge ở thanh trên). Dropdown dưới
  // đây chỉ để *lọc* danh sách, không đổi được người đang code.
  const coders = state.schema.coders || [];
  els.filterCoder.innerHTML = '<option value="">Mọi coder</option>'
    + coders.map((c) => `<option value="${c.coder_id}">${escapeHtml(c.coder_id)}</option>`).join('');
}

/* ---------------------------------------------------------------- Sidebar */

function filters() {
  return {
    status: els.filterStatus.value,
    coder: els.filterCoder.value,
    search: els.search.value.trim(),
  };
}

async function refreshList() {
  const data = await api.get('/api/videos', filters());
  state.videos = data.videos;
  state.counts = data.counts;
  renderList();
}

function renderList() {
  if (!state.videos.length) {
    els.list.innerHTML = '<div class="empty-state small">Không có video nào khớp bộ lọc.</div>';
  } else {
    els.list.innerHTML = state.videos.map((v) => `
      <div class="vid-row ${v.video_id === state.currentId ? 'active' : ''}"
           data-id="${v.video_id}" title="${escapeHtml(v.video_id)}">
        <span class="dot ${v.status}"></span>
        <span class="stt">${v.stt ?? '—'}</span>
        <span class="handle">${escapeHtml(v.account_handle || v.video_id)}</span>
        ${v.flagged ? '<span class="flag" title="Đã đánh dấu review">⚑</span>' : ''}
        ${v.coder_id ? `<span class="small muted">${escapeHtml(v.coder_id)}</span>` : ''}
      </div>`).join('');
  }
  const c = state.counts;
  els.counts.innerHTML = `Tổng <b>${c.total ?? 0}</b> · chưa code ${c.not_started ?? 0}
    · dở ${c.in_progress ?? 0} · OK ${c.ok ?? 0} · CHECK ${c.check ?? 0}`;
  const active = els.list.querySelector('.vid-row.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

/* ------------------------------------------------------------------- Form */

const CARD_GROUPS = [
  { group: 'meta', collapsed: true },
  { group: 'x', collapsed: false },
  { group: 'y', collapsed: false },
  { group: 'w', collapsed: false },
  { group: 'e', collapsed: false },
  { group: 'qc', collapsed: false },
];

function buildForm() {
  els.form.innerHTML = CARD_GROUPS.map(({ group, collapsed }) => {
    const cols = state.schema.columns.filter((c) => c.group === group);
    const body = cols.map(renderField).join('');
    return `
      <section class="card ${collapsed ? 'collapsed' : ''}" data-group="${group}">
        <header data-toggle="${group}">
          <span class="chev">${collapsed ? '▸' : '▾'}</span>
          <span>${escapeHtml(state.schema.groups[group] || group)}</span>
          <span class="count">${cols.length} cột</span>
        </header>
        <div class="body">${body}</div>
      </section>`;
  }).join('');

  els.form.querySelectorAll('header[data-toggle]').forEach((h) => {
    h.addEventListener('click', () => {
      const card = h.closest('.card');
      card.classList.toggle('collapsed');
      h.querySelector('.chev').textContent = card.classList.contains('collapsed') ? '▸' : '▾';
    });
  });

  els.form.addEventListener('click', onFormClick);
  els.form.addEventListener('input', onFormInput);
  els.form.addEventListener('focusin', (e) => {
    const field = e.target.closest('.field');
    if (field) setFocusField(field.dataset.key, false);
  });
}

function renderField(col) {
  const guide = state.guide[col.key];
  const helpBtn = (guide || col.note)
    ? `<button class="help" data-help="${col.key}" tabindex="-1" aria-label="Hướng dẫn">?</button>`
    : '';
  const tentative = col.source === 'derived'
    && state.schema.rules_meta?.[col.key]?.confirmed === false
    ? '<span class="warn-icon" data-tentative="' + col.key + '" title="Công thức tạm, cần review">⚠</span>'
    : '';
  const code = col.alias || col.excel.split(' ')[0];
  const name = col.excel.replace(/^\S+\s/, '');

  return `
    <div class="field" data-key="${col.key}" data-source="${col.source}">
      <div class="label-cell">
        <span class="code">${escapeHtml(code)}</span>
        <span class="name">${escapeHtml(name)}</span>
        ${col.required ? '<span class="muted" title="Bắt buộc để QC = OK">*</span>' : ''}
        ${helpBtn}${tentative}
        <span class="status-dot dot" data-dot="${col.key}"></span>
      </div>
      <div class="control" data-control="${col.key}">${renderControl(col)}</div>
    </div>`;
}

function renderControl(col) {
  if (col.source === 'derived') {
    return `<div class="inline-inputs">
        <input type="text" data-derived-display="${col.key}" readonly tabindex="-1">
        <input type="text" data-input="${col.key}" placeholder="ghi đè…"
               style="max-width:110px" title="Nhập để ghi đè giá trị app tự tính">
      </div>`;
  }
  if (col.options && col.options.length) {
    const buttons = col.options.map((opt) => {
      const label = col.option_labels[String(opt)];
      return `<button type="button" data-set="${col.key}" data-value="${escapeHtml(opt)}"
        title="${escapeHtml(label || '')}">${escapeHtml(opt)}${
        label ? `<span class="opt-label">${escapeHtml(label)}</span>` : ''}</button>`;
    }).join('');
    const clear = `<button type="button" class="ghost small" data-clear="${col.key}"
      tabindex="-1" title="Xoá giá trị">✕</button>`;
    return `<div class="seg" data-seg="${col.key}">${buttons}${clear}</div>`;
  }
  if (col.dtype === 'int' || col.dtype === 'float') {
    const step = col.dtype === 'float' ? 'any' : '1';
    return `<div class="inline-inputs">
      <input type="number" step="${step}" data-input="${col.key}"
             ${col.editable ? '' : 'readonly tabindex="-1"'}>
      ${col.key.endsWith('_sec') ? '<span class="unit">giây</span>' : ''}
    </div>`;
  }
  if (col.dtype === 'date') return `<input type="date" data-input="${col.key}">`;
  if (col.dtype === 'datetime') return `<input type="datetime-local" data-input="${col.key}">`;
  if (col.key.endsWith('_notes')) return `<textarea data-input="${col.key}" rows="2"></textarea>`;
  const ro = col.editable ? '' : 'readonly tabindex="-1"';
  return `<input type="text" data-input="${col.key}" ${ro}>`;
}

/* ------------------------------------------------------- Load & fill data */

async function loadVideo(videoId) {
  await flushPending();
  const payload = await api.get(`/api/coding/${videoId}`, { coder: session.coder_id });
  state.current = payload;
  state.currentId = videoId;
  fillForm(payload);
  renderList();
  const url = new URL(location.href);
  url.searchParams.set('video', videoId);
  history.replaceState(null, '', url);
  focusFirstEmpty();
}

function fillForm(payload) {
  const values = payload.values || {};
  const derived = payload.derived?.values || {};
  const touched = payload.touched || {};

  for (const col of state.schema.columns) {
    const key = col.key;
    const value = col.source === 'derived' ? derived[key] : values[key];
    const control = els.form.querySelector(`[data-control="${key}"]`);
    if (!control) continue;

    if (col.source === 'derived') {
      const display = control.querySelector(`[data-derived-display="${key}"]`);
      const override = control.querySelector(`[data-input="${key}"]`);
      const meta = payload.derived.meta[key] || {};
      display.value = formatDerived(key, meta.auto ?? value);
      if (override) override.value = payload.overrides?.[key] ?? '';
      markDot(key, value !== null && value !== undefined && value !== '');
      continue;
    }

    const seg = control.querySelector(`[data-seg="${key}"]`);
    if (seg) {
      seg.querySelectorAll('[data-set]').forEach((btn) => {
        btn.classList.toggle('on', value !== null && value !== undefined
          && String(btn.dataset.value) === String(value));
      });
    } else {
      const input = control.querySelector(`[data-input="${key}"]`);
      if (input) input.value = value ?? '';
    }
    markDot(key, touched[key] === true
      || (value !== null && value !== undefined && value !== ''));
  }

  applyValidation(payload);
  renderDerivedPanel(payload);
  renderMeta(payload);
  setSaveState('Đã lưu', false);
}

function formatDerived(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  const col = state.columnsByKey[key];
  if (col.dtype === 'float') return fmtNumber(value) + (col.excel.includes('%') ? ' %' : '');
  const label = col.option_labels[String(value)];
  return label ? `${value} — ${label}` : String(value);
}

function markDot(key, filled) {
  const dot = els.form.querySelector(`[data-dot="${key}"]`);
  if (dot) dot.classList.toggle('ok', !!filled);
}

function renderMeta(payload) {
  const v = payload.values;
  const status = payload.status;
  const badge = status === 'ok' ? '<span class="badge ok">QC OK</span>'
    : status === 'check' ? '<span class="badge check">QC CHECK</span>'
    : `<span class="badge">${status === 'not_started' ? 'Chưa code' : 'Đang code dở'}</span>`;
  els.meta.innerHTML = `
    <span class="big">#${v.stt ?? '—'}</span>
    <span class="kv">Handle <b>${escapeHtml(v.account_handle || '—')}</b></span>
    <span class="kv">Video_ID <b class="mono">${escapeHtml(v.video_id || '—')}</b></span>
    <span class="kv">Upload <b>${escapeHtml(v.upload_date || '—')}</b></span>
    <span class="kv">Follower <b>${fmtInt(v.follower_count)}</b></span>
    <span class="kv">Views <b>${fmtInt(v.e4_views)}</b></span>
    ${badge}
    ${payload.flagged_for_review ? '<span class="badge check">⚑ Đã đánh dấu</span>' : ''}
    <span class="spacer" style="flex:1"></span>
    <span class="kv" id="nav-position"></span>`;
  updatePosition();
}

async function updatePosition() {
  const el = document.getElementById('nav-position');
  if (!el || !state.currentId) return;
  try {
    const n = await api.get(`/api/videos/${state.currentId}/neighbors`, filters());
    el.textContent = n.index ? `${n.index} / ${n.total}` : '';
    state.neighbors = n;
  } catch { /* điều hướng không critical */ }
}

/* ------------------------------------------------------- Derived panel */

function renderDerivedPanel(payload) {
  const d = payload.derived;
  const rows = [];
  const order = ['x4c_commercial_share', 'x4_intensity_band', 'x3_visibility_level',
    'v2_commercial_relationship', 'er_view_core', 'er_view_plus_save',
    'er_follower', 'qc_status'];

  for (const key of order) {
    const col = state.columnsByKey[key];
    const meta = d.meta[key] || {};
    const value = d.values[key];
    const cls = meta.overridden ? 'overridden' : (meta.confirmed ? '' : 'tentative');
    let badge = '';
    if (meta.overridden) badge = '<span class="badge over">ghi đè</span>';
    else if (!meta.confirmed) badge = '<span class="badge tentative">tạm</span>';
    const suggestion = d.suggestions?.[key];
    rows.push(`
      <div class="derived-row ${cls}" ${meta.source ? `title="${escapeHtml(meta.source)}"` : ''}>
        <span class="k">${escapeHtml(col.excel)}</span>
        <span class="v ${value === null || value === undefined ? 'empty' : ''}">${
          escapeHtml(formatDerived(key, value))}</span>
        ${badge}
      </div>
      ${suggestion !== undefined && suggestion !== null && (value === null || value === undefined)
        ? `<div class="small muted" style="margin:-2px 0 6px 7px">gợi ý: <b>${
            escapeHtml(formatDerived(key, suggestion))}</b>
           <button class="ghost small" data-accept-suggestion="${key}">dùng</button></div>`
        : ''}`);
  }

  const warnings = payload.validation.warnings || [];
  const missing = payload.validation.missing_labels || [];
  const alerts = [];
  if (missing.length) {
    alerts.push(`<div class="alert soft"><b>Còn thiếu ${missing.length} field bắt buộc:</b><br>${
      escapeHtml(missing.join(', '))}</div>`);
  }
  for (const w of warnings) {
    alerts.push(`<div class="alert ${w.level}">${escapeHtml(w.message)}</div>`);
  }
  if (d.qc_reasons?.length) {
    alerts.push(`<div class="alert info"><b>QC = CHECK vì:</b><br>${
      d.qc_reasons.map(escapeHtml).join('<br>')}</div>`);
  }
  if (!alerts.length && !missing.length) {
    alerts.push('<div class="alert ok">Không có cảnh báo nào.</div>');
  }

  const boundary = payload.validation.boundary_suggestion;
  els.derived.innerHTML = `
    <h3>Giá trị app tự tính</h3>
    ${rows.join('')}
    <h3>Kiểm tra</h3>
    ${alerts.join('')}
    ${boundary ? `<button class="small" id="btn-copy-boundary" style="margin-top:4px">
        ↓ Chép cảnh báo vào Boundary_notes</button>` : ''}
    <h3>Ghi chú</h3>
    <div class="small muted">
      Field có nhãn <span class="badge tentative">tạm</span> dùng công thức best-guess
      trong <span class="mono">rules_config.json</span> — cần đối chiếu manual v0.1.
      Ô "ghi đè" bên cạnh mỗi field derived cho phép sửa tay khi cần.
    </div>`;

  els.derived.querySelectorAll('[data-accept-suggestion]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.acceptSuggestion;
      queueField(key, payload.derived.suggestions[key]);
      flushPending();
    });
  });
  const copyBtn = document.getElementById('btn-copy-boundary');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const box = els.form.querySelector('[data-input="boundary_notes"]');
      const existing = box.value.trim();
      box.value = existing ? `${existing} | ${boundary}` : boundary;
      queueField('boundary_notes', box.value);
      flushPending();
    });
  }
}

function applyValidation(payload) {
  const missing = new Set(payload.validation.missing_required || []);
  const flagged = new Set();
  (payload.validation.warnings || []).forEach((w) => (w.fields || []).forEach((f) => flagged.add(f)));
  els.form.querySelectorAll('.field').forEach((field) => {
    field.classList.toggle('missing', missing.has(field.dataset.key));
  });
}

/* ------------------------------------------------------------ Autosave */

const scheduleSave = debounce(() => { flushPending(); }, 280);

function queueField(key, value) {
  state.pendingFields[key] = value;
  setSaveState('Đang lưu…', true);
  scheduleSave();
}

async function flushPending() {
  scheduleSave.cancel();
  const fields = state.pendingFields;
  if (!Object.keys(fields).length || !state.currentId) return;
  state.pendingFields = {};

  const overrides = {};
  const plain = {};
  for (const [key, value] of Object.entries(fields)) {
    const col = state.columnsByKey[key];
    if (col.source === 'derived') overrides[key] = value;
    else plain[key] = value;
  }

  try {
    state.saving = true;
    const body = { fields: plain };
    if (Object.keys(overrides).length) body.overrides = overrides;
    const payload = await api.patch(`/api/coding/${state.currentId}`, body);
    state.current = payload;
    refreshAfterSave(payload);
    setSaveState('Đã lưu ' + new Date().toLocaleTimeString('vi-VN'), false);
  } catch (err) {
    toast('Lưu lỗi: ' + err.message, 'error');
    setSaveState('LƯU LỖI', false);
  } finally {
    state.saving = false;
  }
}

function refreshAfterSave(payload) {
  // Cập nhật phần phụ thuộc, KHÔNG dựng lại control đang gõ (tránh mất con trỏ).
  const derivedValues = payload.derived.values;
  for (const key of Object.keys(derivedValues)) {
    const display = els.form.querySelector(`[data-derived-display="${key}"]`);
    if (display) {
      display.value = formatDerived(key, payload.derived.meta[key]?.auto ?? derivedValues[key]);
    }
    markDot(key, derivedValues[key] !== null && derivedValues[key] !== undefined);
  }
  applyValidation(payload);
  renderDerivedPanel(payload);
  renderMeta(payload);

  const row = state.videos.find((v) => v.video_id === payload.video_id);
  if (row) {
    row.status = payload.status;
    row.qc_status = payload.derived.values.qc_status;
    row.coder_id = payload.values.coder_id;
    row.flagged = payload.flagged_for_review;
    renderList();
  }
}

function setSaveState(text, busy) {
  els.saveState.textContent = text;
  els.saveState.style.color = busy ? 'var(--brand)' : 'var(--ink-faint)';
}

/* ------------------------------------------------------------- Sự kiện */

function onFormClick(event) {
  const setBtn = event.target.closest('[data-set]');
  if (setBtn) {
    const key = setBtn.dataset.set;
    setValue(key, setBtn.dataset.value);
    advanceFrom(key);
    return;
  }
  const clearBtn = event.target.closest('[data-clear]');
  if (clearBtn) {
    setValue(clearBtn.dataset.clear, '');
    return;
  }
  const help = event.target.closest('[data-help]');
  if (help) {
    const key = help.dataset.help;
    showTip(help, guideHtml(state.guide[key], state.columnsByKey[key]));
    setTimeout(() => document.addEventListener('click', hideTip, { once: true }), 0);
  }
}

function onFormInput(event) {
  const input = event.target.closest('[data-input]');
  if (!input) return;
  queueField(input.dataset.input, input.value === '' ? null : input.value);
}

function setValue(key, rawValue) {
  const col = state.columnsByKey[key];
  const seg = els.form.querySelector(`[data-seg="${key}"]`);
  if (seg) {
    seg.querySelectorAll('[data-set]').forEach((btn) => {
      btn.classList.toggle('on', rawValue !== '' && String(btn.dataset.value) === String(rawValue));
    });
  } else {
    const input = els.form.querySelector(`[data-input="${key}"]`);
    if (input) input.value = rawValue ?? '';
  }
  markDot(key, rawValue !== '' && rawValue !== null && rawValue !== undefined);
  queueField(key, rawValue === '' ? null : rawValue);
}

/* ------------------------------------------------- Điều hướng bàn phím */

function setFocusField(key, scroll = true) {
  const index = state.tabOrder.indexOf(key);
  if (index >= 0) state.focusIndex = index;
  els.form.querySelectorAll('.field').forEach((f) => {
    f.classList.toggle('focused', f.dataset.key === key);
  });
  const field = els.form.querySelector(`.field[data-key="${key}"]`);
  if (!field) return;
  const card = field.closest('.card');
  if (card?.classList.contains('collapsed')) {
    card.classList.remove('collapsed');
    card.querySelector('.chev').textContent = '▾';
  }
  if (scroll) field.scrollIntoView({ block: 'nearest' });
}

function focusField(key, { focusInput = true } = {}) {
  setFocusField(key);
  if (!focusInput) return;
  const field = els.form.querySelector(`.field[data-key="${key}"]`);
  const input = field?.querySelector('input:not([tabindex="-1"]), textarea, select');
  if (input) input.focus({ preventScroll: true });
  else field?.querySelector('[data-set]')?.focus({ preventScroll: true });
}

function advanceFrom(key) {
  const index = state.tabOrder.indexOf(key);
  const next = state.tabOrder[index + 1];
  if (next) focusField(next);
}

function focusFirstEmpty() {
  const values = state.current?.values || {};
  const touched = state.current?.touched || {};
  const target = state.tabOrder.find((key) => {
    const col = state.columnsByKey[key];
    if (!col.required && !col.editable) return false;
    const value = values[key];
    return col.required && !touched[key] && (value === null || value === undefined || value === '');
  }) || state.tabOrder[0];
  setFocusField(target);
}

function currentKey() {
  return state.tabOrder[state.focusIndex];
}

/**
 * Phím số -> giá trị của field.
 * Enum số (0/1/9, 0/1/2/9...) khớp trực tiếp theo giá trị.
 * Enum chữ (Coder_ID C1/C2) thì phím 1..9 chọn theo thứ tự option, để luồng gõ
 * phím không bị đứt ở giữa chừng.
 */
function optionForKey(col, keyChar) {
  const options = col.options.map(String);
  if (options.includes(keyChar)) return keyChar;
  const numeric = options.every((o) => /^\d+$/.test(o));
  if (numeric) return undefined;
  const index = parseInt(keyChar, 10) - 1;
  return index >= 0 && index < options.length ? options[index] : undefined;
}

function bindEvents() {
  els.search.addEventListener('input', debounce(refreshList, 220));
  els.filterStatus.addEventListener('change', refreshList);
  els.filterCoder.addEventListener('change', refreshList);

  els.list.addEventListener('click', (e) => {
    const row = e.target.closest('.vid-row');
    if (row) loadVideo(row.dataset.id);
  });

  document.getElementById('btn-prev').addEventListener('click', () => go('prev'));
  document.getElementById('btn-next-save').addEventListener('click', saveAndNext);
  document.getElementById('btn-flag').addEventListener('click', toggleFlag);
  document.getElementById('btn-open-video').addEventListener('click', openVideo);
  document.getElementById('btn-help').addEventListener('click',
    () => document.getElementById('help-dialog').showModal());

  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', () => { scheduleSave.flush(); });
}

function onKeyDown(event) {
  const target = event.target;
  const typing = target.matches('input[type="text"], input[type="number"], input[type="date"], input[type="datetime-local"], textarea, select');

  if (event.ctrlKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    els.search.focus();
    els.search.select();
    return;
  }
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault();
    openVideo();
    return;
  }
  if (event.altKey && event.key === 'Enter') {
    event.preventDefault();
    saveAndNext();
    return;
  }
  if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    go(event.key === 'ArrowLeft' ? 'prev' : 'next');
    return;
  }
  if (event.key === 'Escape') {
    if (typing) target.blur();
    hideTip();
    return;
  }
  if (target === els.search) {
    if (event.key === 'Enter' && state.videos.length) loadVideo(state.videos[0].video_id);
    return;
  }
  if (typing) return;  // đang gõ trong ô số/ngày/chữ: để nguyên phím

  if (event.key === 'Tab') {
    event.preventDefault();
    const step = event.shiftKey ? -1 : 1;
    const next = state.focusIndex + step;
    if (next >= 0 && next < state.tabOrder.length) focusField(state.tabOrder[next]);
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = state.focusIndex + step;
    if (next >= 0 && next < state.tabOrder.length) focusField(state.tabOrder[next]);
    return;
  }
  if (/^[0-9]$/.test(event.key)) {
    const key = currentKey();
    const col = state.columnsByKey[key];
    if (!col || !col.options?.length) return;
    const value = optionForKey(col, event.key);
    if (value === undefined) {
      toast(`${col.excel}: giá trị ${event.key} không hợp lệ (${col.options.join('/')})`, 'error');
      return;
    }
    event.preventDefault();
    setValue(key, value);
    advanceFrom(key);
  }
}

/* --------------------------------------------------------- Điều hướng */

async function go(direction) {
  await flushPending();
  if (!state.neighbors) await updatePosition();
  const targetId = state.neighbors?.[direction];
  if (!targetId) {
    toast(direction === 'prev' ? 'Đã ở video đầu danh sách' : 'Đã ở video cuối danh sách');
    return;
  }
  await loadVideo(targetId);
}

async function saveAndNext() {
  await flushPending();
  const payload = state.current;
  const missing = payload?.validation?.missing_labels || [];
  if (missing.length) {
    const proceed = confirm(
      `Còn ${missing.length} field bắt buộc chưa nhập:\n\n${missing.join('\n')}\n\n`
      + 'Bấm OK để "Bỏ qua, lưu tạm" và sang video tiếp theo.\n'
      + 'Bấm Cancel để quay lại điền nốt.');
    if (!proceed) {
      const firstMissing = payload.validation.missing_required[0];
      if (firstMissing) focusField(firstMissing);
      return;
    }
  }
  const hard = (payload?.validation?.warnings || []).filter((w) => w.level === 'hard');
  if (hard.length) {
    const proceed = confirm(
      'Có cảnh báo ràng buộc logic:\n\n' + hard.map((w) => '• ' + w.message).join('\n')
      + '\n\nBấm OK để lưu và đi tiếp (case biên), Cancel để sửa lại.');
    if (!proceed) return;
  }
  await go('next');
}

async function toggleFlag() {
  if (!state.currentId) return;
  const next = !state.current?.flagged_for_review;
  const payload = await api.patch(`/api/coding/${state.currentId}`,
    { fields: {}, flagged_for_review: next });
  state.current = payload;
  refreshAfterSave(payload);
  toast(next ? 'Đã đánh dấu để review lại' : 'Đã bỏ đánh dấu');
}

function openVideo() {
  const url = state.current?.values?.url;
  if (!url) { toast('Video này chưa có URL', 'error'); return; }
  window.open(url, '_blank', 'noopener');
}

function showEmpty() {
  els.form.innerHTML = `<div class="empty-state">
      <p>Chưa có video nào trong hàng đợi.</p>
      <p class="small">Vào tab <a href="/app/index.html">Dữ liệu</a> để nạp file Excel gốc,
      hoặc chạy <span class="mono">python seed/import_seed.py &lt;file.xlsx&gt;</span>.</p>
    </div>`;
  els.derived.innerHTML = '';
  els.meta.innerHTML = '';
}
