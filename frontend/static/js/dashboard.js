/* Dashboard: KPI, biểu đồ, bảng cần review, data grid sửa nhanh inline. */

import { api, toast, escapeHtml, fmtInt, fmtNumber, debounce, markActiveNav, downloadUrl } from './common.js';
import { barChart, groupedBarChart, lineChart, donutChart, PALETTE } from './charts.js';

const state = { schema: null, columns: [], byKey: {}, gridRows: [], summary: null };

init().catch((err) => toast('Lỗi tải dashboard: ' + err.message, 'error'));

async function init() {
  markActiveNav();
  state.schema = await api.get('/api/meta/schema');
  state.columns = state.schema.columns;
  state.columns.forEach((c) => { state.byKey[c.key] = c; });

  document.getElementById('btn-refresh').addEventListener('click', loadAll);
  document.getElementById('btn-export-xlsx').addEventListener('click',
    () => downloadUrl('/api/io/export/full.xlsx'));
  document.getElementById('btn-export-csv').addEventListener('click',
    () => downloadUrl('/api/io/export/coding.csv'));
  document.getElementById('grid-search').addEventListener('input', debounce(renderGrid, 200));
  document.getElementById('grid-status').addEventListener('change', loadGrid);

  await loadAll();
}

async function loadAll() {
  const [summary, charts, review] = await Promise.all([
    api.get('/api/dashboard/summary'),
    api.get('/api/dashboard/charts'),
    api.get('/api/dashboard/needs-review'),
  ]);
  state.summary = summary;
  renderKpis(summary);
  renderCharts(summary, charts);
  renderReview(review);
  await loadGrid();
}

function renderKpis(s) {
  const cards = [
    { k: 'Mục tiêu', v: fmtInt(s.target), sub: `hàng đợi hiện có ${fmtInt(s.queue_total)}` },
    {
      k: 'Đã code', v: fmtInt(s.coded), cls: 'ok',
      sub: `${s.percent}% · còn ${fmtInt(s.remaining)}`,
      bar: s.percent,
    },
    { k: 'Đang code dở', v: fmtInt(s.in_progress), sub: 'thiếu field bắt buộc' },
    { k: 'QC OK', v: fmtInt(s.qc.ok), cls: 'ok', sub: `${s.qc.ok_pct}% số video đã code` },
    { k: 'QC CHECK', v: fmtInt(s.qc.check), cls: 'warn', sub: `${s.qc.check_pct}% cần xem lại` },
    { k: 'Đánh dấu tay', v: fmtInt(s.flagged), sub: 'coder tự gắn cờ review' },
  ];
  document.getElementById('kpis').innerHTML = cards.map((c) => `
    <div class="kpi ${c.cls || ''}">
      <div class="k">${c.k}</div>
      <div class="v">${c.v}</div>
      <div class="sub">${escapeHtml(c.sub)}</div>
      ${c.bar !== undefined
        ? `<div class="progress-track"><div class="progress-fill" style="width:${Math.min(c.bar, 100)}%"></div></div>`
        : ''}
    </div>`).join('');
}

function renderCharts(summary, charts) {
  lineChart('chart-timeline', summary.timeline.labels, [
    { name: 'Mỗi ngày', values: summary.timeline.values, color: PALETTE[0] },
    { name: 'Luỹ kế', values: summary.timeline.cumulative, color: PALETTE[1] },
  ]);

  donutChart('chart-x1', charts.x1.categories.map((cat, i) => ({
    label: charts.x1.labels[i] === cat ? (cat === '1' ? 'Có (1)' : 'Không (0)') : charts.x1.labels[i],
    value: charts.x1.values[i],
    color: cat === '1' ? PALETTE[0] : PALETTE[3],
  })));

  donutChart('chart-qc', [
    { label: 'OK', value: summary.qc.ok, color: '#1f8a4c' },
    { label: 'CHECK', value: summary.qc.check, color: '#c98a1d' },
  ]);

  barChart('chart-y7', charts.y7);
  barChart('chart-y9', charts.y9);
  barChart('chart-x4band', charts.x4band, { color: PALETTE[2] });
  barChart('chart-x3', charts.x3, { color: PALETTE[4] });
  barChart('chart-y8', charts.y8, { color: PALETTE[1] });

  const er = charts.er_by_account_type;
  groupedBarChart('chart-er-type', er.labels, [
    { name: 'Trung bình', values: er.mean, color: PALETTE[0] },
    { name: 'Trung vị', values: er.median, color: PALETTE[1] },
  ]);
  const tier = charts.er_by_tier;
  groupedBarChart('chart-er-tier', tier.labels, [
    { name: 'Trung bình', values: tier.mean, color: PALETTE[0] },
    { name: 'Trung vị', values: tier.median, color: PALETTE[1] },
  ]);

  barChart('chart-coder', {
    labels: summary.by_coder.map((r) => r.label),
    values: summary.by_coder.map((r) => r.value),
    categories: summary.by_coder.map((r) => r.label),
  }, { color: PALETTE[5] });
}

