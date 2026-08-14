/* IRR Pilot: code độc lập theo vai trò C1/C2, màn hình so sánh, xuất ma trận. */

import { api, toast, escapeHtml, fmtInt, markActiveNav, downloadUrl, debounce } from './common.js';

const state = {
  schema: null,
  byKey: {},
  role: localStorage.getItem('tiktok_irr_role') || 'C1',
  videos: [],
  counts: {},
  currentId: null,
  current: null,
  pending: {},
};

init().catch((err) => toast('Lỗi tải IRR: ' + err.message, 'error'));

async function init() {
  markActiveNav();
  state.schema = await api.get('/api/meta/schema');
  state.schema.columns.forEach((c) => { state.byKey[c.key] = c; });

  document.querySelectorAll('[data-role]').forEach((btn) => {
    btn.addEventListener('click', () => setRole(btn.dataset.role));
  });
  document.getElementById('btn-export-matrix').addEventListener('click',
    () => downloadUrl('/api/irr/export/matrix.csv'));
  document.getElementById('btn-export-long').addEventListener('click',
    () => downloadUrl('/api/irr/export/long.csv'));
  document.getElementById('btn-agreement').addEventListener('click', showAgreement);
  document.getElementById('btn-select-pilot').addEventListener('click', selectPilot);

  await setRole(state.role);
}

async function setRole(role) {
  state.role = role;
  localStorage.setItem('tiktok_irr_role', role);
  document.querySelectorAll('[data-role]').forEach((b) => {
    b.classList.toggle('on', b.dataset.role === role);
  });

  const banner = document.getElementById('role-banner');
  if (role === 'compare') {
    banner.className = 'alert info';
    banner.innerHTML = '<b>Chế độ so sánh.</b> Chỉ mở được video mà <b>cả C1 và C2</b> '
      + 'đã code xong — trước đó hai vai trò không thấy giá trị của nhau.';
  } else {
    banner.className = 'alert soft';
    banner.innerHTML = `<b>Đang code với vai trò ${role}.</b> Màn hình này không hiển thị `
      + `giá trị của vai trò kia, để hai lượt code hoàn toàn độc lập (tránh bias).`;
  }

  await loadList();
}

async function loadList() {
  const params = state.role === 'compare' ? {} : { role: state.role };
  const data = await api.get('/api/irr/videos', params);
  state.videos = data.videos;
  state.counts = data.counts;
  renderKpis();
  renderList();
}

function renderKpis() {
  const c = state.counts;
  const cards = [
    { k: 'Video pilot', v: fmtInt(c.total) },
    { k: 'C1 đã xong', v: fmtInt(c.c1_done), cls: 'ok' },
    { k: 'C2 đã xong', v: fmtInt(c.c2_done), cls: 'ok' },
    { k: 'Đủ cả 2 (so sánh được)', v: fmtInt(c.both_done), cls: 'warn' },
  ];
  document.getElementById('irr-kpis').innerHTML = cards.map((x) => `
    <div class="kpi ${x.cls || ''}"><div class="k">${x.k}</div><div class="v">${x.v}</div></div>`).join('');
}

function renderList() {
  const content = document.getElementById('content');
  if (!state.videos.length) {
    content.innerHTML = `<div class="empty-state">
      <p>Chưa có video nào trong danh sách IRR pilot.</p>
      <p class="small">Bấm "Chọn lại 75 video pilot" để lấy mẫu hệ thống từ hàng đợi,
      hoặc nạp sheet <span class="mono">5_IRR_Pilot</span> từ file gốc.</p></div>`;
    return;
  }

  const rows = state.videos.map((v) => {
    const openable = state.role !== 'compare' || v.both_done;
    const label = state.role === 'compare'
      ? (v.both_done ? '<span class="badge ok">so sánh được</span>'
        : `<span class="badge">chờ ${['C1', 'C2'].filter((r) => !(v.done_by || []).includes(r)).join(', ')}</span>`)
      : `<span class="dot ${v.status}"></span> ${statusText(v.status)}`;
    return `<tr data-id="${escapeHtml(v.video_id)}" ${openable ? '' : 'class="muted"'}>
        <td class="mono">${v.stt ?? '—'}</td>
        <td>${escapeHtml(v.account_handle || '')}</td>
        <td class="mono small">${escapeHtml(v.video_id)}</td>
        <td>${label}</td>
        <td>${openable ? `<button class="small" data-open="${escapeHtml(v.video_id)}">
              ${state.role === 'compare' ? 'So sánh' : 'Code ' + state.role}</button>` : ''}</td>
      </tr>`;
  }).join('');

  content.innerHTML = `
    <div class="table-wrap" style="max-height:none">
      <table class="grid">
        <thead><tr><th>STT</th><th>Handle</th><th>Video_ID</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div id="detail" style="margin-top:14px"></div>`;

  content.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => open(btn.dataset.open));
  });
}

