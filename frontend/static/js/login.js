/* Màn hình đăng nhập. */

import { api } from './common.js';

const form = document.getElementById('login-form');
const coderInput = document.getElementById('coder');
const passwordInput = document.getElementById('password');
const errorBox = document.getElementById('error');
const submitBtn = document.getElementById('submit');

/** `?next=` do middleware gắn vào khi chặn một trang cụ thể. */
function nextUrl() {
  const raw = new URLSearchParams(location.search).get('next');
  // Chỉ nhận đường dẫn nội bộ — chặn open-redirect sang tên miền khác.
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/app/coding.html';
}

/* Đã đăng nhập rồi thì khỏi bắt gõ lại. */
api.get('/api/auth/me').then((me) => {
  if (me.authenticated) location.replace(nextUrl());
}).catch(() => { /* chưa đăng nhập — ở lại trang này */ });

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Đang kiểm tra…';
  try {
    await api.post('/api/auth/login', {
      coder_id: coderInput.value.trim().toUpperCase(),
      password: passwordInput.value,
    });
    location.replace(nextUrl());
  } catch (err) {
    showError(err.message || 'Đăng nhập thất bại');
    passwordInput.value = '';
    passwordInput.focus();
    submitBtn.disabled = false;
    submitBtn.textContent = 'Đăng nhập';
  }
});
