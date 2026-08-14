/* Trang Dữ liệu: import Excel, export, xem rule derived, cấu hình + chạy sync Sheets. */

import { api, toast, escapeHtml, markActiveNav, downloadUrl, initSession } from './common.js';

let pendingApply = null;

init().catch((err) => toast('Lỗi: ' + err.message, 'error'));

async function init() {
  markActiveNav();
  await initSession();

  const health = await api.get('/api/health');
  document.getElementById('db-info').textContent = 'DB: ' + health.db;

  document.getElementById('btn-upload').addEventListener('click', uploadFile);
  document.getElementById('btn-import-path').addEventListener('click', importPath);
  document.getElementById('btn-preview').addEventListener('click', previewPath);

  document.getElementById('btn-x-coding').addEventListener('click', () => downloadUrl('/api/io/export/coding.xlsx'));
  document.getElementById('btn-x-full').addEventListener('click', () => downloadUrl('/api/io/export/full.xlsx'));
  document.getElementById('btn-x-csv').addEventListener('click', () => downloadUrl('/api/io/export/coding.csv'));
  document.getElementById('btn-x-irr').addEventListener('click', () => downloadUrl('/api/irr/export/matrix.csv'));

  document.getElementById('btn-reload-rules').addEventListener('click', reloadRules);
  document.getElementById('btn-save-sync').addEventListener('click', saveSyncConfig);
  document.getElementById('btn-pull').addEventListener('click', () => runSync('pull'));
  document.getElementById('btn-push').addEventListener('click', () => runSync('push'));
  document.getElementById('btn-diff-apply').addEventListener('click', applyDiff);

  await renderRules();
  await loadSyncConfig();
}

function report(text) {
  document.getElementById('import-report').textContent = text;
}

async function uploadFile() {
  const input = document.getElementById('file-input');
  const file = input.files?.[0];
  if (!file) { toast('Chưa chọn file', 'error'); return; }
  const form = new FormData();
  form.append('file', file);
  const include = document.getElementById('include-coding').checked;
  report('Đang nạp…');
  const res = await fetch(`/api/io/import/upload?include_coding=${include}`,
    { method: 'POST', body: form });
  const body = await res.json();
  if (!res.ok) { report('Lỗi: ' + (body.detail || res.statusText)); return; }
  report(JSON.stringify(body, null, 2));
  toast('Đã nạp xong file');
}

async function importPath() {
  const path = document.getElementById('path-input').value.trim();
  if (!path) { toast('Chưa nhập đường dẫn', 'error'); return; }
  report('Đang nạp…');
  try {
    const body = await api.post('/api/io/import/path', {
      path, include_coding: document.getElementById('include-coding').checked,
    });
    report(JSON.stringify(body, null, 2));
    toast('Đã nạp xong file');
  } catch (err) {
    report('Lỗi: ' + err.message);
  }
}

async function previewPath() {
  const path = document.getElementById('path-input').value.trim();
  if (!path) { toast('Chưa nhập đường dẫn', 'error'); return; }
  try {
    report(JSON.stringify(await api.get('/api/io/import/preview', { path }), null, 2));
  } catch (err) {
    report('Lỗi: ' + err.message);
  }
}

async function renderRules() {
  const schema = await api.get('/api/meta/schema');
  const entries = Object.entries(schema.rules_meta || {});
  document.getElementById('rules-list').innerHTML = `
    <p class="small">Phiên bản rule: <b class="mono">${escapeHtml(schema.rules_version || '—')}</b></p>
    <table class="compare">
      <thead><tr><th>Field</th><th>Kiểu</th><th>Trạng thái</th></tr></thead>
      <tbody>${entries.map(([key, meta]) => `
        <tr>
          <td class="mono small">${escapeHtml(key)}</td>
          <td class="small">${escapeHtml(meta.kind || '')}</td>
          <td class="small">${meta.confirmed
            ? '<span class="badge ok">đã xác nhận</span>'
            : '<span class="badge tentative">tạm</span>'}
            ${meta.source ? `<div class="muted">${escapeHtml(meta.source)}</div>` : ''}</td>
        </tr>`).join('')}</tbody>
    </table>`;
}

