// The typing desk: header, galley/page/script rendering, the keyboard, the till roll, and the
// finish screen. Scoring, storage and progress live in src/core and src/storage.
import { mulberry32, randomSeed } from "../core/rng.js";
import { genWords, shuffleSpread, pairDrill, LISTS } from "../core/words.js";
import { analyse, describe } from "../core/analysis.js";
import { chartData } from "../core/chart-data.js";
import { SNIPPETS, scriptLines } from "../core/code.js";
import { buildResult } from "../core/result.js";
import { streak, dayKey, topWeak, score, modeKey, paceVsBest } from "../core/progress.js";
import { rankFrom, grade } from "../core/pp.js";
import { encodeChallenge, decodeChallenge, dailySeed, compare, DAILY } from "../core/challenge.js";
import { record, emptyState, loadProgress } from "../storage/progress-service.js";
import { syncAccount, pushGalley, forgetAccount, clearAccount, ensureProfile, ensurePpBoard } from "../storage/account-sync.js";
import { DEFAULTS, PRESETS, LIMITS, SLIDE, FS, FONTS, SETTINGS, saveSettings } from "./settings.js";
import { playKey, playErr, playBell, playThunk } from "./sound.js";
import { renderChart, drawChart } from "./chart.js";
import { drawCard, downloadCard } from "./share.js";
import { renderStats, bestLabel } from "./stats.js";
import { renderBoards, ordinal } from "./boards.js";
import { levelFrom } from "../core/levels.js";
import { UNLOCKS, isUnlocked, needs, chosen, newlyUnlocked } from "../core/unlocks.js";
import { headline, featById } from "../core/feats.js";
import { cleanName, fromCloud, defaultName } from "../core/sync.js";
import { ROOM, QUICK, readCode, newCode, roomSettings, raceOpts, settingsLabel, nextHost, runReport, roundOver, standings, pickOpenRoom, lobbyEntry, ordinal as placeName } from "../core/room.js";
import { renderRoom, standingsTable, lanesHtml } from "./race.js";
import { GHOSTS, raceGhosts, withGhosts } from "../core/racers.js";
import { ghostTimeline, charsAt, place, leadSecs, fmtLead, wordStarts } from "../core/ghost.js";
import { $, esc, pad, stampDate, uuid } from "./util.js";
import { pickQuote, words as quoteWords, LENGTHS as QUOTE_LENGTHS, addQuotes } from "../core/quotes.js";
import { loadQuotes, saveQuotes, loadCommunity, saveCommunity, slim, STALE, loadFavs, saveFavs, loadDeleted, saveDeleted, forgetSaved } from "../storage/quote-store.js";
import { REPORT_REASONS, isFav, favKey } from "../core/quotes.js";
import { mergeSaved, recordChange, setFav, favKeys, sameSaved, checkSize, emptySaved } from "../core/quote-sync.js";
import { renderQuotes } from "./quotes.js";
import { renderEdition } from "./edition.js";
import { buildEdition, weekStart, weekKey } from "../core/edition.js";
import { SURVIVAL, nextBatch, DAILY_SURV, dailySurvSeed, regionStart, rollingWpm, loseLife, costsLife, afterCleanWord, survivalOpts, survivalLabel } from "../core/survival.js";

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
  let myQuotes = loadQuotes();
  // everyone's quotes (cached), what you've sent in, and whether you review them
  let community = loadCommunity(), shared = new Map(), admin = false, queueCount = 0, favs = loadFavs(), deleted = loadDeleted();
  const pools = () => ({ mine: myQuotes, community: community.list, favs: new Set(favKeys(favs)) });

  /* ---------- your quotes and favourites, synced to the account ---------- */
  let savedTimer = null, savedBusy = false, savedAgain = false, savedError = "";
  const localSaved = () => ({ quotes: myQuotes, deleted, favs });
  function keepSaved(rec) {
    myQuotes = rec.quotes; deleted = rec.deleted; favs = rec.favs;
    saveQuotes(myQuotes); saveDeleted(deleted); saveFavs(favs);
  }
  /** Change your quote list (add, edit, delete): stamps the change and sends it to the account soon. */
  function setMine(list) {
    keepSaved(recordChange(localSaved(), list));
    scheduleSavedSync();
    return true;
  }
  function scheduleSavedSync() {
    if (!user) return;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => syncSaved().catch(() => {}), 1200);
  }
  /** Merge this browser's quotes and favourites with the account's, both ways. */
  async function syncSaved() {
    const c = cloud, uid = user?.uid;
    if (!c?.foldSaved || !uid) return;
    if (savedBusy) { savedAgain = true; return; }
    savedBusy = true;
    try {
      const sent = localSaved();
      let tooBig = null;
      const merged = await c.foldSaved(uid, (remote) => {
        const m = mergeSaved(sent, remote || emptySaved());
        tooBig = checkSize(m);
        if (tooBig) throw new Error(tooBig);
        return m;
      });
      if (user?.uid !== uid) return; // signed out meanwhile
      // anything changed here while that was in flight is merged on top, and goes next time
      const now = mergeSaved(localSaved(), merged);
      keepSaved(now);
      if (!sameSaved(now, merged)) savedAgain = true;
      savedError = "";
    } catch (e) {
      savedError = e?.message || "couldn't sync your quotes";
      console.warn("Quote sync failed", e);
    } finally {
      savedBusy = false;
      if (savedAgain) { savedAgain = false; scheduleSavedSync(); }
    }
  }
  const HEART = (on) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>`;
  /** Heart or un-heart a quote; returns whether it's now a favourite. */
  function favourite(q) {
    favs = setFav(favs, favKey(q), !isFav(pools(), q)); saveFavs(favs); scheduleSavedSync();
    const on = isFav(pools(), q);
    toast(on ? "Added to your favourites." : "Removed from your favourites.");
    return on;
  }
  const heartBtn = (q, id) => { const on = isFav(pools(), q); return `<button type="button" class="heart${on ? " on" : ""}" id="${id}" aria-pressed="${on}" title="${on ? "Remove from favourites" : "Add to favourites"}">${HEART(on)}${on ? "Favourited" : "Favourite"}</button>`; };
  async function refreshQuotes() {
    const c = cloud || (await cloudReady);
    if (!c?.approvedQuotes) return;
    const [live, mineSent] = await Promise.all([c.approvedQuotes(), user ? c.myShared(user.uid) : null]);
    community = { at: Date.now(), list: slim(live) };
    saveCommunity(community.list, community.at);
    if (mineSent) shared = new Map(mineSent.map((d) => [d.id, d]));
  }
  async function refreshQueueCount() {
    if (!admin || !cloud?.quoteQueue) { queueCount = 0; return renderNavs(); }
    try { queueCount = (await cloud.quoteQueue()).length; } catch { queueCount = 0; }
    renderNavs();
  }
  const ICON_QUOTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h5v6H4v-6c0-3 1.5-5 4-6M14 11h5v6h-5v-6c0-3 1.5-5 4-6"/></svg>`;
  // a random quote from whatever the quote settings allow, never the one just typed
  function quoteSource(lastId = null) {
    const { quote, widened } = pickQuote(pools(), { from: cfg.quoteFrom, len: cfg.quoteLen, source: cfg.quoteSource, clean: cfg.quoteClean, favs: cfg.quoteFavs }, mulberry32(randomSeed()), lastId);
    if (widened) notice = cfg.quoteFavs && !favs.length ? "No favourites yet: heart a quote to add it" : "Nothing matched your quote settings, so here's one from further afield";
    return { kind: "quote", quote };
  }
  const dayLabel = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" }); };
  const o2label = (o) => [o.mode === "time" ? `${o.length} seconds` : `${o.length} words`, (LISTS[o.list]?.label || o.list).toLowerCase(), o.punct ? "punctuation" : "", o.nums ? "numbers" : "", o.sudden ? "sudden death" : ""].filter(Boolean).join(" · ");

  /* ---------- display ---------- */
  function applyDisplay() {
    const root = document.documentElement;
    root.style.setProperty("--lines", cfg.lines);
    root.style.setProperty("--type", FONTS[cfg.font]);
    root.style.setProperty("--slide", SLIDE[cfg.slide] + "ms");
    if (cfg.theme === "system") delete root.dataset.rtTheme; else root.dataset.rtTheme = cfg.theme;
    // the desk: pencil colour, till-roll paper and stamp ink, if they're unlocked
    const have = deskHave(), dark = cfg.theme === "dark" || (cfg.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    const pen = chosen("pencil", cfg.pencil, have), ink = chosen("ink", cfg.ink, have);
    if (pen.id === "red") root.style.removeProperty("--pencil"); else root.style.setProperty("--pencil", dark ? pen.dark : pen.color);
    if (ink.color) root.style.setProperty("--stamp", dark ? ink.dark : ink.color); else root.style.removeProperty("--stamp");
    root.dataset.paper = chosen("paper", cfg.paper, have).id;
    const b = document.body.classList;
    b.toggle("hide-live", !cfg.live); b.toggle("hide-margin", !cfg.margin); b.toggle("hide-roll", !cfg.roll); b.toggle("hide-pace", !cfg.paceLine); b.toggle("focus", cfg.focus);
    if (!cfg.focus) b.remove("typing-now");
  }
  const fmtPp = (x) => Math.round(x).toLocaleString("en-IE");
  /* ---------- the weekly edition ---------- */
  // Last week's front page is "new" until you've read it, if you typed anything last week.
  let editionNew = false;
  const lastWeekKey = () => weekKey(weekStart(weekStart(Date.now()) - 86400000));
  async function checkEdition() {
    let seen = null;
    try { seen = localStorage.getItem("retype-edition-seen"); } catch { /* fine */ }
    if (seen === lastWeekKey()) { editionNew = false; return; }
    const results = await store.all();
    const e = buildEdition(results, weekStart(weekStart(Date.now()) - 86400000), {});
    editionNew = !e.quiet;
    if (editionNew) { renderNavs(); toast("A new edition of The Retype Weekly is out. It's under Stats."); }
  }
  async function showEdition() {
    const results = await store.all();
    const first = results.reduce((m, r) => Math.min(m, r.at), Infinity);
    renderEdition(statsView, {
      results, feats: state.feats || {}, first: Number.isFinite(first) ? first : null,
      name: boardName || (user?.name || "").split(" ")[0] || "Local typist",
      onBack: () => { location.hash = ""; },
      onPractise: (w) => { location.hash = ""; newTest({ kind: "practice", words: shuffleSpread([w, w, w, w, w, w, w, w], mulberry32(randomSeed())), label: `Practice · word of the week: ${w}` }); }
    });
    try { localStorage.setItem("retype-edition-seen", lastWeekKey()); } catch { /* fine */ }
    if (editionNew) { editionNew = false; renderNavs(); }
  }
  const deskHave = () => ({ level: levelFrom(state.xp).level, feats: state.feats || {} });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyDisplay());
  function updateStanding() {
    applyDisplay();
    const rk = rankFrom(state.top), st = streak(state.days, dayKey(Date.now()));
    const bits = [];
    if (state.totals.galleys || state.xp) bits.push(`<b class="lv" title="${levelFrom(state.xp).into} / ${levelFrom(state.xp).need} XP to the next level">Lv ${levelFrom(state.xp).level}</b>`);
    if (rk.rank) bits.push(`<b>${esc(rk.rank.name)}</b>`, `${Math.round(rk.pp).toLocaleString("en-IE")} pp`);
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
  const ICON_FLAG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>`;
  const ICON_PODIUM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21V8h6v13M3 21v-8h6M15 21v-5h6v5M2 21h20M12 2.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 4.6l2-.3z"/></svg>`;
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
      const active = plain && !(test && test.survival) && cfg.mode === mode;
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
    const surv = !!(test && test.survival);
    for (const [key, label] of [["200", "200"], ["1k", "1k"], ["5k", "5k"], ["10k", "10k"]]) {
      const b = btn(label, plain && !surv && cfg.list === key, () => {
        cfg.list = key; if (cfg.mode === "survival") cfg.mode = "words"; saveSettings(cfg);
        newTest(test && test.source.kind === "mix" ? { ...plain(test.source), seed: undefined } : { kind: "normal" });
      });
      b.title = `${LISTS[key].label} words`;
      lists.appendChild(b);
    }
    box.appendChild(lists);
    sep();
    const more = document.createElement("div"); more.className = "grp";
    more.appendChild(btn("flow", plain && cfg.mode === "flow", () => { cfg.mode = "flow"; saveSettings(cfg); newTest({ kind: "normal" }); }));
    more.appendChild(btn("survival", surv, () => { cfg.mode = "survival"; saveSettings(cfg); newTest({ kind: "normal" }); }));
    more.appendChild(btn("python", !!(test && test.code), () => newTest({ kind: "code", idx: test && test.code ? test.source.idx : 0 })));
    more.appendChild(btn("daily", !!(test && test.source.kind === "daily"), () => newTest(dailySource())));
    const ds = btn("daily survival", !!(test && test.source.kind === "dsurv"), () => newTest(dailySurvSource()));
    ds.title = "Today's survival run: the same words for everyone, 3 lives, a 30 wpm floor";
    more.appendChild(ds);
    more.appendChild(btn("quote", !!(test && test.quote), () => newTest(quoteSource(test?.quote?.id))));
    box.appendChild(more);
    if (surv && test.source.kind === "normal") {
      // lives and regen, one click each; the speed floor is in Settings
      const g = document.createElement("div"); g.className = "grp";
      g.innerHTML = `<span class="lbl">lives</span>`;
      for (const v of SURVIVAL.lives) g.appendChild(btn(String(v), test.opts.surv.lives === v, () => { cfg.survLives = v; saveSettings(cfg); newTest({ kind: "normal" }); }));
      const r = btn("regen", test.opts.surv.regen, () => { cfg.survRegen = !cfg.survRegen; saveSettings(cfg); newTest({ kind: "normal" }); });
      r.title = `A life back after ${SURVIVAL.regenEvery} clean words in a row`;
      g.appendChild(r);
      box.appendChild(g);
    }
    if (test && test.quote) {
      const q = document.createElement("div"); q.className = "grp";
      q.innerHTML = `<span class="lbl">quote</span>`;
      for (const [k, label] of [["any", "any"], ["short", "short"], ["medium", "medium"], ["long", "long"]]) {
        const b = btn(label, cfg.quoteLen === k, () => { cfg.quoteLen = k; saveSettings(cfg); newTest(quoteSource(test.quote.id)); });
        if (QUOTE_LENGTHS[k].max || QUOTE_LENGTHS[k].min) b.title = QUOTE_LENGTHS[k].label + (QUOTE_LENGTHS[k].max && !QUOTE_LENGTHS[k].min ? `: up to ${QUOTE_LENGTHS[k].max} words` : QUOTE_LENGTHS[k].min && !QUOTE_LENGTHS[k].max ? `: ${QUOTE_LENGTHS[k].min}+ words` : `: ${QUOTE_LENGTHS[k].min} to ${QUOTE_LENGTHS[k].max} words`);
        q.appendChild(b);
      }
      const f = btn("", !!cfg.quoteFavs, () => { cfg.quoteFavs = !cfg.quoteFavs; saveSettings(cfg); newTest(quoteSource(test.quote.id)); });
      f.innerHTML = `${HEART(!!cfg.quoteFavs)} favourites`; f.className = "favbtn"; f.title = "Only quotes you've hearted";
      q.appendChild(f);
      box.appendChild(q);
    }
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
    nav("navbtn" + (location.hash.startsWith("#room") ? " on" : ""), `${ICON_FLAG}Race${room ? ` <i class="badge" title="You're in room ${room.code}">${room.code}</i>` : ""}`, () => { location.hash = room ? "room=" + room.code : "room"; }, "openRoom", "Race friends in a private room");
    nav("navbtn" + (location.hash === "#quotes" ? " on" : ""), `${ICON_QUOTE}Quotes${queueCount ? ` <i class="badge" title="${queueCount} to review">${queueCount}</i>` : ""}`, () => { location.hash = "quotes"; }, "openQuotes");
    nav("navbtn" + (location.hash === "#boards" ? " on" : ""), `${ICON_PODIUM}Boards`, () => { location.hash = "boards"; }, "openBoards");
    nav("navbtn" + (location.hash === "#stats" ? " on" : ""), `${ICON_CHART}Stats${editionNew ? ` <i class="badge" title="A new weekly edition is out">new</i>` : ""}`, () => { location.hash = editionNew ? "edition" : "stats"; }, "openStats");
    nav("navbtn", `${ICON_GEAR}Settings`, openSettings, "openSettings");
  }

  /* ---------- the daily board ---------- */
  // The Cloud Function checks the galley and posts it a few seconds after it's saved.
  async function showBoardPlace(result, band) {
    if (!cloud?.dailyEntry || !band) return;
    const board = result.kind === "dsurv" ? "dsurv" : "daily";
    const note = document.createElement("div"); note.className = "note"; note.textContent = `Checking your ${board === "dsurv" ? "daily survival run" : "daily"} for the board…`;
    band.appendChild(note);
    for (let i = 0; i < 10; i++) {
      await new Promise((ok) => setTimeout(ok, i ? 2000 : 1500));
      if (!note.isConnected) return;
      try {
        const e = await cloud.dailyEntry(result.day, user.uid, board);
        if (e && e.resultId === result.id) {
          const p = await cloud.dailyPlace(result.day, board === "dsurv" ? e.rank : e.score, board);
          note.textContent = `On today's board: ${ordinal(p.place)} of ${p.of}.`;
          return;
        }
        if (e) { note.textContent = "Your first attempt today is already on the board; retries don't change it."; return; }
      } catch { /* try again */ }
    }
    note.textContent = "Not on the board yet. It may still be checking; look on the Boards page in a minute.";
  }
  async function showPpPlace(result, band) {
    if (!cloud?.ppEntry || !band) return;
    const note = document.createElement("div"); note.className = "note"; note.textContent = "Checking this galley for the PP board…";
    band.appendChild(note);
    for (let i = 0; i < 10; i++) {
      await new Promise((ok) => setTimeout(ok, i ? 2000 : 1500));
      if (!note.isConnected) return;
      try {
        const e = await cloud.ppEntry(user.uid);
        if (e && (e.plays || []).some((p) => p.id === result.id)) {
          const p = await cloud.ppPlace(e.pp);
          note.textContent = `PP board: ${ordinal(p.place)} of ${p.of}, with ${Math.round(e.pp).toLocaleString("en-IE")} PP.`;
          return;
        }
      } catch { /* try again */ }
    }
    note.textContent = "The PP board hasn't caught up with this galley yet; it'll be there shortly.";
  }

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
    if (room) await leaveRoom();
    if (!cloud) return;
    await cloud.signOut();
    user = null; sync = "idle"; admin = false; shared = new Map(); queueCount = 0;
    clearTimeout(savedTimer); forgetSaved(); myQuotes = []; favs = {}; deleted = {};
    await forgetAccount(store);
    state = await loadProgress(store);
    toast("Signed out. Your progress, quotes and favourites are safe in your account; this browser starts fresh.");
    updateStanding();
    newTest({ kind: "normal" });
    route();
  }
  cloudReady.then((c) => {
    cloud = c;
    if (!c) return;
    // a guest gets everyone's quotes too; only refetched when the cached copy is stale
    if (Date.now() - community.at > STALE) refreshQuotes().catch((e) => console.warn("Couldn't load shared quotes", e));
    c.onUser(async (u) => {
      if (u && (!user || user.uid !== u.uid)) {
        const first = !(await store.get("account"));
        user = u;
        await runSync();
        try { boardName = await ensureProfile({ cloud: c, user: u }); } catch (e) { console.warn("Couldn't set up the board name", e); }
        resumeRoom();
        ensurePpBoard({ cloud: c, uid: u.uid, state }).catch((e) => console.warn("Couldn't score older galleys for the PP board", e));
        if (c.isAdmin) { admin = await c.isAdmin(u.uid); refreshQueueCount(); }
        syncSaved().then(() => { if (location.hash === "#quotes") route(); });
        refreshQuotes().then(() => { if (location.hash === "#quotes") route(); }).catch((e) => console.warn("Couldn't load shared quotes", e));
        if (first && sync === "synced") toast(`Signed in as ${u.name || u.email}. Your galleys are now saved to your account.`);
      } else if (!u && user) {
        user = null; sync = "idle"; admin = false; shared = new Map(); queueCount = 0; updateStanding();
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
    // the desk: earned pencils, papers and inks; locked ones say what they need
    const have = deskHave();
    const deskGroup = (kind, title, help) => `<div class="opt"><div class="t">${title}</div><div class="h">${help}</div><div class="seg desk" role="group" aria-label="${title}">` +
      UNLOCKS[kind].map((it) => {
        const open = isUnlocked(it, have), on = chosen(kind, cfg[kind], have).id === it.id;
        const sw = it.color ? `<i class="sw" style="background:${it.color}"></i>` : "";
        return `<button type="button" data-desk="${kind}" data-id="${it.id}" aria-pressed="${on}" ${open ? "" : `disabled title="${esc(needs(it, (id) => featById(id)?.hint || id))}"`}>${sw}${esc(it.label)}${open ? "" : `<small>${it.level != null ? `Level ${it.level}` : "Headline"}</small>`}</button>`;
      }).join("") + `</div></div>`;
    const desk = `<div class="dsec">Desk</div>` + deskGroup("pencil", "Pencil", "The caret and the proof marks. More colours come with levels and headlines.") +
      deskGroup("paper", "Till roll", "The paper your receipts print on.") + deskGroup("ink", "Stamp ink", "The finish stamp.");
    html = html.replace(`<div class="dsec">Accuracy</div>`, desk + `<div class="dsec">Accuracy</div>`);
    html = html.replace(`<div class="dsec">Code</div>`, `<div class="dact"><button type="button" id="manageQuotes">Your quotes</button></div><div class="dsec">Code</div>`);
    html += `<div class="dsec">Keys</div><div class="keys"><kbd>tab</kbd><span>New galley (also from the results)</span><kbd>esc</kbd><span>Restart the same galley, finish a flow session, or close this panel</span><kbd>enter</kbd><span>Practise weak words, from the results</span><kbd>ctrl</kbd><span>with backspace, delete the whole word</span></div>`;
    html += `<div class="dsec">Data</div><div class="h" style="font-size:13px;color:var(--desk-muted)">Settings are saved in this browser only. Your progress can be cleared from the Stats page.</div><div class="dact"><button type="button" id="resetSettings">Reset all settings</button></div>`;
    body.innerHTML = html;
    body.querySelectorAll("[data-desk]").forEach((b) => b.onclick = () => {
      cfg[b.dataset.desk] = b.dataset.id; saveSettings(cfg); applyDisplay(); renderSettings();
    });
    body.querySelectorAll(".seg:not(.desk) button").forEach((b) => b.onclick = () => {
      const s = SETTINGS.find((x) => x.key === b.dataset.k);
      cfg[s.key] = JSON.parse(b.dataset.v); saveSettings(cfg); applyDisplay();
      if (s.quote) { if (test && test.quote && !test.ended) newTest(quoteSource(test.quote.id)); renderSettings(); return; }
      if (s.restart && test && !test.ended && !test.code) restart();
      else if (s.restart && test && !test.ended && test.code && (s.key === "indent" || s.key === "size" || s.key === "font")) restart();
      renderSettings();
    });
    $("#manageQuotes").onclick = () => { closeSettings(); location.hash = "quotes"; };
    $("#resetSettings").onclick = () => {
      Object.keys(cfg).forEach((k) => delete cfg[k]); Object.assign(cfg, DEFAULTS); saveSettings(cfg); applyDisplay();
      if (test && !test.ended) restart();
      renderSettings(); renderConfig();
    };
  }

  /* ---------- lifecycle ---------- */
  function focusInput() { if (!drawerOpen && test && !test.ended && statsView.hidden) input.focus(); }
  function newTest(source) {
    clearInterval(ticker); clearTimeout(idleTimer); stopGhost(); stopRace();
    document.body.classList.remove("ended", "typing-now");
    doneBand.hidden = true;
    const code = source.kind === "code", practice = source.kind === "practice", quoteMode = source.kind === "quote" || (source.kind === "room" && source.opts?.mode === "quote");
    // survival is its own kind of run; a mixed galley started from it falls back to words
    const mode = cfg.mode === "survival" && source.kind !== "normal" ? "words" : cfg.mode;
    const o = source.opts || { mode, length: mode === "time" ? cfg.time : cfg.words, list: cfg.list, punct: cfg.punct, nums: cfg.nums, sudden: cfg.sudden, ...(mode === "survival" ? { surv: survivalOpts(cfg) } : {}) };
    const flow = !code && !practice && !quoteMode && o.mode === "flow";
    const survival = (source.kind === "normal" || source.kind === "dsurv" || source.kind === "room") && o.mode === "survival";
    const infinite = !code && !practice && !quoteMode && (o.mode === "time" || flow || survival);
    const seed = source.seed ?? randomSeed(), rand = mulberry32(seed);
    const genOpts = { rand, list: o.list, weak: source.weak || null, ratio: source.ratio || 0, punct: o.punct, nums: o.nums };
    let targets, lineNo = null, snippet = null, lines = null;
    if (code) {
      snippet = SNIPPETS[source.idx];
      lines = scriptLines(snippet.code, cfg.indent);
      const typable = lines.filter((l) => !l.blank);
      targets = typable.map((l) => l.target); lineNo = typable.map((l) => l.n);
    } else if (practice) targets = source.words.slice();
    else if (quoteMode) targets = quoteWords(source.quote.text);
    else if (survival) targets = nextBatch([], { rand, punct: o.punct, nums: o.nums });
    else targets = genWords(infinite ? 80 : o.length, genOpts);
    test = {
      source: { ...source, seed }, seed, rand, genOpts, targets, typed: targets.map(() => ""), werr: targets.map(() => 0),
      cur: 0, first: 0, committed: 0, infinite, flow, limit: o.mode === "time" && infinite ? o.length : null, opts: o,
      sudden: !!o.sudden && !code && !practice && !flow && !quoteMode && !survival, died: false, quote: quoteMode ? source.quote : null,
      // your best run of this kind, flagged on the galley where it ended
      ghost: survival && source.kind === "normal" ? (state.bests[modeKey({ kind: "normal", mode: "survival", surv: o.surv, punct: o.punct, nums: o.nums })]?.words ?? null) : null, beatGhost: false,
      survival, lives: survival ? o.surv.lives : null, charged: new Set(), cleanRun: 0, commits: [], floorSince: 0, floorAt: 0, lost: { miss: 0, slow: 0 }, regained: 0,
      startT: null, pausedTotal: 0, pauseStart: null, lastT: null, gap: false, keys: [], ended: false,
      total: 0, okKeys: 0, streak: 0, best: 0, corrections: [],
      code, snippet, lines, lineNo, tok: null, layout: code ? "page" : cfg.layout,
      racer: null, raceOut: null, starts: [0], lastResult: null
    };
    document.body.classList.toggle("flow", flow);
    stage.classList.toggle("galley", test.layout === "galley");
    stage.classList.toggle("page", test.layout === "page");
    stage.classList.toggle("code", code);
    stage.classList.remove("heat1", "heat2", "heat3");
    if (!$("#pace")) stage.insertAdjacentHTML("beforeend", `<div id="pace" class="pace" aria-hidden="true"><i></i></div>`);
    document.documentElement.style.setProperty("--fs", FS[test.layout][cfg.size] + "px");
    wordEls = []; track.replaceChildren();
    if (test.layout === "page") track.appendChild(pencil); else stage.appendChild(pencil);
    pencil.style.transform = ""; track.style.transform = "";
    code ? renderCode() : renderFrom(0);
    during.hidden = false; after.hidden = true;
    pencil.classList.add("idle");
    // the best to pace against: same kind of galley (only ordinary ones keep bests)
    test.paceBest = !code && !quoteMode && !practice && !survival && !flow && source.kind === "normal"
      ? state.bests[modeKey({ kind: "normal", mode: o.mode, length: o.mode === "time" ? o.length : targets.length, list: o.list, punct: o.punct, nums: o.nums, sudden: o.sudden })]?.score ?? null
      : null;
    startReceipt(); renderCorrections(); renderConfig(); updateTag(); updateLive(); updateStanding();
    measure(); placeCaret(true);
    if (source.kind === "room") setUpRace(source);
    else if (source.ghost) raceAgainst({ ...source.ghost, who: "your ghost" }); else wantBestGhost();
    focusInput();
  }
  // Esc: the same galley again (same seed, so the same words)
  function restart() {
    const s = test.source;
    newTest(s.kind === "practice" ? { ...s, words: shuffleSpread(s.words, mulberry32(randomSeed())) } : s);
  }
  // Tab: a fresh galley of the same kind (the next script in code mode)
  function fresh() {
    const s = plain(test.source);
    if (s.kind === "code") newTest({ kind: "code", idx: (s.idx + 1) % SNIPPETS.length });
    else if (s.kind === "quote") newTest(quoteSource(s.quote.id));
    else if (s.kind === "challenge" || s.kind === "daily" || s.kind === "dsurv") newTest({ kind: "normal" });
    else if (s.kind === "practice") newTest({ ...s, seed: undefined, words: shuffleSpread(s.words, mulberry32(randomSeed())) });
    else newTest({ ...s, seed: undefined });
  }
  function updateTag() {
    const s = test.source;
    const extra = [];
    if (test.sudden) extra.push("sudden death");
    if (test.survival) extra.push(`Survival · ${survivalLabel(test.opts.surv)} · <b id="survWords">${test.committed}</b> words${test.ghost != null ? ` · <span id="survToBest"></span>` : ""}`);
    if (test.flow) extra.push("flow: no clock, no end");
    if (s.kind === "dsurv") {
      tag.hidden = false;
      tag.innerHTML = `<span>Daily survival · ${dayLabel(s.day)} · ${survivalLabel(test.opts.surv)} · your first attempt today counts · <b id="survWords">${test.committed}</b> words</span><button type="button" id="exitTag">Leave</button>`;
      $("#exitTag").onclick = () => newTest({ kind: "normal" });
      return;
    }
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
    if (s.kind === "quote") {
      tag.hidden = false;
      const q = test.quote, f = s.from;
      const from = [q.by, q.source].filter(Boolean).map(esc).join(", ") + (q.community && q.name ? ` · added by ${esc(q.name)}` : "");
      const vs = f ? ` · ${f.name ? esc(f.name) + "'s" : "their"} score ${score(f.wpm, f.acc).toFixed(1)} (${Math.round(f.wpm)} wpm, ${f.acc.toFixed(1)}%)` : "";
      const lead = f ? `Challenge${f.name ? " from " + esc(f.name) : ""} · quote` : notice ? esc(notice) + " · quote" : "Quote";
      notice = "";
      tag.innerHTML = `<span>${lead}${from ? ` · ${from}` : ""} · ${test.targets.length} words${vs}</span>${heartBtn(q, "favTag")}<button type="button" id="quotesTag">Quotes</button><button type="button" id="exitTag">Back to words</button>`;
      $("#favTag").onmousedown = (e) => e.preventDefault(); // keep typing focus
      $("#favTag").onclick = () => { favourite(q); updateTag(); focusInput(); };
      $("#quotesTag").onclick = () => { location.hash = "quotes"; };
      $("#exitTag").onclick = () => newTest({ kind: "normal" });
      return;
    }
    if (s.kind === "room") {
      tag.hidden = false;
      tag.innerHTML = `<span>Race ${s.round} · room ${esc(s.code)} · ${esc(settingsLabel(test.opts))}</span><button type="button" id="exitTag">Room page</button>`;
      $("#exitTag").onclick = () => { location.hash = "room=" + s.code; };
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
  // The progress line along the paper: time left (timed), how far through (words), or how close
  // to your best run (survival). Coloured by pace against your best, when there is one.
  function updatePace() {
    const el = $("#pace"); if (!el) return;
    let frac = null, pace = null;
    if (test.code || test.quote || test.flow || test.source.kind === "practice") frac = null;
    else if (test.survival) {
      if (test.ghost) { frac = Math.min(1, test.committed / (test.ghost + 1)); pace = test.beatGhost ? "ahead" : null; }
    } else if (test.limit) frac = test.startT == null ? 1 : Math.max(0, 1 - elapsed() / test.limit);
    else if (!test.infinite) frac = test.committed / test.targets.length;
    if (frac == null) { el.hidden = true; return; }
    el.hidden = false;
    if (!test.survival && test.paceBest != null && test.startT != null) {
      // live score: correct words (and their spaces) per minute, times accuracy squared
      const secs = Math.max(elapsed(), 0.001);
      let chars = 0;
      for (let w = 0; w < test.committed; w++) if (test.typed[w] === test.targets[w]) chars += test.targets[w].length + 1;
      pace = paceVsBest({ wpm: chars / 5 / (secs / 60), acc: test.total ? (test.okKeys / test.total) * 100 : 100, best: test.paceBest, secs, words: test.committed });
    }
    el.firstChild.style.transform = `scaleX(${frac})`;
    el.dataset.pace = pace || "";
    el.title = pace === "ahead" ? "On course to beat your best" : pace === "behind" ? "Behind your best" : pace === "even" ? "Level with your best" : "";
  }
  function updateLive() {
    updatePace();
    if (test.race) sendRun();
    const acc = test.total ? (test.okKeys / test.total) * 100 : 100;
    liveAcc.textContent = (acc === 100 ? "100" : acc.toFixed(1)) + "%";
    liveAcc.className = acc < 95 ? "dip" : "";
    liveStreak.textContent = test.streak;
    liveProg.classList.remove("dip");
    const clock = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${pad(s % 60)}` : s);
    if (test.survival) {
      progLabel.textContent = "Lives";
      const max = test.opts.surv.lives;
      liveProg.textContent = max > 5 ? `${test.lives}/${max}` : "●".repeat(test.lives) + "○".repeat(max - test.lives);
      liveProg.classList.toggle("dip", test.lives === 1 && max > 1);
      const sw = $("#survWords"); if (sw) sw.textContent = test.committed;
      const tb = $("#survToBest");
      if (tb) { const left = test.ghost - test.committed + 1; tb.textContent = test.beatGhost ? "past your best" : left <= 20 ? `${left} to beat your best` : `best ${test.ghost}`; tb.classList.toggle("close", !test.beatGhost && left <= 20); }
    } else if (test.flow) {
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
      const region = test.survival ? regionStart(i) : null;
      if (region) el.classList.add("rstart");
      if (test.ghost != null && i === test.ghost) el.classList.add("ghost");
      for (const ch of test.targets[i]) { const s = document.createElement("span"); s.className = "l"; s.textContent = ch; el.appendChild(s); }
      // the labels live on the first letter (see styles.css)
      if (region) el.firstChild.dataset.region = region;
      if (test.ghost != null && i === test.ghost) el.firstChild.dataset.ghost = `your best · ${test.ghost}`;
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
    const start = test.targets.length;
    if (test.survival && start >= SURVIVAL.maxWords) return;
    const add = test.survival ? nextBatch(test.targets, { rand: test.rand, punct: test.opts.punct, nums: test.opts.nums }) : genWords(50, test.genOpts);
    if (!add.length) return;
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

  /* ---------- friend rooms ---------- */
  // One room at a time. The room page is #room (or #room=CODE); a race runs in the ordinary
  // typing view as a galley of kind "room", started for everyone by the host at the same moment.
  // Rules of a race: core/room.js. Database: storage/rooms.js (or the fake one in uitest builds).
  let room = null;          // { code, api, data, unsub }
  let roomBusy = false, roomError = "", hostTimer = null;
  const ROOM_KEY = "retype-room";
  const myUid = () => user?.uid || null;
  const myName = () => cleanName(boardName) || defaultName(user);
  const roomLink = (code) => `${location.origin}${location.pathname}#room=${code}`;
  function drawRoom() {
    if (!location.hash.startsWith("#room")) return;
    renderRoom(statsView, {
      enabled: accountsEnabled && !!cloud?.rooms, signedIn: !!user, me: myUid(), busy: roomBusy, error: roomError,
      room: room?.data ? { code: room.code, data: roomView(room.data) } : null, link: room ? roomLink(room.code) : "",
      onGhosts: () => startRound({ ghosts: true }),
      lobby: lobbyCounts, serverNow: () => room?.api.serverNow() ?? Date.now(), onQuick: quickRace,
      onSignIn: signIn, onCreate: makeRoom, onJoin: (raw) => { const c = readCode(raw); if (c) location.hash = "room=" + c; else { roomError = "That doesn't look like a room code: 5 letters and numbers."; drawRoom(); } },
      onLeave: async () => { await leaveRoom(); if (location.hash === "#room") drawRoom(); else location.hash = "room"; },
      onStart: startRound, onEnd: () => room.api.update(room.code, { state: "done" }),
      onSettings: (st) => room.api.update(room.code, { settings: roomSettings(st) }).catch((e) => console.warn("Couldn't change the room", e)),
      onBack: () => { location.hash = ""; }
    });
  }
  async function enterRoom(code, how) {
    if (!user || !cloud?.rooms) return;
    roomBusy = true; roomError = ""; drawRoom();
    try {
      if (room && room.code !== code) await leaveRoom();
      const api = await cloud.rooms();
      const out = await how(api);
      if (out.error) { roomError = out.error; return false; }
      room = { code, api, data: null, unsub: null };
      try { sessionStorage.setItem(ROOM_KEY, code); } catch { /* fine */ }
      room.unsub = api.watch(code, onRoomData);
      clearInterval(hostTimer); hostTimer = setInterval(hostDuties, 1000);
      renderNavs();
      return true;
    } catch (e) {
      console.warn("Room trouble", e);
      roomError = `Couldn't reach the room (${String(e?.code || e?.message || e).slice(0, 120)}). Check your connection and try again.`;
      return false;
    } finally { roomBusy = false; drawRoom(); }
  }
  async function makeRoom() {
    const settings = roomSettings({ mode: cfg.mode === "time" ? "time" : "words", length: cfg.mode === "time" ? cfg.time : cfg.words, list: cfg.list, punct: cfg.punct, nums: cfg.nums });
    for (let i = 0; i < 4; i++) {
      const code = newCode();
      const ok = await enterRoom(code, (api) => api.create(code, { uid: myUid(), name: myName(), settings }));
      if (ok) { location.hash = "room=" + code; return; }
      if (roomError !== "taken") return;
    }
    roomError = "Couldn't find a free code. Try again."; drawRoom();
  }
  async function joinRoom(code) {
    const ok = await enterRoom(code, (api) => api.join(code, { uid: myUid(), name: myName() }));
    if (!ok && location.hash !== "#room") history.replaceState(null, "", "#room");
    else if (ok && location.hash === "#room") history.replaceState(null, "", "#room=" + code);
  }
  function resumeRoom() {
    let code = readCode(location.hash.startsWith("#room=") ? location.hash.slice(6) : "");
    try { code ||= sessionStorage.getItem(ROOM_KEY); } catch { /* fine */ }
    if (code && !room && !roomBusy) joinRoom(code);
  }
  async function leaveRoom() {
    if (!room) return;
    const r = room; room = null;
    clearInterval(hostTimer); hostTimer = null;
    if (r.data?.public && r.data.host === myUid()) {
      const n = Object.entries(r.data.players || {}).filter(([uid, p]) => p.online && uid !== myUid()).length;
      r.api.list(r.code, n ? { ...lobbyEntry(r.data, 0), n } : null).catch(() => {});
    }
    r.unsub?.();
    try { sessionStorage.removeItem(ROOM_KEY); } catch { /* fine */ }
    await r.api.leave(r.code, myUid()).catch(() => {});
    if (test?.race && !test.ended) newTest({ kind: "normal" });
    renderNavs();
  }
  function onRoomData(data) {
    if (!room) return;
    if (!data) {
      const code = room.code;
      leaveRoom(); roomError = `Room ${code} has closed.`; drawRoom(); return;
    }
    room.data = data;
    const me = myUid();
    // the host has gone: the longest-standing player still here takes over
    if (data.host !== me && nextHost(data) === me) room.api.update(room.code, { host: me }).catch(() => {});
    // a new race for us: everyone's galley opens at startAt
    if (data.state === "race" && data.entrants?.[me] && room.raced !== data.round && !roundOver(data, room.api.serverNow())) {
      room.raced = data.round;
      newTest({ kind: "room", code: room.code, round: data.round, seed: data.seed, startAt: data.startAt, opts: raceOpts(data.settings), ...(data.settings.mode === "quote" && data.quote ? { quote: data.quote } : {}) });
      if (location.hash) location.hash = "";
    }
    if (test?.race && test.race.code === room.code && test.race.round === data.round) {
      if (data.state === "done" && !test.ended && test.startT != null) finish();
      else if (!test.ended) drawRivals();
      else drawRaceResults();
    }
    drawRoom();
  }
  // Once a second, in a room. The host calls the race when it's over (everyone finished or gone,
  // or the clock ran out); in a public room it also keeps the lobby entry current, starts the next
  // race on its own once there are two players, and moves a lone player to a busier room.
  function hostDuties() {
    const d = room?.data; if (!d) return;
    const t = room.api.serverNow(), el = $("#autoIn");
    if (test?.race && test.ended && d.ghosts) drawRaceResults(); // ghosts still running after you finished
    if (d.ghosts && location.hash.startsWith("#room")) drawRoom();
    if (el && d.autoAt) el.textContent = Math.max(0, Math.ceil((d.autoAt - t) / 1000));
    if (d.host !== myUid()) return;
    if (d.state === "race" && roundOver(roomView(d), t)) { room.api.update(room.code, { state: "done" }).catch(() => {}); return; }
    if (!d.public) return;
    const entry = lobbyEntry(d, 0), key = `${entry.mode} ${entry.n} ${entry.state}`;
    if (key !== room.listed || t - (room.listedAt || 0) > 10 * 60e3) {
      room.listed = key; room.listedAt = t;
      room.api.list(room.code, entry.n ? entry : null).catch(() => {});
    }
    if (d.state === "race" || room.starting) return;
    if (entry.n >= 2) {
      if (!d.autoAt) room.api.update(room.code, { autoAt: Math.round(t + ROOM.autoStartMs) }).catch(() => {});
      else if (t >= d.autoAt) startRound();
    } else {
      // on your own in a new room: a short wait for real players, then ghosts of real players' runs
      if (d.state === "lobby" && !room.ghosted) {
        if (!d.autoAt) room.api.update(room.code, { autoAt: Math.round(t + GHOSTS.waitMs) }).catch(() => {});
        else if (t >= d.autoAt) { room.ghosted = true; startRound({ ghosts: true }); }
      } else if (d.autoAt) room.api.update(room.code, { autoAt: null }).catch(() => {});
      // if someone else opened a room of this kind at the same moment, join up
      if (t - (room.hopAt || 0) > 4000) { room.hopAt = t; hop(d); }
    }
  }
  async function hop(d) {
    const lobby = await room.api.lobby().catch(() => ({}));
    if (!room || room.data !== d) return;
    delete lobby[room.code];
    const other = pickOpenRoom(lobby, d.settings.mode, room.api.serverNow());
    // the room with the lower code stays put, so two lone players don't swap places
    if (other && (lobby[other].n > 1 || other < room.code)) { location.hash = "room=" + other; }
  }
  // Quick race: the fullest public room of this kind with space, or a new one.
  async function quickRace(mode) {
    if (!user) { signIn(); return; }
    if (!cloud?.rooms || roomBusy) return;
    roomBusy = true; roomError = ""; drawRoom();
    let code = null;
    try {
      const api = await cloud.rooms();
      code = pickOpenRoom(await api.lobby(), mode, api.serverNow());
    } catch (e) { console.warn("Couldn't read the lobby", e); }
    roomBusy = false;
    if (code && code !== room?.code) { location.hash = "room=" + code; return; }
    for (let i = 0; i < 4; i++) {
      const c = newCode();
      const ok = await enterRoom(c, (api) => api.create(c, { uid: myUid(), name: myName(), settings: QUICK[mode], open: true }));
      if (ok) { location.hash = "room=" + c; return; }
      if (roomError !== "taken") return;
    }
  }
  // How many are waiting in public rooms of each kind, for the race page.
  let lobbyCounts = null, lobbyAt = 0;
  async function loadLobbyCounts() {
    if (!user || !cloud?.rooms || Date.now() - lobbyAt < 5000) return;
    lobbyAt = Date.now();
    try {
      const api = await cloud.rooms(), lobby = await api.lobby(), t = api.serverNow();
      lobbyCounts = {};
      for (const e of Object.values(lobby)) if (e.n > 0 && t - e.at < ROOM.lobbyFreshMs) lobbyCounts[e.mode] = (lobbyCounts[e.mode] || 0) + e.n;
      if (!room) drawRoom();
    } catch { /* fine: no counts */ }
  }
  // The room with this round's ghosts racing in it, as of now (see core/racers.js).
  const ghostTracks = new Map(); let ghostKey = "";
  function roomView(d) {
    if (!d?.ghosts || !room) return d;
    const key = `${room.code}:${d.round}`;
    if (key !== ghostKey) { ghostTracks.clear(); ghostKey = key; }
    const s = d.settings, mine = test?.race && test.race.code === room.code && test.race.round === d.round;
    if (mine) syncStarts();
    const total = s.mode === "time" || s.mode === "survival" ? Infinity : mine ? test.starts[test.targets.length] - 1 : (s.mode === "quote" ? 100 : s.length * 6);
    return withGhosts(d, room.api.serverNow() - d.startAt, ghostTracks, { mode: s.mode, total, limitMs: s.mode === "time" ? s.length * 1000 : Infinity });
  }
  // About how fast you type, to pick ghosts you can race: your recent word and time galleys.
  function myPace() {
    const rs = state.recent.filter((r) => (r.mode === "words" || r.mode === "time") && r.wpm > 0).slice(0, 10);
    return rs.length ? rs.reduce((a, r) => a + r.wpm, 0) / rs.length : 40;
  }
  async function startRound({ ghosts: withG = false } = {}) {
    const d = room?.data;
    if (!d || d.host !== myUid() || d.state === "race" || room.starting) return;
    const entrants = Object.fromEntries(Object.entries(d.players || {}).filter(([, p]) => p.online).map(([uid]) => [uid, true]));
    // a quote race: this browser picks one everyone can have (the library or approved shared ones, never your private quotes)
    let quote = null;
    if (d.settings.mode === "quote") {
      const q = pickQuote({ mine: [], community: community.list, favs: new Set() }, { from: "all", len: d.settings.quoteLen, source: null, clean: true, favs: false }, mulberry32(randomSeed()), d.quote?.id).quote;
      quote = { id: q.id, text: q.text, by: q.by || "", source: q.source || "" };
    }
    room.starting = true;
    // ghosts: real players' recent runs of this kind, near your speed, topped up with house ghosts
    let ghosts = null;
    if (withG) {
      const pool = cloud?.ghostPool ? await cloud.ghostPool(d.settings.mode).catch(() => []) : [];
      ghosts = raceGhosts({ pool, mode: d.settings.mode, me: myUid(), wpm: myPace(), rand: mulberry32(randomSeed()) });
    }
    await room.api.update(room.code, { round: (d.round || 0) + 1, seed: randomSeed(), startAt: Math.round(room.api.serverNow() + ROOM.countdownMs), state: "race", entrants, quote, ghosts, autoAt: null })
      .catch((e) => { roomError = "Couldn't start the race."; console.warn(e); drawRoom(); })
      .finally(() => { if (room) room.starting = false; });
  }

  /* the race itself, in the typing view */
  const lanes = $("#lanes"), countdown = document.createElement("div");
  countdown.className = "countdown"; countdown.setAttribute("aria-live", "assertive");
  let rivalEls = new Map();
  function setUpRace(source) {
    const startPerf = now() + (source.startAt - room.api.serverNow());
    test.race = { code: source.code, round: source.round, startPerf, goTimer: null, cdTimer: null, sent: 0, sendTimer: null };
    document.body.classList.add("racing");
    rivalEls = new Map();
    stage.appendChild(countdown); countdown.hidden = false;
    const tick = () => {
      const left = test.race.startPerf - now();
      if (left <= 0) { go(); return; }
      countdown.textContent = Math.ceil(left / 1000);
      test.race.cdTimer = setTimeout(tick, Math.min(100, left));
    };
    tick();
    lanes.hidden = false;
    drawRivals();
    // ghosts move between room updates, so redraw them on a timer
    if (room?.data?.ghosts) test.race.ghostTick = setInterval(() => { if (!test.ended && test.startT != null) drawRivals(); }, 120);
  }
  function go() {
    if (!test.race || test.startT != null) return;
    test.startT = test.race.startPerf; // everyone's clock starts together, typing or not
    countdown.textContent = "Go"; setTimeout(() => { countdown.hidden = true; }, 500);
    if (test.infinite) ticker = setInterval(() => { updateLive(); if (test.limit && elapsed() >= test.limit) finish(); if (test.survival) checkFloor(); }, 100);
    pencil.classList.remove("idle");
    sendRun();
    focusInput();
  }
  function stopRace() {
    if (test?.race) { clearTimeout(test.race.cdTimer); clearTimeout(test.race.goTimer); clearTimeout(test.race.sendTimer); clearInterval(test.race.ghostTick); }
    countdown.hidden = true; lanes.hidden = true; document.body.classList.remove("racing");
    for (const el of rivalEls.values()) el.remove();
    rivalEls = new Map();
  }
  // What we tell the room: at most five times a second while typing, and once at the end.
  function liveNumbers() {
    const secs = Math.max(elapsed(), 0.001);
    let chars = 0;
    for (let w = 0; w < test.committed; w++) if (test.typed[w] === test.targets[w]) chars += test.targets[w].length + 1;
    return { wpm: chars / 5 / (secs / 60), acc: test.total ? (test.okKeys / test.total) * 100 : 100, secs };
  }
  function sendRun(fin = null) {
    const rc = test.race; if (!rc || !room || rc.code !== room.code || test.startT == null) return;
    if (!fin) {
      if (test.ended) return;
      const wait = rc.sent + 200 - now();
      if (wait > 0) { if (!rc.sendTimer) rc.sendTimer = setTimeout(() => { rc.sendTimer = null; sendRun(); }, wait); return; }
    }
    rc.sent = now();
    const n = fin ? { wpm: fin.r.wpm, acc: fin.r.acc, secs: fin.secs } : liveNumbers();
    // a word race counts as finished only if you got to the end; a timed one when the clock does
    // (survival: done means out of lives, or off the end of the roll)
    const done = !!fin && (test.survival || (test.opts.mode === "time" ? !test.died : test.committed >= test.targets.length));
    const run = runReport({ chars: myChars(), words: test.committed, wpm: n.wpm, acc: n.acc, done, secs: n.secs, lives: test.survival ? test.lives : null, at: Math.round(room.api.serverNow()) });
    room.api.report(rc.code, rc.round, myUid(), run).catch((e) => console.warn("Couldn't send progress", e));
    if (!fin) drawLanes(run);
  }
  // Everyone else as a named caret on your galley, and as lanes above it.
  function drawRivals() {
    const d = roomView(room?.data); if (!d || !test.race) return;
    const runs = d.runs?.[test.race.round] || {}, me = myUid();
    let far = 0;
    for (const uid of Object.keys(d.entrants || {})) {
      if (uid === me) continue;
      const run = runs[uid] || { c: 0 };
      far = Math.max(far, run.c);
      let el = rivalEls.get(uid);
      if (!el) { el = document.createElement("div"); el.className = "ghosty rival"; el.setAttribute("aria-hidden", "true"); rivalEls.set(uid, el); }
      if (el.parentNode !== track) track.appendChild(el);
      // short names, on staggered rows, so carets bunched together stay readable
      el.dataset.who = (d.players?.[uid]?.name || "Someone").replace(/ · ghost$/, "").replace(/^(the|a) /i, "").slice(0, 14);
      el.style.setProperty("--row", String(rivalEls.size > 1 ? [...rivalEls.keys()].indexOf(uid) % 3 : 0));
      el.classList.toggle("done", !!run.done);
      el.classList.toggle("gone", !d.players?.[uid]?.online);
      el.classList.toggle("isghost", !!d.players?.[uid]?.ghost);
      growTo(far);
      caretAt(el, run.c);
    }
    drawLanes();
  }
  // a timed race: make sure the words reach as far as the quickest racer (same seed, same words)
  function growTo(chars) {
    if (!test.infinite) return;
    syncStarts();
    let grew = false;
    while (test.starts[test.targets.length] < chars + 60) {
      const start = test.targets.length;
      const add = test.survival ? nextBatch(test.targets, { rand: test.rand, punct: test.opts.punct, nums: test.opts.nums }) : genWords(50, test.genOpts);
      if (!add.length) break;
      test.targets.push(...add); test.typed.push(...add.map(() => "")); test.werr.push(...add.map(() => 0));
      renderFrom(start); syncStarts(); grew = true;
    }
    if (grew) measure();
  }
  function drawLanes(mine = null) {
    const d = roomView(room?.data); if (!d || !test.race || lanes.hidden) return;
    const me = myUid(), round = test.race.round;
    const local = mine || (test.startT != null ? runReport({ chars: myChars(), words: test.committed, ...liveNumbers(), lives: test.survival ? test.lives : null, at: 0 }) : null);
    const view = local ? { ...d, runs: { ...d.runs, [round]: { ...(d.runs?.[round] || {}), [me]: { ...(d.runs?.[round]?.[me] || {}), ...local, done: d.runs?.[round]?.[me]?.done || false } } } } : d;
    const rows = standings(view, round, me);
    const total = test.infinite ? 0 : test.starts[test.targets.length] - 1;
    lanes.innerHTML = `<div class="wrap"><div class="lanehead">Race ${round} · room ${esc(test.race.code)} · ${esc(settingsLabel(d.settings))}</div>${lanesHtml(rows, d.settings, total)}</div>`;
  }
  // After you finish: the standings as they come in, and where you placed once everyone's done.
  function drawRaceResults() {
    const d = roomView(room?.data); if (!d || !test.race) return;
    const rows = standings(d, test.race.round, myUid());
    const box = $("#raceTable");
    if (box) box.innerHTML = standingsTable(rows, d.settings, { live: d.state === "race" && d.round === test.race.round }) + `<div class="sub">${d.settings.mode === "survival" ? "Last one standing wins; the rest go by words survived." : "Placed by score (wpm × accuracy²); ties go to the quicker finish."}</div>`;
    const badge = $("#racePlace"); if (!badge) return;
    const mine = rows.find((r) => r.me);
    const waiting = rows.filter((r) => !r.done && r.online && r.c >= 0 && d.entrants?.[r.uid]).length;
    const over = d.round !== test.race.round || d.state === "done" || !waiting;
    if (!over) { badge.textContent = `Waiting for ${waiting} more…`; return; }
    badge.textContent = mine?.done ? `${placeName(mine.place)} of ${rows.length}` : "Didn't finish";
    badge.className = mine?.done && mine.place === 1 && rows.length > 1 ? "pb" : "rankup";
  }

  /* ---------- ghost races ---------- */
  // A past run replayed as a faint second caret: your best of the same kind, or (from the results)
  // the run you just typed, on the same words. The maths is in core/ghost.js.
  const ghostEl = document.createElement("div"); ghostEl.id = "ghost"; ghostEl.setAttribute("aria-hidden", "true");
  const ghostStat = $("#ghostStat"), liveGhost = $("#liveGhost");
  const ghostRuns = new Map(); // result id → stored run, so a best is only fetched once
  let ghostRaf = null;
  const plain = (s) => { const { ghost, ...rest } = s; return rest; };
  function stopGhost() { cancelAnimationFrame(ghostRaf); ghostRaf = null; ghostEl.remove(); ghostStat.hidden = true; }
  // The best to race: one of the same kind, for galleys that keep bests.
  function bestGhostKey() {
    const s = test.source, o = test.opts;
    if (test.code) return modeKey({ kind: "code", snippet: test.snippet.id });
    if (test.quote) return s.kind === "quote" && !s.from ? modeKey({ kind: "quote", length: test.targets.length }) : null;
    if (s.kind !== "normal" || test.survival || test.flow || !(o.mode === "words" || o.mode === "time")) return null;
    return modeKey({ kind: "normal", mode: o.mode, length: o.mode === "time" ? o.length : test.targets.length, list: o.list, punct: o.punct, nums: o.nums, sudden: o.sudden });
  }
  async function loadRun(id) {
    if (ghostRuns.has(id)) return ghostRuns.get(id);
    let r = await store.getResult(id).catch(() => null);
    if (!r && cloud && user) r = await cloud.getResult(user.uid, id).then((d) => (d ? fromCloud(d) : null)).catch(() => null);
    if (!r?.keys?.length || !r.targets?.length) return null;
    ghostRuns.set(id, r);
    return r;
  }
  function wantBestGhost() {
    if (cfg.ghost !== "best") return;
    const key = bestGhostKey(), best = key && state.bests[key];
    if (!best?.id) return;
    const t = test;
    loadRun(best.id).then((r) => { if (r && test === t && !t.ended) raceAgainst({ keys: r.keys, targets: r.targets, who: "your best" }); });
  }
  function raceAgainst(g) {
    const same = g.targets.slice(0, test.targets.length).every((x, i) => x === test.targets[i]);
    const tl = ghostTimeline(g.keys, g.targets);
    // a ghost that finished different words keeps going at its pace; one on these words stops where it stopped
    test.racer = { tl, who: g.who, words: g.words ?? null, same, carry: !same && tl.reach >= tl.total, lead: 0, shown: 0 };
    ghostEl.dataset.who = g.who; ghostEl.classList.remove("done"); ghostEl.hidden = true;
    track.appendChild(ghostEl);
    ghostStat.hidden = false; liveGhost.textContent = "level"; liveGhost.className = "";
    $("#ghostLabel").textContent = g.who === "your best" ? "vs your best" : "vs your ghost";
    ghostFrame();
  }
  function ghostChars(ms) {
    const { tl, carry } = test.racer;
    return carry && ms > tl.end ? tl.reach + (ms - tl.end) * (tl.reach / Math.max(tl.end, 1)) : charsAt(tl, ms);
  }
  function syncStarts() { if (test.starts.length !== test.targets.length + 1) test.starts = wordStarts(test.targets); }
  function myChars() {
    syncStarts();
    const w = Math.min(test.cur, test.targets.length - 1);
    return test.starts[w] + Math.min(test.typed[w].length, test.targets[w].length);
  }
  // Put a ghost or a rival's caret where that many characters along this galley would be.
  function caretAt(el, chars) {
    syncStarts();
    const { w, p } = place(chars, test.starts, test.targets);
    const L = cache[w], len = test.targets[w].length;
    if (!L || !L.length) { el.hidden = true; return; } // lifted off the page: well behind you
    const at = p < len ? L[p] : null, last = L[len - 1];
    const x = at ? at.l : last.l + last.w, ref = at || last;
    const y = test.layout === "page" ? ref.t + ref.h / 2 - (FS.page[cfg.size] * 1.15) / 2 : 0;
    el.style.transform = `translate(${x}px,${y}px)`;
    el.hidden = false;
  }
  function ghostFrame() {
    ghostRaf = null;
    const rc = test?.racer; if (!rc || test.ended) return;
    const ms = elapsed() * 1000, chars = ghostChars(ms);
    caretAt(ghostEl, chars);
    const total = test.infinite ? Infinity : test.starts[test.targets.length] - 1;
    ghostEl.classList.toggle("done", test.startT != null && (chars >= total || (!rc.carry && ms >= rc.tl.end)));
    if (test.startT != null && now() - rc.shown > 120) {
      rc.shown = now();
      rc.lead = leadSecs(rc.tl, myChars(), ms);
      liveGhost.textContent = fmtLead(rc.lead);
      liveGhost.className = !Number.isFinite(rc.lead) || Math.abs(rc.lead) >= 0.05 ? (rc.lead > 0 ? "ahead" : "behind") : "";
    }
    ghostRaf = requestAnimationFrame(ghostFrame);
  }
  // At the finish: how it went. Survival is decided by distance, everything else by time to the same place.
  function raceResult(secs) {
    cancelAnimationFrame(ghostRaf); ghostRaf = null;
    const rc = test.racer;
    if (!rc || !test.committed || (test.died && !test.survival)) return;
    test.raceOut = test.survival && rc.words != null ? { words: test.committed - rc.words } : { lead: leadSecs(rc.tl, myChars(), secs * 1000) };
  }
  const ghostCard = () => test.committed && !test.flow && !test.race
    ? `<div class="card"><h3>Race your ghost</h3><p>The same ${test.code ? "script" : test.quote ? "quote" : "words"} again, with this run replayed beside you as a ghost.</p><button class="go" id="btnGhost">Start</button></div>`
    : "";
  function wireGhost() {
    $("#btnGhost")?.addEventListener("click", () => {
      const r = test.lastResult; if (!r) return;
      newTest({ ...plain(test.source), ghost: { keys: r.keys, targets: r.targets, words: test.survival ? r.wordsDone : null } });
    });
  }

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
      if (test.infinite) ticker = setInterval(() => { updateLive(); if (test.limit && elapsed() >= test.limit) finish(); if (test.survival) checkFloor(); }, 100);
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
    if (test.race && !test.ended) {
      // a race can't be restarted or skipped, and nothing counts before the start
      if (e.key === "Tab" || e.key === "Escape" || test.startT == null) { e.preventDefault(); return; }
    }
    if (e.key === "Tab") { e.preventDefault(); test.ended ? nextFromResults() : fresh(); return; }
    // finished: a space typed out of habit (or any letter) mustn't scroll the page away from the results
    if (test.ended) { if (e.key === "Enter") { e.preventDefault(); $("#btnPractice")?.click(); } else if (e.key === "Escape" && test.quote && !test.race) { e.preventDefault(); restart(); } else if (e.key === " ") e.preventDefault(); return; }
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
    if (!ok && cfg.stop === "letter" && !test.sudden && !test.survival) {
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
    if (!ok && test.survival) { hit("miss", t, w); if (test.ended) return; }
    if (!test.infinite && w === test.targets.length - 1 && test.typed[w] === tgt) { commitWord(w); finish(t); }
  }
  function space(t) {
    const w = test.cur, typed = test.typed[w], tgt = test.targets[w];
    if (!typed.length) return;
    if (cfg.stop !== "off" && !test.sudden && !test.survival && typed !== tgt) { flash(wordEls[w], "nope"); playErr(cfg.errSound, cfg.sound); return; }
    const dt = stamp(t), ok = typed === tgt, missed = Math.max(0, tgt.length - typed.length);
    // the space itself is only a mistake when it skips letters; a wrong letter was already counted
    const keyOk = missed === 0;
    test.keys.push({ w, pos: typed.length, exp: " ", ch: " ", ok: keyOk, dt, space: true, missed, at: elapsed(t) });
    test.total++; if (keyOk) test.okKeys++;
    test.werr[w] += missed;
    for (let p = typed.length; p < tgt.length; p++) setLetter(w, p, p === typed.length ? "miss gap" : "miss", tgt[p]);
    // a space that skips letters can end a survival run, and then the word doesn't count as survived
    if (test.survival && missed) { hit("miss", t, w); if (test.ended) return; }
    commitWord(w); playKey(cfg.sound);
    if (!ok && test.sudden) { test.died = true; finish(t); return; }
    if (test.survival && afterWord(w, t)) return;
    if (!test.infinite && w === test.targets.length - 1) { finish(t); return; }
    test.cur++;
    ensureMore(); maybeShift(); placeCaret(); updateLive();
    if (test.survival) milestones();
  }
  /* ---------- survival ---------- */
  // Reaching a new region, and passing your best run: a bell, and the label stamps itself.
  function milestones() {
    if (regionStart(test.cur) && test.cur > 0) { wordEls[test.cur]?.classList.add("reached"); playBell(cfg.bell); }
    if (test.ghost != null && !test.beatGhost && test.committed > test.ghost) {
      test.beatGhost = true;
      wordEls[test.ghost]?.classList.add("beaten");
      playBell(cfg.bell); toast(`Past your best of ${test.ghost} words. Keep going.`, "pb");
      updateTag();
    }
  }
  // A life lost: printed on the roll as a void, and the run ends at none.
  // w: the word a mistake was in; each word costs at most one life, at its first mistake.
  function hit(why, t, w = null, at = null) {
    if (w != null) { if (!costsLife(test.charged, w)) return; test.charged.add(w); }
    if (why === "slow") test.keys.push({ life: true, at: at ?? elapsed(t) }); // logged, so the server can check it
    test.lives = loseLife(test.lives); test.lost[why]++; test.cleanRun = 0;
    const r = document.createElement("div"); r.className = "r bad void";
    r.innerHTML = `<span>VOID · ${why === "slow" ? "TOO SLOW" : esc(test.targets[w]).toUpperCase()}</span><span>${test.lives} LEFT</span>`;
    rows.prepend(r);
    flash(liveProg, "lost");
    updateLive();
    if (!test.lives) { test.died = true; finish(t); }
  }
  // After each finished word: regen, the speed floor, and the end of the roll. True if the run ended.
  function afterWord(w, t) {
    test.commits[test.committed - 1] = elapsed(t);
    test.commits.length = test.committed;
    if (test.typed[w] === test.targets[w] && !test.werr[w]) {
      const r = afterCleanWord({ lives: test.lives, max: test.opts.surv.lives, run: test.cleanRun, regen: test.opts.surv.regen });
      test.cleanRun = r.run;
      if (r.regained) {
        test.lives = r.lives; test.regained++;
        const row = document.createElement("div"); row.className = "r fixed";
        row.innerHTML = `<span>REFUND · ${SURVIVAL.regenEvery} CLEAN</span><span>${test.lives} LEFT</span>`;
        rows.prepend(row); flash(liveProg, "gain");
      }
    } else test.cleanRun = 0;
    if (checkFloor(t)) return true;
    if (test.committed >= SURVIVAL.maxWords) { finish(t); return true; }
    return false;
  }
  // The speed floor: too slow over the last 10 words costs a life, then the window starts again.
  function checkFloor(t) {
    const floor = test.opts.surv.floor;
    if (!floor || test.ended || test.startT == null || test.pauseStart != null) return false;
    const now = elapsed(t);
    const lens = test.targets.slice(0, test.committed).map((x) => x.length);
    const wpm = rollingWpm({ commits: test.commits, lens, since: test.floorSince, sinceAt: test.floorAt, now });
    if (wpm == null || wpm >= floor) return false;
    test.floorSince = test.committed; test.floorAt = now;
    hit("slow", t, null, now);
    return test.ended;
  }
  function commitWord(w) {
    const ok = test.typed[w] === test.targets[w];
    test.committed++;
    test.streak = ok ? test.streak + 1 : 0; test.best = Math.max(test.best, test.streak);
    const s = test.streak;
    stage.classList.toggle("heat1", s >= 25 && s < 50); stage.classList.toggle("heat2", s >= 50 && s < 100); stage.classList.toggle("heat3", s >= 100);
    if (ok && (s === 25 || s === 50 || s === 100 || (s > 100 && s % 100 === 0))) { playBell(cfg.bell); flash(liveStreak, "mile"); }
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
        if (test.survival) { test.commits.pop(); test.floorSince = Math.min(test.floorSince, test.commits.length); }
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
    if (test.quote) return `QUOTE${test.quote.source ? " · " + test.quote.source.toUpperCase() : ""}`;
    if (test.source.kind === "practice") return "PRACTICE";
    if (test.source.kind === "room") return `RACE ${test.source.round} · ROOM ${test.source.code}`;
    if (test.source.kind === "daily") return `DAILY · ${dayLabel(test.source.day).toUpperCase()}`;
    if (test.source.kind === "challenge") return `CHALLENGE · ${test.opts.mode === "time" ? test.opts.length + " SECONDS" : test.targets.length + " WORDS"}`;
    if (test.flow) return "FLOW";
    if (test.source.kind === "dsurv") return `DAILY SURVIVAL · ${dayLabel(test.source.day).toUpperCase()}`;
    if (test.survival) return `SURVIVAL · ${survivalLabel(test.opts.surv).toUpperCase()}`;
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
    if (test.startT != null && !test.ended && test.pauseStart == null && !test.race) test.pauseStart = now();
    document.body.classList.remove("typing-now");
  });
  input.addEventListener("focus", () => {
    stage.classList.remove("unfocused");
    if (test.pauseStart != null) { test.pausedTotal += now() - test.pauseStart; test.pauseStart = null; test.gap = true; }
  });
  stage.addEventListener("mousedown", (e) => { e.preventDefault(); focusInput(); });
  document.addEventListener("keydown", (e) => {
    if (drawerOpen) { if (e.key === "Escape") { e.preventDefault(); closeSettings(); } return; }
    if (!statsView.hidden) {
      if (e.key === "Escape" && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); location.hash = ""; }
      else if (e.key === "Enter" && e.target.tagName !== "INPUT" && e.target.tagName !== "BUTTON" && ($("#roomGhosts") || $("#roomStart"))) { e.preventDefault(); ($("#roomGhosts") || $("#roomStart")).click(); }
      return;
    }
    if (document.activeElement === input || e.target.tagName === "INPUT") return;
    if (e.target.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) return;
    if (e.key === "Tab") { e.preventDefault(); if (test.race && !test.ended) return; test.ended ? nextFromResults() : fresh(); return; }
    // finished: a space typed out of habit (or any letter) mustn't scroll the page away from the results
    if (test.ended) { if (e.key === "Enter") { e.preventDefault(); $("#btnPractice")?.click(); } else if (e.key === "Escape" && test.quote && !test.race) { e.preventDefault(); restart(); } else if (e.key === " ") e.preventDefault(); return; }
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
    if (test.race) { location.hash = room ? "room=" + room.code : "room"; return; }
    if (test.code || test.quote) { fresh(); return; }
    newTest(test.source.kind === "mix" ? { ...plain(test.source), seed: undefined } : { kind: "normal" });
  }
  async function finish(t) {
    if (test.ended) return;
    test.ended = true; clearInterval(ticker); clearTimeout(idleTimer);
    const secs = elapsed(t);
    raceResult(secs);
    if (test.race) { clearTimeout(test.race.goTimer); clearInterval(test.race.ghostTick); }
    const r = analyse(test, secs);
    if (test.race && test.startT != null) sendRun({ final: true, r, secs });
    document.body.classList.add("ended"); document.body.classList.remove("typing-now");
    input.blur(); stage.classList.remove("unfocused"); pencil.classList.add("idle");
    const s = test.source;
    const result = buildResult({
      id: uuid(), userId: state.profile.id, at: Date.now(), session: test, stats: r,
      meta: {
        kind: s.kind, mode: test.code ? "code" : test.quote ? "quote" : s.kind === "practice" ? "practice" : test.flow ? "flow" : test.opts.mode,
        length: test.code || test.quote || s.kind === "practice" ? test.targets.length : test.opts.mode === "time" ? test.opts.length : test.opts.mode === "words" ? test.targets.length : null,
        list: test.code || test.quote || test.survival ? null : test.opts.list,
        surv: test.survival ? { ...test.opts.surv, left: test.lives } : null, punct: !test.code && !test.quote && !!test.opts.punct, nums: !test.code && !test.quote && !!test.opts.nums, sudden: test.sudden,
        snippet: test.code ? test.snippet.id : test.quote ? test.quote.id : null, seed: test.seed, wordsDone: test.committed, lend: cfg.lendGhosts !== false
      }
    });
    test.lastResult = result;
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
          if (next && (result.kind === "daily" || result.kind === "dsurv") && test === finished) showBoardPlace(result, doneBand.querySelector(".doneIn > div"));
          if (next && change?.inTop && test === finished) showPpPlace(result, doneBand.querySelector(".doneIn > div"));
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
    if (test.survival) stamp = { cls: test.died ? "" : " grade clean", big: String(n), small: test.died ? "words survived" : test.committed >= SURVIVAL.maxWords ? "the whole roll" : "words, still standing", aria: `Survived ${n} words` };
    else if (test.died) stamp = { cls: "", big: "Spiked", small: "one mistake", aria: "Spiked: sudden death ended on a mistake" };
    else {
      const g = grade(r.acc);
      stamp = { cls: " grade" + (g === "SS" ? " clean" : ""), big: g, small: clean ? "perfect · no corrections" : `${r.acc.toFixed(1)}% accurate`, aria: `Grade ${g}, ${r.acc.toFixed(1)}% accuracy` };
    }
    const lostBits = test.survival ? [test.lost.miss ? `${test.lost.miss} ${test.lost.miss === 1 ? "word" : "words"} wrong` : "", test.lost.slow ? `${test.lost.slow} too slow` : "", test.regained ? `${test.regained} regained` : ""].filter(Boolean).join(", ") : "";
    const sub = test.survival && test.race && !test.died ? "Last one standing: everyone else was out."
      : test.survival
      ? (test.died ? `Out of lives on word ${n + 1}${lostBits ? `: ${lostBits}` : ""}.${test.ghost != null && n < test.ghost ? ` ${test.ghost - n} short of your best (${test.ghost}).` : ""}` : test.committed >= SURVIVAL.maxWords ? `The roll ran out at ${n} words with ${test.lives} ${test.lives === 1 ? "life" : "lives"} left. Nothing more to type.` : `Stopped with ${test.lives} ${test.lives === 1 ? "life" : "lives"} left${lostBits ? ` (${lostBits})` : ""}.`)
      : test.died ? `Sudden death: out on word ${n}.` : clean ? "Not a mark on it." : `${marks} ${marks === 1 ? "correction" : "corrections"} marked · best clean streak ${r.best}`;
    let badges = "";
    const bestWas = (b) => (b.words != null ? `${b.words} words` : b.score.toFixed(1));
    if (change?.isBest) badges += `<span class="pb">New best${change.previous ? ` · was ${bestWas(change.previous)}` : ""}</span>`;
    if (change?.pp != null) badges += `<span class="ppb" title="Performance points for this galley">${change.pp.toFixed(1)} PP</span>`;
    if (change?.rankUp) badges += `<span class="rankup">Now ${esc(change.rankAfter.rank.name)}</span>`;
    const levelUp = change && change.levelAfter.level > change.levelBefore.level;
    if (change?.xp) badges += `<span class="xp" title="${esc((change.xpParts || []).map(([l, x]) => `${l} ${x}`).join(" · "))}">+${change.xp} XP</span>`;
    if (levelUp) badges += `<span class="pb">Level ${change.levelAfter.level}</span>`;
    let note = "";
    if (change?.xpParts?.length > 1) note += `<div class="note">${esc(change.xpParts.map(([l, x]) => `${l} +${x}`).join(" · "))}</div>`;
    if (change?.isBest) toast(`New personal best · ${bestLabel(change.key)}: ${change.previous ? `${bestWas(change.previous)} → ` : ""}${test.survival ? `${n} words` : score(r.wpm, r.acc).toFixed(1)}`, "pb");
    if (change?.rankUp) toast(`Promoted to ${change.rankAfter.rank.name} · ${Math.round(change.ppAfter)} PP`, "lv");
    if (levelUp) toast(`Level ${change.levelAfter.level}! ${change.levelAfter.need - change.levelAfter.into} XP to the next.`, "lv");
    // headlines earned, as clippings; and anything they (or a level) unlock for the desk
    let clips = "";
    if (change?.feats?.length) {
      // the first three on the band, the rest waiting in the scrapbook; toasts only when there are a couple
      change.feats.slice(0, 3).forEach((e) => {
        const f = featById(e.id), head = headline(e.id, e);
        clips += `<div class="clip"><small>Extra! Extra!</small><b>${esc(head)}</b><span>${esc(f.dek)}</span></div>`;
      });
      if (change.feats.length > 3) clips += `<a class="clip more" href="#stats"><small>And</small><b>${change.feats.length - 3} more ${change.feats.length - 3 === 1 ? "story" : "stories"}</b><span>In your scrapbook, on the Stats page.</span></a>`;
      if (change.feats.length <= 2) change.feats.forEach((e) => toast(`EXTRA! ${headline(e.id, e)}`, "lv"));
      else toast(`EXTRA! ${change.feats.length} headlines from one galley.`, "lv");
      const unlocked = newlyUnlocked({ level: change.levelBefore.level, feats: change.featsBefore }, { level: change.levelAfter.level, feats: state.feats });
      if (unlocked.length) { toast(`Unlocked for your desk: ${unlocked.map((u) => u.label).join(", ")}. Settings → Desk.`, "pb"); }
    } else if (levelUp) {
      const unlocked = newlyUnlocked({ level: change.levelBefore.level, feats: state.feats }, { level: change.levelAfter.level, feats: state.feats });
      if (unlocked.length) toast(`Unlocked for your desk: ${unlocked.map((u) => u.label).join(", ")}. Settings → Desk.`, "pb");
    }
    const from = test.source.from;
    if (test.raceOut) {
      const o = test.raceOut, name = test.racer.who, Name = name[0].toUpperCase() + name.slice(1);
      const head = o.words != null
        ? (o.words > 0 ? `Outlasted ${name} by ${o.words} ${o.words === 1 ? "word" : "words"}` : o.words < 0 ? `${-o.words} ${o.words === -1 ? "word" : "words"} short of ${name}` : `Level with ${name}`)
        : !Number.isFinite(o.lead) ? `Left ${name} behind`
        : Math.abs(o.lead) < 0.05 ? `Dead level with ${name}` : o.lead > 0 ? `Beat ${name} by ${o.lead.toFixed(1)}s` : `${Name} won by ${(-o.lead).toFixed(1)}s`;
      badges += `<span class="${(o.words ?? o.lead) > 0 ? "pb" : "rankup"}">${head}</span>`;
      if (o.words == null) note += `<div class="note">${test.racer.same ? "The ghost is that run, keystroke for keystroke." : "The ghost runs at your best's pace in characters, on these words."} It races to the line; bests still go by score.</div>`;
    }
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
    if (change?.pp != null) {
      const gain = change.ppAfter - change.ppBefore;
      note += `<div class="note">${change.inTop ? `Total ${fmtPp(change.ppAfter)} PP (+${gain.toFixed(1)}).` : `Total ${fmtPp(change.ppAfter)} PP. This one didn't make your top 100.`}</div>`;
    } else if (change && test.source.kind === "normal" && !change.rankAfter.rank && !test.code && !test.survival) note += `<div class="note">Galleys of 15 words or more earn PP, and PP earns a rank.</div>`;
    // so close: within 5% (or 2 points) of a best you didn't beat
    if (change && !change.isBest && change.previous && !test.survival && change.previous.words == null) {
      const gap = change.previous.score - score(r.wpm, r.acc);
      if (gap > 0 && gap <= Math.max(2, change.previous.score * 0.05)) note += `<div class="note close">Just ${gap.toFixed(1)} short of your best (${change.previous.score.toFixed(1)}).</div>`;
    }
    if (!test.committed) note = `<div class="note">Nothing finished, so this one wasn't saved.</div>`;
    if (test.race) badges += `<span class="rankup" id="racePlace">Waiting for the others…</span>`;
    const seal = clean && n >= 10 && !test.survival ? "Perfect" : test.survival && change?.isBest && n >= 10 ? "New best" : "";
    doneBand.innerHTML = `<div class="wrap doneIn">
      <div><div class="eyebrow">Galley ${no} · finished</div>
        <div class="dtitle">${esc(what)} in ${r.secs.toFixed(1)}s</div>
        <div class="dsub">${esc(sub)}</div>${badges ? `<div>${badges}</div>` : ""}${note}${clips ? `<div class="clips">${clips}</div>` : ""}</div>
      <div class="stamps">${seal ? `<div class="seal" aria-hidden="true"><span>${seal}</span></div>` : ""}<div class="stamp${stamp.cls}" role="img" aria-label="${esc(stamp.aria)}"><b>${stamp.big}</b><span>${stamp.small}</span></div></div>
    </div>`;
    doneBand.hidden = false;
    doneBand.classList.remove("slam"); void doneBand.offsetWidth; doneBand.classList.add("slam");
    setTimeout(() => playThunk(cfg.bell), 230);
    if ((test.source.kind === "daily" || test.source.kind === "dsurv") && test.committed && accountsEnabled && !user) {
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
        : `${test.survival ? `<div class="r"><span>LIVES LEFT</span><span>${test.lives}/${test.opts.surv.lives}</span></div><div class="dash"></div>${test.died ? `<div class="ticket"><small>** TRANSACTION TERMINATED **</small></div><div class="dash"></div>` : ""}` : ""}${test.quote && (test.quote.by || test.quote.source) ? `<div class="rtext attr">- ${esc([test.quote.by, test.quote.source].filter(Boolean).join(", "))}</div><div class="dash"></div>` : ""}<div class="ticket"><small>** NEXT TICKET **</small><b>${r.weak.length ? esc(r.weak.slice(0, 5).map((w) => w.word).join(" · ")) : "nothing to practise"}</b></div>`}
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
    const ok = test.code || test.quote || ((test.source.kind === "normal" || test.source.kind === "challenge" || test.source.kind === "daily") && !test.flow && !test.survival);
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
    const modeLabel = cfg.mode === "words" ? `${cfg.words}-word` : cfg.mode === "time" ? `${cfg.time}-second` : cfg.mode === "survival" ? `${cfg.words}-word` : "flow";
    const q = test.quote;
    const canReport = q && q.community && !shared.has(q.id);
    const quotePanel = q ? `<div class="panel"><h2>The quote</h2><p class="quoteblock">${esc(q.text)}</p>${q.by || q.source ? `<div class="quoteby">- ${esc([q.by, q.source].filter(Boolean).join(", "))}${q.community && q.name ? ` · added by ${esc(q.name)}` : ""}</div>` : ""}
      <div class="qpanelacts">${heartBtn(q, "favRes")}</div>
      ${canReport ? `<div class="qreport" id="qrep"><button type="button" class="linkbtn" id="qrepOpen">Report this quote</button></div>` : ""}</div>` : "";
    const keepable = q && q.shared && !myQuotes.some((x) => x.text.toLowerCase() === q.text.toLowerCase());
    const raceCards = test.race ? `<div class="card"><h3>Back to the room</h3><p>See the standings${room && room.data?.host === myUid() ? " and start the next race" : ", and wait for the next race"}.</p><button class="go primary" id="btnRoom">Room ${esc(test.race.code)} <kbd>tab</kbd></button></div>` : "";
    const nextCard = test.race ? raceCards : q
      ? `<div class="card"><h3>Next quote</h3><p>Another ${cfg.quoteLen === "any" ? "" : cfg.quoteLen + " "}quote at random.</p><button class="go" id="btnNext">Start <kbd>tab</kbd></button></div>
         <div class="card"><h3>Type it again</h3><p>The same quote, now you know where it bites.</p><button class="go" id="btnAgain">Start <kbd>esc</kbd></button></div>
         ${keepable ? `<div class="card"><h3>Keep this quote</h3><p>Add it to your own quotes.</p><button class="go" id="btnKeep">Add to yours</button></div>` : ""}`
      : `<div class="card"><h3>Next galley</h3><p>${test.source.kind === "mix" ? "Another mixed galley, same weak words." : test.survival ? `Another survival run, ${esc(survivalLabel(test.opts.surv))}.` : `A fresh ${modeLabel} galley.`}</p>
          <button class="go" id="btnNext">Start <kbd>tab</kbd></button></div>`;
    during.hidden = true; after.hidden = false;
    after.innerHTML = `
      <div class="sheet">
        ${test.race ? `<div class="panel"><h2>Race ${test.race.round} · room ${esc(test.race.code)}</h2><div id="raceTable"></div></div>` : ""}
        ${quotePanel}
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
        ${nextCard}
        ${ghostCard()}${shareCard}${challengeCard()}
      </div>
      <div class="foot">${r.keys} keystrokes timed. Latencies after a pause, a correction or a gap over 2s are left out.</div>`;
    drawResultChart(r);
    $("#btnPractice").onclick = () => newTest({ kind: "practice", words: shuffleSpread(r.weak.flatMap((w) => [w.word, w.word, w.word]), mulberry32(randomSeed())), label: `Practice · ${r.weak.length} weak words ×3` });
    $("#btnMix").onclick = () => newTest({ kind: "mix", weak: mixWords, ratio: cfg.ratio });
    $("#btnDrill").onclick = () => { if (drill) newTest({ kind: "practice", words: drill.words, label: `Pair drill · ${drill.pairs.join(" ")}` }); };
    $("#btnNext")?.addEventListener("click", nextFromResults);
    $("#btnRoom")?.addEventListener("click", nextFromResults);
    $("#btnAgain")?.addEventListener("click", restart);
    if (test.race) drawRaceResults();
    if (q) {
      const wireHeart = () => $("#favRes").addEventListener("click", () => {
        favourite(q);
        $("#favRes").outerHTML = heartBtn(q, "favRes"); wireHeart();
      });
      wireHeart();
    }
    $("#qrepOpen")?.addEventListener("click", () => {
      const box = $("#qrep");
      if (!user) { box.innerHTML = `<span class="sub">Sign in to report a quote.</span><button type="button" class="go" id="qrepIn">Sign in</button>`; $("#qrepIn").onclick = signIn; return; }
      box.innerHTML = `<span class="sub">What's wrong with it?</span>${Object.entries(REPORT_REASONS).map(([k, l]) => `<button type="button" class="go" data-reason="${k}">${esc(l)}</button>`).join("")}<span class="sub" id="qrepMsg"></span>`;
      box.querySelectorAll("[data-reason]").forEach((b) => b.onclick = async () => {
        box.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        try {
          const r = await cloud.reportQuote(q.id, b.dataset.reason);
          box.innerHTML = `<span class="sub">Thanks. ${r.hidden ? "It's been taken down until it's reviewed." : "It'll be looked at."}</span>`;
          if (r.hidden) refreshQuotes().catch(() => {});
        } catch (e) {
          $("#qrepMsg").textContent = e?.message?.replace(/^.*?: /, "") || "Couldn't send that.";
          box.querySelectorAll("button").forEach((x) => { x.disabled = false; });
        }
      });
    });
    $("#btnKeep")?.addEventListener("click", (e) => {
      const out = addQuotes(myQuotes, [q]);
      if (out.added) setMine(out.list);
      e.currentTarget.textContent = "Added"; e.currentTarget.disabled = true;
    });
    $("#ratio").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      cfg.ratio = +b.dataset.v; saveSettings(cfg);
      $("#ratio").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    };
    wireShare(r, no); wireChallenge(r); wireGhost();
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
    const modeLabel = cfg.mode === "words" ? `${cfg.words}-word` : cfg.mode === "time" ? `${cfg.time}-second` : cfg.mode === "survival" ? `${cfg.words}-word` : "flow";
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
        ${ghostCard()}${shareCard}${challengeCard()}
      </div>`;
    drawResultChart(r);
    $("#btnPractice").onclick = () => newTest({ ...test.source });
    $("#btnNext").onclick = fresh;
    $("#btnWords").onclick = () => newTest({ kind: "normal" });
    wireShare(r, no); wireChallenge(r); wireGhost();
  }

  function drawResultChart(r) {
    const d = chartData(test, r.secs), ctx = { targets: test.targets, code: test.code, lineNo: test.lineNo };
    lastChart = { box: $("#chart"), d, ctx };
    renderChart($("#chart"), $("#legend"), d, r, ctx);
  }
  function wireShare(r, no) {
    const btn = $("#btnShare");
    btn.onclick = () => {
      const rk = rankFrom(state.top);
      const cv = drawCard({
        galley: no, what: galleyWhat(), date: stampDate(), acc: r.acc, wpm: r.wpm, raw: r.raw, errors: r.errors,
        best: r.best, secs: r.secs, clean: r.errors === 0 && r.corrections === 0 && !test.died, rank: rk.rank?.name, grade: test.died ? null : grade(r.acc),
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
        : test.quote ? { mode: "quote", quote: test.quote, from }
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
  function dailySurvSource() {
    const day = dayKey(Date.now());
    return { kind: "dsurv", day, seed: dailySurvSeed(day), opts: { mode: "survival", punct: false, nums: false, surv: { ...DAILY_SURV } } };
  }
  function challengeSource(c) {
    if (c.mode === "code") return { kind: "code", idx: SNIPPETS.findIndex((s) => s.id === c.snippet), from: c.from };
    if (c.mode === "quote") return { kind: "quote", quote: c.quote, from: c.from };
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
    const page = location.hash === "#stats" ? "stats" : location.hash === "#boards" ? "boards" : location.hash === "#quotes" ? "quotes" : location.hash === "#edition" ? "edition" : location.hash.startsWith("#room") ? "room" : null;
    // both pages draw into the same view; the typing view hides behind either
    statsView.hidden = !page; typingView.hidden = !!page;
    for (const id of ["openStats", "openBoards", "openQuotes", "openRoom"]) $("#" + id)?.classList.toggle("on", page === id.slice(4).toLowerCase() || (id === "openStats" && page === "edition"));
    const back = () => { location.hash = ""; };
    const boardHandlers = {
      signedIn: !!user,
      load: cloud?.dailyBoard ? async (which, n) => ({
        rows: which === "pp" ? await cloud.ppBoard(n) : await cloud.dailyBoard(dayKey(Date.now()), n, which), me: user?.uid
      }) : null,
      place: cloud?.ppEntry && user ? async (which) => {
        const day = dayKey(Date.now());
        const entry = which === "pp" ? await cloud.ppEntry(user.uid) : await cloud.dailyEntry(day, user.uid, which);
        if (!entry) return null;
        const p = which === "pp" ? await cloud.ppPlace(entry.pp) : await cloud.dailyPlace(day, which === "dsurv" ? entry.rank : entry.score, which);
        return { ...p, entry };
      } : null
    };
    if (page === "room") {
      input.blur();
      const want = readCode(location.hash.slice(6));
      if (want && want !== room?.code && user && !roomBusy) joinRoom(want);
      else { drawRoom(); if (!room) loadLobbyCounts(); }
      window.scrollTo(0, 0);
    } else if (page === "edition") {
      input.blur();
      showEdition().then(() => window.scrollTo(0, 0));
    } else if (page === "quotes") {
      input.blur();
      renderQuotes(statsView, {
        mine: () => myQuotes, community: () => community.list, shared: () => shared, admin: () => admin, signedIn: () => !!user, cfg,
        favs: () => new Set(favKeys(favs)), onFav: (q) => { favs = setFav(favs, favKey(q), !isFav(pools(), q)); saveFavs(favs); scheduleSavedSync(); return isFav(pools(), q); },
        syncNote: () => (user ? (savedError ? `Not synced: ${savedError}` : "synced") : null),
        onSignIn: signIn,
        share: async (list) => { const r = (await cloud.submitQuotes(list)).results; refreshQueueCount(); return r; },
        withdraw: (id) => cloud.withdrawQuote(id),
        report: (id, reason) => cloud.reportQuote(id, reason),
        review: async (id, action, extra) => { const r = await cloud.reviewQuote(id, action, extra); refreshQueueCount(); return r; },
        queue: () => cloud.quoteQueue(),
        refresh: () => Promise.all([refreshQuotes(), syncSaved()]),
        onSave: (list) => setMine(list),
        onCfg: (ch) => { Object.assign(cfg, ch); saveSettings(cfg); },
        onType: (quote) => { location.hash = ""; newTest({ kind: "quote", quote }); },
        onTypeRandom: () => { location.hash = ""; newTest(quoteSource(test?.quote?.id)); },
        onBack: back
      });
      window.scrollTo(0, 0);
    } else if (page === "boards") {
      input.blur();
      renderBoards(statsView, { ...boardHandlers, onBack: back, onDaily: () => { location.hash = ""; newTest(dailySource()); }, onDailySurv: () => { location.hash = ""; newTest(dailySurvSource()); }, onSignIn: signIn });
      window.scrollTo(0, 0);
    } else if (page === "stats") {
      input.blur();
      renderStats(statsView, state, {
        ...boardHandlers,
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
        onRename: async (raw) => {
          const name = cleanName(raw);
          if (!name) return "Use 2 to 20 characters.";
          try { boardName = await cloud.setName(name); return "Saved."; }
          catch (e) { return e?.code === "functions/invalid-argument" ? e.message.replace(/^.*?: /, "") : `Couldn't save (${e?.code || "error"}).`; }
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
  checkEdition().catch(() => {});
}
