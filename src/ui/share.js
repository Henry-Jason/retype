// A shareable result card: the receipt, drawn to a PNG. Always drawn in the light paper colours
// so it reads the same wherever it's posted.
const C = { paper: "#fbfbf8", ink: "#2a2d33", muted: "#6a707a", pencil: "#c8322b", line: "#9aa1ab", fill: "rgba(42,45,51,.07)" };

export function drawCard({ galley, what, date, acc, wpm, raw, errors, best, secs, clean, rank, grade, pts, T }) {
  const W = 640, H = 790, s = 2;
  const cv = document.createElement("canvas");
  cv.width = W * s; cv.height = H * s;
  const g = cv.getContext("2d");
  g.scale(s, s);
  g.fillStyle = "#dfe3e8"; g.fillRect(0, 0, W, H);
  // the receipt, with a torn bottom edge
  const x0 = 70, x1 = W - 70, y0 = 40, y1 = H - 60;
  g.fillStyle = C.paper; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x1, y1);
  for (let x = x1; x > x0; x -= 14) { g.lineTo(x - 7, y1 + 8); g.lineTo(x - 14, y1); }
  g.closePath(); g.shadowColor = "rgba(0,0,0,.18)"; g.shadowBlur = 24; g.shadowOffsetY = 10; g.fill(); g.shadowColor = "transparent";

  const mono = (size, weight = 400) => `${weight} ${size}px "Overpass Mono", "Courier Prime", monospace`;
  const center = W / 2;
  let y = y0 + 58;
  g.textAlign = "center"; g.fillStyle = C.ink; g.font = mono(30, 700);
  g.letterSpacing = "8px"; g.fillText("CORRATYPE", center + 4, y); g.letterSpacing = "0px";
  y += 30; g.font = mono(15); g.fillStyle = C.muted;
  g.fillText(`GALLEY ${galley} · ${what}`, center, y); y += 22; g.fillText(date, center, y);
  const dash = (yy) => { g.save(); g.strokeStyle = C.line; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x0 + 28, yy); g.lineTo(x1 - 28, yy); g.stroke(); g.restore(); };
  y += 24; dash(y);

  y += 70; g.textAlign = "left"; g.fillStyle = C.muted; g.font = mono(14);
  g.fillText("ACCURACY", x0 + 34, y - 52); g.fillText("WPM", x0 + 300, y - 52);
  g.fillStyle = C.ink; g.font = `700 54px "Courier Prime", monospace`;
  g.fillText(`${acc.toFixed(1)}%`, x0 + 30, y); g.fillText(String(Math.round(wpm)), x0 + 296, y);

  y += 40;
  const row = (a, b, bold) => { g.font = mono(17, bold ? 700 : 400); g.fillStyle = C.ink; g.textAlign = "left"; g.fillText(a, x0 + 34, y); g.textAlign = "right"; g.fillText(b, x1 - 34, y); y += 30; };
  row("RAW", String(Math.round(raw)));
  row("MISSES", String(errors));
  row("BEST STREAK", `${best} words`);
  row("TIME", `${secs.toFixed(1)}s`);
  if (rank) row("RANK", rank.toUpperCase(), true);
  dash(y - 8); y += 14;

  // the actual-speed line
  const cx0 = x0 + 34, cx1 = x1 - 34, cy0 = y, cy1 = y + 120;
  const act = pts.filter((p) => p.act != null);
  if (act.length > 1) {
    const max = Math.max(...act.map((p) => p.act)) * 1.1;
    const X = (t) => cx0 + (t / T) * (cx1 - cx0), Y = (v) => cy1 - (v / max) * (cy1 - cy0);
    g.beginPath(); g.moveTo(X(act[0].s), cy1);
    for (const p of act) g.lineTo(X(p.s), Y(p.act));
    g.lineTo(X(act[act.length - 1].s), cy1); g.closePath(); g.fillStyle = C.fill; g.fill();
    g.beginPath(); act.forEach((p, i) => (i ? g.lineTo(X(p.s), Y(p.act)) : g.moveTo(X(p.s), Y(p.act))));
    g.strokeStyle = C.ink; g.lineWidth = 2.5; g.lineJoin = "round"; g.stroke();
    g.strokeStyle = C.pencil; g.lineWidth = 2;
    for (const p of pts) if (!p.k.ok) { const x = X(p.s), yy = cy1 + 10; g.beginPath(); g.moveTo(x - 4, yy - 4); g.lineTo(x + 4, yy + 4); g.moveTo(x + 4, yy - 4); g.lineTo(x - 4, yy + 4); g.stroke(); }
  }
  y = cy1 + 46;
  // barcode
  g.fillStyle = C.ink;
  let bx = x0 + 34;
  for (let i = 0; bx < x0 + 250; i++) { const w = [2, 1, 3, 1, 2, 2, 1][i % 7]; g.fillRect(bx, y, w, 50); bx += w + [3, 2, 3, 4, 2][i % 5]; }

  // the stamp
  g.save();
  g.translate(x1 - 140, y + 25); g.rotate(-0.13);
  g.strokeStyle = C.pencil; g.fillStyle = C.pencil; g.globalAlpha = 0.9;
  g.lineWidth = clean ? 7 : 4; g.strokeRect(-95, -40, 190, 80);
  if (clean) { g.lineWidth = 2; g.fillStyle = C.paper; g.strokeStyle = C.paper; g.strokeRect(-89, -34, 178, 68); g.strokeStyle = C.pencil; g.fillStyle = C.pencil; }
  g.textAlign = "center";
  if (grade) { g.font = `800 40px Archivo, sans-serif`; g.letterSpacing = "6px"; g.fillText(grade, 3, 10); }
  else { g.font = `800 30px Archivo, sans-serif`; g.letterSpacing = "5px"; g.fillText(clean ? "PERFECT" : "PROOFED", 3, 8); }
  g.letterSpacing = "2px";
  g.font = `700 11px Archivo, sans-serif`; g.fillText(clean ? "NO CORRECTIONS" : `${acc.toFixed(1)}% ACCURATE`, 2, 28);
  g.restore();
  return cv;
}

