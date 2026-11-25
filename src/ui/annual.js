// The Retype Annual page (#annual): your year as a front page. Facts from core/annual.js.
import { esc, fmtDuration } from "./util.js";
import { buildAnnual } from "../core/annual.js";

const dayName = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }); };

/** handlers: { results, races, feats, rank, name, year, onBack, onPractise(word), onYear(y) } */
export function renderAnnual(view, h) {
  const a = buildAnnual(h.results, h.year, h), s = a.stats;
  const row = (label, value) => `<div class="erow"><span>${label}</span><b>${value}</b></div>`;
  const years = [...new Set(h.results.map((r) => new Date(r.at).getFullYear()))].sort((x, y) => y - x);
  view.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <div class="seg" role="tablist">${(years.length ? years : [h.year]).map((y) => `<button type="button" data-y="${y}" aria-selected="${y === h.year}">${y}</button>`).join("")}</div>
      <button type="button" class="go" id="anBack">Back to typing <kbd>esc</kbd></button>
    </div>
    <article class="edition annual">
      <header class="mast"><div class="rule"></div><h1>The Retype Annual</h1>
        <div class="dateline"><span>${a.year}</span><span>The year in galleys</span><span>Price: one galley</span></div><div class="rule"></div></header>
      <h2 class="lead">${esc(a.lead)}</h2>
      <p class="dek">${esc(a.dek)}</p>
      ${a.quiet ? `<p class="quiet">Nothing filed this year yet. There's still time.</p>` : `
      <div class="cols">
        <section><h3>By the numbers</h3>
          ${row("Galleys", s.galleys.toLocaleString("en-IE"))}
          ${row("Words typed", s.words.toLocaleString("en-IE"))}
          ${row("Keys pressed", s.keys.toLocaleString("en-IE"))}
          ${row("Time at the desk", fmtDuration(s.secs))}
          ${row("Accuracy", s.acc != null ? s.acc.toFixed(1) + "%" : "–")}
          ${row("Perfect galleys", s.perfect)}
          ${row("Days at the desk", s.days)}
          ${row("Pieces of type found", a.sorts)}
        </section>
        <section><h3>Highlights</h3>
          ${a.best ? `<p><b>Best galley: ${Math.round(a.best.wpm)} wpm at ${a.best.acc.toFixed(1)}%</b><br><small>${a.best.wordsDone} words, ${new Date(a.best.at).toLocaleDateString(undefined, { day: "numeric", month: "long" })}</small></p>` : ""}
          ${a.fastest && a.fastest !== a.best ? `<p><b>Fastest: ${Math.round(a.fastest.wpm)} wpm</b><br><small>at ${a.fastest.acc.toFixed(1)}%</small></p>` : ""}
          ${a.bestDay ? `<p><b>Busiest day: ${a.bestDay.galleys} galleys</b><br><small>${dayName(a.bestDay.day)}</small></p>` : ""}
          ${a.bestMonth ? `<p><b>Busiest month: ${a.bestMonth.month}</b><br><small>${a.bestMonth.galleys} galleys</small></p>` : ""}
          ${a.survival ? `<p><b>Longest survival: ${a.survival.wordsDone} words</b></p>` : ""}
          ${a.races ? `<p><b>Races: ${a.races.wins} won of ${a.races.played}</b></p>` : ""}
          ${a.rank?.rank ? `<p><b>Rank: ${esc(a.rank.rank.name)}</b><br><small>${Math.round(a.rank.pp ?? 0).toLocaleString("en-IE")} PP</small></p>` : ""}
        </section>
        <section><h3>The word of the year</h3>
          ${a.word ? `<p class="wotw">&lsquo;${esc(a.word.word)}&rsquo;</p><p><small>Fumbled ${a.word.misses} times this year. It knows what it did.</small></p><button type="button" class="go" id="anPractise">Practise it</button>` : `<p><small>No word gave you real trouble. Remarkable, or suspicious.</small></p>`}
        </section>
      </div>
      ${a.feats.length ? `<section class="also"><h3>The year's headlines</h3><ul>${a.feats.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}`}
    </article>`;
  view.querySelector("#anBack").onclick = h.onBack;
  view.querySelector("#anPractise")?.addEventListener("click", () => h.onPractise(a.word.word));
  view.querySelectorAll("[data-y]").forEach((b) => b.onclick = () => h.onYear(+b.dataset.y));
  return a;
}
