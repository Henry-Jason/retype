// The typing desk: header, galley/page/script rendering, the keyboard, the till roll, and the
// finish screen. Scoring, storage and progress live in src/core and src/storage.
import { mulberry32, randomSeed } from "../core/rng.js";
import { genWords, shuffleSpread, pairDrill, LISTS } from "../core/words.js";
import { analyse, describe } from "../core/analysis.js";
import { chartData } from "../core/chart-data.js";
import { SNIPPETS, scriptLines } from "../core/code.js";
import { buildResult } from "../core/result.js";
import { rankFrom, streak, dayKey, topWeak, score } from "../core/progress.js";
import { encodeChallenge, decodeChallenge, dailySeed, compare, DAILY } from "../core/challenge.js";
import { record, emptyState, loadProgress } from "../storage/progress-service.js";
import { syncAccount, pushGalley, forgetAccount, clearAccount, ensureProfile } from "../storage/account-sync.js";
import { DEFAULTS, PRESETS, LIMITS, SLIDE, FS, FONTS, SETTINGS, saveSettings } from "./settings.js";
import { playKey, playErr } from "./sound.js";
import { renderChart, drawChart } from "./chart.js";
import { drawCard, downloadCard } from "./share.js";
import { renderStats, bestLabel } from "./stats.js";
import { levelFrom } from "../core/levels.js";
import { cleanName } from "../core/sync.js";
import { $, esc, pad, stampDate, uuid } from "./util.js";

