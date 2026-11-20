// Settings: defaults, the drawer's options, and saving to this browser.
export const DEFAULTS = {
  mode: "words", words: 25, time: 30,
  layout: "galley", lines: 3, size: "m", font: "courier", slide: "smooth", theme: "system",
  stop: "off", backspace: "on", sudden: false, ratio: 0.4,
  list: "200", punct: false, nums: false,
  focus: false, live: true, margin: true, roll: true, sound: "off", errSound: false,
  indent: "auto",
  quoteFrom: "all", quoteLen: "any", quoteSource: null, quoteClean: false
};

export const PRESETS = { words: [25, 50, 100], time: [15, 30, 60, 120] };
export const LIMITS = { words: [1, 1000], time: [5, 600] };
export const SLIDE = { off: 0, fast: 70, smooth: 110, slow: 160 };
export const FS = { galley: { s: 34, m: 42, l: 50 }, page: { s: 24, m: 30, l: 36 } };
export const FONTS = {
  courier: '"Courier Prime","Courier New",ui-monospace,monospace',
  plex: '"IBM Plex Mono",ui-monospace,monospace',
  atkinson: '"Atkinson Hyperlegible Mono",ui-monospace,monospace'
};

export const SETTINGS = [
  { section: "Layout" },
  { key: "layout", label: "Text layout", help: "A single line that slides past a fixed pencil, or a page of several lines where the pencil moves.", options: [["galley", "Galley strip"], ["page", "Page"]], restart: true },
  { key: "lines", label: "Lines on the page", options: [[2, "2"], [3, "3"], [4, "4"], [5, "5"]], when: (c) => c.layout === "page", restart: true },
  { key: "size", label: "Text size", options: [["s", "Small"], ["m", "Medium"], ["l", "Large"]], restart: true },
  { key: "font", label: "Typeface", options: [["courier", "Courier Prime"], ["plex", "IBM Plex Mono"], ["atkinson", "Atkinson Mono"]], restart: true },
  { key: "slide", label: "Slide speed", help: "How quickly the text (or the pencil, on a page) moves to the next letter.", options: [["off", "Off"], ["fast", "Fast"], ["smooth", "Smooth"], ["slow", "Slow"]] },
  { key: "theme", label: "Theme", options: [["system", "System"], ["light", "Light"], ["dark", "Dark"]] },
  { section: "Accuracy" },
  { key: "stop", label: "Stop on error", help: "Letter: you can't move on until you press the right key. Word: space won't work until the word is right.", options: [["off", "Off"], ["letter", "Letter"], ["word", "Word"]] },
  { key: "sudden", label: "Sudden death", help: "One mistake ends the galley. Sudden-death galleys keep their own bests and don't count towards rank.", options: [[false, "Off"], [true, "On"]], restart: true },
  { key: "backspace", label: "Backspace", help: "Limit corrections to train getting it right first time.", options: [["on", "Anywhere"], ["word", "This word only"], ["off", "Off"]] },
  { key: "ratio", label: "Weak word share", help: "How often flagged words appear in a mixed galley.", options: [[0.25, "25%"], [0.4, "40%"], [0.6, "60%"]] },
  { section: "Words" },
  { key: "list", label: "Word list", help: "The most common English words, from the top 200 up to the top 5,000.", options: [["200", "Top 200"], ["1k", "Top 1,000"], ["5k", "Top 5,000"]], restart: true },
  { key: "punct", label: "Punctuation", help: "Capitals, commas, full stops and question marks.", options: [[false, "Off"], [true, "On"]], restart: true },
  { key: "nums", label: "Numbers", options: [[false, "Off"], [true, "On"]], restart: true },
  { section: "While typing" },
  { key: "focus", label: "Focus mode", help: "Fade everything except the text while you type.", options: [[false, "Off"], [true, "On"]] },
  { key: "live", label: "Live stats", options: [[true, "Show"], [false, "Hide"]] },
  { key: "margin", label: "Corrections margin", options: [[true, "Show"], [false, "Hide"]] },
  { key: "roll", label: "Till roll while typing", help: "The receipt still prints at the end.", options: [[true, "Show"], [false, "Hide"]] },
  { key: "sound", label: "Key sound", options: [["off", "Off"], ["click", "Click"], ["type", "Typewriter"]] },
  { key: "errSound", label: "Error sound", options: [[false, "Off"], [true, "On"]] },
  { section: "Quotes" },
  { key: "quoteLen", label: "Quote length", help: "Short is up to 20 words, medium 21 to 45, long anything over.", options: [["any", "Any"], ["short", "Short"], ["medium", "Medium"], ["long", "Long"]], quote: true },
  { key: "quoteFrom", label: "Quotes from", help: "The built-in library, quotes other players shared, the ones you've added, or all of them. Add and share your own on the Quotes page.", options: [["all", "Everything"], ["library", "Library"], ["community", "Everyone's"], ["mine", "Yours"]], quote: true },
  { key: "quoteClean", label: "Strong language in quotes", help: "Shared quotes with swearing are marked when they're reviewed. Hide them if you'd rather not type them.", options: [[false, "Allow"], [true, "Hide"]], quote: true },
  { section: "Code" },
  { key: "indent", label: "Indentation", help: "Auto: indentation fills in, and space or Enter at the end of a line moves you to the next one. Manual: type the indentation yourself and press Enter to end each line.", options: [["auto", "Auto"], ["manual", "Manual"]], restart: true }
];

const KEY = "retype-settings-v1";
export function loadSettings() {
  const cfg = { ...DEFAULTS };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* private window: defaults */ }
  return cfg;
}
export function saveSettings(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* nothing to do */ }
}
