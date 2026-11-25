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

- **Galleys**: top 200, 1,000, 5,000 or 10,000 words (switchable in the header), 25/50/100 words or custom, 15/30/60/120 seconds or custom, flow (no clock, no end; Esc finishes), survival (below), and Python code mode.
- **Survival**: type until you run out of lives (1, 3, 5 or 10). A word costs a life the moment it gets its first wrong key (a space that skips letters counts), fixed or not; further mistakes in the same word are free. The words get harder as you go: the first 50 come from the top 200, the next 100 from the top 1,000, the next 200 from the top 5,000, and everything after from the top 10,000, with a label above the first word of each region. A speed floor (off, 20, 30, 40 or 60 wpm; 30 by default) costs a life whenever your last 10 words, plus any time since, drop below it, then starts counting afresh; it stops a run being won by crawling. Optional regen gives a life back after 50 clean words in a row, up to what you started with. Punctuation and numbers only if they're switched on. Lost lives print on the till roll as voids. Bests are the furthest run (then the better score) and kept apart per number of lives, regen, floor, punctuation and numbers. Runs stop at 1,990 words, where the stored galley would get too big. Survival runs earn XP and feed your weak words but don't earn PP or count for rank, and have no challenge links yet. Rules live in `src/core/survival.js`.
- **Layouts**: a single galley strip that slides under a fixed pencil, or a page of 2–5 lines.
- **Proof marks**: wrong letters struck through with the right one written above, insert marks for skipped letters, a corrections margin.
- **Till roll**: each word prints as you finish it; the receipt at the end has the totals and your next ticket.
- **Results**: a finish band with a stamp (Perfect, Proofed, or Spiked in sudden death), a per-keystroke speed chart (actual, raw, burst, mistakes), weak words, slow letter pairs, and a share card image.
- **Practice**: practise this galley's weak words, mix your trouble words into normal galleys, or drill slow letter pairs.
- **Daily galley**: 40 words from the top 1,000, seeded from the date so everyone gets the same words. Your first attempt each day counts; retries are practice.
- **Challenges**: from the results, copy a link to the exact same galley (or script) with your score attached. Whoever opens it types the same words and sees who won. Links carry everything, so no server is needed.
- **Progress**: personal bests per kind of galley, a rank from your recent scores, a forgiving daily streak, and a weak-word profile that builds up across galleys. All on the Stats page.
- **Quotes**: type a whole quote instead of random words. 195 built-in quotes (speeches, science and space, philosophy, Shakespeare and other literature, poetry, proverbs), all public domain. Add your own on the Quotes page (`#quotes`): one at a time, or paste a list (one per line, or blocks ending `- Who, Source`), filter by length (short ≤20 words, medium 21–45, long 46+), by library or yours, and by source. Your quotes are kept in this browser (`retype-quotes-v1`), separate from progress, and synced to your account when you're signed in; JSON export/import too. Quote galleys keep bests per length (whole quotes of 5+ words), earn XP, and don't earn PP. Challenge links carry library quotes by id and your own by text.
- **Series**: sources group into series (franchises), so "Only from" can pick a whole series ("All of Harry Potter") or one source in it. Common ones are worked out from the source (`SERIES_RULES` in `src/core/quotes.js`: Harry Potter, Middle-earth, the MCU, Spider-Man, Batman, Breaking Bad, Game of Thrones, Dune and more); a quote's optional `series` field overrides the guess and is only stored when it differs from it. Admins can set it when reviewing.
- **Favourites**: heart a quote while typing it, on its results, or on the Quotes page; then set quote mode to Favourites (the heart in the quote row, the Quotes page, or Settings). Favourites are kept by the quote's words (`favKey` in `src/core/quotes.js`), so one of your quotes stays a favourite after it's shared, and they're saved in this browser (`retype-favourites-v1`). With other filters on top, favourites are the last thing quote mode gives up when nothing matches.
- **Synced quotes and favourites**: when signed in, your own quotes and favourites live in `users/{uid}/saved/quotes` too, so they follow you between devices. Each browser merges its copy with the account's (`src/core/quote-sync.js`): every add, edit, deletion and (un)favourite carries a time and the newer change wins, deletions are kept as tombstones so another device can't bring them back, and merging is safe in any order. Changes sync about a second after you make them, and on sign-in and opening the Quotes page. Signing in brings a guest's quotes along; signing out clears this browser's copy (the account keeps it).
- **Shared quotes**: signed-in players can share their quotes with everyone (a "Share with everyone" box under both forms, or Share on any of yours). Each one goes through the `submitQuotes` Cloud Function, which runs the filter in `src/core/moderation.js` (slurs, links/emails/handles, spam, shouting, gibberish and library duplicates are turned away; strong language is flagged, not refused), caps each player at 50 a day and 100 waiting, and files it as `quotes/{id}` with status `pending`. Admins have no caps, and their own quotes go live straight away (still filtered). An admin approves (fixing wording or attribution if needed) or rejects it with a reason on the Review tab of the Quotes page; only approved quotes are readable by everyone, and they appear as "Everyone's" in quote mode. Players can report a live quote; three reports from different players hide it until an admin keeps it or takes it down. Players can hide quotes flagged for strong language. Browsers can't write to `quotes/` at all; everything goes through `submitQuotes`, `withdrawQuote`, `reportQuote` and `reviewQuote`. The filter's word lists stay on the server: the browser bundle never imports `moderation.js`.
- **Display names**: shown on the boards and to strangers in quick races, so they're checked on the server (`screenName` in `src/core/moderation.js`): 2 to 20 characters, no swearing or slurs (stricter than quotes), no links, emails, handles or long numbers, and nothing posing as staff (admin, moderator, Retype…). Browsers can't write `profiles/` any more; names are set through the `setName` Cloud Function, which says what's wrong with a refused one. The first name comes from the Google account and becomes "Typist ABCD" if it can't be shown. Every name the server copies onto a board goes through the same check, and `screenRoomName` replaces any name written straight into a room that fails it.
- **Becoming an admin**: in the Firebase console, add a document `admins/{your uid}` (any field, e.g. `at: 1`). Your uid is on the Authentication page. The Quotes button then shows how many quotes are waiting.
- **Daily survival**: one survival run a day, the same words for everyone, with fixed rules (3 lives, a 30 wpm floor, no regen). Your first attempt each day goes on its own board, ordered by words survived, then score. The `postDailySurvival` function rebuilds the run from the day's seed and replays every life from the keystrokes (`verifyDailySurvival` in `src/core/verify.js`): wrong words, and lives lost to the speed floor, which the desk logs as their own entries in the keystroke log (flag 4) so the server can check each one was really slow and that none was skipped.
- **Game feel**: a typewriter bell (Settings → Milestone bell) for clean streaks of 25, 50 and 100, each new survival region and passing your best; the pencil warms up as a clean streak grows; the finish stamp lands with a thump, and perfect galleys get a gold seal. In survival, a flag on the galley marks where your best run of that kind ended, the tag counts down the last 20 words to it, and the finish screen says how close you came. Ordinary galleys say so when you finish within 5% of a best.
- **Headlines**: 41 achievements, each reported as a newspaper headline the first time you earn it (`src/core/feats.js`), shown as clippings on the finish band and kept in the scrapbook on the Stats page (unearned ones show how to get them). Stored as `feats` in the browser and the account document, merged between devices with the earlier date winning.
- **The desk**: pencil colours (the caret and proof marks), till-roll papers and stamp inks, unlocked by levels and headlines (`src/core/unlocks.js`), in Settings → Desk.
- **The Retype Weekly** (`#edition`): a front page for last week, or this week so far: a headline about your week, the numbers against the week before, your best galley and run, the word you fumbled most (with a button to practise it) and the headlines you made. The Stats button says "new" when last week's edition hasn't been read.
- **Progress line**: a thin line along the foot of the paper showing time left in a timed galley, how far through a word galley, or how close you are to your best survival run. It's green when you're on course to beat your best (the live score, same formula, more than 2% ahead), gold when level, red when behind, and grey with no best yet or in the first 3 seconds/5 words. Settings → Progress line.
- **Ghost races**: a faint second caret replays a past run beside you, with a live "vs" readout (+1.2s ahead, −0.8s behind). By default it's your best of the same kind (same length and word list, script, or quote length); on different words it moves at your best's pace in characters, and keeps going at that pace if your best was a shorter text. From any results, **Race your ghost** types the same words again against the run you just did, keystroke for keystroke (Esc keeps the same ghost; Tab drops it). The finish band says who won: by time to the line, or in survival by words outlasted. Ghosts don't change how bests are judged (still by score). The replay maths is in `src/core/ghost.js`; a best that isn't in this browser is fetched from your account. Settings → Ghost.
- **Friend rooms** (`#room`): race friends on the same words at the same moment. Make a room (you get a 5-character code and a link), friends join from the link or by typing the code, and the host picks the galley (25/50/100 words or 15/30/60 seconds, word list, punctuation, numbers) and starts it. Everyone gets a 4-second countdown and the clock starts for all at once; you can't restart or pause a race. While racing, everyone else is a named caret on your galley and a lane above it. Places go by score (wpm × accuracy², ties to the quicker finish); a word race only counts as finished if you got to the end. Rooms need you signed in, hold up to 8 players, and keep going round after round; if the host leaves, the longest-standing player takes over. Races earn XP and PP like any galley but never touch personal bests. Rules of a race: `src/core/room.js`; the page: `src/ui/race.js`; the database: `src/storage/rooms.js`. See "Friend rooms: setting up" below.
- **Quote and survival races**: rooms can also race a quote (any length, or short, medium or long; the host's browser picks one from the library or approved shared quotes, never anyone's private ones, and puts it in the room so everyone types the same) or survival (1, 3 or 5 lives, a 0/20/30/40 wpm floor, the same endless words for everyone). Survival is last one standing: anyone still alive ranks above everyone who's out, the rest go by words survived, and the race ends once the last one standing has outlasted everyone. Lanes show each player's lives. Quote and survival races earn XP but not PP (like solo quotes and survival).
- **Quick races** (Race page): one button per kind (25 words, 30 seconds, a short quote, survival) puts you in the fullest public room of that kind with space, or opens a new one. Public rooms are listed in `lobby/{code}` by their host, have fixed settings so everyone in a queue races the same thing, and start the next race on their own 10 seconds after there are two players (the host can also race alone). A lone player whose room has a busier (or, between two lone players, lower-coded) twin moves across, so two people pressing at the same moment end up together. The Race page shows how many are waiting for each kind. `pickOpenRoom` and the rest are in `src/core/room.js`.
- **Ghosts in quick races**: alone in a new public room for 8 seconds, you race ghosts instead of waiting (or press "Race ghosts now"): up to three replays of real players' recent runs of that kind, picked closest to your speed (one per player, never your own), topped up with house ghosts at steady paces around yours ("The night editor", "A copy boy"…). Ghosts are labelled as ghosts everywhere, with dotted carets. Every browser in the room replays the same ghosts from the same start, so anyone who joins sees them too (and races the next one for real). Once every real player is done, ghosts are placed as they'd have ended, so nobody waits for one. The pool is `ghosts/{mode}/runs/{uid}` in Firestore: the `collectGhost` function files each player's latest checked run of a quick-race kind (25 words, 30 seconds, a short quote, standard survival) there, unless they've turned off Settings → "Lend your runs as ghosts". The rules are in `src/core/racers.js`.
- **The type case**: every perfect galley of 25 words or more (no mistakes, nothing fixed; not practice or code) drops one piece of metal type, worked out from the galley's id so the browser and the account agree (`src/core/typecase.js`). Common letters drop often, rare sorts (k, j, x, q, z, &, ¶) about one time in twelve. The case is on the Stats page; completing a row (the vowels, the home row, the alphabet, the rare sorts) unlocks a pencil or ink for the desk.
- **Promotions**: a new rank gets a front page of its own over the finish screen ("Henry named Sub-editor"), with a bell and a PNG to save.
- **Race podiums and your race record**: races of three or more end with a podium; the host gets a Rematch button. Wins, podiums and winning runs are kept (`src/core/races.js`), synced to the account, shown on Stats, and earn headlines (first win, three in a row, winning without the fastest wpm, 25 races).
- **Rivals**: signed in, someone just above you on the PP board becomes your rival; the finish band says how far ahead they are, and passing them is front-page news (and a headline), after which a new one is found.
- **Flourishes**: a perfect galley's seal comes with a small mark of approval, a different one each time (a coffee ring, OK to print, a printer's fist, stet…).
- **The Retype Annual** (`#annual`): your year as a front page (galleys, words, time, best galley, busiest day and month, races, rank, the word of the year and the year's headlines), from `src/core/annual.js`. Open all year from Stats; in December and January the Stats button flags it.
- **First visit**: a short welcome card says the one thing that matters (score is wpm × accuracy²), and the first time a fast but sloppy galley costs you, the finish band says what it would have scored at 100%.
- **The finish band** leads with the result; the XP breakdown, PP totals, board places and the like are under Details.
- **The top bar**: one switch for what to type (Words, Time, Quote, Survival, Code, and Today ▾ for the daily galley and daily survival), then only that kind's options beside it: lengths and a word list for words and time (flow is the ∞ under Time), lives, regen and the speed floor for survival, length and favourites for quotes, the script for code. It fades once you start typing and comes back when you move the mouse or finish (Settings → Fade the top bar while typing).
- **Settings**: layout, size, typeface, slide speed, theme, stop on error, sudden death, backspace limits, word list (top 200/1,000/5,000/10,000), punctuation, numbers, survival lives, speed floor and regen, focus mode, ghost, key sounds, code indentation.
- **Word lists** (`src/data`): the top 1,000, 5,000 and 10,000 are the same wordfreq ranking, each the start of the next, so a word has one frequency rank everywhere. The second half of the 10,000 was filtered against the Monkeytype 5k/10k/25k lists and their 450k dictionary (names, places and brands dropped) and read through by hand; see the comment at the top of `words-10k.js`.

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

## Friend rooms: setting up

Rooms run on the Firebase **Realtime Database** (quicker than Firestore for live progress, and it notices when someone's connection drops). Once, in the Firebase console for `retype-883ba`:

1. **Build → Realtime Database → Create database**, location **Belgium (europe-west1)**, start in **locked mode**.
2. Check the database URL it shows matches `databaseURL` in `src/firebase-config.js` and `ROOMS_DB` in `functions/index.js` (`https://retype-883ba-default-rtdb.europe-west1.firebasedatabase.app`). If not, change both.
3. `npm run deploy` now also deploys `database.rules.json` and the `clearOldRooms` function, which deletes rooms more than a day old every six hours (and quick-race lobby entries an hour stale).

- **Rules:** `database.rules.json` is generated by `npm run rules:db` from `scripts/build-db-rules.mjs` (the rules language has no functions, so the repeated checks live there). Anyone signed in with a room's code can see it, and anyone signed in can read the lobby of public rooms; only the host can change the settings or start and end races; each player writes only their own entry and their own run in the current round. `npm run test:rules` runs `tests-rules/database.rules.test.js` against the Realtime Database emulator alongside the Firestore tests (needs Java 11+).
- **Trying it without Firebase:** `npx vite build --mode uitest && npx vite preview`, then open `/?as=Ana` and `/?as=Ben` in two tabs of the same browser: each is its own player, and rooms are shared between the tabs through localStorage.

## Levels

Levels run from 0 with no cap; level n needs `100 + 20n` XP to clear. XP comes from typing (one point per five correct keys), accuracy, speed (capped at 200 wpm), perfect galleys, personal bests, rank-ups, the first galley of the day, the streak and the daily. Bonuses need at least 10 words. The XP for each galley is worked out once and stored on the result, so the account adds exactly what the browser showed. Rules live in `src/core/levels.js`.

## PP, ranks and grades

Performance points work like osu!'s. Each galley of 15+ words (plain, mixed, daily or challenge; not practice, code, flow or sudden death) earns `100 × (wpm/100)^1.5 × (acc/100)^12 × difficulty × length`. Difficulty comes from the words actually typed (their frequency rank, plus a little for capitals, punctuation and numbers): about 0.85 for the top 200, 1 for the top 1,000, 1.2 for the top 5,000, 1.28 for the top 10,000 (adding it changed no existing word's rank, so older galleys score exactly as before). Length runs from 0.8 to 1.2 at 100 words. Your total is your top 100 galleys, each weighted 0.95× the one above. Ranks (15 of them, Copy boy to Fourth estate, 0 to 11,000 PP, each step about 30% further than the last) come from the total, and each galley gets a letter grade from its accuracy (SS 100%, S 98%, A 95%, B 90%, C 85%). Rules live in `src/core/pp.js`; the top 100 is kept locally and in the account document (`top`).

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
