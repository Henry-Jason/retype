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

- **Galleys**: top 200, 1,000 or 5,000 words (switchable in the header), 25/50/100 words or custom, 15/30/60/120 seconds or custom, flow (no clock, no end; Esc finishes), and Python code mode.
- **Layouts**: a single galley strip that slides under a fixed pencil, or a page of 2–5 lines.
- **Proof marks**: wrong letters struck through with the right one written above, insert marks for skipped letters, a corrections margin.
- **Till roll**: each word prints as you finish it; the receipt at the end has the totals and your next ticket.
- **Results**: a finish band with a stamp (Perfect, Proofed, or Spiked in sudden death), a per-keystroke speed chart (actual, raw, burst, mistakes), weak words, slow letter pairs, and a share card image.
- **Practice**: practise this galley's weak words, mix your trouble words into normal galleys, or drill slow letter pairs.
- **Daily galley**: 40 words from the top 1,000, seeded from the date so everyone gets the same words. Your first attempt each day counts; retries are practice.
- **Challenges**: from the results, copy a link to the exact same galley (or script) with your score attached. Whoever opens it types the same words and sees who won. Links carry everything, so no server is needed.
- **Progress**: personal bests per kind of galley, a rank from your recent scores, a forgiving daily streak, and a weak-word profile that builds up across galleys. All on the Stats page.
- **Quotes**: type a whole quote instead of random words. 195 built-in quotes (speeches, science and space, philosophy, Shakespeare and other literature, poetry, proverbs), all public domain. Add your own on the Quotes page (`#quotes`): one at a time, or paste a list (one per line, or blocks ending `- Who, Source`), filter by length (short ≤20 words, medium 21–45, long 46+), by library or yours, and by source. Your quotes live in this browser (`retype-quotes-v1` in localStorage), separate from progress, with JSON export/import. Quote galleys keep bests per length (whole quotes of 5+ words), earn XP, and don't earn PP. Challenge links carry library quotes by id and your own by text.
- **Series**: sources group into series (franchises), so "Only from" can pick a whole series ("All of Harry Potter") or one source in it. Common ones are worked out from the source (`SERIES_RULES` in `src/core/quotes.js`: Harry Potter, Middle-earth, the MCU, Spider-Man, Batman, Breaking Bad, Game of Thrones, Dune and more); a quote's optional `series` field overrides the guess and is only stored when it differs from it. Admins can set it when reviewing.
- **Shared quotes**: signed-in players can share their quotes with everyone (a "Share with everyone" box under both forms, or Share on any of yours). Each one goes through the `submitQuotes` Cloud Function, which runs the filter in `src/core/moderation.js` (slurs, links/emails/handles, spam, shouting, gibberish and library duplicates are turned away; strong language is flagged, not refused), caps each player at 50 a day and 100 waiting, and files it as `quotes/{id}` with status `pending`. Admins have no caps, and their own quotes go live straight away (still filtered). An admin approves (fixing wording or attribution if needed) or rejects it with a reason on the Review tab of the Quotes page; only approved quotes are readable by everyone, and they appear as "Everyone's" in quote mode. Players can report a live quote; three reports from different players hide it until an admin keeps it or takes it down. Players can hide quotes flagged for strong language. Browsers can't write to `quotes/` at all; everything goes through `submitQuotes`, `withdrawQuote`, `reportQuote` and `reviewQuote`. The filter's word lists stay on the server: the browser bundle never imports `moderation.js`.
- **Becoming an admin**: in the Firebase console, add a document `admins/{your uid}` (any field, e.g. `at: 1`). Your uid is on the Authentication page. The Quotes button then shows how many quotes are waiting.
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

## Accounts

Sign in with Google to keep your progress in your account and on every device. Guests keep everything in the browser as before; signing in brings all of it along.

- **Turning it on:** paste the web app's config into `src/firebase-config.js`. While it's `null`, the app is guest-only and Firebase isn't even downloaded.
- **What's stored:** `users/{uid}` holds bests, weak words, streak days and totals; `users/{uid}/results/{id}` holds one document per galley, keystroke log included (as a string: Firestore can't store arrays inside arrays).
- **Sync:** galleys are uploaded as they finish and folded into the account inside a transaction, so two devices can't overwrite each other's totals. The account remembers the last 300 galley ids it has counted, so a retried upload never counts twice. A galley finished offline is retried at the next sync.
- **Signing out** clears this browser; the account keeps everything. **Clearing progress** while signed in clears the account too.
- **Security rules** (`firestore.rules`): each person can read and write only their own documents, results can't be edited once written, and everything else is closed.

### Testing it

