// Writes database.rules.json (the Realtime Database rules for friend rooms). The rules language
// has no functions, so the repeated checks are spelled out here once and pasted in.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const room = "data.parent()"; // from any direct child of rooms/$code
const isHost = `(${room}.child('host').val() === auth.uid || (!${room}.exists() && newData.parent().child('host').val() === auth.uid))`;
const hostOnly = { ".write": `auth != null && ${isHost}` };

const rules = {
  rules: {
    ".read": false,
    ".write": false,
    rooms: {
      ".indexOn": ["created"],
      $code: {
        ".read": "auth != null",
        // the host can take the whole room down; nothing else is written at this level
        ".write": "auth != null && data.child('host').val() === auth.uid && !newData.exists()",
        ".validate": "$code.matches(/^[A-HJKMNP-Z2-9]{5}$/) && newData.hasChildren(['host', 'created', 'settings', 'round', 'state'])",
        host: {
          ".write": "auth != null && (" + [
            // making the room
            `(!${room}.exists() && newData.val() === auth.uid)`,
            // the host handing it to another player
            `(data.val() === auth.uid && ${room}.child('players').child(newData.val()).exists())`,
            // a player taking over from a host who has gone
            `(newData.val() === auth.uid && ${room}.child('players').child(auth.uid).exists() && ${room}.child('players').child(data.val()).child('online').val() !== true)`
          ].join(" || ") + ")",
          ".validate": "newData.isString()"
        },
        created: { ".write": `auth != null && !data.exists() && ${isHost}`, ".validate": "newData.val() === now" },
        settings: {
          ...hostOnly,
          ".validate": "newData.hasChildren(['mode', 'length', 'list', 'punct', 'nums'])",
          mode: { ".validate": "newData.val() === 'words' || newData.val() === 'time'" },
          length: { ".validate": "newData.isNumber() && newData.val() >= 5 && newData.val() <= 1000" },
          list: { ".validate": "newData.val() === '200' || newData.val() === '1k' || newData.val() === '5k' || newData.val() === '10k'" },
          punct: { ".validate": "newData.isBoolean()" },
          nums: { ".validate": "newData.isBoolean()" },
          $other: { ".validate": false }
        },
        round: { ...hostOnly, ".validate": "newData.isNumber() && newData.val() >= 0 && (!data.exists() || newData.val() >= data.val())" },
        seed: { ...hostOnly, ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 4294967295" },
        startAt: { ...hostOnly, ".validate": "newData.isNumber() && newData.val() <= now + 60000" },
        state: { ...hostOnly, ".validate": "newData.val() === 'lobby' || newData.val() === 'race' || newData.val() === 'done'" },
        entrants: { ...hostOnly, $uid: { ".validate": "newData.val() === true" } },
        players: {
          $uid: {
            // you can only put yourself in a room that exists (or that you're making)
            ".write": `auth != null && auth.uid === $uid && (data.parent().parent().exists() || newData.parent().parent().child('host').val() === auth.uid)`,
            ".validate": "newData.hasChildren(['name', 'joined', 'online'])",
            name: { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 24" },
            joined: { ".validate": "newData.isNumber() && newData.val() <= now" },
            online: { ".validate": "newData.isBoolean()" },
            $other: { ".validate": false }
          }
        },
        runs: {
          $round: {
            $uid: {
              // your own run, in the current round, once you're in the room
              ".write": "auth != null && auth.uid === $uid && root.child('rooms').child($code).child('players').child($uid).exists() && root.child('rooms').child($code).child('round').val() + '' === $round",
              ".validate": "newData.hasChildren(['c', 'w', 'wpm', 'acc', 'done', 'at'])",
              c: { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() < 100000" },
              w: { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 5000" },
              wpm: { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() < 1000" },
              acc: { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100" },
              done: { ".validate": "newData.isBoolean()" },
              secs: { ".validate": "newData.isNumber() && newData.val() >= 0" },
              score: { ".validate": "newData.isNumber() && newData.val() >= 0" },
              at: { ".validate": "newData.isNumber()" },
              $other: { ".validate": false }
            }
          }
        },
        $other: { ".validate": false }
      }
    }
  }
};

const out = fileURLToPath(new URL("../database.rules.json", import.meta.url));
writeFileSync(out, JSON.stringify(rules, null, 2) + "\n");
console.log("Wrote database.rules.json");
