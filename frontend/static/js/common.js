/* Tiện ích dùng chung: gọi API, toast, tooltip, format. */

export const api = {
  async get(url, params) {
    const qs = params ? '?' + new URLSearchParams(clean(params)) : '';
    return handle(await fetch(url + qs));
  },
  async post(url, body) {
    return handle(await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }));
  },
  async patch(url, body) {
    return handle(await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }));
  },
  async put(url, body) {
    return handle(await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }));
  },
};

function clean(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch { /* body không phải JSON */ }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/* ---------------- Toast ---------------- */
let toastEl = null;
let toastTimer = null;

export function toast(message, kind = '') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = ''; }, kind === 'error' ? 4200 : 1600);
}

/* ---------------- Tooltip ---------------- */
let tipEl = null;

function tipNode() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'tooltip';
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

export function showTip(anchor, html) {
  const node = tipNode();
  node.innerHTML = html;
  node.style.display = 'block';
  const rect = anchor.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  let left = rect.left;
  if (left + box.width > window.innerWidth - 12) left = window.innerWidth - box.width - 12;
  let top = rect.bottom + 6;
  if (top + box.height > window.innerHeight - 12) top = rect.top - box.height - 6;
  node.style.left = Math.max(8, left) + 'px';
  node.style.top = Math.max(8, top) + 'px';
}

export function hideTip() {
  if (tipEl) tipEl.style.display = 'none';
}

export function guideHtml(guide, column) {
  if (!guide && !column) return '';
  const parts = [];
  const head = [column?.excel, guide?.label].filter(Boolean)[0];
  if (head) parts.push(`<div class="row"><b>${escapeHtml(head)}</b></div>`);
  if (guide?.measures) parts.push(`<div class="row"><b>Đo cái gì?</b><br>${escapeHtml(guide.measures)}</div>`);
  if (guide?.confused_with) parts.push(`<div class="row"><b>Dễ nhầm với</b><br>${escapeHtml(guide.confused_with)}</div>`);
  if (guide?.example) parts.push(`<div class="row"><b>Ví dụ nhanh</b><br>${escapeHtml(guide.example)}</div>`);
  if (!guide?.measures && column?.note) {
    parts.push(`<div class="row">${escapeHtml(column.note)}</div>`);
  }
  return parts.join('');
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/* ---------------- Format ---------------- */
export function fmtNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('vi-VN', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : digits,
    maximumFractionDigits: digits,
  });
}

export function fmtInt(value) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('vi-VN');
}

export function debounce(fn, wait = 350) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.flush = (...args) => { clearTimeout(timer); fn(...args); };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function markActiveNav() {
  const here = location.pathname.split('/').pop();
  document.querySelectorAll('.topbar nav a').forEach((a) => {
    if (a.getAttribute('href').endsWith(here)) a.classList.add('active');
  });
}

/** Coder đang chọn được nhớ trong localStorage để không phải chọn lại mỗi lần mở app. */
export const coderStore = {
  get() { return localStorage.getItem('tiktok_coding_coder') || ''; },
  set(value) { localStorage.setItem('tiktok_coding_coder', value || ''); },
};

export function downloadUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