function statusText(status) {
  return { not_started: 'Chưa code', in_progress: 'Đang code dở', ok: 'Xong', check: 'Xong (CHECK)' }[status] || status;
}

async function open(videoId) {
  state.currentId = videoId;
  if (state.role === 'compare') return openCompare(videoId);
  return openForm(videoId);
}

/* ------------------------------------------------------------- Code form */

const CODE_FIELDS = ['account_type', 'dominant_format', 'x1_commercial',
  'x2_1_platform_label', 'x2_2_verbal', 'x2_3_onscreen', 'x2_4_hashtag',
  'x2_5_brand_tag', 'x2_6_product_link', 'x2_7_promo_code',
  'x4a_video_sec', 'x4b_commercial_sec',
  'y1_information', 'y2_experience', 'y3_aesthetic', 'y4_price_promo',
  'y5_social_proof', 'y6_problem_solution', 'y7_dominant_frame', 'y8_cta',
  'y9_appeal', 'w1_ai_disclosure', 'w2_ai_label_source'];

async function openForm(videoId) {
  const payload = await api.get(`/api/irr/${state.role}/${videoId}`);
  state.current = payload;
  const values = payload.values;

  const fields = CODE_FIELDS.map((key) => {
    const col = state.byKey[key];
    const value = values[key];
    const control = col.options?.length
      ? `<div class="seg" data-seg="${key}">${col.options.map((o) =>
        `<button type="button" data-set="${key}" data-value="${escapeHtml(o)}"
          class="${String(o) === String(value) ? 'on' : ''}"
          title="${escapeHtml(col.option_labels[String(o)] || '')}">${escapeHtml(o)}</button>`).join('')}</div>`
      : `<input type="number" step="any" data-input="${key}" value="${value ?? ''}" style="max-width:130px">`;
    return `<div class="field" data-key="${key}">
        <div class="label-cell"><span class="code">${escapeHtml(col.alias || '')}</span>
          <span class="name">${escapeHtml(col.excel.replace(/^\S+\s/, ''))}</span></div>
        <div class="control">${control}</div>
      </div>`;
  }).join('');

  document.getElementById('detail').innerHTML = `
    <div class="card">
      <header style="cursor:default">
        <span>Code ${state.role} — STT ${payload.video.stt ?? '—'} ·
        <span class="mono small">${escapeHtml(videoId)}</span></span>
        <span class="spacer" style="flex:1"></span>
        ${payload.video.url ? `<a href="${escapeHtml(payload.video.url)}" target="_blank"
           rel="noopener" class="small">↗ Mở video</a>` : ''}
        <span class="badge ${payload.completed ? 'ok' : ''}" id="irr-state">
          ${payload.completed ? 'Đã đủ field' : 'Còn thiếu field'}</span>
      </header>
      <div class="body" id="irr-fields">${fields}</div>
    </div>`;

  const box = document.getElementById('irr-fields');
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-set]');
    if (!btn) return;
    const key = btn.dataset.set;
    box.querySelectorAll(`[data-set="${key}"]`).forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    save({ [key]: btn.dataset.value });
  });
  box.addEventListener('input', debounce((e) => {
    const input = e.target.closest('[data-input]');
    if (input) save({ [input.dataset.input]: input.value === '' ? null : input.value });
  }, 300));

  document.getElementById('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function save(fields) {
  try {
    const payload = await api.patch(`/api/irr/${state.role}/${state.currentId}`, { fields });
    state.current = payload;
    const badge = document.getElementById('irr-state');
    if (badge) {
      badge.textContent = payload.completed ? 'Đã đủ field' : 'Còn thiếu field';
      badge.className = 'badge ' + (payload.completed ? 'ok' : '');
    }
    const row = state.videos.find((v) => v.video_id === state.currentId);
    if (row) row.status = payload.status;
    renderKpis();
    await loadList();
    if (state.currentId) await openFormKeepScroll();
  } catch (err) {
    toast('Lưu lỗi: ' + err.message, 'error');
  }
}

