// The friend-room page (#room), and the standings drawn on it, beside the galley while racing,
// and on the results. The race itself runs in the ordinary typing view; see app.js.
import { esc } from "./util.js";
import { ROOM, ROOM_PRESETS, settingsLabel, playerList, standings, ordinal } from "../core/room.js";

const QUICK_MODES = [["words", "25 words"], ["time", "30 seconds"], ["quote", "A short quote"], ["survival", "Survival"]];
const hearts = (n, max) => (max > 5 ? `${n}/${max}` : "●".repeat(n) + "○".repeat(Math.max(0, max - n)));

const LIST_LABELS = [["200", "Top 200"], ["1k", "Top 1,000"], ["5k", "Top 5,000"], ["10k", "Top 10,000"]];

/** The standings as a table: place, name, how far, speed, accuracy, score once finished. */
export function standingsTable(rows, settings, { live = false } = {}) {
  if (!rows.length) return `<div class="sub">Nobody raced.</div>`;
  const surv = settings.mode === "survival", timed = settings.mode === "time";
  const cell = (r) => {
    if (surv) return `<td class="num">${r.w}${r.done ? "" : r.online ? ` <small>${live ? "alive" : ""}</small>` : " <small>left</small>"}</td>`;
    if (r.done) return `<td class="num">${(r.score ?? 0).toFixed(1)}</td>`;
    return `<td class="num muted">${!r.online ? "left" : live ? "typing" : "didn't finish"}</td>`;
  };
  const placed = (r) => (surv ? !live || r.done : r.done || !live);
  return `<div class="tblwrap"><table class="tbl board race"><thead><tr><th class="num">#</th><th>Name</th><th class="num">WPM</th><th class="num">Accuracy</th><th class="num">${surv ? "Words" : "Score"}</th></tr></thead><tbody>${rows.map((r) =>
    `<tr class="${r.me ? "me" : ""}${r.done || surv ? "" : " out"}"><td class="num">${placed(r) ? r.place : "·"}</td><td>${esc(r.name)}${r.me ? " <small>(you)</small>" : ""}${r.done && !surv && !timed && r.secs != null ? ` <small>${r.secs.toFixed(1)}s</small>` : ""}</td><td class="num">${Math.round(r.wpm)}</td><td class="num">${r.acc.toFixed(1)}%</td>${cell(r)}</tr>`).join("")}</tbody></table></div>`;
}

/** Lanes beside the galley while racing: everyone's progress as a bar, with speed. */
export function lanesHtml(rows, settings, total) {
  const most = Math.max(total || 0, ...rows.map((r) => r.c), 1);
  return rows.map((r) => {
    const frac = Math.min(1, r.c / most);
    const tail = settings.mode === "survival"
      ? (r.done ? `out · ${r.w}` : !r.online ? "left" : `${hearts(r.l ?? settings.lives, settings.lives)} · ${r.w}`)
      : r.done ? (settings.mode === "time" ? "time" : `${ordinal(r.place)} · ${r.secs.toFixed(1)}s`) : !r.online ? "left" : `${Math.round(r.wpm)} wpm`;
    return `<div class="lane${r.me ? " me" : ""}${r.done ? " done" : ""}"><span class="lname">${esc(r.name)}</span><span class="lbar"><i style="transform:scaleX(${frac})"></i></span><span class="ltail">${tail}</span></div>`;
  }).join("");
}

/**
 * ctx: { enabled, signedIn, me, room: { code, data } | null, error, busy, link, lobby: { mode: players } | null,
 *        onSignIn, onCreate, onJoin(code), onQuick(mode), onLeave, onStart, onEnd, onSettings(s), onBack, serverNow() }
 */
