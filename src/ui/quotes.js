// The quotes page: what quote mode draws from, adding and sharing your own quotes, pasting in a
// whole list, browsing everyone's, reporting, and (for admins) the review queue.
import { LENGTHS, CATEGORIES, LIBRARY, filterQuotes, sources, sourceTree, sourceValues, seriesOf, guessSeries, lengthOf, wordCount, addQuotes, updateQuote, parseImport, exportQuotes, sharedId, REJECT_REASONS, REPORT_REASONS } from "../core/quotes.js";
import { esc } from "./util.js";

const PAGE = 40;
const FROM = [["all", "Everything"], ["library", "Library"], ["community", "Everyone's"], ["mine", "Yours"]];
const STATUS = {
  approved: ["Shared", "ok"],
  pending: ["In review", "wait"],
  rejected: ["Not accepted", "no"],
  hidden: ["Hidden after reports", "no"]
};
const errText = (e) => e?.message?.replace(/^.*?: /, "") || "Something went wrong.";

/**
 * h: {
 *   mine(), community(), shared() -> Map id -> doc, admin(), signedIn(), cfg,
 *   onSave(list) -> bool, onCfg(changes), onType(quote), onTypeRandom(), onBack, onSignIn,
 *   share(quotes) -> results[], withdraw(id), report(id, reason), review(id, action, extra),
 *   queue() -> docs, refresh() -> Promise (reloads everyone's quotes and your submissions)
 * }
 */
