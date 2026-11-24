// The stats page: level, PP and rank, streak, totals, recent galleys, personal bests and the weak-word profile.
import { streak, topWeak, dayKey, isRanked } from "../core/progress.js";
import { RANKS, rankFrom, grade, PP_RULES } from "../core/pp.js";
import { placeLine } from "./boards.js";
import { LISTS } from "../core/words.js";
import { SNIPPETS } from "../core/code.js";
import { esc, fmtDuration } from "./util.js";
import { levelFrom, XP_RULES } from "../core/levels.js";
import { survivalLabel } from "../core/survival.js";
import { FEATS, headline } from "../core/feats.js";

export function resultLabel(r) {
  if (r.kind === "code") return `code · ${SNIPPETS.find((s) => s.id === r.snippet)?.title || r.snippet}`;
  if (r.kind === "quote") return `quote · ${r.length} words`;
  if (r.kind === "practice") return "practice";
  if (r.kind === "daily") return `daily · ${new Date(r.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  if (r.kind === "room") return `friend race · ${r.mode === "time" ? `${r.length}s` : `${r.length} words`}`;
  if (r.kind === "challenge") return `challenge · ${r.mode === "time" ? `${r.length}s` : `${r.length} words`}`;
  if (r.mode === "survival") return [r.kind === "dsurv" ? `daily survival · ${new Date(r.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "survival", `${r.wordsDone} words`, r.surv ? survivalLabel(r.surv) : "", r.punct ? "punctuation" : "", r.nums ? "numbers" : ""].filter(Boolean).join(" · ");
  const base = r.mode === "flow" ? "flow" : r.mode === "time" ? `${r.length}s` : `${r.length} words`;
  const extra = [r.kind === "mix" ? "mixed" : "", r.list && r.list !== "200" ? (LISTS[r.list]?.label || r.list).toLowerCase() : "", r.punct ? "punctuation" : "", r.nums ? "numbers" : "", r.sudden ? "sudden death" : ""].filter(Boolean);
  return [base, ...extra].join(" · ");
}
export const bestLabel = (key) => {
  if (key.startsWith("quote:")) return `quote · ${key.slice(6)}`;
  if (key.startsWith("survival ")) {
    const p = key.split(" ").slice(1), lives = parseInt(p[0], 10) || 3, floor = p.find((x) => x.startsWith("floor"));
    return ["survival", survivalLabel({ lives, regen: p.includes("regen"), floor: floor ? +floor.slice(5) : 0 }), p.includes("punct") ? "punctuation" : "", p.includes("nums") ? "numbers" : ""].filter(Boolean).join(" · ");
  }
  if (key.startsWith("code:")) return `code · ${SNIPPETS.find((s) => s.id === key.slice(5))?.title || key.slice(5)}`;
  const [len, list, ...rest] = key.split(" ");
  const l = len.endsWith("w") ? `${len.slice(0, -1)} words` : len.endsWith("s") ? `${len.slice(0, -1)} seconds` : len;
  return [l, (LISTS[list]?.label || list).toLowerCase(), ...rest.map((x) => (x === "punct" ? "punctuation" : x === "nums" ? "numbers" : x === "sudden" ? "sudden death" : x))].join(" · ");
};
const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function accountCard(a) {
  if (!a || !a.enabled) return "";
  if (!a.user) {
    return `<div class="scard wide acctcard"><h2>Account</h2>
      <div class="sub">You're typing as a guest, so your progress lives in this browser only. Sign in with Google to keep it in your account and carry it to any device. Everything you've typed so far comes with you.</div>
      <div class="sactions"><button type="button" class="go primary" id="acctIn">Sign in with Google</button></div></div>`;
  }
  const status = a.sync === "syncing" ? "Syncing…" : a.sync === "error" ? `Not synced yet (${esc(a.syncError)}). It will try again next time.` : "Everything is saved to your account.";
  return `<div class="scard wide acctcard"><h2>Account</h2>
    <div class="acctrow">${a.user.photo ? `<img src="${esc(a.user.photo)}" alt="" width="40" height="40" referrerpolicy="no-referrer">` : ""}
      <div><div class="big" style="font-size:22px">${esc(a.user.name || a.user.email)}</div><div class="sub">${esc(a.user.email)} · <i class="dot ${esc(a.sync)}"></i> ${status}</div></div></div>
    <div class="namerow"><label for="boardName" class="sub">Name on the boards</label>
      <input id="boardName" class="chin" maxlength="20" value="${esc(a.name || "")}" placeholder="2 to 20 characters"><button type="button" class="go" id="saveName">Save</button><span class="sub" id="nameMsg"></span></div>
    <div class="sub">Signing out keeps everything in your account; this browser starts fresh as a guest.</div>
    <div class="sactions"><button type="button" class="go" id="acctOut">Sign out</button></div></div>`;
}

function levelCard(xp) {
  const L = levelFrom(xp), R = XP_RULES;
  return `<div class="scard wide"><h2>Level</h2>
    <div class="lvrow"><div class="big">Level ${L.level}</div>
      <div class="lvbar"><div class="meter"><i style="width:${(L.progress * 100).toFixed(1)}%"></i></div>
      <div class="sub">${L.into.toLocaleString()} / ${L.need.toLocaleString()} XP · ${(L.need - L.into).toLocaleString()} to level ${L.level + 1} · ${L.xp.toLocaleString()} XP in all</div></div></div>
    <details class="sub"><summary>How XP is earned</summary>
      <ul class="xplist">
        <li><b>Typing:</b> ${R.perWord} XP for every correct word you type, in any galley.</li>
        <li><b>Accuracy:</b> +10% of that at 95%, +25% at 98%, +50% at 100%.</li>
        <li><b>Speed:</b> +1 XP per ${R.speedPer} wpm, up to ${R.speedCap} wpm.</li>
        <li><b>Perfect galley:</b> +${R.perfect}. <b>New personal best:</b> +${R.best}. <b>Rank up:</b> +${R.rankUp}.</li>
        <li><b>First galley of the day:</b> +${R.firstOfDay}, plus ${R.streakStep} for each day of your streak, up to a week.</li>
        <li><b>Daily galley:</b> +${R.daily} for your first attempt.</li>
      </ul>Bonuses need a galley of ${R.minWords}+ words. Each level needs 20 XP more than the last, and there's no top level.</details></div>`;
}

const fmtPp = (x) => Math.round(x).toLocaleString("en-IE");

function ppCard(top) {
  const rk = rankFrom(top), R = PP_RULES;
  const head = rk.rank
    ? `<div class="big">${esc(rk.rank.name)}</div>
       <div class="sub">${fmtPp(rk.pp)} PP${rk.next ? ` · ${fmtPp(rk.next.min - rk.pp)} to ${esc(rk.next.name)}` : " · the top of the ladder"}</div>
       <div class="meter"><i style="width:${(rk.progress * 100).toFixed(0)}%"></i></div>`
    : `<div class="big">Unranked</div><div class="sub">Finish a galley of ${R.minWords}+ words to earn your first PP and a rank.</div>`;
  const ladder = RANKS.slice().reverse().map((r) => `<div class="${rk.rank && r.name === rk.rank.name ? "on" : ""}"><span>${esc(r.name)}</span><span>${r.min.toLocaleString("en-IE")} PP</span></div>`).join("");
  return `<div class="scard"><h2>Rank</h2>${head}<div class="sub placeline" id="placeLine">${rk.rank ? "" : `<a href="#boards">See the boards →</a>`}</div><div class="ladder">${ladder}</div></div>`;
}

function topPlaysCard(top) {
  const R = PP_RULES;
  const rows = top.slice(0, 10).map((p, i) => `<tr><td class="num">${i + 1}</td><td>${esc(resultLabel(p))}</td><td class="num">${p.pp.toFixed(1)}</td><td class="num">${Math.round(R.weight ** i * 100)}%</td><td class="num">${Math.round(p.wpm)}</td><td class="num">${p.acc.toFixed(1)}%</td><td class="grade g${grade(p.acc)}">${grade(p.acc)}</td><td>${shortDate(p.at)}</td></tr>`).join("");
  return `<div class="scard wide"><h2>Top galleys</h2>
    ${rows ? `<div class="tblwrap"><table class="tbl"><thead><tr><th class="num">#</th><th>Galley</th><th class="num">PP</th><th class="num">Counts</th><th class="num">WPM</th><th class="num">Accuracy</th><th>Grade</th><th>When</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="sub">Your best galleys will show here.</div>`}
    <details class="sub"><summary>How PP works</summary>
      <ul class="xplist">
        <li><b>Each galley</b> earns PP from its speed, its accuracy, how hard its words were and its length. 100 wpm at 100% on 50 average top-1,000 words is worth 100 PP.</li>
        <li><b>Accuracy</b> matters most: 98% keeps 78% of the PP, 95% keeps 54%, 90% keeps 28%.</li>
        <li><b>Speed</b> counts a bit more than in proportion: 150 wpm is worth 1.8 times 100 wpm.</li>
        <li><b>Harder words</b> earn more: about 0.85× for the top 200, 1× for the top 1,000, 1.2× for the top 5,000, a little more with punctuation or numbers.</li>
        <li><b>Length:</b> 0.9× at 25 words, 1× at 50, up to 1.2× at 100 words or more.</li>
        <li><b>Your total</b> is your best galley, plus 95% of your second best, 90% of your third and so on, down your top ${R.top}. It only goes up when you set a new top galley.</li>
      </ul>Plain, mixed, daily, challenge and friend-race galleys of ${R.minWords}+ words count; practice, code, flow and sudden death don't. Grades go by accuracy: SS at 100%, S at 98%, A at 95%, B at 90%, C at 85%.</details></div>`;
}

/** The scrapbook: every headline you've made, newest first, and the stories still unreported. */
function scrapbook(feats) {
  const held = FEATS.filter((f) => feats[f.id]).sort((a, b) => feats[b.id].at - feats[a.id].at);
  const open = FEATS.filter((f) => !feats[f.id]);
  const clip = (f) => `<div class="clip"><small>${shortDate(feats[f.id].at)}</small><b>${esc(headline(f.id, feats[f.id]))}</b><span>${esc(f.dek)}</span></div>`;
  const blank = (f) => `<div class="clip unreported"><small>Unreported</small><b>${"▆".repeat(3 + (f.id.length % 4))} ${"▆".repeat(2 + (f.id.length % 3))}</b><span>${esc(f.hint)}</span></div>`;
  return `<div class="scard wide"><h2>The scrapbook</h2>
    <div class="sub">${held.length} of ${FEATS.length} stories filed. Headlines unlock pencils, papers and inks for your desk (Settings → Desk).</div>
    <div class="clips book">${held.map(clip).join("")}${open.map(blank).join("")}</div></div>`;
}

export function renderStats(view, state, handlers) {
  const top = state.top || [];
  const st = streak(state.days, dayKey(Date.now()));
  const weak = topWeak(state.weak, 24);
  const ranked = state.recent.filter(isRanked).slice(0, 30).reverse();
  const bests = Object.entries(state.bests).sort((a, b) => b[1].score - a[1].score);
  // the first attempt each day is the one that counts
  const dailyFirst = new Map();
  for (const r of state.recent) if (r.kind === "daily") dailyFirst.set(r.day, r);
  const dailies = [...dailyFirst.values()].sort((a, b) => b.at - a.at).slice(0, 7);

  let spark = `<div class="sub">Ranked galleys will show here.</div>`;
  if (ranked.length >= 2) {
    const W = 600, H = 70, max = Math.max(...ranked.map((r) => r.score)) * 1.1 || 1;
    const X = (i) => (i / (ranked.length - 1)) * W, Y = (v) => H - (v / max) * (H - 6) - 2;
    const line = ranked.map((r, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(r.score).toFixed(1)}`).join("");
    spark = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score of your last ${ranked.length} ranked galleys"><path class="a" d="${line}L${W},${H}L0,${H}Z"></path><path class="l" d="${line}" vector-effect="non-scaling-stroke"></path></svg>`;
  }
  const recentRows = state.recent.slice(0, 15).map((r) => `<tr><td>${shortDate(r.at)}</td><td>${esc(resultLabel(r))}</td><td class="num">${Math.round(r.wpm)}</td><td class="num">${r.acc.toFixed(1)}%</td><td class="num">${r.score.toFixed(1)}</td><td class="num">${r.pp != null ? r.pp.toFixed(1) : ""}</td><td class="grade g${grade(r.acc)}">${r.kind === "code" || r.mode === "flow" || r.mode === "survival" ? "" : grade(r.acc)}</td></tr>`).join("");
  const bestRows = bests.map(([k, b]) => `<tr><td>${esc(bestLabel(k))}</td><td class="num">${b.words != null ? `${b.words} words` : b.score.toFixed(1)}</td><td class="num">${Math.round(b.wpm)}</td><td class="num">${b.acc.toFixed(1)}%</td><td>${shortDate(b.at)}</td></tr>`).join("");

  view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h1>Your desk</h1>
      <button type="button" class="go" id="statsBack">Back to typing <kbd>esc</kbd></button>
    </div>
    <p class="lede">${handlers.account?.user ? "Everything here is saved to your account." : "Everything here is saved in this browser only."} Score is wpm × accuracy², so accuracy counts for more than speed: 80 wpm at 100% beats 100 wpm at 89%. PP adds up your best galleys, and your rank comes from it.</p>
    <div class="sgrid">
      ${accountCard(handlers.account)}
      <a class="scard wide edlink" href="#edition"><h2>The Retype Weekly</h2><div class="big">Read this week's edition →</div><div class="sub">Your week at the desk as a front page: the numbers, your best, the word that gave you the most trouble and the headlines you made. A new one comes out every Monday.</div></a>
      ${levelCard(state.xp)}
      ${ppCard(top)}
      <div class="scard"><h2>Streak</h2><div class="big">${st.count} ${st.count === 1 ? "day" : "days"}</div>
        <div class="sub">Best ${Math.max(state.bestStreak, st.count)} ${Math.max(state.bestStreak, st.count) === 1 ? "day" : "days"}. Any finished galley counts for the day.</div>
        <div class="sub">${st.graceLeft ? "You can miss one day without losing it." : "You've used your missed day for this week; tomorrow counts."}</div></div>
      <div class="scard"><h2>On the desk so far</h2>
        <div class="big">${state.totals.galleys}</div><div class="sub">${state.totals.galleys === 1 ? "galley" : "galleys"} finished</div>
        <div class="sub">${fmtDuration(state.totals.secs)} typing · ${state.totals.keys.toLocaleString()} keys · ${state.totals.perfect} perfect ${state.totals.perfect === 1 ? "galley" : "galleys"} (10+ words, no mistakes)</div></div>
      ${topPlaysCard(top)}
      <div class="scard wide"><h2>Recent galleys</h2>${spark}
        ${recentRows ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>When</th><th>Galley</th><th class="num">WPM</th><th class="num">Accuracy</th><th class="num">Score</th><th class="num">PP</th><th>Grade</th></tr></thead><tbody>${recentRows}</tbody></table></div>` : `<div class="sub">Nothing yet. Your first galley is waiting.</div>`}</div>
      <div class="scard wide"><h2>Daily galleys</h2>
        <div class="sub">One 40-word galley a day from the top 1,000, the same words for everyone. Your first attempt each day counts.</div>
        ${dailies.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Day</th><th class="num">WPM</th><th class="num">Accuracy</th><th class="num">Score</th><th></th></tr></thead><tbody>${dailies.map((r) => `<tr><td>${shortDate(r.at)}</td><td class="num">${Math.round(r.wpm)}</td><td class="num">${r.acc.toFixed(1)}%</td><td class="num">${r.score.toFixed(1)}</td><td>${r.clean ? "perfect" : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
        <div class="sactions"><button type="button" class="go" id="statsDaily">Type today's daily</button></div></div>
      <div class="scard wide"><h2>Personal bests</h2>
        ${bestRows ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Galley</th><th class="num">Score</th><th class="num">WPM</th><th class="num">Accuracy</th><th>Set</th></tr></thead><tbody>${bestRows}</tbody></table></div>` : `<div class="sub">Each kind of galley keeps its own best.</div>`}</div>
      ${scrapbook(state.feats || {})}
      <div class="scard wide"><h2>Words that need work</h2>
        <div class="sub">Built up over every galley you've typed. A word drops off once you've typed it cleanly and at your normal pace a few times.</div>
        ${weak.length ? `<div class="chips">${weak.map((w) => `<span>${esc(w.word)}<i>${w.trouble.toFixed(1)}</i></span>`).join("")}</div>
        <div class="sactions"><button type="button" class="go primary" id="statsPractice">Practise these</button><button type="button" class="go" id="statsMix">Mix them into galleys</button></div>` : `<div class="sub">Nothing flagged yet.</div>`}</div>
      <div class="scard wide"><h2>Data</h2><div class="sub">${handlers.account?.user ? "Clearing removes every galley, best, streak and weak word from your account and this browser. It can't be undone." : "Clearing removes every saved galley, best, streak and weak word from this browser. Settings stay."}</div>
        <div class="sactions"><button type="button" class="go danger" id="statsReset">Clear my progress</button></div></div>
    </div>`;
  view.querySelector("#statsBack").onclick = handlers.onBack;
  view.querySelector("#acctIn")?.addEventListener("click", handlers.onSignIn);
  view.querySelector("#acctOut")?.addEventListener("click", handlers.onSignOut);
  view.querySelector("#statsDaily").onclick = handlers.onDaily;
  const save = view.querySelector("#saveName");
  if (save) save.onclick = async () => {
    const msg = view.querySelector("#nameMsg");
    msg.textContent = "Saving…";
    msg.textContent = await handlers.onRename(view.querySelector("#boardName").value);
  };
  if (top.length) placeLine(view.querySelector("#placeLine"), handlers.signedIn ? handlers : {});
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