export function downloadCard(canvas, name) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
}

/** A promotion, as a front page: name, new rank, PP and what's next. Light paper, like the result card. */
export function drawRankCard({ name, rank, pp, next, date }) {
  const W = 640, H = 640, s = 2;
  const cv = document.createElement("canvas"); cv.width = W * s; cv.height = H * s;
  const g = cv.getContext("2d"); g.scale(s, s);
  g.fillStyle = "#dfe3e8"; g.fillRect(0, 0, W, H);
  g.fillStyle = C.paper; g.shadowColor = "rgba(0,0,0,.18)"; g.shadowBlur = 24; g.shadowOffsetY = 10; g.fillRect(50, 40, W - 100, H - 90); g.shadowColor = "transparent";
  const serif = (size, w = 700) => `${w} ${size}px Georgia, "Times New Roman", serif`;
  g.textAlign = "center"; g.fillStyle = C.ink;
  g.font = serif(44); g.fillText("The Corratype", W / 2, 110);
  g.fillRect(80, 128, W - 160, 2); g.fillRect(80, 134, W - 160, 1);
  g.font = `400 13px "Overpass Mono", "Courier Prime", monospace`; g.fillStyle = C.muted; g.fillText(`EXTRA · ${date}`, W / 2, 156);
  g.fillStyle = C.pencil; g.font = `700 14px "Overpass Mono", monospace`; g.fillText("PROMOTION", W / 2, 214);
  g.fillStyle = C.ink; g.font = serif(40);
  const words = `${name} named ${rank}`.split(" "); let line = "", y = 266;
  for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > W - 180 && line) { g.fillText(line, W / 2, y); y += 48; line = w; } else line = t; }
  g.fillText(line, W / 2, y);
  y += 70; g.font = `700 54px "Courier Prime", monospace`; g.fillText(`${Math.round(pp).toLocaleString("en-IE")} PP`, W / 2, y);
  y += 44; g.font = serif(18, 400); g.fillStyle = C.muted;
  g.fillText(next ? `Next: ${next.name}, at ${next.min.toLocaleString("en-IE")} PP` : "The top of the masthead.", W / 2, y);
  g.font = `400 13px "Overpass Mono", monospace`; g.fillText("corratype.com", W / 2, H - 76);
  return cv;
}
