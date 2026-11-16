// The decision behind postDaily, kept free of Firebase so it can be tested directly.
import { verifyDaily } from "./shared/core/verify.js";

export const DAY_MS = 86400000;
const round = (x, n) => Math.round(x * 10 ** n) / 10 ** n;

/** Whether a saved galley goes on the daily board, and the entry if so. */
export function boardEntry({ uid, rid, result, name, now }) {
  if (result.userId !== uid || result.id !== rid) return { ok: false, reason: "result filed under the wrong account" };
  // typed within the last two days (time zones and offline uploads), and not in the future
  if (!(result.at > now - 2 * DAY_MS && result.at < now + 60 * 60 * 1000)) return { ok: false, reason: "too old for the board" };
  const v = verifyDaily(result);
  if (!v.ok) return v;
  return {
    ok: true,
    entry: {
      uid, name: name || "Anonymous typist",
      wpm: round(v.wpm, 1), acc: round(v.acc, 2), score: round(v.score, 2),
      at: result.at, resultId: rid, clean: !!result.clean
    }
  };
}
