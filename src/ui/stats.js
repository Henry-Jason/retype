// The stats page: rank, streak, totals, recent galleys, personal bests and the weak-word profile.
import { RANKS, rankFrom, streak, topWeak, dayKey, isRanked } from "../core/progress.js";
import { LISTS } from "../core/words.js";
import { SNIPPETS } from "../core/code.js";
import { esc, fmtDuration } from "./util.js";

export function resultLabel(r) {
  if (r.kind === "code") return `code · ${SNIPPETS.find((s) => s.id === r.snippet)?.title || r.snippet}`;
  if (r.kind === "practice") return "practice";
  if (r.kind === "daily") return `daily · ${new Date(r.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  if (r.kind === "challenge") return `challenge · ${r.mode === "time" ? `${r.length}s` : `${r.length} words`}`;
  const base = r.mode === "flow" ? "flow" : r.mode === "time" ? `${r.length}s` : `${r.length} words`;
  const extra = [r.kind === "mix" ? "mixed" : "", r.list && r.list !== "200" ? (LISTS[r.list]?.label || r.list).toLowerCase() : "", r.punct ? "punctuation" : "", r.nums ? "numbers" : "", r.sudden ? "sudden death" : ""].filter(Boolean);
  return [base, ...extra].join(" · ");
}
const bestLabel = (key) => {
  if (key.startsWith("code:")) return `code · ${SNIPPETS.find((s) => s.id === key.slice(5))?.title || key.slice(5)}`;
  const [len, list, ...rest] = key.split(" ");
  const l = len.endsWith("w") ? `${len.slice(0, -1)} words` : len.endsWith("s") ? `${len.slice(0, -1)} seconds` : len;
  return [l, (LISTS[list]?.label || list).toLowerCase(), ...rest.map((x) => (x === "punct" ? "punctuation" : x === "nums" ? "numbers" : x === "sudden" ? "sudden death" : x))].join(" · ");
};
const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function renderStats(view, state, handlers) {
  const rk = rankFrom(state.recent);
  const st = streak(state.days, dayKey(Date.now()));
  const weak = topWeak(state.weak, 24);
  const ranked = state.recent.filter(isRanked).slice(0, 30).reverse();
  const bests = Object.entries(state.bests).sort((a, b) => b[1].score - a[1].score);
  // the first attempt each day is the one that counts
  const dailyFirst = new Map();
  for (const r of state.recent) if (r.kind === "daily") dailyFirst.set(r.day, r);
  const dailies = [...dailyFirst.values()].sort((a, b) => b.at - a.at).slice(0, 7);

  const rankCard = rk.rank
    ? `<div class="big">${esc(rk.rank.name)}</div>
       <div class="sub">Score ${rk.score.toFixed(1)}${rk.next ? ` · ${(rk.next.min - rk.score).toFixed(1)} to ${esc(rk.next.name)}` : " · the top of the ladder"}</div>
       <div class="meter"><i style="width:${(rk.progress * 100).toFixed(0)}%"></i></div>`
    : `<div class="big">Unranked</div><div class="sub">Finish ${rk.needed} more ranked ${rk.needed === 1 ? "galley" : "galleys"} to get a rank.</div>`;
  const ladder = RANKS.slice().reverse().map((r) => `<div class="${rk.rank && r.name === rk.rank.name ? "on" : ""}"><span>${esc(r.name)}</span><span>${r.min}+</span></div>`).join("");

  let spark = `<div class="sub">Ranked galleys will show here.</div>`;
  if (ranked.length >= 2) {
    const W = 600, H = 70, max = Math.max(...ranked.map((r) => r.score)) * 1.1 || 1;
    const X = (i) => (i / (ranked.length - 1)) * W, Y = (v) => H - (v / max) * (H - 6) - 2;
    const line = ranked.map((r, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(r.score).toFixed(1)}`).join("");
    spark = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score of your last ${ranked.length} ranked galleys"><path class="a" d="${line}L${W},${H}L0,${H}Z"></path><path class="l" d="${line}" vector-effect="non-scaling-stroke"></path></svg>`;
  }
  const recentRows = state.recent.slice(0, 15).map((r) => `<tr><td>${shortDate(r.at)}</td><td>${esc(resultLabel(r))}</td><td class="num">${Math.round(r.wpm)}</td><td class="num">${r.acc.toFixed(1)}%</td><td class="num">${r.score.toFixed(1)}</td><td>${r.clean ? "perfect" : ""}</td></tr>`).join("");
  const bestRows = bests.map(([k, b]) => `<tr><td>${esc(bestLabel(k))}</td><td class="num">${b.score.toFixed(1)}</td><td class="num">${Math.round(b.wpm)}</td><td class="num">${b.acc.toFixed(1)}%</td><td>${shortDate(b.at)}</td></tr>`).join("");

  view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h1>Your desk</h1>
      <button type="button" class="go" id="statsBack">Back to typing <kbd>esc</kbd></button>
    </div>
    <p class="lede">Everything here is saved in this browser only. Score is wpm × accuracy², so accuracy counts for more than speed: 80 wpm at 100% beats 100 wpm at 89%.</p>
    <div class="sgrid">
      <div class="scard"><h2>Rank</h2>${rankCard}<div class="sub">From your last ${Math.min(10, Math.max(rk.count, 0))} ranked galleys. Practice, code, flow, sudden death and galleys under 15 words don't count.</div><div class="ladder">${ladder}</div></div>
      <div class="scard"><h2>Streak</h2><div class="big">${st.count} ${st.count === 1 ? "day" : "days"}</div>
        <div class="sub">Best ${Math.max(state.bestStreak, st.count)} ${Math.max(state.bestStreak, st.count) === 1 ? "day" : "days"}. Any finished galley counts for the day.</div>
        <div class="sub">${st.graceLeft ? "You can miss one day without losing it." : "You've used your missed day for this week; tomorrow counts."}</div></div>
      <div class="scard"><h2>On the desk so far</h2>
        <div class="big">${state.totals.galleys}</div><div class="sub">${state.totals.galleys === 1 ? "galley" : "galleys"} finished</div>
        <div class="sub">${fmtDuration(state.totals.secs)} typing · ${state.totals.keys.toLocaleString()} keys · ${state.totals.perfect} perfect ${state.totals.perfect === 1 ? "galley" : "galleys"} (10+ words, no mistakes)</div></div>
      <div class="scard wide"><h2>Recent galleys</h2>${spark}
        ${recentRows ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>When</th><th>Galley</th><th class="num">WPM</th><th class="num">Accuracy</th><th class="num">Score</th><th></th></tr></thead><tbody>${recentRows}</tbody></table></div>` : `<div class="sub">Nothing yet. Your first galley is waiting.</div>`}</div>
      <div class="scard wide"><h2>Daily galleys</h2>
        <div class="sub">One 40-word galley a day from the top 1,000, the same words for everyone. Your first attempt each day counts.</div>
        ${dailies.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Day</th><th class="num">WPM</th><th class="num">Accuracy</th><th class="num">Score</th><th></th></tr></thead><tbody>${dailies.map((r) => `<tr><td>${shortDate(r.at)}</td><td class="num">${Math.round(r.wpm)}</td><td class="num">${r.acc.toFixed(1)}%</td><td class="num">${r.score.toFixed(1)}</td><td>${r.clean ? "perfect" : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
        <div class="sactions"><button type="button" class="go" id="statsDaily">Type today's daily</button></div></div>
      <div class="scard wide"><h2>Personal bests</h2>
        ${bestRows ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Galley</th><th class="num">Score</th><th class="num">WPM</th><th class="num">Accuracy</th><th>Set</th></tr></thead><tbody>${bestRows}</tbody></table></div>` : `<div class="sub">Each kind of galley keeps its own best.</div>`}</div>
      <div class="scard wide"><h2>Words that need work</h2>
        <div class="sub">Built up over every galley you've typed. A word drops off once you've typed it cleanly and at your normal pace a few times.</div>
        ${weak.length ? `<div class="chips">${weak.map((w) => `<span>${esc(w.word)}<i>${w.trouble.toFixed(1)}</i></span>`).join("")}</div>
        <div class="sactions"><button type="button" class="go primary" id="statsPractice">Practise these</button><button type="button" class="go" id="statsMix">Mix them into galleys</button></div>` : `<div class="sub">Nothing flagged yet.</div>`}</div>
      <div class="scard wide"><h2>Data</h2><div class="sub">Clearing removes every saved galley, best, streak and weak word from this browser. Settings stay.</div>
        <div class="sactions"><button type="button" class="go danger" id="statsReset">Clear my progress</button></div></div>
    </div>`;
  view.querySelector("#statsBack").onclick = handlers.onBack;
  view.querySelector("#statsDaily").onclick = handlers.onDaily;
  if (weak.length) {
    view.querySelector("#statsPractice").onclick = () => handlers.onPractice(weak.slice(0, 10).map((w) => w.word));
    view.querySelector("#statsMix").onclick = () => handlers.onMix(weak.slice(0, 12).map((w) => w.word));
  }
  const reset = view.querySelector("#statsReset");
  reset.onclick = () => {
    if (reset.dataset.armed) { handlers.onReset(); return; }
    reset.dataset.armed = "1";
    reset.textContent = "Click again to clear everything";
    setTimeout(() => { if (reset.isConnected) { delete reset.dataset.armed; reset.textContent = "Clear my progress"; } }, 4000);
  };
}