export function renderRoom(view, ctx) {
  const head = (title, lede) => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h1>${title}</h1>
      <button type="button" class="go" id="roomBack">Back to typing <kbd>esc</kbd></button>
    </div>
    <p class="lede">${lede}</p>`;
  const err = ctx.error ? `<div class="sub bad">${esc(ctx.error)}</div>` : "";

  if (!ctx.enabled || !ctx.signedIn) {
    view.innerHTML = head("Race your friends", "Make a room, send the link, and race the same words at the same moment. Up to " + ROOM.maxPlayers + " players.") + `
      <div class="scard wide"><div class="sub">${ctx.enabled ? "Rooms need you signed in, so the others see your name." : "Rooms need accounts, and this copy of Retype isn't connected to one."}</div>
      ${ctx.enabled ? `<div class="sactions"><button type="button" class="go primary" id="roomIn">Sign in with Google</button></div>` : ""}</div>`;
    view.querySelector("#roomIn")?.addEventListener("click", ctx.onSignIn);
  } else if (!ctx.room) {
    const waiting = (m) => { const n = ctx.lobby?.[m] || 0; return n ? ` <small>${n} waiting</small>` : ""; };
    view.innerHTML = head("Race", "Race strangers in a quick race, or make a room and send the link to friends: everyone types the same words from the same moment. Up to " + ROOM.maxPlayers + " players. Word and time races earn XP and PP like any galley, but never touch your personal bests.") + `
      <div class="scard wide"><h2>Quick race</h2><div class="sub">Join a public room with whoever's around, or open one and wait for someone. The next race starts on its own ${ROOM.autoStartMs / 1000} seconds after there are two of you.</div>
        <div class="sactions quick">${QUICK_MODES.map(([m, l]) => `<button type="button" class="go${m === "words" ? " primary" : ""}" data-quick="${m}" ${ctx.busy ? "disabled" : ""}>${l}${waiting(m)}</button>`).join("")}</div></div>
      <div class="qtwo" style="margin-top:16px">
        <div class="scard"><h2>Make a room</h2><div class="sub">You'll get a code and a link to send. You pick the galley; anyone in the room can race.</div>
          <div class="sactions"><button type="button" class="go primary" id="roomMake" ${ctx.busy ? "disabled" : ""}>Make a room</button></div></div>
        <div class="scard"><h2>Join a room</h2><div class="sub">Type the code a friend sent you, or paste their link.</div>
          <form class="sactions" id="roomJoinForm"><input id="roomCode" class="chin code" maxlength="80" placeholder="e.g. KXQ7P" autocomplete="off" spellcheck="false"><button type="submit" class="go" ${ctx.busy ? "disabled" : ""}>Join</button></form></div>
      </div>${err}`;
    view.querySelector("#roomMake").onclick = ctx.onCreate;
    view.querySelectorAll("[data-quick]").forEach((b) => b.onclick = () => ctx.onQuick(b.dataset.quick));
    view.querySelector("#roomJoinForm").onsubmit = (e) => { e.preventDefault(); ctx.onJoin(view.querySelector("#roomCode").value); };
  } else {
    const { code, data } = ctx.room, me = ctx.me;
    const isHost = data.host === me, s = data.settings, open = !!data.public;
    const canSet = isHost && !open;
    const players = playerList(data).filter((p) => p.online || data.entrants?.[p.uid]);
    const racing = data.state === "race";
    const inRace = racing && !!data.entrants?.[me] && !data.runs?.[data.round]?.[me]?.done;
    const last = data.round > 0 ? standings(data, data.round, me) : [];
    const seg = (key, opts, cur) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${String(cur) === String(v)}" ${canSet && !racing ? "" : "disabled"}>${l}</button>`).join("")}</div>`;
    const words = s.mode === "words" || s.mode === "time", surv = s.mode === "survival";
    const settingsBox = `
      <div class="roomset">
        ${seg("mode", [["words", "Words"], ["time", "Time"], ["quote", "Quote"], ["survival", "Survival"]], s.mode)}
        ${words ? seg("length", (s.mode === "time" ? ROOM_PRESETS.time : ROOM_PRESETS.words).map((n) => [n, s.mode === "time" ? n + "s" : n]), s.length) : ""}
        ${s.mode === "quote" ? seg("quoteLen", [["any", "Any length"], ["short", "Short"], ["medium", "Medium"], ["long", "Long"]], s.quoteLen) : ""}
        ${surv ? seg("lives", ROOM_PRESETS.lives.map((n) => [n, n === 1 ? "1 life" : `${n} lives`]), s.lives) : ""}
        ${surv ? seg("floor", ROOM_PRESETS.floor.map((n) => [n, n ? `${n} wpm floor` : "No floor"]), s.floor) : ""}
        ${words ? seg("list", LIST_LABELS, s.list) : ""}
        ${s.mode !== "quote" ? seg("punct", [[false, "No punctuation"], [true, "Punctuation"]], s.punct) : ""}
        ${s.mode !== "quote" ? seg("nums", [[false, "No numbers"], [true, "Numbers"]], s.nums) : ""}
      </div>`;
    const autoIn = !racing && data.autoAt ? `<div class="sub">Next race in <b id="autoIn">${Math.max(0, Math.ceil((data.autoAt - ctx.serverNow()) / 1000))}</b>s.</div>` : "";
    const action = racing
      ? (inRace ? `<button type="button" class="go primary" id="roomRejoin">Back to the race</button>` : data.entrants?.[me] ? `<div class="sub">You've finished. Waiting for the others.</div>` : `<div class="sub">A race is on. You're in the next one.</div>`)
        + (isHost ? `<button type="button" class="go" id="roomEnd">End this race</button>` : "")
      : open ? autoIn + (autoIn ? "" : `<div class="sub">Waiting for someone to join. The race starts on its own once there are two of you.</div>`) + (isHost && !autoIn ? `<button type="button" class="go" id="roomStart">Race on your own now</button>` : "")
      : isHost ? `<button type="button" class="go primary" id="roomStart">${data.round ? "Start the next race" : "Start the race"} <kbd>enter</kbd></button>`
      : `<div class="sub">Waiting for ${esc(data.players?.[data.host]?.name || "the host")} to start the ${data.round ? "next " : ""}race.</div>`;
    view.innerHTML = head(`${open ? "Quick race · " : ""}Room <span class="roomcode">${esc(code)}</span>`, open ? `A public room: anyone doing a quick race of this kind can land here. ${racing ? "" : "Each race starts with a " + ROOM.countdownMs / 1000 + "-second countdown for everyone at once."}` : `Send the link, or read out the code. ${racing ? "" : "The race starts with a " + ROOM.countdownMs / 1000 + "-second countdown for everyone at once."}`) + `
      <div class="qtwo">
        <div class="scard"><h2>Invite</h2>
          <div class="sactions"><input class="chin" id="roomLink" readonly value="${esc(ctx.link)}"><button type="button" class="go" id="roomCopy">Copy link</button></div>
          <h2>Players · ${players.filter((p) => p.online).length}/${ROOM.maxPlayers}</h2>
          <ul class="players">${players.map((p) => `<li class="${p.online ? "" : "gone"}"><i class="dot ${p.online ? "synced" : ""}"></i>${esc(p.name)}${p.uid === me ? " <small>(you)</small>" : ""}${p.uid === data.host ? ` <span class="hosttag">host</span>` : ""}${p.online ? "" : " <small>left</small>"}</li>`).join("")}</ul>
        </div>
        <div class="scard"><h2>The galley</h2>
          <div class="sub">${esc(settingsLabel(s))}${open ? " · the same for every quick race of this kind" : isHost ? "" : " · the host picks"}</div>
          ${canSet ? settingsBox : ""}
          <div class="sactions">${action}</div>${err}
        </div>
      </div>
      ${last.length ? `<div class="scard wide"><h2>${racing ? "This race" : "Last race"} · race ${data.round}</h2>${standingsTable(last, s, { live: racing })}
        <div class="sub">${s.mode === "survival" ? "Last one standing wins; the rest go by words survived." : "Placed by score (wpm × accuracy²), like every galley here; ties go to the quicker finish."}</div></div>` : ""}
      <div class="sactions" style="margin-top:16px"><button type="button" class="go" id="roomLeave">Leave the room</button></div>`;
    view.querySelector("#roomCopy").onclick = async (e) => {
      try { await navigator.clipboard.writeText(ctx.link); e.currentTarget.textContent = "Copied"; }
      catch { view.querySelector("#roomLink").select(); }
    };
    view.querySelector("#roomStart")?.addEventListener("click", ctx.onStart);
    view.querySelector("#roomEnd")?.addEventListener("click", ctx.onEnd);
    view.querySelector("#roomRejoin")?.addEventListener("click", ctx.onBack);
    view.querySelector("#roomLeave").onclick = ctx.onLeave;
    view.querySelectorAll(".roomset [data-k]").forEach((b) => b.onclick = () => {
      const k = b.dataset.k, raw = b.dataset.v;
      const v = k === "mode" || k === "list" || k === "quoteLen" ? raw : k === "length" || k === "lives" || k === "floor" ? Number(raw) : raw === "true";
      const next = { ...s, [k]: v };
      if (k === "mode") next.length = v === "time" ? 30 : 25;
      ctx.onSettings(next);
    });
  }
  view.querySelector("#roomBack").onclick = ctx.onBack;
}
