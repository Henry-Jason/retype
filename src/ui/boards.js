// The boards page: the all-time PP board and today's daily board. Public, so guests can look too.
import { esc } from "./util.js";
import { PP_RULES } from "../core/pp.js";

const fmtPp = (x) => Math.round(x).toLocaleString("en-IE");
export const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const SHOW = 50;

const BOARDS = {
  pp: {
    tab: "PP",
    about: `Everyone's total PP: their best galley, plus 95% of the second, 90% of the third and so on, down their top ${PP_RULES.top}. Every galley is re-scored from its keystrokes on the server before it counts.`,
    empty: "Nobody's on the PP board yet.",
    head: `<th class="num">#</th><th>Name</th><th class="num">PP</th><th class="num">Best galley</th><th class="num">Galleys</th>`,
    row: (r) => `<td>${esc(r.name)}</td><td class="num">${fmtPp(r.pp)}</td><td class="num">${r.best.toFixed(1)}</td><td class="num">${r.count}</td>`
  },
  daily: {
    tab: "Today's daily",
    about: "Today's 40 words from the top 1,000, the same for everyone. Each player's first attempt of the day counts, re-scored from its keystrokes on the server.",
    empty: "Nobody's on today's board yet. Be first.",
    head: `<th class="num">#</th><th>Name</th><th class="num">Score</th><th class="num">WPM</th><th class="num">Accuracy</th><th></th>`,
    row: (r) => `<td>${esc(r.name)}</td><td class="num">${r.score.toFixed(1)}</td><td class="num">${Math.round(r.wpm)}</td><td class="num">${r.acc.toFixed(1)}%</td><td>${r.clean ? "perfect" : ""}</td>`
  },
  dsurv: {
    tab: "Daily survival",
    about: "Today's survival run, the same words for everyone: 3 lives, a 30 wpm floor, no regen. Furthest run wins, then score. Each player's first attempt of the day counts, and every life is re-checked from the keystrokes.",
    empty: "Nobody's survived today yet. Be first.",
    head: `<th class="num">#</th><th>Name</th><th class="num">Words</th><th class="num">WPM</th><th class="num">Accuracy</th>`,
    row: (r) => `<td>${esc(r.name)}</td><td class="num">${r.words}</td><td class="num">${Math.round(r.wpm)}</td><td class="num">${r.acc.toFixed(1)}%</td>`
  }
};

/**
 * handlers: { onBack, onDaily, onSignIn, signedIn, load(which, n) -> { rows, me },
 *             place(which) -> { place, of, entry } | null }   (load null when offline)
 */
export function renderBoards(view, handlers) {
  view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h1>The boards</h1>
      <button type="button" class="go" id="boardsBack">Back to typing <kbd>esc</kbd></button>
    </div>
    <p class="lede">How you compare. Nothing gets on a board without the server re-checking it from the keystrokes, so every entry was typed by hand.</p>
    <div class="scard wide boardpage">
      <div class="boardhead"><div class="seg" role="tablist">${Object.entries(BOARDS).map(([k, b]) => `<button type="button" role="tab" data-board="${k}">${b.tab}</button>`).join("")}</div>
        <div class="sactions" style="margin:0">${handlers.signedIn ? "" : `<button type="button" class="go primary" id="boardsIn">Sign in to join</button>`}<button type="button" class="go" id="boardsDaily">Type today's daily</button><button type="button" class="go" id="boardsDsurv">Today's survival run</button></div></div>
      <div class="sub" id="boardAbout"></div>
      <div id="boardBox" class="sub">Loading…</div>
    </div>`;
  view.querySelector("#boardsBack").onclick = handlers.onBack;
  view.querySelector("#boardsDaily").onclick = handlers.onDaily;
  view.querySelector("#boardsDsurv").onclick = handlers.onDailySurv;
  view.querySelector("#boardsIn")?.addEventListener("click", handlers.onSignIn);
  const box = view.querySelector("#boardBox"), about = view.querySelector("#boardAbout"), tabs = [...view.querySelectorAll("[data-board]")];
  const show = (which) => {
    box.dataset.which = which;
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.board === which));
    about.textContent = BOARDS[which].about;
    try { localStorage.setItem("retype-board", which); } catch { /* fine */ }
    fill(box, handlers, which);
  };
  for (const t of tabs) t.onclick = () => show(t.dataset.board);
  let which = "pp";
  try { const saved = localStorage.getItem("retype-board"); if (saved in BOARDS) which = saved; } catch { /* fine */ }
  show(which);
}

async function fill(box, handlers, which) {
  if (!handlers.load) { box.textContent = "The boards need an internet connection to load."; return; }
  const B = BOARDS[which];
  box.innerHTML = `<div class="sub">Loading…</div>`;
  try {
    const { rows, me } = await handlers.load(which, SHOW);
    if (!box.isConnected || box.dataset.which !== which) return;
    let html = rows.length
      ? `<div class="tblwrap"><table class="tbl board"><thead><tr>${B.head}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.uid === me ? "me" : ""}"><td class="num">${i + 1}</td>${B.row(r)}</tr>`).join("")}</tbody></table></div>`
      : `<div class="sub">${B.empty}</div>`;
    box.innerHTML = html;
    // signed in but further down than the table shows: say where
    if (me && rows.length >= SHOW && !rows.some((r) => r.uid === me)) {
      const p = await handlers.place(which);
      if (p && box.isConnected && box.dataset.which === which) {
        box.insertAdjacentHTML("beforeend", `<div class="tblwrap"><table class="tbl board"><tbody><tr class="me"><td class="num">${p.place}</td>${B.row(p.entry)}</tr></tbody></table></div>`);
      }
    }
  } catch (e) {
    if (box.isConnected) box.textContent = "Couldn't load the board right now.";
  }
}

/** One line for the Stats page: where you stand on the PP board. */
export async function placeLine(el, handlers) {
  if (!el) return;
  if (!handlers.place) { el.innerHTML = `<a href="#boards">See the boards →</a>`; return; }
  try {
    const p = await handlers.place("pp");
    if (!el.isConnected) return;
    el.innerHTML = p ? `<a href="#boards">${ordinal(p.place)} of ${p.of} on the PP board →</a>` : `<a href="#boards">See the boards →</a>`;
  } catch {
    if (el.isConnected) el.innerHTML = `<a href="#boards">See the boards →</a>`;
  }
}
