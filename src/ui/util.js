export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pad = (n, w = 2) => String(n).padStart(w, "0");
export const fmtSecs = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}` : `${s.toFixed(1)}s`);
export const fmtDuration = (s) => {
  if (s < 60) return `${Math.round(s)}s`;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};
export const stampDate = (t = Date.now()) => {
  const d = new Date(t);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