function renderReview(rows) {
  const tbody = document.querySelector('#review-table tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">'
      + 'Không có video nào cần review.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="mono">${r.stt ?? '—'}</td>
      <td>${escapeHtml(r.account_handle || '')}</td>
      <td>${escapeHtml(r.coder_id || '—')}</td>
      <td>${r.qc_status === 'CHECK' ? '<span class="badge check">CHECK</span>' : escapeHtml(r.qc_status || '—')}
          ${r.flagged ? ' ⚑' : ''}</td>
      <td style="white-space:normal">${escapeHtml([...r.reasons, ...(r.missing.length
        ? ['Thiếu: ' + r.missing.join(', ')] : [])].join(' · ') || '—')}</td>
      <td><a href="/app/coding.html?video=${encodeURIComponent(r.video_id)}">Mở →</a></td>
    </tr>`).join('');
}

/* --------------------------------------------------------------- Grid */

const GRID_KEYS = ['stt', 'video_id', 'account_handle', 'coder_id', 'account_type',
  'x1_commercial', 'x3_visibility_level', 'x4a_video_sec', 'x4b_commercial_sec',
  'x4c_commercial_share', 'x4_intensity_band', 'y1_information', 'y2_experience',
  'y3_aesthetic', 'y4_price_promo', 'y5_social_proof', 'y6_problem_solution',
  'y7_dominant_frame', 'y8_cta', 'y9_appeal', 'w1_ai_disclosure', 'w2_ai_label_source',
  'e1_likes', 'e2_comments', 'e3_shares', 'e4_views', 'e5_saves',
  'er_view_core', 'er_follower', 'qc_status', 'missing_data_notes', 'boundary_notes'];

async function loadGrid() {
  const status = document.getElementById('grid-status').value;
  const data = await api.get('/api/dashboard/grid', { status, limit: 2000 });
  state.gridRows = data.rows;
  renderGrid();
}

function renderGrid() {
  const needle = document.getElementById('grid-search').value.trim().toLowerCase();
  const rows = needle
    ? state.gridRows.filter((r) => [r.stt, r.video_id, r.account_handle]
      .some((v) => String(v ?? '').toLowerCase().includes(needle)))
    : state.gridRows;

  const head = document.querySelector('#data-grid thead tr');
  head.innerHTML = GRID_KEYS.map((k) => {
    const col = state.byKey[k];
    return `<th title="${escapeHtml(col.excel)}">${escapeHtml(col.alias || col.excel)}</th>`;
  }).join('');

  const body = document.querySelector('#data-grid tbody');
  body.innerHTML = rows.map((row) => `
    <tr data-id="${escapeHtml(row.video_id)}">
      ${GRID_KEYS.map((k) => {
        const col = state.byKey[k];
        const editable = col.editable && k !== 'video_id';
        return `<td class="${editable ? 'editable' : ''}" data-key="${k}"
          title="${escapeHtml(col.excel)}">${escapeHtml(cellText(k, row[k]))}</td>`;
      }).join('')}
    </tr>`).join('');

  document.getElementById('grid-count').textContent =
    `${rows.length} / ${state.gridRows.length} dòng`;
  body.onclick = onGridClick;
}

function cellText(key, value) {
  if (value === null || value === undefined || value === '') return '';
  const col = state.byKey[key];
  if (col.dtype === 'float') return fmtNumber(value);
  if (key.endsWith('_notes')) return String(value).slice(0, 40);
  return String(value);
}

function onGridClick(event) {
  const cell = event.target.closest('td.editable');
  if (!cell || cell.querySelector('input, select')) return;
  const key = cell.dataset.key;
  const videoId = cell.closest('tr').dataset.id;
  const col = state.byKey[key];
  const original = cell.textContent.trim();

  let input;
  if (col.options?.length) {
    input = document.createElement('select');
    input.innerHTML = '<option value=""></option>' + col.options.map((o) =>
      `<option value="${escapeHtml(o)}" ${String(o) === original ? 'selected' : ''}>${
        escapeHtml(o)}${col.option_labels[String(o)] ? ' — ' + escapeHtml(col.option_labels[String(o)]) : ''}</option>`).join('');
  } else {
    input = document.createElement('input');
    input.type = (col.dtype === 'int' || col.dtype === 'float') ? 'number' : 'text';
    input.value = original;
  }
  cell.textContent = '';
  cell.appendChild(input);
  input.focus();

  const commit = async () => {
    const value = input.value;
    cell.textContent = value;
    if (value === original) return;
    try {
      const payload = await api.patch('/api/dashboard/grid',
        { video_id: videoId, field: key, value: value === '' ? null : value });
      const row = state.gridRows.find((r) => r.video_id === videoId);
      if (row) {
        Object.assign(row, payload.values, payload.derived.values);
        row._status = payload.status;
      }
      renderGrid();
      toast('Đã lưu ' + col.excel);
    } catch (err) {
      cell.textContent = original;
      toast('Lưu lỗi: ' + err.message, 'error');
    }
  };

  input.addEventListener('blur', commit, { once: true });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = original; input.blur(); }
  });
}
