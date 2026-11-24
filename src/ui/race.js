// The friend-room page (#room), and the standings drawn on it, beside the galley while racing,
// and on the results. The race itself runs in the ordinary typing view; see app.js.
import { esc } from "./util.js";
import { ROOM, ROOM_PRESETS, settingsLabel, playerList, standings, ordinal } from "../core/room.js";

const LIST_LABELS = [["200", "Top 200"], ["1k", "Top 1,000"], ["5k", "Top 5,000"], ["10k", "Top 10,000"]];

/** The standings as a table: place, name, how far, speed, accuracy, score once finished. */
export function standingsTable(rows, settings, { live = false } = {}) {
  if (!rows.length) return `<div class="sub">Nobody raced.</div>`;
  const cell = (r) => {
    if (r.done) return `<td class="num">${(r.score ?? 0).toFixed(1)}</td>`;
    return `<td class="num muted">${!r.online ? "left" : live ? "typing" : settings.mode === "words" ? `${r.w}/${settings.length}` : "–"}</td>`;
  };
  return `<div class="tblwrap"><table class="tbl board race"><thead><tr><th class="num">#</th><th>Name</th><th class="num">WPM</th><th class="num">Accuracy</th><th class="num">Score</th></tr></thead><tbody>${rows.map((r) =>
    `<tr class="${r.me ? "me" : ""}${r.done ? "" : " out"}"><td class="num">${r.done || !live ? r.place : "·"}</td><td>${esc(r.name)}${r.me ? " <small>(you)</small>" : ""}${r.done && settings.mode === "words" ? ` <small>${r.secs?.toFixed(1)}s</small>` : ""}</td><td class="num">${Math.round(r.wpm)}</td><td class="num">${r.acc.toFixed(1)}%</td>${cell(r)}</tr>`).join("")}</tbody></table></div>`;
}

/** Lanes beside the galley while racing: everyone's progress as a bar, with speed. */
export function lanesHtml(rows, settings, total) {
  const most = Math.max(total || 0, ...rows.map((r) => r.c), 1);
  return rows.map((r) => {
    const frac = Math.min(1, r.c / most);
    const tail = r.done ? (settings.mode === "words" ? `${ordinal(r.place)} · ${r.secs.toFixed(1)}s` : "time") : !r.online ? "left" : `${Math.round(r.wpm)} wpm`;
    return `<div class="lane${r.me ? " me" : ""}${r.done ? " done" : ""}"><span class="lname">${esc(r.name)}</span><span class="lbar"><i style="transform:scaleX(${frac})"></i></span><span class="ltail">${tail}</span></div>`;
  }).join("");
}

/**
 * ctx: { enabled, signedIn, me, room: { code, data } | null, error, busy, link,
 *        onSignIn, onCreate, onJoin(code), onLeave, onStart, onEnd, onSettings(s), onBack, serverNow() }
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
    view.innerHTML = head("Race your friends", "Make a room, send the link, and race the same words at the same moment. Up to " + ROOM.maxPlayers + " players. Races earn XP and PP like any galley, but don't touch your personal bests.") + `
      <div class="qtwo">
        <div class="scard"><h2>Make a room</h2><div class="sub">You'll get a code and a link to send. You pick the galley; anyone in the room can race.</div>
          <div class="sactions"><button type="button" class="go primary" id="roomMake" ${ctx.busy ? "disabled" : ""}>Make a room</button></div></div>
        <div class="scard"><h2>Join a room</h2><div class="sub">Type the code a friend sent you, or paste their link.</div>
          <form class="sactions" id="roomJoinForm"><input id="roomCode" class="chin code" maxlength="80" placeholder="e.g. KXQ7P" autocomplete="off" spellcheck="false"><button type="submit" class="go" ${ctx.busy ? "disabled" : ""}>Join</button></form></div>
      </div>${err}`;
    view.querySelector("#roomMake").onclick = ctx.onCreate;
    view.querySelector("#roomJoinForm").onsubmit = (e) => { e.preventDefault(); ctx.onJoin(view.querySelector("#roomCode").value); };
  } else {
    const { code, data } = ctx.room, me = ctx.me;
    const isHost = data.host === me, s = data.settings;
    const players = playerList(data).filter((p) => p.online || data.entrants?.[p.uid]);
    const racing = data.state === "race";
    const inRace = racing && !!data.entrants?.[me];
    const last = data.round > 0 ? standings(data, data.round, me) : [];
    const seg = (key, opts, cur) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${String(cur) === String(v)}" ${isHost && !racing ? "" : "disabled"}>${l}</button>`).join("")}</div>`;
    const settingsBox = `
      <div class="roomset">
        ${seg("mode", [["words", "Words"], ["time", "Time"]], s.mode)}
        ${seg("length", ROOM_PRESETS[s.mode].map((n) => [n, s.mode === "time" ? n + "s" : n]), s.length)}
        ${seg("list", LIST_LABELS, s.list)}
        ${seg("punct", [[false, "No punctuation"], [true, "Punctuation"]], s.punct)}
        ${seg("nums", [[false, "No numbers"], [true, "Numbers"]], s.nums)}
      </div>`;
    const action = racing
      ? (inRace ? `<button type="button" class="go primary" id="roomRejoin">Back to the race</button>` : `<div class="sub">A race is on. You're in the next one.</div>`)
        + (isHost ? `<button type="button" class="go" id="roomEnd">End this race</button>` : "")
      : isHost ? `<button type="button" class="go primary" id="roomStart">${data.round ? "Start the next race" : "Start the race"} <kbd>enter</kbd></button>`
      : `<div class="sub">Waiting for ${esc(data.players?.[data.host]?.name || "the host")} to start the ${data.round ? "next " : ""}race.</div>`;
    view.innerHTML = head(`Room <span class="roomcode">${esc(code)}</span>`, `Send the link, or read out the code. ${racing ? "" : "The race starts with a " + ROOM.countdownMs / 1000 + "-second countdown for everyone at once."}`) + `
      <div class="qtwo">
        <div class="scard"><h2>Invite</h2>
          <div class="sactions"><input class="chin" id="roomLink" readonly value="${esc(ctx.link)}"><button type="button" class="go" id="roomCopy">Copy link</button></div>
          <h2>Players · ${players.filter((p) => p.online).length}/${ROOM.maxPlayers}</h2>
          <ul class="players">${players.map((p) => `<li class="${p.online ? "" : "gone"}"><i class="dot ${p.online ? "synced" : ""}"></i>${esc(p.name)}${p.uid === me ? " <small>(you)</small>" : ""}${p.uid === data.host ? ` <span class="hosttag">host</span>` : ""}${p.online ? "" : " <small>left</small>"}</li>`).join("")}</ul>
        </div>
        <div class="scard"><h2>The galley</h2>
          <div class="sub">${esc(settingsLabel(s))}${isHost ? "" : " · the host picks"}</div>
          ${isHost ? settingsBox : ""}
          <div class="sactions">${action}</div>${err}
        </div>
      </div>
      ${last.length ? `<div class="scard wide"><h2>${racing ? "This race" : "Last race"} · race ${data.round}</h2>${standingsTable(last, s, { live: racing })}
        <div class="sub">Placed by score (wpm × accuracy²), like every galley here; ties go to the quicker finish.</div></div>` : ""}
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
      const v = k === "mode" || k === "list" ? raw : k === "length" ? Number(raw) : raw === "true";
      const next = { ...s, [k]: v };
      if (k === "mode") next.length = v === "time" ? 30 : 25;
      ctx.onSettings(next);
    });
  }
  view.querySelector("#roomBack").onclick = ctx.onBack;
}
