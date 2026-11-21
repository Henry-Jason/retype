// The weekly edition page (#edition): last week's front page, or this week's so far.
import { esc, fmtDuration } from "./util.js";
import { buildEdition, weekStart } from "../core/edition.js";

const longDate = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** handlers: { results, feats, name, first, onBack, onPractise(word), now } */
export function renderEdition(view, handlers, which = "last") {
  const now = handlers.now ?? Date.now(), thisWeek = weekStart(now);
  const start = which === "this" ? thisWeek : weekStart(thisWeek - 86400000);
  const e = buildEdition(handlers.results, start, { feats: handlers.feats, name: handlers.name, first: handlers.first });
  const s = e.stats, p = e.prev;
  const delta = (a, b, unit = "", dp = 0) => (a == null || b == null || Math.abs(a - b) < 10 ** -dp / 2 ? "" : `<i class="${a > b ? "up" : "down"}">${a > b ? "▲" : "▼"} ${Math.abs(a - b).toFixed(dp)}${unit}</i>`);
  const row = (label, value, d = "") => `<div class="erow"><span>${label}</span><b>${value}</b>${d}</div>`;
  view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <div class="seg" role="tablist"><button type="button" data-w="last" aria-selected="${which === "last"}">Last week</button><button type="button" data-w="this" aria-selected="${which === "this"}">This week so far</button></div>
      <button type="button" class="go" id="edBack">Back to typing <kbd>esc</kbd></button>
    </div>
    <article class="edition">
      <header class="mast"><div class="rule"></div><h1>The Retype Weekly</h1>
        <div class="dateline"><span>No. ${e.no}</span><span>Week of ${longDate(e.start)}${which === "this" ? " · so far" : ""}</span><span>Price: one galley</span></div><div class="rule"></div></header>
      <h2 class="lead">${esc(e.lead)}</h2>
      <p class="dek">${esc(e.dek)}</p>
      ${e.quiet ? `<p class="quiet">${which === "this" ? "Nothing filed yet this week. Today's a good day for it." : "Nothing filed last week. This week's edition is still being written."}</p>` : `
      <div class="cols">
        <section><h3>By the numbers</h3>
          ${row("Galleys", s.galleys, p ? delta(s.galleys, p.galleys) : "")}
          ${row("Time at the desk", fmtDuration(s.secs))}
          ${row("Words typed", s.words.toLocaleString("en-IE"), p ? delta(s.words, p.words) : "")}
          ${row("Accuracy", s.acc != null ? s.acc.toFixed(1) + "%" : "–", p ? delta(s.acc, p.acc, " pts", 1) : "")}
          ${row("Perfect galleys", s.perfect)}
          ${row("Days at the desk", `${s.days} of 7`)}
        </section>
        <section><h3>Best of the week</h3>
          ${e.best ? `<p><b>${Math.round(e.best.wpm)} wpm at ${e.best.acc.toFixed(1)}%</b><br><small>${e.best.wordsDone} words, ${new Date(e.best.at).toLocaleDateString(undefined, { weekday: "long" })}</small></p>` : `<p><small>No scored galleys this week.</small></p>`}
          ${e.survival ? `<p><b>${e.survival.wordsDone} words survived</b><br><small>${e.survival.kind === "dsurv" ? "daily survival" : "survival"}, ${new Date(e.survival.at).toLocaleDateString(undefined, { weekday: "long" })}</small></p>` : ""}
        </section>
        <section><h3>Word of the week</h3>
          ${e.word ? `<p class="wotw">&lsquo;${esc(e.word.word)}&rsquo;</p><p><small>Fumbled ${e.word.misses} times. Our correspondent suggests a word with it.</small></p><button type="button" class="go" id="edPractise">Practise it</button>` : `<p><small>No word gave you any real trouble. Suspicious.</small></p>`}
        </section>
      </div>
      ${e.feats.length ? `<section class="also"><h3>Also in this edition</h3><ul>${e.feats.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></section>` : ""}`}
    </article>`;
  view.querySelector("#edBack").onclick = handlers.onBack;
  view.querySelector("#edPractise")?.addEventListener("click", () => handlers.onPractise(e.word.word));
  view.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => renderEdition(view, handlers, b.dataset.w));
  return e;
}