async function reloadRules() {
  const res = await api.post('/api/meta/rules/reload');
  toast('Đã nạp lại rules: ' + res.version);
  await renderRules();
}

/* --------------------------------------------------------------- Sync */

async function loadSyncConfig() {
  const cfg = await api.get('/api/sync/config');
  document.getElementById('cred-path').value = cfg.credentials_path || '';
  document.getElementById('sheet-id').value = cfg.spreadsheet || '';
  document.getElementById('sheet-tab').value = cfg.worksheet || '3_Coding_Sheet';
  const status = document.getElementById('sync-status');
  if (!cfg.library_installed) {
    status.innerHTML = '<span class="alert soft">Chưa cài thư viện. Chạy: '
      + '<span class="mono">pip install gspread google-auth</span></span>';
  } else if (!cfg.configured) {
    status.innerHTML = '<span class="alert soft">Chưa cấu hình credentials / spreadsheet.</span>';
  } else {
    status.innerHTML = '<span class="alert ok">Đã cấu hình xong, sẵn sàng đồng bộ.</span>';
  }
}

async function saveSyncConfig() {
  await api.put('/api/sync/config', {
    credentials_path: document.getElementById('cred-path').value.trim(),
    spreadsheet: document.getElementById('sheet-id').value.trim(),
    worksheet: document.getElementById('sheet-tab').value.trim() || '3_Coding_Sheet',
  });
  toast('Đã lưu cấu hình sync');
  await loadSyncConfig();
}

async function runSync(direction) {
  let preview;
  try {
    preview = await api.get(`/api/sync/${direction}/preview`);
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  const changed = preview.diffs.filter((d) => d.kind === 'changed');
  const onlyLocal = preview.diffs.filter((d) => d.kind === 'only_local').length;
  const onlyRemote = preview.diffs.filter((d) => d.kind === 'only_remote').length;

  document.getElementById('diff-title').textContent = direction === 'pull'
    ? 'Kéo về từ Sheet — xem diff trước khi ghi vào SQLite'
    : 'Đẩy lên Sheet — xem diff trước khi ghi đè Sheet';

  document.getElementById('diff-body').innerHTML = `
    <p class="small">Local ${preview.local_rows} dòng · Sheet ${preview.remote_rows} dòng ·
      <b>${changed.length}</b> dòng khác nhau
      ${onlyLocal ? `· ${onlyLocal} dòng chỉ có ở local` : ''}
      ${onlyRemote ? `· ${onlyRemote} dòng chỉ có ở Sheet` : ''}</p>
    ${changed.length ? `<table class="compare">
      <thead><tr><th>STT</th><th>Cột</th><th>Local</th><th>Sheet</th></tr></thead>
      <tbody>${changed.slice(0, 200).flatMap((d) => d.cells.map((c, i) => `
        <tr class="differ">
          <td>${i === 0 ? (d.stt ?? '') : ''}</td>
          <td class="small">${escapeHtml(c.label)}</td>
          <td class="mono small">${escapeHtml(c.local ?? '—')}</td>
          <td class="mono small">${escapeHtml(c.remote ?? '—')}</td>
        </tr>`)).join('')}</tbody></table>`
    : '<p class="muted">Không có khác biệt nào.</p>'}
    ${changed.length > 200 ? '<p class="small muted">(chỉ hiện 200 dòng đầu)</p>' : ''}`;

  pendingApply = { direction, videoIds: changed.map((d) => d.video_id) };
  document.getElementById('diff-dialog').showModal();
}

async function applyDiff() {
  if (!pendingApply) return;
  const { direction, videoIds } = pendingApply;
  try {
    const body = direction === 'pull' ? { video_ids: videoIds } : {};
    const res = await api.post(`/api/sync/${direction}/apply`, body);
    toast(direction === 'pull'
      ? `Đã kéo về ${res.updated} dòng`
      : `Đã đẩy lên ${res.rows} dòng`);
    document.getElementById('diff-dialog').close();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    pendingApply = null;
  }
}
