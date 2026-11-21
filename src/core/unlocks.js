// Things for the desk, earned by levelling up and by headlines: pencil colours (the caret and
// the proof marks), till-roll paper and stamp inks. Purely cosmetic. Pure functions only.

export const UNLOCKS = {
  pencil: [
    { id: "red", label: "Red pencil", color: "#c8322b", dark: "#ff7d6e" },
    { id: "blue", label: "Blue pencil", color: "#2457c5", dark: "#7ea6ff", level: 3 },
    { id: "green", label: "Green pencil", color: "#1f7a4a", dark: "#5fd39a", level: 6 },
    { id: "violet", label: "Violet pencil", color: "#7a3cc2", dark: "#c29bff", level: 10 },
    { id: "graphite", label: "Graphite", color: "#3b3f46", dark: "#c3c8d0", feat: "perfect100" },
    { id: "gold", label: "Gold leaf", color: "#a87a12", dark: "#f0c24a", feat: "streak100" }
  ],
  paper: [
    { id: "thermal", label: "Thermal roll" },
    { id: "carbon", label: "Carbon copy", level: 5 },
    { id: "ticker", label: "Ticker tape", level: 8 },
    { id: "newsprint", label: "Newsprint", feat: "surv5k" }
  ],
  ink: [
    { id: "pencil", label: "Same as pencil" },
    { id: "blue", label: "Blue ink", color: "#2457c5", dark: "#7ea6ff", level: 4 },
    { id: "green", label: "Green ink", color: "#1f7a4a", dark: "#5fd39a", level: 7 },
    { id: "black", label: "Black ink", color: "#1b2230", dark: "#e3e6eb", level: 12 },
    { id: "gold", label: "Gold ink", color: "#a87a12", dark: "#f0c24a", feat: "days30" }
  ]
};

/** Is an item yours? Defaults (no level, no feat) always are. */
export const isUnlocked = (item, { level = 0, feats = {} }) =>
  (item.level == null || level >= item.level) && (item.feat == null || !!feats[item.feat]);

/** What it takes, for a locked item: "Level 6", or the feat's hint. */
export const needs = (item, featHint = (id) => id) => (item.level != null ? `Level ${item.level}` : `Headline: ${featHint(item.feat)}`);

/** The chosen item if it's unlocked, otherwise the default. */
export function chosen(kind, id, have) {
  const list = UNLOCKS[kind], item = list.find((x) => x.id === id);
  return item && isUnlocked(item, have) ? item : list[0];
}

/** Items newly unlocked between two states, for the "Unlocked: …" toast. */
export function newlyUnlocked(before, after) {
  const out = [];
  for (const list of Object.values(UNLOCKS)) for (const it of list) if (!isUnlocked(it, before) && isUnlocked(it, after)) out.push(it);
  return out;
}