```bash
npm test             # everything, including sync against an in-memory fake cloud
npm run test:rules   # security rules against the Firestore emulator (needs Java 11+)
npm run emulators    # Auth + Firestore emulators, then in another terminal:
npm run dev:emulators  # the app pointed at the emulators, with fake Google sign-in
```

## Levels

Levels run from 0 with no cap; level n needs `100 + 20n` XP to clear. XP comes from typing (one point per five correct keys), accuracy, speed (capped at 200 wpm), perfect galleys, personal bests, rank-ups, the first galley of the day, the streak and the daily. Bonuses need at least 10 words. The XP for each galley is worked out once and stored on the result, so the account adds exactly what the browser showed. Rules live in `src/core/levels.js`.

## PP, ranks and grades

Performance points work like osu!'s. Each galley of 15+ words (plain, mixed, daily or challenge; not practice, code, flow or sudden death) earns `100 × (wpm/100)^1.5 × (acc/100)^12 × difficulty × length`. Difficulty comes from the words actually typed (their frequency rank, plus a little for capitals, punctuation and numbers): about 0.85 for the top 200, 1 for the top 1,000, 1.2 for the top 5,000. Length runs from 0.8 to 1.2 at 100 words. Your total is your top 100 galleys, each weighted 0.95× the one above. Ranks (15 of them, Copy boy to Fourth estate, 0 to 11,000 PP, each step about 30% further than the last) come from the total, and each galley gets a letter grade from its accuracy (SS 100%, S 98%, A 95%, B 90%, C 85%). Rules live in `src/core/pp.js`; the top 100 is kept locally and in the account document (`top`).

Both boards have their own page (`#boards`, the Boards button); Stats just shows your place. The all-time PP board (`boards/pp/entries/{uid}`) is written only by the `postPp` function, which re-scores every saved galley from its keystrokes. `backfillPp` (callable, once per account) scores galleys saved before PP existed, and `clearPp` removes the entry when progress is cleared.

## Daily board

Signed-in players' first daily of the day goes on `boards/daily-{day}`. Nobody can write to a board directly: the `postDaily` Cloud Function (in `functions/`) picks up each new daily result, rebuilds the galley from its keystroke log with `src/core/verify.js`, checks the words match the day's seed, recomputes wpm, accuracy and score, rejects impossible typing (over 250 wpm, too many sub-12 ms gaps), and only then writes the entry. Names come from `profiles/{uid}` (2 to 20 characters, set in Stats); `renameOnBoards` updates the last two days when someone renames.

`functions/shared` is a copy of `src/core` and `src/data`, made by `scripts/sync-functions.mjs` before every functions deploy, so the browser and the server score with the same code.

### Deploying

```bash
cd functions && npm install && cd ..   # once
npm run deploy   # tests, build, then hosting + rules + functions
```

Functions need the Blaze plan.

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
    sync.js         folding galleys into the account, merging guest data
    result.js       the stored shape of a finished galley
  storage/
    store.js             IndexedDB (memory fallback): results + small records
    progress-service.js  folds a result into progress and saves it
    account-sync.js      what to upload and when; signing in, out and clearing
    cloud.js             Firebase Auth and Firestore (loaded only when accounts are on)
  ui/          the interface: app.js (typing desk), chart, stats page, settings, share card, sound
  data/        word lists
tests/         Vitest suites for core, storage and sync
tests-rules/   security-rule tests (Firestore emulator)
```

### Ready for accounts later

Each stored result carries an id, a `userId` (the guest id for now), a timestamp, every setting that affects difficulty, the seed, and the packed keystroke log. When accounts arrive, the guest's results can be uploaded as they are, and a server can re-score any run from its log to check leaderboard scores.

## Word lists

- `src/data/words-200.js`: hand-picked.
- `src/data/words-1k.js` and `words-5k.js`: the most frequent English words from [wordfreq](https://github.com/rspeer/wordfreq) (data licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)), filtered to plain a–z words. Names, places, nationalities, religions, brands, days and months are removed: each word is checked against Webster's dictionary (a word only ever written with a capital is a proper noun) and the GeoNames list of cities and countries, then reviewed by hand, because some words are both ("bill", "mark", "rose" and "turkey" stay; "york", "smith" and "jordan" go). Abbreviations, contraction fragments, foreign fragments, text-speak and profanity are removed too.

## Code mode

The 22 scripts and their explanations are hand-written. Each stored output comes from running the script with Python 3, and `tests/snippets.test.js` re-runs them when `python3` is available, so an edited script can't drift from its output. Running the code live in the browser (Pyodide) is a later step.
