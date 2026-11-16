// The speed chart on the results sheet: one point per keystroke, scrubbable by hover.
import { $, esc } from "./util.js";

export function renderChart(box, legend, d, r, ctx) {
  const bs = d.pts.filter((p) => p.burst != null).map((p) => p.burst);
  const peak = bs.length ? Math.round(Math.max(...bs)) : null;
  legend.innerHTML = `<span><i class="sw"></i>Actual <b>${Math.round(r.wpm)}</b></span><span><i class="sw raw"></i>Raw <b>${Math.round(r.raw)}</b></span><span><i class="sw dot"></i>Burst${peak != null ? ` peak <b>${peak}</b>` : ""}</span><span><i class="sw x">×</i>Mistakes <b>${r.errors}</b></span><span>wpm · hover for each key</span>`;
  drawChart(box, d, ctx);
}

/** ctx: { targets, code, lineNo } for the tooltip text. */
export function drawChart(box, d, ctx) {
  if (!d.pts.length) { box.innerHTML = ""; return; }
  const W = Math.max(300, box.clientWidth), H = 240, L = 40, R = 14, Tp = 14, B = 28;
  const vals = d.pts.flatMap((p) => [p.act, p.raw, p.burst]).filter((v) => v != null);
  const top = Math.max(20, ...vals);
  const step = top > 200 ? 50 : top > 100 ? 25 : top > 50 ? 20 : 10, maxV = Math.ceil((top * 1.08) / step) * step;
  const X = (s) => L + (s / d.T) * (W - L - R), Y = (v) => Tp + (1 - Math.min(v, maxV) / maxV) * (H - Tp - B);
  const tstep = [1, 2, 5, 10, 15, 30, 60, 120].find((t) => d.T / t <= 10) || 300;
  let g = "";
  for (let v = 0; v <= maxV; v += step) g += `<line class="cg" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"></line><text class="cy" x="${L - 8}" y="${Y(v) + 4}">${v}</text>`;
  for (let s = 0; s <= d.T + 1e-9; s += tstep) g += `<text class="cx" x="${X(s)}" y="${H - 8}">${s}s</text>`;
  const path = (k) => {
    let out = "", pen = false;
    for (const p of d.pts) {
      if (p[k] == null) { pen = false; continue; }
      out += `${pen ? "L" : "M"}${X(p.s).toFixed(1)},${Y(p[k]).toFixed(1)}`; pen = true;
    }
    return out;
  };
  const actPts = d.pts.filter((p) => p.act != null), last = actPts[actPts.length - 1];
  const area = actPts.length ? `M${X(actPts[0].s).toFixed(1)},${Y(0)}` + actPts.map((p) => `L${X(p.s).toFixed(1)},${Y(p.act).toFixed(1)}`).join("") + `L${X(last.s).toFixed(1)},${Y(0)}Z` : "";
  const stack = new Map(); let errs = "";
  for (const p of d.pts) {
    if (p.k.ok) continue;
    const b = Math.round(p.s * 2), n = stack.get(b) || 0; stack.set(b, n + 1);
    const x = X(Math.min(p.s, d.T)), y = H - B - 7 - n * 9;
    errs += `<path class="c-err" d="M${x - 3.5},${y - 3.5}L${x + 3.5},${y + 3.5}M${x + 3.5},${y - 3.5}L${x - 3.5},${y + 3.5}"></path>`;
  }
  const bursts = d.pts.filter((p) => p.burst != null).map((p) => `<circle class="c-burst" cx="${X(p.s).toFixed(1)}" cy="${Y(p.burst).toFixed(1)}" r="3.5"></circle>`).join("");
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Speed over the galley, one point per keystroke: actual and raw words per minute, burst speed per word, and mistakes">
    ${g}<path class="c-area" d="${area}"></path><path class="c-raw" d="${path("raw")}"></path><path class="c-act" d="${path("act")}"></path>
    ${bursts}${errs}${last ? `<circle class="c-end" cx="${X(last.s).toFixed(1)}" cy="${Y(last.act).toFixed(1)}" r="4"></circle>` : ""}
    <line class="c-guide" data-r="guide" y1="${Tp}" y2="${H - B}" x1="-10" x2="-10"></line>
    <circle data-r="hlA" r="4.5" cx="-20" cy="-20" fill="var(--ink)" stroke="var(--paper)" stroke-width="2"></circle>
    <circle data-r="hlR" r="4" cx="-20" cy="-20" fill="var(--todo)" stroke="var(--paper)" stroke-width="2"></circle>
    <circle data-r="hlB" r="6" cx="-20" cy="-20" fill="var(--kw)" stroke="var(--paper)" stroke-width="2"></circle>
    <rect x="${L}" y="${Tp}" width="${W - L - R}" height="${H - Tp - B}" fill="transparent" data-r="hit"></rect></svg><div class="tip" hidden></div>`;
  const q = (r) => $(`[data-r="${r}"]`, box), hit = q("hit"), guide = q("guide"), hlA = q("hlA"), hlR = q("hlR"), hlB = q("hlB"), tip = $(".tip", box);
  const set = (el, a) => { for (const k in a) el.setAttribute(k, a[k]); };
  const off = { cx: -20, cy: -20 };
  const keyName = (c) => (c === " " ? "space" : c == null ? "–" : c);
  hit.addEventListener("mousemove", (e) => {
    const rect = hit.getBoundingClientRect(), sx = L + (e.clientX - rect.left) * ((W - L - R) / rect.width);
    let p = d.pts[0];
    for (const c of d.pts) if (Math.abs(X(c.s) - sx) < Math.abs(X(p.s) - sx)) p = c;
    const x = X(p.s), k = p.k;
    set(guide, { x1: x, x2: x });
    set(hlA, p.act != null ? { cx: x, cy: Y(p.act) } : off);
    set(hlR, p.raw != null ? { cx: x, cy: Y(p.raw) } : off);
    set(hlB, p.burst != null ? { cx: x, cy: Y(p.burst) } : off);
    const tgt = ctx.targets[k.w], at = Math.min(k.pos, tgt.length), from = Math.max(0, at - 14), to = Math.min(tgt.length, at + 14);
    const where = ctx.code ? `<span style="color:var(--desk-muted)">line ${ctx.lineNo[k.w]}</span> ` : "";
    const word = k.space ? esc(tgt.slice(from).trim()) + " ␣"
      : esc(tgt.slice(from, at)) + `<u style="text-decoration-color:${k.ok ? "var(--desk-ink)" : "var(--pencil)"};text-decoration-thickness:2px">${esc(tgt[at] ?? "")}</u>` + esc(tgt.slice(at + 1, to));
    const verdict = k.ok ? `<b>${esc(keyName(k.ch))}</b>` : `<b style="color:var(--pencil)">${esc(keyName(k.ch))}</b> for ${esc(keyName(k.exp))}`;
    tip.innerHTML = `${where}<span style="font-family:'Courier Prime',monospace">${word}</span><br>${verdict} at ${p.s.toFixed(2)}s${p.gap != null ? ` · ${Math.round(p.gap)}ms after the last key` : ""}<br>Actual ${p.act != null ? Math.round(p.act) : "–"} · Raw ${p.raw != null ? Math.round(p.raw) : "–"}${p.burst != null ? ` · Burst ${Math.round(p.burst)}` : ""}`;
    tip.hidden = false;
    tip.style.left = (x > W - 260 ? x - tip.offsetWidth - 12 : x + 12) + "px";
  });
  hit.addEventListener("mouseleave", () => { tip.hidden = true; set(guide, { x1: -10, x2: -10 }); set(hlA, off); set(hlR, off); set(hlB, off); });
}