export function renderQuotes(view, h) {
  const pools = () => ({ mine: h.mine(), community: h.community() });
  const ui = { tab: h.mine().length ? "mine" : h.community().length ? "community" : "library", search: "", shown: PAGE, editing: null, confirm: null, reporting: null, queue: null };
  let shareDefault = true;
  try { shareDefault = localStorage.getItem("retype-share") !== "0"; } catch { /* fine */ }
  view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h1>Quotes</h1>
      <div class="sactions"><button type="button" class="go primary" id="qType">Type a quote</button><button type="button" class="go" id="qBack">Back to typing <kbd>esc</kbd></button></div>
    </div>
    <p class="lede">Type a quote instead of random words: from the library of ${LIBRARY.length}, from everyone's, or your own. Share yours and, once they've been reviewed, everyone can type them too.</p>
    <div class="sgrid">
      <div class="scard wide" id="qPool"></div>
      <div class="qtwo"><div class="scard">
        <h2 id="qFormHead">Add a quote</h2>
        <div class="sub">One quote at a time. Type or paste the words exactly as they should be typed, say where it's from, and add who said it if you like. <kbd>ctrl</kbd> <kbd>enter</kbd> adds it.</div>
        <label class="sub" for="qText">Quote</label>
        <textarea id="qText" class="chin qarea" rows="4" placeholder="The words, exactly as you want to type them"></textarea>
        <div class="qpair">
          <div><label class="sub" for="qSource">From</label><input id="qSource" class="chin" maxlength="80" placeholder="Show, film, book, speech…" list="qSources"></div>
          <div><label class="sub" for="qBy">Who said it <span class="optl">(optional)</span></label><input id="qBy" class="chin" maxlength="80" placeholder="Character or person"></div>
        </div>
        <div><label class="sub" for="qSeries">Series <span class="optl">(optional: groups it with others, like all of Harry Potter)</span></label><input id="qSeries" class="chin" maxlength="80" list="qSeriesList"></div>
        <datalist id="qSources"></datalist><datalist id="qSeriesList"></datalist>
        <div class="qshare" data-share="qShare"></div>
        <div class="sactions"><button type="button" class="go primary" id="qAdd">Add quote</button><button type="button" class="go" id="qCancel" hidden>Cancel</button><span class="sub" id="qMsg" role="status"></span></div>
      </div>
      <div class="scard">
        <h2>Paste a list</h2>
        <div class="sub">Several quotes at once: one per line, blocks with a dash line, or JSON.</div>
        <details class="qhelp"><summary>How to lay out a list</summary>
          <p><b>One per line</b>, all from the same place: put each quote on its own line, no blank lines, and fill in "From, for any without one" below.</p>
          <pre>Every keystroke counts.
Slow is smooth, and smooth is fast.</pre>
          <p><b>Blocks</b>, from different places: leave a blank line between quotes and end each with a line starting with a dash. <code>- Who, Source</code> sets both, <code>- Source</code> just the source. A quote can run over several lines.</p>
          <pre>The first quote, which can run
over more than one line.
- Someone, Somewhere

The second quote.
- Somewhere else</pre>
          <p>The attribution splits at the first comma, so a source with a comma in it needs a name first: <code>- Lincoln, Gettysburg Address, 1863</code>.</p>
          <p><b>JSON</b>: a list of objects with <code>text</code>, <code>source</code> and (optionally) <code>by</code> and <code>series</code>, like an exported <code>retype-quotes.json</code>. The square brackets around the list are optional, a trailing comma is fine, and other fields are ignored.</p>
          <pre>{ "text": "The first quote.", "source": "Somewhere" },
{ "text": "The second quote.", "source": "Somewhere else", "by": "Someone" }</pre>
          <p>Curly quotes, long dashes and accents become plain keyboard characters, quotation marks around a whole quote are dropped, and duplicates are skipped. Shared quotes need at least four words and a source.</p>
          <p><b>Series</b> group sources, so "Only from" can pick all of Harry Potter or the whole MCU at once. Well-known ones (Harry Potter, Middle-earth, Marvel, Spider-Man, Batman, Breaking Bad, Game of Thrones, Dune…) are worked out from the source; give a <code>series</code> only for anything else.</p>
        </details>
        <textarea id="qBulk" class="chin qarea" rows="5" placeholder="First quote&#10;- Someone, Somewhere&#10;&#10;Second quote&#10;- Somewhere else"></textarea>
        <div><label class="sub" for="qBulkSource">From, for any without one <span class="optl">(optional)</span></label><input id="qBulkSource" class="chin" maxlength="80" list="qSources"></div>
        <div class="qshare" data-share="qBulkShare"></div>
        <div class="sactions"><button type="button" class="go" id="qImport">Add them</button><button type="button" class="go" id="qExport">Export yours</button><span class="sub" id="qBulkMsg" role="status"></span></div>
      </div></div>
      <div class="scard wide">
        <div class="boardhead"><div class="seg" role="tablist" id="qTabs"></div>
          <input id="qSearch" class="chin qsearch" type="search" placeholder="Search quotes" aria-label="Search quotes"></div>
        <div id="qList"></div>
      </div>
    </div>`;
  const $ = (s) => view.querySelector(s);
  $("#qBack").onclick = h.onBack;
  $("#qType").onclick = h.onTypeRandom;
  const msg = (el, text, bad = false) => { el.textContent = text; el.classList.toggle("bad", bad); };

  /* ---------- the share switch, under both forms ---------- */
  function drawShare() {
    view.querySelectorAll("[data-share]").forEach((box) => {
      const id = box.dataset.share;
      box.innerHTML = h.signedIn()
        ? `<label class="qcheck"><input type="checkbox" id="${id}" ${shareDefault ? "checked" : ""}> Share with everyone</label><span class="sub">${h.admin() ? "A filter checks it; as an admin, yours go live straight away." : "A filter checks it, then it's reviewed before anyone else sees it."}</span>`
        : `<span class="sub">Quotes you add stay in this browser. <button type="button" class="linkbtn" data-signin>Sign in</button> to share them with everyone.</span>`;
      box.querySelector("input")?.addEventListener("change", (e) => {
        shareDefault = e.target.checked;
        try { localStorage.setItem("retype-share", shareDefault ? "1" : "0"); } catch { /* fine */ }
        view.querySelectorAll(".qcheck input").forEach((x) => { x.checked = shareDefault; });
      });
      box.querySelector("[data-signin]")?.addEventListener("click", h.onSignIn);
    });
  }
  const sharing = () => h.signedIn() && shareDefault;

  /** Send quotes off for review; returns a sentence about how it went. */
  async function share(list, onProgress) {
    let ok = 0, live = 0; const no = [];
    for (let i = 0; i < list.length; i += 25) {
      let res;
      if (list.length > 25 && onProgress) onProgress(Math.min(i + 25, list.length), list.length);
      try { res = await h.share(list.slice(i, i + 25).map(({ text, source, by, series }) => ({ text, source, by, series: series || "" }))); }
      catch (e) { no.push(errText(e)); break; }
      for (const r of res) { if (r.ok) { ok++; if (r.live) live++; } else no.push(r.reason); }
    }
    await h.refresh().catch(() => {});
    if (h.admin() && ok) await loadQueue();
    drawList();
    // admins' quotes go live at once; everyone else's wait for review
    const sent = !ok ? "" : live === ok ? (ok === 1 ? "Shared: it's live." : `${ok} shared, live now.`) : ok === 1 ? "Sent for review." : `${ok} sent for review.`;
    if (!no.length) return { text: sent, bad: false };
    const why = [...new Set(no)];
    return { text: `${sent ? sent.replace(/\.$/, ";") + " " : ""}${no.length === 1 ? "not shared" : `${no.length} not shared`}: ${why.slice(0, 2).join(" ")}`, bad: !ok };
  }

  /* ---------- what quote mode draws from ---------- */
  function drawPool() {
    const cfg = h.cfg, p = pools();
    const srcs = sources(p), tree = sourceTree(p, { from: cfg.quoteFrom });
    if (cfg.quoteSource && !sourceValues(sourceTree(p)).includes(cfg.quoteSource)) h.onCfg({ quoteSource: null });
    const opt = (x, label) => `<option value="${esc(x.value)}" ${x.value === cfg.quoteSource ? "selected" : ""}>${label} (${x.count})</option>`;
    const options = tree.map((x) => x.sources
      ? `<optgroup label="${esc(x.name)}">${opt(x, `All of ${esc(x.name)}`)}${x.sources.map((s) => opt(s, esc(s.name))).join("")}</optgroup>`
      : opt(x, esc(x.name))).join("");
    const n = filterQuotes(p, { from: cfg.quoteFrom, len: cfg.quoteLen, source: cfg.quoteSource, clean: cfg.quoteClean }).length;
    const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-k="${key}" data-v='${JSON.stringify(v)}' aria-pressed="${cfg[key] === v}">${esc(l)}</button>`).join("")}</div>`;
    $("#qPool").innerHTML = `<h2>What quote mode gives you</h2>
      <div class="qfilters">
        <div><div class="sub">From</div>${seg("quoteFrom", FROM)}</div>
        <div><div class="sub">Length</div>${seg("quoteLen", Object.entries(LENGTHS).map(([k, v]) => [k, v.label + (v.max && !v.min ? ` (up to ${v.max} words)` : v.min && !v.max ? ` (${v.min}+)` : v.min ? ` (${v.min}–${v.max})` : "")]))}</div>
        <div><div class="sub">Strong language</div>${seg("quoteClean", [[false, "Allow"], [true, "Hide"]])}</div>
        <div><label class="sub" for="qOnly">Only from</label>
          <select id="qOnly" class="chin"><option value="">Anywhere</option>${options}</select></div>
      </div>
      <div class="sub">${n ? `${n} ${n === 1 ? "quote matches" : "quotes match"}. Each galley picks one at random; <kbd>tab</kbd> skips to another.` : "Nothing matches that yet, so quote mode will widen the search until something does."}</div>`;
    $("#qPool").querySelectorAll("[data-k]").forEach((b) => b.onclick = () => { h.onCfg({ [b.dataset.k]: JSON.parse(b.dataset.v) }); drawPool(); });
    $("#qOnly").onchange = (e) => { h.onCfg({ quoteSource: e.target.value || null }); drawPool(); };
    $("#qSources").innerHTML = srcs.filter((s) => s.origin !== "library").map((s) => `<option value="${esc(s.name)}">`).join("");
    const known = new Set([...filterQuotes(p, { from: "mine" }), ...filterQuotes(p, { from: "community" })].map(seriesOf).filter(Boolean));
    $("#qSeriesList").innerHTML = [...known].sort().map((x) => `<option value="${esc(x)}">`).join("");
  }

  /* ---------- the list ---------- */
  function drawTabs() {
    const p = pools(), q = ui.queue;
    const tabs = [["mine", `Yours (${p.mine.length})`], ["community", `Everyone's (${p.community.length})`], ["library", `Library (${LIBRARY.length})`]];
    if (h.admin()) tabs.push(["review", `Review${q ? ` (${q.length})` : ""}`]);
    $("#qTabs").innerHTML = tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}</button>`).join("");
    $("#qTabs").querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { ui.tab = b.dataset.tab; ui.shown = PAGE; ui.confirm = ui.reporting = null; drawList(); });
    $("#qSearch").hidden = ui.tab === "review";
  }
  function statusChip(q) {
    const doc = h.shared().get(sharedId(q.text));
    if (!doc) return h.signedIn() ? `<button type="button" class="go" data-share-one="${esc(q.id)}">Share</button>` : "";
    const [label, cls] = STATUS[doc.status] || ["", ""];
    const why = doc.status === "rejected" && doc.reason ? `: ${REJECT_REASONS[doc.reason] || doc.reason}` : "";
    return `<span class="qchip ${cls}" title="${esc(label + why)}">${esc(label + why)}</span>${doc.status === "pending" ? `<button type="button" class="go" data-withdraw="${esc(doc.id)}">Withdraw</button>` : ""}`;
  }
  function row(q) {
    const who = [q.by, q.source].filter(Boolean).join(", ");
    const sr = seriesOf(q);
    const tag = (sr && sr !== q.source ? ` · ${esc(sr)}` : "") + (q.origin === "library" ? ` · ${esc(CATEGORIES[q.cat] || "")}` : q.origin === "community" && q.name ? ` · added by ${esc(q.name)}` : "");
    const lang = (q.flags || []).includes("language") ? ` · strong language` : "";
    let act = `<button type="button" class="go" data-type="${esc(q.id)}">Type</button>`;
    if (q.origin === "mine") {
      act = statusChip(q) + act + `<button type="button" class="go" data-edit="${esc(q.id)}">Edit</button><button type="button" class="go${ui.confirm === q.id ? " danger" : ""}" data-del="${esc(q.id)}">${ui.confirm === q.id ? "Delete it?" : "Delete"}</button>`;
    } else if (q.origin === "community" && !h.shared().has(q.id)) {
      act += `<button type="button" class="go" data-report="${esc(q.id)}">Report</button>`;
    }
    const reporting = ui.reporting === q.id
      ? `<div class="qreport">${h.signedIn() ? `<span class="sub">What's wrong with it?</span>${Object.entries(REPORT_REASONS).map(([k, l]) => `<button type="button" class="go" data-reason="${k}">${esc(l)}</button>`).join("")}` : `<span class="sub">Sign in to report a quote.</span><button type="button" class="go" data-signin>Sign in</button>`}<button type="button" class="linkbtn" data-cancel>Cancel</button><span class="sub" data-rmsg></span></div>` : "";
    return `<div class="qrow" data-row="${esc(q.id)}">
      <div class="qbody"><div class="qtext">${esc(q.text)}</div><div class="qmeta">${who ? `${esc(who)} · ` : ""}${wordCount(q.text)} words · ${lengthOf(q.text)}${tag}${lang}</div>${reporting}</div>
      <div class="qact">${act}</div></div>`;
  }
  function drawList() {
    drawTabs();
    if (ui.tab === "review") return drawQueue();
    const items = filterQuotes(pools(), { from: ui.tab, search: ui.search });
    if (ui.tab === "mine") items.sort((a, b) => (b.at || 0) - (a.at || 0));
    const box = $("#qList");
    if (!items.length) {
      box.innerHTML = `<div class="sub qempty">${ui.search ? "Nothing matches that search." : ui.tab === "mine" ? "No quotes of your own yet. Add one above, or paste in a list." : ui.tab === "community" ? "Nobody's quotes are live yet. Share one of yours and it'll be first." : ""}</div>`;
      return;
    }
    box.innerHTML = items.slice(0, ui.shown).map(row).join("") + (items.length > ui.shown ? `<div class="sactions" style="margin-top:12px"><button type="button" class="go" id="qMore">Show more (${items.length - ui.shown} left)</button></div>` : "");
    $("#qMore")?.addEventListener("click", () => { ui.shown += PAGE; drawList(); });
    const byId = (id) => items.find((q) => q.id === id);
    box.querySelectorAll("[data-type]").forEach((b) => b.onclick = () => h.onType(byId(b.dataset.type)));
    box.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => startEdit(b.dataset.edit));
    box.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
      const id = b.dataset.del;
      if (ui.confirm !== id) { ui.confirm = id; drawList(); return; }
      ui.confirm = null;
      if (ui.editing === id) stopEdit();
      save(h.mine().filter((q) => q.id !== id));
    });
    box.querySelectorAll("[data-share-one]").forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = "Sending…";
      const r = await share([byId(b.dataset.shareOne)]);
      if (r.bad) msg($("#qMsg"), r.text, true);
    });
    box.querySelectorAll("[data-withdraw]").forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { await h.withdraw(b.dataset.withdraw); await h.refresh(); } catch (e) { msg($("#qMsg"), errText(e), true); }
      drawList();
    });
    box.querySelectorAll("[data-report]").forEach((b) => b.onclick = () => { ui.reporting = ui.reporting === b.dataset.report ? null : b.dataset.report; drawList(); });
    const rep = box.querySelector(".qreport");
    if (rep) {
      rep.querySelector("[data-cancel]").onclick = () => { ui.reporting = null; drawList(); };
      rep.querySelector("[data-signin]")?.addEventListener("click", h.onSignIn);
      rep.querySelectorAll("[data-reason]").forEach((b) => b.onclick = async () => {
        rep.querySelectorAll("button").forEach((x) => { x.disabled = true; });
        try {
          const r = await h.report(ui.reporting, b.dataset.reason);
          rep.innerHTML = `<span class="sub">Thanks. ${r.hidden ? "That's enough reports to take it down until it's reviewed." : "It'll be looked at."}</span>`;
          if (r.hidden) { await h.refresh(); setTimeout(() => { ui.reporting = null; drawList(); drawPool(); }, 1500); }
        } catch (e) { rep.querySelector("[data-rmsg]").textContent = errText(e); rep.querySelectorAll("button").forEach((x) => { x.disabled = false; }); }
      });
    }
  }

  /* ---------- the review queue (admins) ---------- */
  async function loadQueue() {
    try { ui.queue = (await h.queue()).sort((a, b) => (b.reports || 0) - (a.reports || 0) || a.at - b.at); }
    catch (e) { ui.queue = []; ui.queueError = errText(e); }
    if (ui.tab === "review") drawList(); else drawTabs();
  }
  function drawQueue() {
    const box = $("#qList");
    if (!ui.queue) { box.innerHTML = `<div class="sub qempty">Loading…</div>`; return; }
    if (!ui.queue.length) { box.innerHTML = `<div class="sub qempty">${ui.queueError ? esc(ui.queueError) : "Nothing waiting. All caught up."}</div>`; return; }
    const reasons = `<option value="">Reject because…</option>` + Object.entries(REJECT_REASONS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
    box.innerHTML = ui.queue.map((q) => {
      const reported = q.reports > 0;
      const reps = (q.reportList || []).map((r) => REPORT_REASONS[r.reason] || r.reason);
      const counts = [...new Set(reps)].map((r) => `${r} ×${reps.filter((x) => x === r).length}`).join(", ");
      const chips = [
        q.status === "pending" ? `<span class="qchip wait">Waiting</span>` : q.status === "hidden" ? `<span class="qchip no">Hidden</span>` : `<span class="qchip ok">Live</span>`,
        (q.flags || []).includes("language") ? `<span class="qchip">Strong language</span>` : "",
        reported ? `<span class="qchip no">${q.reports} ${q.reports === 1 ? "report" : "reports"}${counts ? `: ${esc(counts)}` : ""}</span>` : ""
      ].join("");
      return `<div class="qrev" data-id="${esc(q.id)}">
        <div class="qrevhead">${chips}<span class="sub">from ${esc(q.name || "a player")} · ${new Date(q.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span></div>
        <textarea class="chin qarea" rows="2" data-f="text">${esc(q.text)}</textarea>
        <div class="qtrio"><input class="chin" data-f="source" value="${esc(q.source)}" aria-label="From"><input class="chin" data-f="by" value="${esc(q.by || "")}" placeholder="Who said it" aria-label="Who said it"><input class="chin" data-f="series" value="${esc(q.series || "")}" placeholder="${esc(guessSeries(q.source) || "Series")}" aria-label="Series"></div>
        <div class="sactions">
          <button type="button" class="go primary" data-act="${q.status === "pending" ? "approve" : "restore"}">${q.status === "pending" ? "Approve" : "Keep it live"}</button>
          <select class="chin qreject">${reasons}</select>
          <button type="button" class="go" data-act="${q.status === "pending" ? "reject" : "remove"}">${q.status === "pending" ? "Reject" : "Take down"}</button>
          <span class="sub" data-msg></span>
        </div></div>`;
    }).join("");
    box.querySelectorAll(".qrev").forEach((el) => {
      const id = el.dataset.id, q = ui.queue.find((x) => x.id === id);
      el.querySelectorAll("[data-act]").forEach((b) => b.onclick = async () => {
        const action = b.dataset.act, out = el.querySelector("[data-msg]");
        const reason = el.querySelector(".qreject").value;
        if ((action === "reject" || action === "remove") && !reason) { msg(out, "Pick a reason first.", true); return; }
        const f = (k) => el.querySelector(`[data-f="${k}"]`).value;
        const edits = { text: f("text"), source: f("source"), by: f("by"), series: f("series") };
        const changed = edits.text !== q.text || edits.source !== q.source || edits.by !== (q.by || "") || edits.series !== (q.series || "");
        el.querySelectorAll("button,select").forEach((x) => { x.disabled = true; });
        try {
          await h.review(id, action, { reason: reason || undefined, edits: action === "approve" && changed ? edits : undefined });
          ui.queue = ui.queue.filter((x) => x.id !== id);
          el.classList.add("gone"); msg(out, action === "approve" || action === "restore" ? "Live." : "Gone.");
          setTimeout(() => { drawList(); }, 700);
          h.refresh().then(() => { drawPool(); drawTabs(); }).catch(() => {});
        } catch (e) {
          msg(out, errText(e), true);
          el.querySelectorAll("button,select").forEach((x) => { x.disabled = false; });
        }
      });
    });
  }

  let searchT;
  $("#qSearch").oninput = (e) => { clearTimeout(searchT); searchT = setTimeout(() => { ui.search = e.target.value; ui.shown = PAGE; drawList(); }, 120); };

  function save(list) {
    const ok = h.onSave(list);
    drawPool(); drawList();
    return ok;
  }

  /* ---------- add and edit ---------- */
  function startEdit(id) {
    const q = h.mine().find((x) => x.id === id); if (!q) return;
    ui.editing = id;
    $("#qText").value = q.text; $("#qSource").value = q.source || ""; $("#qBy").value = q.by || ""; $("#qSeries").value = q.series || ""; hintSeries();
    $("#qFormHead").textContent = "Edit quote"; $("#qAdd").textContent = "Save changes"; $("#qCancel").hidden = false;
    msg($("#qMsg"), h.shared().has(sharedId(q.text)) ? "Edits change your copy; the shared one stays as it was reviewed." : "");
    $("#qText").focus(); $("#qText").scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function stopEdit() {
    ui.editing = null;
    $("#qText").value = ""; $("#qBy").value = ""; $("#qSeries").value = "";
    $("#qFormHead").textContent = "Add a quote"; $("#qAdd").textContent = "Add quote"; $("#qCancel").hidden = true;
  }
  $("#qCancel").onclick = () => { stopEdit(); msg($("#qMsg"), ""); };
  // the series box shows what it'll be filed under if left empty
  function hintSeries() {
    const g = guessSeries($("#qSource").value);
    $("#qSeries").placeholder = g ? `${g} (worked out from "From")` : "Leave empty if it's a one-off";
  }
  $("#qSource").addEventListener("input", hintSeries);
  $("#qAdd").onclick = async () => {
    const fields = { text: $("#qText").value, source: $("#qSource").value, by: $("#qBy").value, series: $("#qSeries").value };
    if (ui.editing) {
      const r = updateQuote(h.mine(), ui.editing, fields);
      if (r.error) return msg($("#qMsg"), r.error, true);
      stopEdit(); save(r.list); msg($("#qMsg"), "Saved.");
      return;
    }
    const r = addQuotes(h.mine(), [fields]);
    if (r.errors.length) return msg($("#qMsg"), r.errors[0], true);
    if (!r.added) return msg($("#qMsg"), "That one's already there.", true);
    $("#qText").value = ""; $("#qBy").value = ""; // keep the source: the next one is often from the same place
    ui.tab = "mine";
    const kept = save(r.list);
    msg($("#qMsg"), kept ? "Added." : "Added, but this browser won't keep it after you leave.");
    if (sharing()) {
      msg($("#qMsg"), "Added. Sending for review…");
      const s = await share([r.list[r.list.length - 1]]);
      msg($("#qMsg"), `Added. ${s.text}`, s.bad);
    }
    $("#qText").focus();
  };
  $("#qText").onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#qAdd").click(); } };

  /* ---------- paste and export ---------- */
  $("#qImport").onclick = async () => {
    let parsed;
    try { parsed = parseImport($("#qBulk").value, $("#qBulkSource").value.trim()); }
    catch (e) { return msg($("#qBulkMsg"), e.message, true); }
    if (!parsed.length) return msg($("#qBulkMsg"), "Paste some quotes first.", true);
    const before = h.mine().length;
    const r = addQuotes(h.mine(), parsed);
    const bits = [`Added ${r.added} ${r.added === 1 ? "quote" : "quotes"}`];
    if (r.skipped) bits.push(`${r.skipped} already there`);
    if (r.errors.length) bits.push(`${r.errors.length} too short or too long`);
    if (r.added) { save(r.list); $("#qBulk").value = ""; ui.tab = "mine"; drawList(); }
    msg($("#qBulkMsg"), bits.join(", ") + ".", !r.added);
    if (r.added && sharing()) {
      msg($("#qBulkMsg"), bits.join(", ") + ". Sending for review…");
      const s = await share(r.list.slice(before), (n, of) => msg($("#qBulkMsg"), `${bits.join(", ")}. Sharing ${n} of ${of}…`));
      msg($("#qBulkMsg"), bits.join(", ") + ". " + s.text, s.bad);
    }
  };
  $("#qExport").onclick = () => {
    const mine = h.mine();
    if (!mine.length) return msg($("#qBulkMsg"), "Nothing of yours to export yet.", true);
    const url = URL.createObjectURL(new Blob([exportQuotes(mine)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "retype-quotes.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    msg($("#qBulkMsg"), `Exported ${mine.length}.`);
  };

  drawShare(); drawPool(); drawList(); hintSeries();
  // fresh copies of everyone's quotes and your submissions, then the queue for admins
  h.refresh().then(() => { if (view.isConnected) { drawShare(); drawPool(); drawList(); } }).catch(() => {});
  if (h.admin()) loadQueue();
}
