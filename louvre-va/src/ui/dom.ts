export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); }
  for (const c of children) e.append(c);
  return e;
}
export const ui = () => document.getElementById('ui')!;
export function toast(msg: string, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) { t = el('div', { id: 'toast' }); ui().append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout((t as HTMLElement & { _to?: number })._to);
  (t as HTMLElement & { _to?: number })._to = window.setTimeout(() => t!.classList.remove('show'), ms);
}
export function download(blob: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