async function openFormKeepScroll() {
  const y = window.scrollY;
  await openForm(state.currentId);
  window.scrollTo({ top: y });
}

/* --------------------------------------------------------------- Compare */

async function openCompare(videoId) {
  let data;
  try {
    data = await api.get(`/api/irr/compare/${videoId}`);
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  const rows = data.rows.map((r) => `
    <tr class="${r.agree ? '' : 'differ'}">
      <td class="field-name">${escapeHtml(r.label)} <span class="scale-tag">${r.scale}</span></td>
      <td class="mono">${escapeHtml(r.c1 ?? '—')}${r.c1_label ? ` <span class="small muted">${escapeHtml(r.c1_label)}</span>` : ''}</td>
      <td class="mono">${escapeHtml(r.c2 ?? '—')}${r.c2_label ? ` <span class="small muted">${escapeHtml(r.c2_label)}</span>` : ''}</td>
      <td>${r.agree ? '✓' : '✗ lệch'}</td>
    </tr>`).join('');

  document.getElementById('detail').innerHTML = `
    <div class="card">
      <header style="cursor:default">
        <span>So sánh C1 vs C2 — <span class="mono small">${escapeHtml(videoId)}</span></span>
        <span class="spacer" style="flex:1"></span>
        <span class="badge ${data.agreement.percent >= 80 ? 'ok' : 'check'}">
          Đồng thuận ${data.agreement.percent}% (${data.agreement.agree}/${data.agreement.total})</span>
      </header>
      <div class="body">
        <table class="compare">
          <thead><tr><th style="width:42%">Biến</th><th>C1</th><th>C2</th><th style="width:80px">Kết quả</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:12px">
          <label for="diff-notes">Ghi chú khác biệt (ghi vào cột cuối của sheet 5_IRR_Pilot)</label>
          <textarea id="diff-notes" rows="3">${escapeHtml(data.diff_notes || '')}</textarea>
          <div class="row" style="margin-top:6px">
            <button id="btn-save-notes" class="primary small">Lưu ghi chú</button>
            <span class="small muted">Alpha (Krippendorff) vẫn tính bằng R/Python từ CSV xuất ra —
              app chỉ đưa % đồng thuận thô.</span>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('btn-save-notes').addEventListener('click', async () => {
    await api.put(`/api/irr/compare/${videoId}/notes`,
      { diff_notes: document.getElementById('diff-notes').value });
    toast('Đã lưu ghi chú khác biệt');
  });
}

/* ---------------------------------------------------------- Agreement */

async function showAgreement() {
  const data = await api.get('/api/irr/agreement');
  const body = document.getElementById('agreement-body');
  if (!data.n_double_coded) {
    body.innerHTML = '<p class="muted">Chưa có video nào được cả C1 và C2 code xong.</p>';
  } else {
    body.innerHTML = `
      <p class="small">Tính trên <b>${data.n_double_coded}</b> video có đủ 2 lượt code.</p>
      <table class="compare">
        <thead><tr><th>Biến</th><th>Thang đo</th><th>Đồng thuận</th></tr></thead>
        <tbody>${data.fields.map((f) => `
          <tr class="${f.percent !== null && f.percent < 70 ? 'differ' : ''}">
            <td>${escapeHtml(f.label)}</td>
            <td><span class="scale-tag">${f.scale}</span></td>
            <td class="mono">${f.percent === null ? '—' : f.percent + '%'} (${f.agree}/${f.n})</td>
          </tr>`).join('')}</tbody>
      </table>
      <p class="small muted" style="margin-bottom:0">${escapeHtml(data.note)}</p>`;
  }
  document.getElementById('agreement-dialog').showModal();
}

async function selectPilot() {
  const raw = prompt('Chọn bao nhiêu video vào IRR pilot? (lấy mẫu hệ thống từ hàng đợi)', '75');
  if (!raw) return;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) { toast('Số không hợp lệ', 'error'); return; }
  const res = await api.post(`/api/irr/pilot/select?n=${n}`);
  toast(`Đã chọn ${res.selected} video vào pilot (bước nhảy ${res.step})`);
  await loadList();
}
