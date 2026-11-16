# Retype

An accuracy-first typing trainer. You type along a galley strip (or a ruled page) past a red pencil; mistakes are marked like a proof, every galley prints a till receipt, and the words you fumble keep coming back until you don't.

Retype is a working name.

## Running it

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run build      # static site in dist/
npm run preview    # serve the built site
```

Deploying to Firebase Hosting: `firebase use --add` to pick a project, then `npm run build && firebase deploy --only hosting`. `firebase.json` already serves `dist/`.

## What's in version 1

Everything runs in the browser. Nothing is sent anywhere yet.

- **Galleys**: 25/50/100 words or custom, 15/30/60/120 seconds or custom, flow (no clock, no end; Esc finishes), and Python code mode.
- **Layouts**: a single galley strip that slides under a fixed pencil, or a page of 2–5 lines.
- **Proof marks**: wrong letters struck through with the right one written above, insert marks for skipped letters, a corrections margin.
- **Till roll**: each word prints as you finish it; the receipt at the end has the totals and your next ticket.
- **Results**: a finish band with a stamp (Perfect, Proofed, or Spiked in sudden death), a per-keystroke speed chart (actual, raw, burst, mistakes), weak words, slow letter pairs, and a share card image.
- **Practice**: practise this galley's weak words, mix your trouble words into normal galleys, or drill slow letter pairs.
- **Daily galley**: 40 words from the top 1,000, seeded from the date so everyone gets the same words. Your first attempt each day counts; retries are practice.
- **Challenges**: from the results, copy a link to the exact same galley (or script) with your score attached. Whoever opens it types the same words and sees who won. Links carry everything, so no server is needed.
- **Progress**: personal bests per kind of galley, a rank from your recent scores, a forgiving daily streak, and a weak-word profile that builds up across galleys. All on the Stats page.
- **Settings**: layout, size, typeface, slide speed, theme, stop on error, sudden death, backspace limits, word list (top 200/1,000/5,000), punctuation, numbers, focus mode, key sounds, code indentation.

### Scoring

- **WPM** counts only words typed exactly right, plus their spaces, divided by five, per minute.
- **Raw** counts every key.
- **Accuracy** is correct keys over all keys. A mistake you fix still counts. A space after a misspelt word isn't a second mistake; a space that skips letters is.
- **Score** is `wpm × (accuracy/100)²`, so accuracy matters more than speed: 80 wpm at 100% (80) beats 100 wpm at 89% (79.2).
- **Rank** is the average score of your last 10 ranked galleys (ordinary galleys of 15+ words; not practice, code, flow or sudden death). You need 3 for a first rank: Copy boy, Typesetter (20), Compositor (35), Proofreader (50), Sub-editor (65), Editor (80), Editor-in-chief (100).
- **Daily galleys and challenges** don't count towards rank or personal bests: the words are known in advance, so retries would inflate them.
- **Personal bests** are kept per kind of galley (length, word list, punctuation, numbers, sudden death; per script in code mode) and need at least 10 words.
- **Streak**: any finished galley counts for its day. One missed day is forgiven as long as there wasn't another forgiven day in the week before it.

## Layout of the code

```
src/
  core/        pure logic, no DOM; everything here is tested
    rng.js          seeded generator: the same seed gives the same galley
    words.js        word lists, generation, punctuation, pair drills
    analysis.js     scoring a galley from its keystroke log
    chart-data.js   per-keystroke speed series
    code.js         scripts for code mode, Python highlighting
    progress.js     score, ranks, personal bests, streaks, weak-word profile
    challenge.js    challenge links (encode/decode) and the daily seed
    result.js       the stored shape of a finished galley
  storage/
    store.js             IndexedDB (memory fallback): results + small records
    progress-service.js  folds a result into progress and saves it
  ui/          the interface: app.js (typing desk), chart, stats page, settings, share card, sound
  data/        word lists
tests/         Vitest suites for core and storage
```

### Ready for accounts later

Each stored result carries an id, a `userId` (the guest id for now), a timestamp, every setting that affects difficulty, the seed, and the packed keystroke log. When accounts arrive, the guest's results can be uploaded as they are, and a server can re-score any run from its log to check leaderboard scores.

## Word lists

- `src/data/words-200.js`: hand-picked.
- `src/data/words-1k.js` and `words-5k.js`: the most frequent English words from [wordfreq](https://github.com/rspeer/wordfreq) (data licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)). They're filtered to plain a–z words, with abbreviations, contraction fragments and a profanity screen removed. The 5k list still contains some names and places and is worth a read-through.

## Code mode

The six scripts and their explanations are hand-written. Each stored output comes from running the script with Python 3, and `tests/snippets.test.js` re-runs them when `python3` is available, so an edited script can't drift from its output. Running the code live in the browser (Pyodide) is a later step.