export function startApp({ cfg, store, progress, accountsEnabled = false, cloudReady = Promise.resolve(null) }) {
  const stage = $("#stage"), track = $("#track"), tape = $(".tape"), pencil = $("#pencil"), input = $("#hidden"), tag = $("#tag");
  const during = $("#during"), after = $("#after"), receipt = $("#receipt"), corrList = $("#corr"), drawer = $("#drawer"), scrim = $("#scrim");
  const typingView = $("#typingView"), statsView = $("#statsView"), doneBand = $("#done");
  const liveAcc = $("#liveAcc"), liveStreak = $("#liveStreak"), liveProg = $("#liveProg"), progLabel = $("#progLabel");

  let state = progress;
  // accounts: cloud is the Firebase layer once loaded; user is who's signed in
  let cloud = null, user = null, sync = "idle", syncError = "", boardName = "";
  let test, wordEls, cache, center, rows, ticker, idleTimer, editing = null, drawerOpen = false, lastChart = null;
  const galleyNo = () => pad(state.totals.galleys + 1, 4);
  let notice = "";
  const dayLabel = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" }); };
  const o2label = (o) => [o.mode === "time" ? `${o.length} seconds` : `${o.length} words`, (LISTS[o.list]?.label || o.list).toLowerCase(), o.punct ? "punctuation" : "", o.nums ? "numbers" : "", o.sudden ? "sudden death" : ""].filter(Boolean).join(" · ");

  /* ---------- display ---------- */
  function applyDisplay() {
    const root = document.documentElement;
    root.style.setProperty("--lines", cfg.lines);
    root.style.setProperty("--type", FONTS[cfg.font]);
    root.style.setProperty("--slide", SLIDE[cfg.slide] + "ms");
    if (cfg.theme === "system") delete root.dataset.rtTheme; else root.dataset.rtTheme = cfg.theme;
    const b = document.body.classList;
    b.toggle("hide-live", !cfg.live); b.toggle("hide-margin", !cfg.margin); b.toggle("hide-roll", !cfg.roll); b.toggle("focus", cfg.focus);
    if (!cfg.focus) b.remove("typing-now");
  }
  function updateStanding() {
    const rk = rankFrom(state.recent), st = streak(state.days, dayKey(Date.now()));
    const bits = [];
    if (state.totals.galleys || state.xp) bits.push(`<b class="lv" title="${levelFrom(state.xp).into} / ${levelFrom(state.xp).need} XP to the next level">Lv ${levelFrom(state.xp).level}</b>`);
    if (rk.rank) bits.push(`<b>${esc(rk.rank.name)}</b>`);
    else if (state.totals.galleys) bits.push("unranked");
    if (st.count) bits.push(`${st.count}-day streak`);
    $("#standing").innerHTML = bits.length ? bits.join('<span class="sep">·</span>') : user ? "" : "guest";
    renderNavs();
  }
  // one toast at a time; kind "pb" or "lv" colours it
  const toastQueue = [];
  function toast(msg, kind = "") {
    toastQueue.push({ msg, kind });
    if (!toast.busy) nextToast();
  }
  function nextToast() {
    const t = $("#toast"), n = toastQueue.shift();
    if (!n) { toast.busy = false; return; }
    toast.busy = true;
    t.textContent = n.msg; t.className = "toast" + (n.kind ? " " + n.kind : ""); t.hidden = false;
    setTimeout(() => { t.hidden = true; setTimeout(nextToast, 250); }, n.kind ? 3600 : 4200);
  }

  /* ---------- header ---------- */
  const ICON_GEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
  const ICON_CHART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`;
  function renderConfig() {
    const box = $("#config"); box.replaceChildren();
    const sep = () => { const d = document.createElement("span"); d.className = "div"; box.appendChild(d); };
    const btn = (label, pressed, onclick) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label;
      b.setAttribute("aria-pressed", String(pressed)); b.onclick = onclick; return b;
    };
    const plain = test && (test.source.kind === "normal" || test.source.kind === "mix");
    ["words", "time"].forEach((mode, gi) => {
      if (gi) sep();
      const g = document.createElement("div"); g.className = "grp";
      g.innerHTML = `<span class="lbl">${mode === "words" ? "words" : "seconds"}</span>`;
      const active = plain && cfg.mode === mode;
      for (const v of PRESETS[mode]) g.appendChild(btn(v, active && cfg[mode] === v, () => applyConfig(mode, v)));
      const isCustom = !PRESETS[mode].includes(cfg[mode]);
      if (editing === mode) {
        const inp = document.createElement("input"); inp.type = "number"; inp.id = "custom-" + mode;
        inp.min = LIMITS[mode][0]; inp.max = LIMITS[mode][1]; inp.value = cfg[mode];
        inp.setAttribute("aria-label", `Custom ${mode === "words" ? "word count" : "seconds"}`);
        let done = false;
        const commit = (ok) => {
          if (done) return; done = true; editing = null;
          const v = Math.round(+inp.value);
          if (ok && v >= LIMITS[mode][0] && v <= LIMITS[mode][1]) applyConfig(mode, v); else { renderConfig(); focusInput(); }
        };
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); commit(true); } else if (e.key === "Escape") { e.preventDefault(); commit(false); } };
        inp.onblur = () => commit(true);
        g.appendChild(inp); requestAnimationFrame(() => { inp.focus(); inp.select(); });
      } else {
        g.appendChild(btn(isCustom ? `${cfg[mode]} ✎` : "custom", active && isCustom, () => { editing = mode; renderConfig(); }));
      }
      box.appendChild(g);
    });
    // which word list: one click, same setting as in the drawer
    sep();
    const lists = document.createElement("div"); lists.className = "grp";
    lists.innerHTML = `<span class="lbl">top</span>`;
    for (const [key, label] of [["200", "200"], ["1k", "1k"], ["5k", "5k"]]) {
      const b = btn(label, plain && cfg.list === key, () => {
        cfg.list = key; saveSettings(cfg);
        newTest(test && test.source.kind === "mix" ? { ...test.source, seed: undefined } : { kind: "normal" });
      });
      b.title = `${LISTS[key].label} words`;
      lists.appendChild(b);
    }
    box.appendChild(lists);
    sep();
    const more = document.createElement("div"); more.className = "grp";
    more.appendChild(btn("flow", plain && cfg.mode === "flow", () => { cfg.mode = "flow"; saveSettings(cfg); newTest({ kind: "normal" }); }));
    more.appendChild(btn("python", !!(test && test.code), () => newTest({ kind: "code", idx: test && test.code ? test.source.idx : 0 })));
    more.appendChild(btn("daily", !!(test && test.source.kind === "daily"), () => newTest(dailySource())));
    box.appendChild(more);
    renderNavs();
  }
  function renderNavs() {
    const navs = $("#navs"); if (!navs) return;
    navs.replaceChildren();
    const nav = (cls, html, onclick, id, title) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.id = id; b.innerHTML = html; b.onclick = onclick; if (title) b.title = title; navs.appendChild(b); };
    if (accountsEnabled) {
      if (user) {
        const first = esc((user.name || user.email || "Account").split(/[ @]/)[0]);
        const title = sync === "syncing" ? "Syncing…" : sync === "error" ? `Not synced: ${syncError}` : "Synced";
        nav("navbtn acct", `<i class="dot ${sync}"></i>${first}`, () => { location.hash = "stats"; }, "openAccount", title);
      } else {
        nav("navbtn", "Sign in", signIn, "signIn", "Sign in with Google to keep your progress on every device");
      }
    }
    nav("navbtn", `${ICON_CHART}Stats`, () => { location.hash = "stats"; }, "openStats");
    nav("navbtn", `${ICON_GEAR}Settings`, openSettings, "openSettings");
  }

  /* ---------- the daily board ---------- */
  // The Cloud Function checks the galley and posts it a few seconds after it's saved.
  async function showBoardPlace(result, band) {
    if (!cloud?.dailyEntry || !band) return;
    const note = document.createElement("div"); note.className = "note"; note.textContent = "Checking your daily for the board…";
    band.appendChild(note);
    for (let i = 0; i < 10; i++) {
      await new Promise((ok) => setTimeout(ok, i ? 2000 : 1500));
      if (!note.isConnected) return;
      try {
        const e = await cloud.dailyEntry(result.day, user.uid);
        if (e && e.resultId === result.id) {
          const p = await cloud.dailyPlace(result.day, e.score);
          note.textContent = `On today's board: ${ordinal(p.place)} of ${p.of}.`;
          return;
        }
        if (e) { note.textContent = "Your first attempt today is already on the board; retries don't change it."; return; }
      } catch { /* try again */ }
    }
    note.textContent = "Not on the board yet. It may still be checking; look on the Stats page in a minute.";
  }
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

  /* ---------- accounts ---------- */
  async function runSync() {
    if (!user || !cloud) return;
    sync = "syncing"; renderNavs();
    try {
      state = await syncAccount({ store, cloud, uid: user.uid, state });
      sync = "synced"; syncError = "";
    } catch (e) {
      console.warn("Sync failed", e);
      sync = "error"; syncError = e?.code || e?.message || "unknown error";
    }
    updateStanding();
    if (!statsView.hidden) route();
  }
  async function signIn() {
    const c = cloud || (await cloudReady);
    if (!c) { toast("Sign-in isn't available right now."); return; }
    try { await c.signIn(); }
    catch (e) {
      if (e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request") return;
      if (e?.code === "auth/popup-blocked") toast("Your browser blocked the sign-in window. Allow pop-ups for this site and try again.");
      else toast(`Couldn't sign in (${e?.code || "unknown error"}).`);
    }
  }
  async function signOut() {
    if (!cloud) return;
    await cloud.signOut();
    user = null; sync = "idle";
    await forgetAccount(store);
    state = await loadProgress(store);
    toast("Signed out. Your progress is safe in your account; this browser starts fresh.");
    updateStanding();
    newTest({ kind: "normal" });
    route();
  }
  cloudReady.then((c) => {
    cloud = c;
    if (!c) return;
    c.onUser(async (u) => {
      if (u && (!user || user.uid !== u.uid)) {
        const first = !(await store.get("account"));
        user = u;
        await runSync();
        try { boardName = await ensureProfile({ cloud: c, user: u }); } catch (e) { console.warn("Couldn't set up the board name", e); }
        if (first && sync === "synced") toast(`Signed in as ${u.name || u.email}. Your galleys are now saved to your account.`);
      } else if (!u && user) {
        user = null; sync = "idle"; updateStanding();
      }
    });
  });

  function applyConfig(mode, v) {
    cfg.mode = mode; cfg[mode] = v; saveSettings(cfg);
    newTest(test && test.source.kind === "mix" ? { ...test.source, seed: undefined } : { kind: "normal" });
  }

  /* ---------- settings drawer ---------- */
  function openSettings() { drawerOpen = true; drawer.hidden = false; scrim.hidden = false; renderSettings(); $("#closeSettings").focus(); }
  function closeSettings() { drawerOpen = false; drawer.hidden = true; scrim.hidden = true; if (test && !test.ended) focusInput(); }
  $("#closeSettings").onclick = closeSettings;
  scrim.onclick = closeSettings;
  function renderSettings() {
    const body = $("#settingsBody");
    let html = "";
    for (const s of SETTINGS) {
      if (s.section) { html += `<div class="dsec">${s.section}</div>`; continue; }
      if (s.when && !s.when(cfg)) continue;
      html += `<div class="opt"><div class="t">${s.label}</div>${s.help ? `<div class="h">${s.help}</div>` : ""}<div class="seg" role="group" aria-label="${s.label}">` +
        s.options.map(([v, l]) => `<button type="button" data-k="${s.key}" data-v='${JSON.stringify(v)}' aria-pressed="${String(cfg[s.key]) === String(v)}">${l}</button>`).join("") + `</div></div>`;
    }
    html += `<div class="dsec">Keys</div><div class="keys"><kbd>tab</kbd><span>New galley (also from the results)</span><kbd>esc</kbd><span>Restart the same galley, finish a flow session, or close this panel</span><kbd>enter</kbd><span>Practise weak words, from the results</span><kbd>ctrl</kbd><span>with backspace, delete the whole word</span></div>`;
    html += `<div class="dsec">Data</div><div class="h" style="font-size:13px;color:var(--desk-muted)">Settings are saved in this browser only. Your progress can be cleared from the Stats page.</div><div class="dact"><button type="button" id="resetSettings">Reset all settings</button></div>`;
    body.innerHTML = html;
    body.querySelectorAll(".seg button").forEach((b) => b.onclick = () => {
      const s = SETTINGS.find((x) => x.key === b.dataset.k);
      cfg[s.key] = JSON.parse(b.dataset.v); saveSettings(cfg); applyDisplay();
      if (s.restart && test && !test.ended && !test.code) restart();
      else if (s.restart && test && !test.ended && test.code && (s.key === "indent" || s.key === "size" || s.key === "font")) restart();
      renderSettings();
    });
    $("#resetSettings").onclick = () => {
      Object.keys(cfg).forEach((k) => delete cfg[k]); Object.assign(cfg, DEFAULTS); saveSettings(cfg); applyDisplay();
      if (test && !test.ended) restart();
      renderSettings(); renderConfig();
    };
  }

  /* ---------- lifecycle ---------- */
  function focusInput() { if (!drawerOpen && test && !test.ended && statsView.hidden) input.focus(); }
  function newTest(source) {
    clearInterval(ticker); clearTimeout(idleTimer);
    document.body.classList.remove("ended", "typing-now");
    doneBand.hidden = true;
    const code = source.kind === "code", practice = source.kind === "practice";
    const o = source.opts || { mode: cfg.mode, length: cfg.mode === "time" ? cfg.time : cfg.words, list: cfg.list, punct: cfg.punct, nums: cfg.nums, sudden: cfg.sudden };
    const flow = !code && !practice && o.mode === "flow";
    const infinite = !code && !practice && (o.mode === "time" || flow);
    const seed = source.seed ?? randomSeed(), rand = mulberry32(seed);
    const genOpts = { rand, list: o.list, weak: source.weak || null, ratio: source.ratio || 0, punct: o.punct, nums: o.nums };
    let targets, lineNo = null, snippet = null, lines = null;
    if (code) {
      snippet = SNIPPETS[source.idx];
      lines = scriptLines(snippet.code, cfg.indent);
      const typable = lines.filter((l) => !l.blank);
      targets = typable.map((l) => l.target); lineNo = typable.map((l) => l.n);
    } else if (practice) targets = source.words.slice();
    else targets = genWords(infinite ? 80 : o.length, genOpts);
    test = {
      source: { ...source, seed }, seed, rand, genOpts, targets, typed: targets.map(() => ""), werr: targets.map(() => 0),
      cur: 0, first: 0, committed: 0, infinite, flow, limit: o.mode === "time" && infinite ? o.length : null, opts: o,
      sudden: !!o.sudden && !code && !practice && !flow, died: false,
      startT: null, pausedTotal: 0, pauseStart: null, lastT: null, gap: false, keys: [], ended: false,
      total: 0, okKeys: 0, streak: 0, best: 0, corrections: [],
      code, snippet, lines, lineNo, tok: null, layout: code ? "page" : cfg.layout
    };
    document.body.classList.toggle("flow", flow);
    stage.classList.toggle("galley", test.layout === "galley");
    stage.classList.toggle("page", test.layout === "page");
    stage.classList.toggle("code", code);
    document.documentElement.style.setProperty("--fs", FS[test.layout][cfg.size] + "px");
    wordEls = []; track.replaceChildren();
    if (test.layout === "page") track.appendChild(pencil); else stage.appendChild(pencil);
    pencil.style.transform = ""; track.style.transform = "";
    code ? renderCode() : renderFrom(0);
    during.hidden = false; after.hidden = true;
    pencil.classList.add("idle");
    startReceipt(); renderCorrections(); renderConfig(); updateTag(); updateLive(); updateStanding();
    measure(); placeCaret(true);
    focusInput();
  }
  // Esc: the same galley again (same seed, so the same words)
  function restart() {
    const s = test.source;
    newTest(s.kind === "practice" ? { ...s, words: shuffleSpread(s.words, mulberry32(randomSeed())) } : s);
  }
  // Tab: a fresh galley of the same kind (the next script in code mode)
  function fresh() {
    const s = test.source;
    if (s.kind === "code") newTest({ kind: "code", idx: (s.idx + 1) % SNIPPETS.length });
    else if (s.kind === "challenge" || s.kind === "daily") newTest({ kind: "normal" });
    else if (s.kind === "practice") newTest({ ...s, seed: undefined, words: shuffleSpread(s.words, mulberry32(randomSeed())) });
    else newTest({ ...s, seed: undefined });
  }
  function updateTag() {
    const s = test.source;
    const extra = [];
    if (test.sudden) extra.push("sudden death");
    if (test.flow) extra.push("flow: no clock, no end");
    if (s.kind === "challenge" || s.kind === "daily" || (s.kind === "code" && s.from)) {
      tag.hidden = false;
      const f = s.from;
      const vs = f ? ` · ${f.name ? esc(f.name) + "'s" : "their"} score ${score(f.wpm, f.acc).toFixed(1)} (${Math.round(f.wpm)} wpm, ${f.acc.toFixed(1)}%)` : "";
      const what = s.kind === "daily" ? `Daily galley · ${dayLabel(s.day)} · ${o2label(test.opts)} · your first attempt today counts`
        : s.kind === "code" ? `Challenge${f && f.name ? " from " + esc(f.name) : ""} · Python · ${esc(test.snippet.title)}${vs}`
        : `Challenge${f && f.name ? " from " + esc(f.name) : ""} · ${o2label(test.opts)}${vs}`;
      tag.innerHTML = `<span>${what}${extra.length ? " · " + extra.join(" · ") : ""}</span><button type="button" id="exitTag">Leave</button>`;
      $("#exitTag").onclick = () => newTest({ kind: "normal" });
      return;
    }
    if (s.kind === "normal") {
      tag.hidden = !extra.length && !notice;
      tag.innerHTML = `<span>${[notice, ...extra].filter(Boolean).join(" · ")}</span>`;
      notice = "";
      return;
    }
    tag.hidden = false;
    tag.innerHTML = s.kind === "code"
      ? `<span>Python · ${esc(test.snippet.title)} · script ${s.idx + 1} of ${SNIPPETS.length}</span><button type="button" id="exitTag">Back to words</button>`
      : s.kind === "mix"
        ? `<span>Mixed galley · ${s.weak.length} weak words at ${Math.round(s.ratio * 100)}%${extra.length ? " · " + extra.join(" · ") : ""}</span><button type="button" id="exitTag">Stop mixing</button>`
        : `<span>${esc(s.label)}</span><button type="button" id="exitTag">Exit practice</button>`;
    $("#exitTag").onclick = () => newTest({ kind: "normal" });
  }
  function updateLive() {
    const acc = test.total ? (test.okKeys / test.total) * 100 : 100;
    liveAcc.textContent = (acc === 100 ? "100" : acc.toFixed(1)) + "%";
    liveAcc.className = acc < 95 ? "dip" : "";
    liveStreak.textContent = test.streak;
    const clock = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${pad(s % 60)}` : s);
    if (test.flow) {
      progLabel.textContent = "Time";
      liveProg.textContent = clock(Math.floor(elapsed()));
    } else if (test.infinite) {
      progLabel.textContent = "Seconds left";
      liveProg.textContent = clock(test.startT == null ? test.limit : Math.max(0, Math.ceil(test.limit - elapsed())));
    } else {
      progLabel.textContent = test.code ? "Lines" : "Words";
      liveProg.textContent = `${test.cur}/${test.targets.length}`;
    }
  }

  /* ---------- rendering ---------- */
  function renderFrom(i) {
    const frag = document.createDocumentFragment();
    for (; i < test.targets.length; i++) {
      const el = document.createElement("span"); el.className = "w";
      for (const ch of test.targets[i]) { const s = document.createElement("span"); s.className = "l"; s.textContent = ch; el.appendChild(s); }
      wordEls[i] = el; frag.appendChild(el);
    }
    track.appendChild(frag);
  }
  // Code: one script line per screen line, with line numbers. Blank lines are shown but skipped.
  function renderCode() {
    const frag = document.createDocumentFragment();
    let ti = 0; test.tok = [];
    for (const ln of test.lines) {
      const row = document.createElement("div"); row.className = "cl";
      const n = document.createElement("span"); n.className = "ln"; n.textContent = ln.n; row.appendChild(n);
      if (!ln.blank) {
        if (ln.indent) { const s = document.createElement("span"); s.className = "ind"; s.textContent = " ".repeat(ln.indent); row.appendChild(s); }
        const w = document.createElement("span"); w.className = "w";
        [...ln.target].forEach((ch, p) => { const s = document.createElement("span"); s.className = "l" + (ln.tokens[p] ? " " + ln.tokens[p] : ""); s.textContent = ch; w.appendChild(s); });
        row.appendChild(w); wordEls[ti] = w; test.tok[ti] = ln.tokens; ti++;
      }
      frag.appendChild(row);
    }
    track.appendChild(frag);
  }
  // Layout is read only here, in one batch, when layout really changes. Keystrokes never read layout.
  // Letters are positioned, so their offsets are relative to the track in every layout.
  function measure() {
    center = tape.clientWidth / 2;
    cache = [];
    for (let i = test.first; i < wordEls.length; i++) {
      cache[i] = [...wordEls[i].children].map((s) => ({ l: s.offsetLeft, t: s.offsetTop, w: s.offsetWidth, h: s.offsetHeight }));
    }
  }
  function move(el, tf, instant) {
    if (instant) { el.style.transition = "none"; el.style.transform = tf; void el.offsetWidth; el.style.transition = ""; }
    else el.style.transform = tf;
  }
  function placeCaret(instant) {
    const L = cache[test.cur]; if (!L || !L.length) return;
    const p = test.typed[test.cur].length, last = L[L.length - 1], at = p < L.length ? L[p] : null;
    const x = at ? at.l : last.l + last.w;
    if (test.layout === "galley") move(track, `translateX(${center - x}px)`, instant); // the pencil stays, the galley slides
    else {
      const ref = at || last, ph = FS.page[cfg.size] * 1.15;
      move(pencil, `translate(${x}px,${ref.t + ref.h / 2 - ph / 2}px)`, instant);
    }
  }
  // Page layout: once you reach the third line, the top line is lifted off.
  function maybeShift() {
    if (test.layout !== "page" || test.code) return;
    const top = (w) => cache[w][0].t;
    const tops = [...new Set(cache.slice(test.first).filter(Boolean).map((c) => c[0].t))].sort((a, b) => a - b);
    if (tops.indexOf(top(test.cur)) < Math.min(2, cfg.lines - 1)) return;
    let i = test.first;
    while (i < test.cur && top(i) === tops[0]) { wordEls[i].remove(); i++; }
    test.first = i; measure();
  }
  function ensureMore() {
    if (!test.infinite || test.cur < test.targets.length - 30) return;
    const add = genWords(50, test.genOpts), start = test.targets.length;
    test.targets.push(...add); test.typed.push(...add.map(() => "")); test.werr.push(...add.map(() => 0));
    renderFrom(start); measure();
  }
  function setLetter(w, p, cls, shown, fix) {
    const s = wordEls[w].children[p], tk = test.tok && test.tok[w] ? test.tok[w][p] : "";
    s.className = "l" + (tk ? " " + tk : "") + (cls ? " " + cls : "");
    s.textContent = shown;
    if (fix) { const i = document.createElement("i"); i.className = "fix"; i.textContent = fix; s.appendChild(i); }
  }
  function flash(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 220); }

  /* ---------- timing ---------- */
  const now = () => performance.now();
  function elapsed(at) {
    if (test.startT == null) return 0;
    const t = at ?? now();
    return (t - test.startT - test.pausedTotal - (test.pauseStart != null ? t - test.pauseStart : 0)) / 1000;
  }
  // Returns ms since the previous key, or null when that number can't be trusted.
  function stamp(t) {
    let dt = null;
    if (test.startT == null) {
      test.startT = t;
      if (test.infinite) ticker = setInterval(() => { updateLive(); if (test.limit && elapsed() >= test.limit) finish(); }, 100);
    } else if (!test.gap && test.lastT != null) { dt = t - test.lastT; if (dt > 2000) dt = null; }
    test.lastT = t; test.gap = false;
    pencil.classList.remove("idle");
    if (cfg.focus) document.body.classList.add("typing-now");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { pencil.classList.add("idle"); document.body.classList.remove("typing-now"); }, 1200);
    return dt;
  }

  /* ---------- keyboard ---------- */
  input.addEventListener("keydown", (e) => {
    if (e.key === "Tab") { e.preventDefault(); test.ended ? nextFromResults() : fresh(); return; }
    if (test.ended) { if (e.key === "Enter") { e.preventDefault(); $("#btnPractice")?.click(); } return; }
    if (e.key === "Escape") { e.preventDefault(); if (test.flow) { if (test.committed) finish(); } else restart(); return; }
    if (e.repeat) { e.preventDefault(); return; }
    if (e.metaKey || (e.ctrlKey && e.key !== "Backspace") || (e.altKey && e.key !== "Backspace")) return;
    const t = e.timeStamp;
    if (e.key === "Backspace") { e.preventDefault(); back(e.ctrlKey || e.altKey, t); return; }
    if (e.key === "Enter") { e.preventDefault(); if (test.code) space(t); return; }
    if (e.key === " ") {
      e.preventDefault();
      if (!test.code) space(t);
      // in code, space ends the line once it's typed (auto indentation); otherwise it's a character
      else if (cfg.indent === "auto" && test.typed[test.cur].length >= test.targets[test.cur].length) space(t);
      else char(" ", t);
      return;
    }
    if (e.key.length === 1) { e.preventDefault(); char(e.key, t); }
  });

  function char(ch, t) {
    const w = test.cur, tgt = test.targets[w], typed = test.typed[w];
    if (typed.length >= tgt.length + 10) return;
    const pos = typed.length, exp = pos < tgt.length ? tgt[pos] : null, ok = ch === exp;
    if (!ok && cfg.stop === "letter" && !test.sudden) {
      // the miss still counts, but you can't move on until the right key
      const dt = stamp(t);
      test.keys.push({ w, pos, exp, ch, ok: false, dt, at: elapsed(t) });
      test.total++; test.werr[w]++; test.gap = true;
      if (exp != null) flash(wordEls[w].children[pos], "nope"); else flash(wordEls[w], "nope");
      playErr(cfg.errSound, cfg.sound); updateLive();
      return;
    }
    const dt = stamp(t);
    test.typed[w] = typed + ch;
    test.keys.push({ w, pos, exp, ch, ok, dt, at: elapsed(t) });
    test.total++; if (ok) test.okKeys++; else test.werr[w]++;
    if (exp != null) {
      if (ok) setLetter(w, pos, "ok", exp);
      else setLetter(w, pos, "bad", ch === " " ? "·" : ch, exp === " " ? "␣" : exp); // what you typed, struck through, the right letter above
    } else {
      const s = document.createElement("span"); s.className = "l extra"; s.textContent = ch === " " ? "·" : ch; wordEls[w].appendChild(s); measure();
    }
    ok ? playKey(cfg.sound) : playErr(cfg.errSound, cfg.sound);
    placeCaret(); updateLive();
    if (!ok && test.sudden) { test.died = true; finish(t); return; }
    if (!test.infinite && w === test.targets.length - 1 && test.typed[w] === tgt) { commitWord(w); finish(t); }
  }
  function space(t) {
    const w = test.cur, typed = test.typed[w], tgt = test.targets[w];
    if (!typed.length) return;
    if (cfg.stop !== "off" && !test.sudden && typed !== tgt) { flash(wordEls[w], "nope"); playErr(cfg.errSound, cfg.sound); return; }
    const dt = stamp(t), ok = typed === tgt, missed = Math.max(0, tgt.length - typed.length);
    // the space itself is only a mistake when it skips letters; a wrong letter was already counted
    const keyOk = missed === 0;
    test.keys.push({ w, pos: typed.length, exp: " ", ch: " ", ok: keyOk, dt, space: true, missed, at: elapsed(t) });
    test.total++; if (keyOk) test.okKeys++;
    test.werr[w] += missed;
    for (let p = typed.length; p < tgt.length; p++) setLetter(w, p, p === typed.length ? "miss gap" : "miss", tgt[p]);
    commitWord(w); playKey(cfg.sound);
    if (!ok && test.sudden) { test.died = true; finish(t); return; }
    if (!test.infinite && w === test.targets.length - 1) { finish(t); return; }
    test.cur++;
    ensureMore(); maybeShift(); placeCaret(); updateLive();
  }
  function commitWord(w) {
    const ok = test.typed[w] === test.targets[w];
    test.committed++;
    test.streak = ok ? test.streak + 1 : 0; test.best = Math.max(test.best, test.streak);
    printRow(w);
    if (!ok) { test.corrections.push({ w, note: describe(test.targets[w], test.typed[w]) }); renderCorrections(); }
  }
  function back(whole, t) {
    if (cfg.backspace === "off") return;
    const w = test.cur, typed = test.typed[w], tgt = test.targets[w];
    if (!typed.length) {
      if (cfg.backspace === "word") return;
      // step back into the previous word only if it was wrong and is still on screen
      if (w - 1 >= test.first && w > 0 && test.typed[w - 1] !== test.targets[w - 1]) {
        test.cur--; const pw = w - 1, pt = test.targets[pw];
        for (let p = test.typed[pw].length; p < pt.length; p++) setLetter(pw, p, "", pt[p]);
        test.werr[pw] -= Math.max(0, pt.length - test.typed[pw].length);
        if (test.corrections.length && test.corrections[test.corrections.length - 1].w === pw) { test.corrections.pop(); renderCorrections(); }
        rows.firstElementChild?.remove();
        test.committed--; test.streak = 0;
        playKey(cfg.sound); placeCaret(); updateLive();
      }
      return;
    }
    const next = whole ? "" : typed.slice(0, -1);
    let removedExtra = false;
    for (let p = typed.length - 1; p >= next.length; p--) {
      if (p >= tgt.length) { wordEls[w].lastChild.remove(); removedExtra = true; }
      else setLetter(w, p, "", tgt[p]);
    }
    test.typed[w] = next;
    test.keys.push({ bs: true, at: elapsed(t) });
    test.lastT = t; test.gap = true;
    if (removedExtra) measure();
    playKey(cfg.sound); placeCaret();
  }
  const label = (w) => (test.code ? `line ${test.lineNo[w]}` : test.targets[w]);
  function renderCorrections() {
    const list = test.corrections.slice(-4).reverse();
    corrList.innerHTML = list.length
      ? list.map((c) => `<li>${esc(label(c.w))} · <span>${esc(c.note)}</span></li>`).join("")
      : `<li class="none">Nothing to mark yet.</li>`;
  }

  /* ---------- till roll ---------- */
  function galleyWhat() {
    if (test.code) return `SCRIPT · ${test.snippet.title.toUpperCase()}`;
    if (test.source.kind === "practice") return "PRACTICE";
    if (test.source.kind === "daily") return `DAILY · ${dayLabel(test.source.day).toUpperCase()}`;
    if (test.source.kind === "challenge") return `CHALLENGE · ${test.opts.mode === "time" ? test.opts.length + " SECONDS" : test.targets.length + " WORDS"}`;
    if (test.flow) return "FLOW";
    return test.infinite ? `${test.opts.length} SECONDS` : `${test.targets.length} WORDS`;
  }
  function startReceipt() {
    receipt.className = "receipt";
    receipt.innerHTML = `<div class="rhead"><b>RETYPE</b><span>GALLEY ${galleyNo()} · ${esc(galleyWhat())}<br>${stampDate()}</span></div><div class="dash"></div><div class="rows"></div>`;
    rows = receipt.querySelector(".rows");
  }
  function printRow(w) {
    const ok = test.typed[w] === test.targets[w], e = test.werr[w];
    const s = !ok ? { cls: "bad", txt: `${Math.max(1, e)} MISS` } : e ? { cls: "fixed", txt: "FIXED" } : { cls: "", txt: "ok" };
    const r = document.createElement("div");
    r.className = "r" + (s.cls ? " " + s.cls : "");
    const name = test.code ? `L${pad(test.lineNo[w])} ${test.targets[w].trim()}` : test.targets[w];
    r.innerHTML = `<span>${esc(name)}</span><span>${s.txt}</span>`;
    rows.prepend(r);
  }

  /* ---------- focus ---------- */
  input.addEventListener("blur", () => {
    if (!test.ended) stage.classList.add("unfocused");
    if (test.startT != null && !test.ended && test.pauseStart == null) test.pauseStart = now();
    document.body.classList.remove("typing-now");
  });
  input.addEventListener("focus", () => {
    stage.classList.remove("unfocused");
    if (test.pauseStart != null) { test.pausedTotal += now() - test.pauseStart; test.pauseStart = null; test.gap = true; }
  });
  stage.addEventListener("mousedown", (e) => { e.preventDefault(); focusInput(); });
  document.addEventListener("keydown", (e) => {
    if (drawerOpen) { if (e.key === "Escape") { e.preventDefault(); closeSettings(); } return; }
    if (!statsView.hidden) { if (e.key === "Escape") { e.preventDefault(); location.hash = ""; } return; }
    if (document.activeElement === input || e.target.tagName === "INPUT") return;
    if (e.target.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
    if (e.key === "Tab") { e.preventDefault(); test.ended ? nextFromResults() : fresh(); return; }
    if (test.ended) { if (e.key === "Enter") { e.preventDefault(); $("#btnPractice")?.click(); } return; }
    if (!e.metaKey && !e.ctrlKey && e.key.length === 1) { e.preventDefault(); focusInput(); }
  });
  addEventListener("resize", () => {
    if (!test || !statsView.hidden) return;
    if (test.ended) { if (lastChart && lastChart.box.isConnected) drawChart(lastChart.box, lastChart.d, lastChart.ctx); }
    else { measure(); placeCaret(true); }
  });
  document.fonts?.ready.then(() => { if (test && !test.ended) { measure(); placeCaret(true); } });

  /* ---------- finishing ---------- */
  function nextFromResults() {
    if (test.code) { fresh(); return; }
    newTest(test.source.kind === "mix" ? { ...test.source, seed: undefined } : { kind: "normal" });
  }
  async function finish(t) {
    if (test.ended) return;
    test.ended = true; clearInterval(ticker); clearTimeout(idleTimer);
    const secs = elapsed(t);
    const r = analyse(test, secs);
    document.body.classList.add("ended"); document.body.classList.remove("typing-now");
    input.blur(); stage.classList.remove("unfocused"); pencil.classList.add("idle");
    const s = test.source;
    const result = buildResult({
      id: uuid(), userId: state.profile.id, at: Date.now(), session: test, stats: r,
      meta: {
        kind: s.kind, mode: test.code ? "code" : s.kind === "practice" ? "practice" : test.flow ? "flow" : test.opts.mode,
        length: test.code || s.kind === "practice" ? test.targets.length : test.opts.mode === "time" ? test.opts.length : test.opts.mode === "words" ? test.targets.length : null,
        list: test.code ? null : test.opts.list, punct: !test.code && !!test.opts.punct, nums: !test.code && !!test.opts.nums, sudden: test.sudden,
        snippet: test.code ? test.snippet.id : null, seed: test.seed, wordsDone: test.committed
      }
    });
    const thisGalley = galleyNo();
    const earlierDailies = state.recent.filter((x) => x.kind === "daily");
    let change = null;
    if (test.committed > 0) {
      const out = await record(store, state, result, r.words);
      state = out.state; change = out.change;
      // send it to the account in the background; a failure is retried at the next sync
      if (accountsEnabled) {
        const uid = user?.uid;
        if (uid) { sync = "syncing"; renderNavs(); }
        const finished = test;
        pushGalley({ store, cloud, uid, state, result, words: r.words }).then((next) => {
          if (next) { state = { ...next, recent: state.recent }; sync = "synced"; }
          else if (uid) { sync = "error"; syncError = "offline? it will retry"; }
          updateStanding();
          // the finish band is drawn by now; only add to it if it's still this galley's
          if (next && result.kind === "daily" && test === finished) showBoardPlace(result, doneBand.querySelector(".doneIn > div"));
        });
      }
    }
    showDone(r, change, thisGalley, earlierDailies);
    finishReceipt(r);
    test.code ? codeResults(r, thisGalley) : wordResults(r, thisGalley);
    updateStanding(); renderConfig();
  }

  function showDone(r, change, no, earlierDailies) {
    const n = test.committed, clean = r.errors === 0 && r.corrections === 0 && !test.died;
    const unit = test.code ? (n === 1 ? "line" : "lines") : n === 1 ? "word" : "words";
    const what = test.code ? `${test.snippet.title} · ${n} ${unit}` : `${n} ${unit}`;
    const marks = test.corrections.length;
    let stamp;
    if (test.died) stamp = { cls: "", big: "Spiked", small: "one mistake", aria: "Spiked: sudden death ended on a mistake" };
    else if (clean) stamp = { cls: " clean", big: "Perfect", small: "no corrections", aria: "Perfect run" };
    else stamp = { cls: "", big: "Proofed", small: `${r.acc.toFixed(1)}% accurate`, aria: `Proofed at ${r.acc.toFixed(1)}% accuracy` };
    const sub = test.died ? `Sudden death: out on word ${n}.` : clean ? "Not a mark on it." : `${marks} ${marks === 1 ? "correction" : "corrections"} marked · best clean streak ${r.best}`;
    let badges = "";
    if (change?.isBest) badges += `<span class="pb">New best${change.previous ? ` · was ${change.previous.score.toFixed(1)}` : ""}</span>`;
    if (change?.rankUp) badges += `<span class="rankup">Now ${esc(change.rankAfter.rank.name)}</span>`;
    const levelUp = change && change.levelAfter.level > change.levelBefore.level;
    if (change?.xp) badges += `<span class="xp" title="${esc((change.xpParts || []).map(([l, x]) => `${l} ${x}`).join(" · "))}">+${change.xp} XP</span>`;
    if (levelUp) badges += `<span class="pb">Level ${change.levelAfter.level}</span>`;
    let note = "";
    if (change?.xpParts?.length > 1) note += `<div class="note">${esc(change.xpParts.map(([l, x]) => `${l} +${x}`).join(" · "))}</div>`;
    if (change?.isBest) toast(`New personal best · ${bestLabel(change.key)}: ${change.previous ? `${change.previous.score.toFixed(1)} → ` : ""}${score(r.wpm, r.acc).toFixed(1)}`, "pb");
    if (levelUp) toast(`Level ${change.levelAfter.level}! ${change.levelAfter.need - change.levelAfter.into} XP to the next.`, "lv");
    const from = test.source.from;
    if (from && test.committed) {
      const c = compare({ wpm: r.wpm, acc: test.died ? r.acc : r.acc }, from, score), who = from.name || "them";
      const head = c.result === "win" ? `You beat ${esc(who)} by ${c.diff.toFixed(1)}` : c.result === "loss" ? `${esc(from.name || "They")} ${from.name ? "wins" : "win"} by ${(-c.diff).toFixed(1)}` : `Dead heat with ${esc(who)}`;
      badges += `<span class="${c.result === "win" ? "pb" : "rankup"}">${head}</span>`;
      note += `<div class="note">You ${c.mine.toFixed(1)} (${Math.round(r.wpm)} wpm, ${r.acc.toFixed(1)}%) · ${esc(from.name || "Them")} ${c.theirs.toFixed(1)} (${Math.round(from.wpm)} wpm, ${from.acc.toFixed(1)}%)</div>`;
    }
    if (test.source.kind === "daily" && test.committed) {
      const today = earlierDailies.filter((x) => x.day === test.source.day);
      const firstToday = today.length ? today[today.length - 1] : null;
      const official = firstToday || { score: score(r.wpm, r.acc) };
      const past = earlierDailies.filter((x) => x.day !== test.source.day);
      const firsts = new Map(); for (const x of past) firsts.set(x.day, x); // recent is newest first, so the last one kept per day is that day's first
      const best = Math.max(0, ...[...firsts.values()].map((x) => x.score));
      note += `<div class="note">${firstToday ? `A retry: today's daily stays at your first attempt, ${official.score.toFixed(1)}.` : "Your first attempt today, so this is the one that counts."}${firsts.size ? ` Your best daily is ${best.toFixed(1)} over ${firsts.size} ${firsts.size === 1 ? "day" : "days"}.` : ""}</div>`;
      if (!firstToday && firsts.size && official.score > best) badges += `<span class="pb">Best daily yet</span>`;
    }
    if (change && test.source.kind === "normal" && !change.rankAfter.rank && change.rankAfter.needed) note += `<div class="note">${change.rankAfter.needed} more ranked ${change.rankAfter.needed === 1 ? "galley" : "galleys"} until your first rank.</div>`;
    if (!test.committed) note = `<div class="note">Nothing finished, so this one wasn't saved.</div>`;
    doneBand.innerHTML = `<div class="wrap doneIn">
      <div><div class="eyebrow">Galley ${no} · finished</div>
        <div class="dtitle">${esc(what)} in ${r.secs.toFixed(1)}s</div>
        <div class="dsub">${esc(sub)}</div>${badges ? `<div>${badges}</div>` : ""}${note}</div>
      <div class="stamp${stamp.cls}" role="img" aria-label="${esc(stamp.aria)}"><b>${stamp.big}</b><span>${stamp.small}</span></div>
    </div>`;
    doneBand.hidden = false;
    if (test.source.kind === "daily" && test.committed && accountsEnabled && !user) {
      doneBand.querySelector(".doneIn > div").insertAdjacentHTML("beforeend", `<div class="note">Sign in to put your daily on the board.</div>`);
    }
    window.scrollTo(0, 0);
  }
  function finishReceipt(r) {
    receipt.insertAdjacentHTML("beforeend", `<div class="dash"></div>
      <div class="r"><span>KEYS</span><span>${r.keys}</span></div>
      <div class="r"><span>MISSES</span><span>${r.errors}</span></div>
      <div class="r"><span>WPM</span><span>${Math.round(r.wpm)}</span></div>
      <div class="r total"><span>ACCURACY</span><span>${r.acc.toFixed(1)}%</span></div>
      <div class="dash"></div>
      ${test.code
        ? `<div class="ticket"><small>** WHAT IT DOES **</small></div><div class="rtext">${esc(test.snippet.explain)}</div>
          <div class="dash"></div><div class="ticket"><small>** OUTPUT **</small></div><div class="rpre">${esc(test.snippet.output)}</div>`
        : `<div class="ticket"><small>** NEXT TICKET **</small><b>${r.weak.length ? esc(r.weak.slice(0, 5).map((w) => w.word).join(" · ")) : "nothing to practise"}</b></div>`}
      <div class="barcode"></div>`);
    receipt.classList.add("done");
    receipt.scrollTop = 0;
  }

  const statBlock = (r, extra) => `<div class="big">
      <div class="stat hero circled"><label>Accuracy</label><b>${r.acc.toFixed(1)}%</b></div>
      <div class="stat hero"><label>WPM</label><b>${Math.round(r.wpm)}</b></div>${extra}
      <div class="stat"><label>Errors</label><b>${r.errors}</b></div>
      <div class="stat"><label>Time</label><b>${r.secs.toFixed(1)}s</b></div>
    </div>
    <div class="panel"><h2>Speed</h2><div class="legend" id="legend"></div><div class="chart" id="chart"></div></div>`;
  const challengeCard = () => {
    const ok = test.code || ((test.source.kind === "normal" || test.source.kind === "challenge" || test.source.kind === "daily") && !test.flow);
    if (!ok || !test.committed) return "";
    let name = "";
    try { name = localStorage.getItem("retype-name") || ""; } catch { /* fine */ }
    if (!name && user?.name) name = user.name.split(" ")[0];
    return `<div class="card"><h3>Challenge a friend</h3><p>A link to these exact ${test.code ? "lines" : "words"}, with your score to beat.</p>
      <label class="h" for="chName" style="font-size:12px;color:var(--desk-muted)">Your name on the link (optional)</label>
      <input id="chName" class="chin" maxlength="20" value="${esc(name)}" placeholder="Anonymous">
      <button class="go" id="btnChallenge">Copy link</button><input id="chLink" class="chin" readonly hidden aria-label="Challenge link"></div>`;
  };
  const shareCard = `<div class="card"><h3>Share card</h3><p>This galley's receipt as an image, stamp and all.</p><button class="go share" id="btnShare">Save image</button></div>`;
  const rowsFor = (items, head, cells) => items.length ? `<div class="row head">${head}</div>` + items.map(cells).join("") : "";

  function wordResults(r, no) {
    const maxW = Math.max(...r.weak.map((w) => w.score), 0.001), maxP = Math.max(...r.pairs.map((p) => p.score), 0.001);
    const weakRows = rowsFor(r.weak, `<span>word</span><span>err</span><span>ms/key</span><span></span>`,
      (w) => `<div class="row"><span class="wd">${esc(w.word)}${w.occ > 1 ? ` <small>×${w.occ}</small>` : ""}</span><span class="e ${w.errs ? "" : "zero"}">${w.errs}</span><span class="n">${w.med != null ? Math.round(w.med) : "–"}</span><span class="bar"><i style="width:${(w.score / maxW) * 100}%"></i></span></div>`)
      || `<div class="empty">Clean galley. Nothing flagged as weak.</div>`;
    const pairRows = rowsFor(r.pairs, `<span>pair</span><span>err</span><span>median</span><span></span>`,
      (p) => `<div class="row"><span class="wd">${esc(p.bg[0])} → ${esc(p.bg[1])}</span><span class="e ${p.errs ? "" : "zero"}">${p.errs}</span><span class="n">${p.med != null ? Math.round(p.med) + "ms" : "–"}</span><span class="bar"><i style="width:${(p.score / maxP) * 100}%"></i></span></div>`)
      || `<div class="empty">Not enough letter pairs yet.</div>`;
    const drill = pairDrill(r.pairs.map((p) => p.bg), { rand: mulberry32(randomSeed()), list: cfg.list === "200" ? "1k" : cfg.list });
    // the mix draws on everything you've typed, with this galley's trouble words first
    const mixWords = [...new Set([...r.weak.map((w) => w.word), ...topWeak(state.weak, 12).map((w) => w.word)])].slice(0, 12);
    const modeLabel = cfg.mode === "words" ? `${cfg.words}-word` : cfg.mode === "time" ? `${cfg.time}-second` : "flow";
    during.hidden = true; after.hidden = false;
    after.innerHTML = `
      <div class="sheet">
        ${statBlock(r, `<div class="stat"><label>Best streak</label><b>${r.best}</b></div><div class="stat"><label>Fixes</label><b>${r.corrections}</b></div>`)}
        <div class="panels">
          <div class="panel"><h2>Weak words</h2><p>Errors, plus how much slower than your median you typed them.</p>${weakRows}</div>
          <div class="panel"><h2>Slow letter pairs</h2><p>Time from one letter to the next. Your median is ${Math.round(r.globalMed)}ms a key.</p>${pairRows}</div>
        </div>
      </div>
      <div class="cards">
        <div class="card"><h3>Practise weak words</h3><p>A short galley of only this galley's flagged words, three of each.</p>
          <button class="go primary" id="btnPractice" ${r.weak.length ? "" : "disabled"}>Start <kbd>enter</kbd></button></div>
        <div class="card"><h3>Mix them in</h3><p>A ${modeLabel} galley where your trouble words, from this galley and before, turn up more often. Stays on until you stop it.</p>
          <div class="ratio" id="ratio" role="group" aria-label="Share of weak words">${[0.25, 0.4, 0.6].map((v) => `<button type="button" data-v="${v}" aria-pressed="${cfg.ratio === v}">${v * 100}%</button>`).join("")}</div>
          <button class="go" id="btnMix" ${mixWords.length ? "" : "disabled"}>Start mixed galley</button></div>
        <div class="card"><h3>Drill slow pairs</h3><p>${drill ? `30 words built around ${esc(drill.pairs.join(", "))}.` : "Needs a few more slow pairs first."}</p>
          <button class="go" id="btnDrill" ${drill ? "" : "disabled"}>Start drill</button></div>
        <div class="card"><h3>Next galley</h3><p>${test.source.kind === "mix" ? "Another mixed galley, same weak words." : `A fresh ${modeLabel} galley.`}</p>
          <button class="go" id="btnNext">Start <kbd>tab</kbd></button></div>
        ${shareCard}${challengeCard()}
      </div>
      <div class="foot">${r.keys} keystrokes timed. Latencies after a pause, a correction or a gap over 2s are left out.</div>`;
    drawResultChart(r);
    $("#btnPractice").onclick = () => newTest({ kind: "practice", words: shuffleSpread(r.weak.flatMap((w) => [w.word, w.word, w.word]), mulberry32(randomSeed())), label: `Practice · ${r.weak.length} weak words ×3` });
    $("#btnMix").onclick = () => newTest({ kind: "mix", weak: mixWords, ratio: cfg.ratio });
    $("#btnDrill").onclick = () => { if (drill) newTest({ kind: "practice", words: drill.words, label: `Pair drill · ${drill.pairs.join(" ")}` }); };
    $("#btnNext").onclick = nextFromResults;
    $("#ratio").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      cfg.ratio = +b.dataset.v; saveSettings(cfg);
      $("#ratio").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    };
    wireShare(r, no); wireChallenge(r);
  }

  function codeResults(r, no) {
    const tricky = test.targets.map((t, w) => ({ w, errs: test.werr[w], wrong: test.typed[w] !== t }))
      .filter((x) => x.errs > 0 || x.wrong).sort((a, b) => b.errs - a.errs).slice(0, 6);
    const maxE = Math.max(...tricky.map((x) => x.errs), 1), maxP = Math.max(...r.pairs.map((p) => p.score), 0.001);
    const lineRows = rowsFor(tricky, `<span>line</span><span>err</span><span></span><span></span>`,
      (x) => `<div class="row"><span class="wd">${test.lineNo[x.w]} · ${esc(test.targets[x.w].trim())}</span><span class="e">${x.errs}</span><span class="n"></span><span class="bar"><i style="width:${(x.errs / maxE) * 100}%"></i></span></div>`)
      || `<div class="empty">Clean script. Every line right first time.</div>`;
    const sym = (c) => (c === " " ? "␣" : c);
    const pairRows = rowsFor(r.pairs, `<span>pair</span><span>err</span><span>median</span><span></span>`,
      (p) => `<div class="row"><span class="wd">${esc(sym(p.bg[0]))} → ${esc(sym(p.bg[1]))}</span><span class="e ${p.errs ? "" : "zero"}">${p.errs}</span><span class="n">${p.med != null ? Math.round(p.med) + "ms" : "–"}</span><span class="bar"><i style="width:${(p.score / maxP) * 100}%"></i></span></div>`)
      || `<div class="empty">Not enough key pairs yet.</div>`;
    const cleanLines = test.targets.filter((t, w) => test.werr[w] === 0 && test.typed[w] === t).length;
    const nextTitle = SNIPPETS[(test.source.idx + 1) % SNIPPETS.length].title;
    const modeLabel = cfg.mode === "words" ? `${cfg.words}-word` : cfg.mode === "time" ? `${cfg.time}-second` : "flow";
    during.hidden = true; after.hidden = false;
    after.innerHTML = `
      <div class="sheet">
        ${statBlock(r, `<div class="stat"><label>Clean lines</label><b>${cleanLines}/${test.targets.length}</b></div>`)}
        <div class="panel"><h2>What it does</h2><p class="explain">${esc(test.snippet.explain)}</p>
          <h2>Output</h2><pre class="codebox">${esc(test.snippet.output)}</pre></div>
        <div class="panels">
          <div class="panel"><h2>Tricky lines</h2>${lineRows}</div>
          <div class="panel"><h2>Slow key pairs</h2><p>Symbols included. Your median is ${Math.round(r.globalMed)}ms a key.</p>${pairRows}</div>
        </div>
      </div>
      <div class="cards">
        <div class="card"><h3>Type it again</h3><p>Same script, now that you know where it bites.</p><button class="go primary" id="btnPractice">Start <kbd>enter</kbd></button></div>
        <div class="card"><h3>Next script</h3><p>${esc(nextTitle)}.</p><button class="go" id="btnNext">Start <kbd>tab</kbd></button></div>
        <div class="card"><h3>Back to words</h3><p>A ${modeLabel} galley.</p><button class="go" id="btnWords">Start</button></div>
        ${shareCard}${challengeCard()}
      </div>`;
    drawResultChart(r);
    $("#btnPractice").onclick = () => newTest({ ...test.source });
    $("#btnNext").onclick = fresh;
    $("#btnWords").onclick = () => newTest({ kind: "normal" });
    wireShare(r, no); wireChallenge(r);
  }

  function drawResultChart(r) {
    const d = chartData(test, r.secs), ctx = { targets: test.targets, code: test.code, lineNo: test.lineNo };
    lastChart = { box: $("#chart"), d, ctx };
    renderChart($("#chart"), $("#legend"), d, r, ctx);
  }
  function wireShare(r, no) {
    const btn = $("#btnShare");
    btn.onclick = () => {
      const rk = rankFrom(state.recent);
      const cv = drawCard({
        galley: no, what: galleyWhat(), date: stampDate(), acc: r.acc, wpm: r.wpm, raw: r.raw, errors: r.errors,
        best: r.best, secs: r.secs, clean: r.errors === 0 && r.corrections === 0 && !test.died, rank: rk.rank?.name,
        pts: lastChart.d.pts, T: lastChart.d.T
      });
      downloadCard(cv, `retype-galley-${no}.png`);
      btn.textContent = "Saved";
      setTimeout(() => { if (btn.isConnected) btn.textContent = "Save image"; }, 2000);
    };
  }

  function wireChallenge(r) {
    const btn = $("#btnChallenge"); if (!btn) return;
    btn.onclick = async () => {
      const name = $("#chName").value.trim().slice(0, 20);
      try { localStorage.setItem("retype-name", name); } catch { /* fine */ }
      const from = { name, wpm: r.wpm, acc: r.acc };
      const c = test.code ? { mode: "code", snippet: test.snippet.id, from }
        : { seed: test.seed, mode: test.opts.mode, length: test.opts.mode === "time" ? test.opts.length : test.targets.length, list: test.opts.list, punct: test.opts.punct, nums: test.opts.nums, sudden: test.opts.sudden, from };
      const link = `${location.origin}${location.pathname}#c=${encodeChallenge(c)}`;
      const out = $("#chLink"); out.value = link; out.hidden = false;
      try { await navigator.clipboard.writeText(link); btn.textContent = "Link copied"; }
      catch { out.focus(); out.select(); btn.textContent = "Copy the link below"; }
      setTimeout(() => { if (btn.isConnected) btn.textContent = "Copy link"; }, 2500);
    };
  }

  /* ---------- daily and challenges ---------- */
  function dailySource() {
    const day = dayKey(Date.now());
    return { kind: "daily", day, seed: dailySeed(day), opts: { ...DAILY } };
  }
  function challengeSource(c) {
    if (c.mode === "code") return { kind: "code", idx: SNIPPETS.findIndex((s) => s.id === c.snippet), from: c.from };
    return { kind: "challenge", seed: c.seed, from: c.from, opts: { mode: c.mode, length: c.length, list: c.list, punct: c.punct, nums: c.nums, sudden: c.sudden } };
  }

  /* ---------- stats page ---------- */
  function route() {
    if (location.hash.startsWith("#c=")) {
      const c = decodeChallenge(location.hash.slice(3));
      history.replaceState(null, "", location.pathname + location.search);
      if (c) { newTest(challengeSource(c)); }
      else { notice = "That challenge link didn't work, so here's an ordinary galley."; newTest({ kind: "normal" }); }
    }
    const stats = location.hash === "#stats";
    statsView.hidden = !stats; typingView.hidden = stats;
    if (stats) {
      input.blur();
      renderStats(statsView, state, {
        onBack: () => { location.hash = ""; },
        onDaily: () => { location.hash = ""; newTest(dailySource()); },
        onPractice: (words) => { location.hash = ""; newTest({ kind: "practice", words: shuffleSpread(words.flatMap((w) => [w, w, w]), mulberry32(randomSeed())), label: `Practice · ${words.length} trouble words ×3` }); },
        onMix: (words) => { location.hash = ""; newTest({ kind: "mix", weak: words, ratio: cfg.ratio }); },
        onReset: async () => {
          if (user && cloud) await clearAccount({ store, cloud, uid: user.uid });
          else await store.clear();
          state = { ...emptyState(), profile: state.profile }; await store.set("profile", state.profile); updateStanding(); route();
        },
        account: { enabled: accountsEnabled, user, sync, syncError, name: boardName },
        loadBoard: cloud?.dailyBoard ? async () => ({ rows: await cloud.dailyBoard(dayKey(Date.now()), 25), me: user?.uid, signedIn: !!user }) : null,
        onRename: async (raw) => {
          const name = cleanName(raw);
          if (!name) return "Use 2 to 20 characters.";
          try { await cloud.setProfile(user.uid, name); boardName = name; return "Saved."; }
          catch (e) { return `Couldn't save (${e?.code || "error"}).`; }
        },
        onSignIn: signIn, onSignOut: signOut
      });
      window.scrollTo(0, 0);
    } else if (test && !test.ended) { measure(); placeCaret(true); focusInput(); }
  }
  addEventListener("hashchange", route);
  if (import.meta.env.MODE === "uitest") window.__retype = { get state() { return state; }, get user() { return user; } };

  applyDisplay();
  newTest({ kind: "normal" });
  route();
}
