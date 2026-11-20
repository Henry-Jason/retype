import { describe, it, expect } from "vitest";
import { screenQuote, tokens, submission, existingVerdict, countToday, review, report, sharedId, SHARE_RULES } from "../src/core/moderation.js";
import { LIBRARY } from "../src/core/quotes.js";

const ok = (text, source = "The Show", by = "") => screenQuote({ text, source, by });

describe("the filter", () => {
  it("lets ordinary quotes through, tidied", () => {
    const r = ok("  I’m not  locked in here with you — you’re locked in here with me. ", "Watchmen", "Rorschach");
    expect(r.ok).toBe(true);
    expect(r.quote.text).toBe("I'm not locked in here with you - you're locked in here with me.");
    expect(r.flags).toEqual([]);
  });
  it("needs a source and four words", () => {
    expect(ok("A quote with no source", "").ok).toBe(false);
    expect(ok("Too short here").ok).toBe(false);
  });
  it("turns away slurs, however they're dressed up", () => {
    for (const t of ["you are a f4ggot and that is that", "what a stupid f a g g o t you are", "shut up you k1ke right now", "go home you sp1c, go on"]) {
      const r = ok(t);
      expect(r.ok, t).toBe(false);
      expect(r.reason).toMatch(/slur/);
    }
    expect(ok("A perfectly fine quote", "Spic and span").ok).toBe(false);
  });
  it("doesn't trip over innocent words", () => {
    for (const t of ["Scunthorpe United won at home on Saturday", "The country of Niger lies in West Africa", "Moby Dick is a long book about a whale", "We saw a peacock and a raccoon in the garden"]) expect(ok(t).ok, t).toBe(true);
  });
  it("flags strong language for the reviewer, without turning it away", () => {
    const r = ok("Maximum effort, you absolute shitbags, let's fucking go", "Deadpool");
    expect(r.ok).toBe(true);
    expect(r.flags).toEqual(["language"]);
  });
  it("turns away links, handles, spam and shouting", () => {
    expect(ok("Buy cheap followers at example.com today please").reason).toMatch(/links/);
    expect(ok("Follow me on there @someone for more quotes").reason).toMatch(/links/);
    expect(ok("Hello hello hello hello my friends", "x x").reason).toMatch(/same word/);
    expect(ok("Waaaaaaaaaaaay too many letters in this one").reason).toMatch(/repeated/);
    expect(ok("THIS IS ALL IN CAPITAL LETTERS FOR NO GOOD REASON").reason).toMatch(/capitals/);
    expect(ok("12345 67890 !!!!? ??? 1234 aa").ok).toBe(false);
    expect(ok("xkcd zzpt qrst bvcx wxyz").reason).toMatch(/words/);
  });
  it("won't take quotes that are already in the library", () => {
    expect(ok(LIBRARY[0].text).reason).toMatch(/library/);
  });
  it("reads spaced-out and stretched letters as words", () => {
    expect(tokens("n.i.c.e one")).toContain("nice");
    expect(tokens("shiiiit")).toContain("shit");
  });
});

describe("the queue", () => {
  const q = screenQuote({ text: "We are the ones we've been waiting for", source: "A speech" });
  const doc = submission({ quote: q.quote, flags: q.flags, uid: "ana", name: "Ana", now: 5 });
  it("files a submission as pending under an id from its text", () => {
    expect(doc).toMatchObject({ id: sharedId(q.quote.text), status: "pending", uid: "ana", name: "Ana", reports: 0, words: 8 });
    expect(sharedId("we are the ONES we’ve been waiting for")).toBe(doc.id);
  });
  it("explains a duplicate", () => {
    expect(existingVerdict({ ...doc, status: "approved" }, "ben")).toMatch(/already shared/);
    expect(existingVerdict(doc, "ana")).toMatch(/waiting/);
    expect(existingVerdict({ ...doc, status: "rejected" }, "ana")).toMatch(/turned down/);
  });
  it("counts submissions per UTC day", () => {
    const t = Date.UTC(2026, 10, 20, 12);
    expect(countToday({ day: "2026-11-20", n: 7 }, t)).toEqual({ day: "2026-11-20", n: 7 });
    expect(countToday({ day: "2026-11-19", n: 50 }, t)).toEqual({ day: "2026-11-20", n: 0 });
    expect(SHARE_RULES.perDay).toBeGreaterThan(SHARE_RULES.batch);
  });
  it("approves, with fixes to the attribution", () => {
    const r = review(doc, { action: "approve", edits: { source: "Barack Obama, 2008", by: "" } }, 9);
    expect(r.doc).toMatchObject({ status: "approved", source: "Barack Obama, 2008", reviewedAt: 9 });
  });
  it("won't let an edit change the words into a different quote", () => {
    expect(review(doc, { action: "approve", edits: { text: "Something else entirely different here" } }, 9).error).toBeTruthy();
    expect(review(doc, { action: "approve", edits: { text: "We are the ones we've been waiting for." } }, 9).doc.text).toBe("We are the ones we've been waiting for.");
  });
  it("rejects only with a reason", () => {
    expect(review(doc, { action: "reject" }, 9).error).toBeTruthy();
    expect(review(doc, { action: "reject", reason: "fake" }, 9).doc).toMatchObject({ status: "rejected", reason: "fake" });
  });
  it("hides a quote after enough reports from different players, and restoring clears them", () => {
    let live = review(doc, { action: "approve" }, 9).doc;
    expect(report(live, { uid: "ana", reason: "spam" }).error).toMatch(/your own/);
    expect(report(live, { uid: "ben", reason: "nope" }).error).toBeTruthy();
    expect(report(live, { uid: "ben", reason: "spam", already: true }).counted).toBe(false);
    for (const uid of ["ben", "cat", "dan"]) live = report(live, { uid, reason: "offensive" }).doc;
    expect(live).toMatchObject({ status: "hidden", reports: 3 });
    expect(report(live, { uid: "eve", reason: "spam" }).error).toBeTruthy();
    expect(review(live, { action: "restore" }, 10).doc).toMatchObject({ status: "approved", reports: 0 });
  });
});
