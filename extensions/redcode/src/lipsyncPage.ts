// The Lip Sync tab's page: one HTML file with its style and script inline, so the extension ships no extra files.
// It only draws what the extension sends (src/lipsyncTab.ts) and asks for more; it reads nothing itself.
// The script uses no template literals, so it can sit in one here.

/** `headScript` is the head viewer's script (media/lipsync/head.js) as a webview address; without it the
 *  tab shows the mouth sketch only. */
export function lipsyncHtml(cspSource: string, headScript?: string): string {
  const nonce = Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; media-src blob: data:; img-src ${cspSource} data: blob:; connect-src ${cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lip Sync</title>
<style>
  :root { --accent: #5ef6ff; --warm: #fcee0a; --line: var(--vscode-panel-border, #2a2d3a); --dim: var(--vscode-descriptionForeground, #8a8fa3); }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; padding: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.45 var(--vscode-font-family, sans-serif); display: flex; flex-direction: column; }
  header { display: flex; align-items: baseline; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  h1 { font-size: 16px; margin: 0; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--accent); }
  .dim { color: var(--dim); }
  .grow { flex: 1; }
  button { font: inherit; color: var(--vscode-button-foreground, #fff); background: var(--vscode-button-background, #0e639c); border: 0; padding: 4px 12px; cursor: pointer; border-radius: 2px; }
  button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  button.quiet { color: var(--vscode-foreground); background: transparent; border: 1px solid var(--line); }
  button:disabled { opacity: .5; cursor: default; }
  main { flex: 1; display: flex; min-height: 0; }
  aside { width: 38%; max-width: 460px; min-width: 240px; border-right: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; }
  aside .top { padding: 8px 10px; border-bottom: 1px solid var(--line); }
  input[type=text] { width: 100%; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--line)); padding: 4px 6px; }
  #scenes { flex: 1; overflow: auto; }
  .scene { border-bottom: 1px solid var(--line); }
  .scene h2 { font-size: 11px; font-weight: 600; margin: 0; padding: 6px 10px 2px; color: var(--dim); letter-spacing: .05em; text-transform: uppercase; word-break: break-all; }
  .scene .path { font-size: 11px; padding: 0 10px 4px; color: var(--dim); word-break: break-all; opacity: .7; }
  .row { display: flex; gap: 8px; padding: 4px 10px; cursor: pointer; align-items: baseline; }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.on { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .row .t { flex: 1; }
  .row .s { color: var(--dim); font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 11px; }
  .row.on .s { color: inherit; }
  .row .g { font-size: 10px; border: 1px solid var(--line); padding: 0 4px; border-radius: 2px; color: var(--dim); }
  .foot { padding: 8px 10px; border-top: 1px solid var(--line); display: flex; gap: 8px; align-items: center; }
  #status { color: var(--dim); font-size: 12px; }
  #status.bad { color: var(--vscode-errorForeground, #f48771); }
  section { flex: 1; min-width: 0; min-height: 0; overflow: hidden; padding: 14px 18px; display: flex; flex-direction: column; }
  #detail { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  #newLine { flex: none; display: flex; gap: 8px; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  #newLine input { flex: 1; min-width: 14em; }
  #sayNote { flex-basis: 100%; font-size: 12px; min-height: 0; }
  #sayNote:empty { display: none; }
  #sayNote.bad { color: var(--vscode-errorForeground, #f48771); }
  #versions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 0 0 10px; color: var(--dim); font-size: 12px; }
  #versions button { padding: 2px 10px; }
  #versions button.on { color: var(--vscode-button-foreground, #fff); background: var(--vscode-button-background, #0e639c); border-color: transparent; }
  #words { font-size: 18px; line-height: 1.35; }
  #meta { color: var(--dim); font-size: 12px; margin: 4px 0 10px; word-break: break-all; }
  .bar { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .bar label { display: inline-flex; gap: 5px; align-items: center; color: var(--dim); cursor: pointer; }
  .bar label.vol { gap: 6px; cursor: default; }
  #volume { width: 90px; accent-color: var(--accent); cursor: pointer; }
  .transport { display: inline-flex; gap: 2px; }
  button.icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 26px; padding: 0; color: var(--vscode-foreground); background: transparent; border: 1px solid var(--line); }
  button.icon:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.2)); }
  button.icon.main { width: 38px; color: var(--vscode-button-foreground, #fff); background: var(--vscode-button-background, #0e639c); border-color: transparent; }
  button.icon.main:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  button.icon svg { display: block; }
  button.icon span { display: inline-flex; }
  #time { font-variant-numeric: tabular-nums; min-width: 12em; color: var(--dim); }
  #curves.drag { cursor: ew-resize; }
  /* The head stays put; only the curves scroll, in their own box. */
  #stage { flex: 1; min-height: 0; display: flex; gap: 12px; align-items: stretch; }
  #mouthBox { width: 132px; flex: none; text-align: center; color: var(--dim); font-size: 11px; }
  #mouthBox.head { width: 300px; }
  #mouth { width: 132px; height: 100px; border: 1px solid var(--line); display: block; margin-bottom: 4px; }
  #head { width: 300px; height: 340px; border: 1px solid var(--line); display: block; margin-bottom: 4px; cursor: grab; }
  #curvesBox { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  #curvesScroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
  #curves { width: 100%; display: block; cursor: crosshair; }
  /* Two fixed lines, so the curves never move under the mouse as the text changes. */
  #readout { height: 2.9em; flex: none; overflow: hidden; color: var(--dim); font-size: 12px; line-height: 1.45; margin-bottom: 6px; font-variant-numeric: tabular-nums; }
  #readout > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #readout b { color: var(--vscode-foreground); font-weight: 600; }
  table { border-collapse: collapse; margin-top: 12px; font-size: 12px; width: 100%; }
  th, td { text-align: left; padding: 2px 10px 2px 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
  th { color: var(--dim); font-weight: 600; }
  td.sw span { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
  #empty { color: var(--dim); padding: 30px 0; max-width: 46em; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<header>
  <h1 id="name">Lip Sync</h1>
  <span class="dim" id="tag"></span>
  <span class="grow"></span>
  <button class="quiet" id="change" title="Pick another character by voice tag">Change Character</button>
</header>
<main>
  <aside>
    <div class="top"><input type="text" id="filter" placeholder="Find a scene: a quest (mq306), voice sets (vset_) ..." spellcheck="false"></div>
    <div id="scenes"></div>
    <div class="foot"><button class="quiet" id="more" hidden>Show More Scenes</button><span id="status"></span></div>
  </aside>
  <section>
    <div id="newLine">
      <input type="text" id="say" placeholder="Type a new line for this character, then press Enter" spellcheck="true">
      <button id="speak" title="EDGEwave speaks the line in this character's voice (ElevenLabs, your key), and the lip sync is made from it">Speak</button>
      <button class="quiet" id="again" hidden title="The same words, spoken again">New Take</button>
      <span class="dim" id="sayNote"></span>
    </div>
    <div id="empty">Pick a line on the left to hear it and see its lip sync: every part of the face the game's clip moves for that line, as curves under the voice. Lip sync is kept per line and per character, not per head, so one clip plays on any head.</div>
    <div id="detail" hidden>
      <div id="words"></div>
      <div id="meta"></div>
      <div id="versions" hidden></div>
      <div class="bar">
        <span class="transport">
          <button class="icon" id="toStart" title="Jump to the start (Home)"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 2h2v12H2zM14 2v12L5 8z"/></svg></button>
          <button class="icon" id="stepBack" title="Back one frame (Left arrow)"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M11 2v12L3 8zM12 2h2v12h-2z"/></svg></button>
          <button class="icon main" id="play" title="Play or pause (Space)"><span id="playIcon"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M4 2l10 6-10 6z"/></svg></span><span id="pauseIcon" hidden><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3 2h4v12H3zM9 2h4v12H9z"/></svg></span></button>
          <button class="icon" id="stepForward" title="Forward one frame (Right arrow)"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M5 2v12l8-6zM2 2h2v12H2z"/></svg></button>
          <button class="icon" id="toEnd" title="Jump to the end (End)"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2h2v12h-2zM2 2v12l9-6z"/></svg></button>
        </span>
        <span id="time" title="Where the marker is: seconds, and the frame of the game's clip">0.00 s</span>
        <label><input type="checkbox" id="loop"> Loop</label>
        <label title="The tracks that mute other face animation while the line plays"><input type="checkbox" id="overrides"> Overrides</label>
        <label title="The game's own track names and values"><input type="checkbox" id="raw"> Track names</label>
        <label class="vol" title="How loud the voice plays here"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 6h3l4-3v10l-4-3H2zM11 5.2a4 4 0 0 1 0 5.6l-.9-.9a2.7 2.7 0 0 0 0-3.8zM12.9 3.3a6.6 6.6 0 0 1 0 9.4l-.9-.9a5.3 5.3 0 0 0 0-7.6z"/></svg><input type="range" id="volume" min="0" max="100" value="100" aria-label="Volume"></label>
        <span class="dim" id="audioNote"></span>
      </div>
      <div id="stage">
        <div id="mouthBox"><canvas id="head" hidden></canvas><canvas id="mouth" width="264" height="200"></canvas><span id="faceNote">A sketch from the jaw and lip tracks, not the game's face</span></div>
        <div id="curvesBox"><div id="readout"></div><div id="curvesScroll"><canvas id="curves"></canvas><table id="tracks" hidden></table></div></div>
      </div>
    </div>
  </section>
</main>
${headScript ? `<script nonce="${nonce}" src="${headScript}"></script>` : ""}
<script nonce="${nonce}">
(function () {
  var host = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : (window.lipsyncHost || { postMessage: function () {} });
  var $ = function (id) { return document.getElementById(id); };
  var state = { lines: null, clip: null, line: null, audio: null, peaks: null, playing: false, startedAt: 0, at: 0, hover: null, source: null };
  var audioCtx = null, gain = null;
  // The slider's place as loudness: squared, so the middle of the slider sounds about half as loud.
  function volume() { var v = Number($("volume").value) / 100; return v * v; }

  // Lanes, top to bottom: plain words first; the game's names are under Track names.
  var LANES = [
    { id: "jaw", title: "Jaw", pick: function (t) { return t.group === "lipsync" && t.part === "jaw"; } },
    { id: "lips", title: "Lips", pick: function (t) { return t.group === "lipsync" && t.part === "lips"; } },
    { id: "tongue", title: "Tongue", pick: function (t) { return t.group === "lipsync" && t.part === "tongue"; } },
    { id: "brow", title: "Brows", pick: function (t) { return t.group === "lipsync" && t.part === "brow"; } },
    { id: "eye", title: "Eyes and blinks", pick: function (t) { return t.group === "lipsync" && t.part === "eye"; } },
    { id: "throat", title: "Throat, neck and the rest", pick: function (t) { return t.group === "lipsync" && ["jaw", "lips", "tongue", "brow", "eye"].indexOf(t.part) < 0; } },
    { id: "control", title: "Controls: envelopes and JALI", pick: function (t) { return t.group === "control"; } },
    { id: "pose", title: "Head and eye direction", pick: function (t) { return t.group === "pose" || t.group === "wrinkle"; } },
    { id: "override", title: "Overrides: mute other face animation", pick: function (t) { return t.group === "override"; }, optional: true }
  ];
  var WAVE = 58, LANE = 92, PAD = 8, LEFT = 8;

  function plain(name) {
    return name.replace(/LipsyncPoseOutput$|AnimOverrideWeight$|Wrnkl$/, "").replace(/_l_/, " left ").replace(/_r_/, " right ").replace(/_mid_/, " ").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  }
  function sample(t, s) {
    var k = t.keys;
    if (!k.length) return 0;
    if (s <= k[0]) return k[1];
    for (var i = 2; i < k.length; i += 2) {
      if (s <= k[i]) { var span = k[i] - k[i - 2]; return span > 0 ? k[i - 1] + (k[i + 1] - k[i - 1]) * (s - k[i - 2]) / span : k[i + 1]; }
    }
    return k[k.length - 1];
  }
  function css(name, fallback) {
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }
  function seconds() { return state.clip ? Math.max(state.clip.seconds, state.audio ? state.audio.duration : 0) : 0; }

  function lanes() {
    if (!state.clip) return [];
    var out = [];
    LANES.forEach(function (l) {
      if (l.optional && !$("overrides").checked) return;
      var tracks = state.clip.tracks.filter(l.pick);
      if (!tracks.length) return;
      // Each lane fills its height: lips that reach 0.3 would be flat on a 0 to 1 scale. The top is said beside the title.
      var lo = 0, hi = 0.05;
      tracks.forEach(function (t, i) { lo = Math.min(lo, t.min); hi = Math.max(hi, t.max); t.color = "hsl(" + ((i * 47 + l.id.length * 31) % 360) + ", 78%, 62%)"; });
      out.push({ lane: l, tracks: tracks, lo: lo, hi: hi });
    });
    return out;
  }

  function draw() {
    showTime();
    var c = $("curves"), box = $("curvesScroll");
    if (!state.clip) return;
    var rows = lanes();
    var w = Math.max(240, box.clientWidth), h = WAVE + rows.length * LANE + 4;
    var dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.height = h + "px"; }
    var g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var fg = css("--vscode-foreground", "#ccc"), dim = css("--vscode-descriptionForeground", "#888"), line = css("--vscode-panel-border", "#333");
    var total = seconds() || 1, plotW = w - LEFT - 4;
    var x = function (s) { return LEFT + (s / total) * plotW; };
    state.geometry = { w: w, total: total, plotW: plotW, rows: rows };
    g.font = "11px " + css("--vscode-font-family", "sans-serif");

    // Time ticks, every half second.
    g.strokeStyle = line; g.fillStyle = dim; g.lineWidth = 1;
    for (var s = 0; s <= total + 1e-6; s += 0.5) {
      g.globalAlpha = s % 1 === 0 ? 0.9 : 0.4;
      g.beginPath(); g.moveTo(x(s) + 0.5, 0); g.lineTo(x(s) + 0.5, h); g.stroke();
      g.globalAlpha = 1;
      if (s % 1 === 0) g.fillText(s + " s", x(s) + 3, 10);
    }

    // The voice.
    var mid = WAVE / 2 + 6;
    if (state.peaks) {
      g.fillStyle = "#5ef6ff";
      g.globalAlpha = 0.75;
      var n = state.peaks.length, aw = (state.audio.duration / total) * plotW;
      for (var i = 0; i < n; i++) {
        var ph = Math.max(1, state.peaks[i] * (WAVE - 18));
        g.fillRect(LEFT + (i / n) * aw, mid - ph / 2, Math.max(1, aw / n - 0.5), ph);
      }
      g.globalAlpha = 1;
    } else {
      g.fillStyle = dim;
      g.fillText(state.audioNote || "The voice", LEFT + 4, mid + 4);
    }

    rows.forEach(function (r, i) {
      var top = WAVE + i * LANE, y0 = top + 18, ph = LANE - 18 - PAD;
      var y = function (v) { return y0 + ph - ((v - r.lo) / (r.hi - r.lo)) * ph; };
      g.strokeStyle = line; g.beginPath(); g.moveTo(0, top + 0.5); g.lineTo(w, top + 0.5); g.stroke();
      g.fillStyle = fg; g.fillText(r.lane.title, LEFT + 2, top + 13);
      g.fillStyle = dim; g.fillText(r.tracks.length + (r.tracks.length === 1 ? " track" : " tracks") + ", up to " + r.hi.toFixed(2) + (r.lo < 0 ? ", down to " + r.lo.toFixed(2) : ""), LEFT + 8 + g.measureText(r.lane.title).width, top + 13);
      if (r.lo < 0) { g.globalAlpha = 0.5; g.beginPath(); g.moveTo(LEFT, y(0) + 0.5); g.lineTo(w, y(0) + 0.5); g.stroke(); g.globalAlpha = 1; }
      r.tracks.forEach(function (t) {
        g.strokeStyle = t.color; g.lineWidth = state.hover && state.hover.track === t ? 2.4 : 1.2;
        g.globalAlpha = state.hover && state.hover.row === r && state.hover.track !== t ? 0.35 : 0.95;
        g.beginPath();
        for (var k = 0; k < t.keys.length; k += 2) { if (k) g.lineTo(x(t.keys[k]), y(t.keys[k + 1])); else g.moveTo(x(t.keys[k]), y(t.keys[k + 1])); }
        if (t.keys.length) g.lineTo(x(Math.max(t.keys[t.keys.length - 2], state.clip.seconds)), y(t.keys[t.keys.length - 1]));
        g.stroke();
      });
      g.globalAlpha = 1; g.lineWidth = 1;
    });

    // The playhead.
    g.strokeStyle = "#fcee0a"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x(state.at), 0); g.lineTo(x(state.at), h); g.stroke();
    drawMouth();
  }

  // A mouth from four numbers: how far the jaw opens, how wide the lips stretch, how far they purse, and whether
  // they close. A sketch to read the curves by, until a real head shows in the tab (docs/research/lipsync.md, R-face).
  function drawMouth() {
    // The real head, when one is loaded: posed by the face solver at the playhead.
    if (window.lipsyncHead && window.lipsyncHead.ready) { window.lipsyncHead.show(state.clip, state.at); return; }
    var c = $("mouth"), g = c.getContext("2d");
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, 132, 100);
    if (!state.clip) return;
    var avg = function (re) {
      var sum = 0, n = 0;
      state.clip.tracks.forEach(function (t) { if (t.group === "lipsync" && re.test(t.name)) { sum += sample(t, state.at); n++; } });
      return n ? sum / n : 0;
    };
    var open = avg(/^jaw_mid_open/), wide = avg(/^lips_[lr]_(corner_)?stretch|^lips_[lr]_pull/), purse = avg(/^lips_[lr]_(purse|funnel)/), shut = avg(/^lips_together/);
    var rx = 30 * (1 + 0.7 * wide - 0.6 * purse), ry = Math.max(1.5, 34 * open * (1 - Math.min(1, shut)));
    g.strokeStyle = css("--vscode-foreground", "#ccc"); g.lineWidth = 2.5; g.fillStyle = "rgba(94,246,255,0.18)";
    g.beginPath(); g.ellipse(66, 50, Math.max(8, rx), ry, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  }

  function tick() {
    if (!state.playing) return;
    var total = seconds();
    state.at = audioCtx && state.source ? audioCtx.currentTime - state.startedAt : (performance.now() - state.startedAt) / 1000;
    if (state.at >= total) {
      if ($("loop").checked) { stop(); state.at = 0; play(); return; }
      stop(); state.at = total; draw(); return;
    }
    draw();
    requestAnimationFrame(tick);
  }
  // Play starts at the marker (from the start when the marker is at the end); pressed again, it pauses there.
  function play() {
    if (!state.clip) return;
    if (state.playing) { stop(); draw(); return; }
    var total = seconds();
    if (state.at >= total - 0.001) state.at = 0;
    state.playing = true; $("playIcon").hidden = true; $("pauseIcon").hidden = false;
    if (state.audio && state.at < state.audio.duration) {
      audioCtx = audioCtx || new AudioContext();
      var src = audioCtx.createBufferSource();
      // Through a gain node, so the volume slider works while the line plays.
      if (!gain || gain.context !== audioCtx) { gain = audioCtx.createGain(); gain.connect(audioCtx.destination); }
      gain.gain.value = volume();
      src.buffer = state.audio; src.connect(gain); src.start(0, state.at);
      state.source = src; state.startedAt = audioCtx.currentTime - state.at;
    } else { state.source = null; state.startedAt = performance.now() - state.at * 1000; }
    requestAnimationFrame(tick);
  }
  // Pauses: the marker stays where it is.
  function stop() {
    state.playing = false; $("playIcon").hidden = false; $("pauseIcon").hidden = true;
    if (state.source) { try { state.source.stop(); } catch (e) {} state.source = null; }
  }
  function fps() { return state.clip && state.clip.fps > 0 ? state.clip.fps : 30; }
  // Moves the marker to a time, pausing first.
  function seek(s) {
    if (!state.clip) return;
    if (state.playing) stop();
    state.at = Math.max(0, Math.min(seconds(), s));
    draw();
  }
  // One frame of the game's clip back or forward, landing on whole frames.
  function step(by) {
    if (!state.clip) return;
    var f = state.at * fps(), whole = Math.round(f);
    var next = Math.abs(f - whole) < 0.01 ? whole + by : (by > 0 ? Math.ceil(f) : Math.floor(f));
    seek(next / fps());
  }
  function showTime() {
    if (!state.clip) { $("time").textContent = ""; return; }
    var last = Math.round(seconds() * fps());
    $("time").textContent = state.at.toFixed(2) + " s · frame " + Math.min(last, Math.round(state.at * fps())) + " of " + last;
  }

  function showTracks() {
    var t = $("tracks");
    t.hidden = !$("raw").checked || !state.clip;
    if (t.hidden) return;
    var rows = "<tr><th></th><th>Track</th><th>Kind</th><th>Part</th><th>Keys</th><th>Lowest</th><th>Highest</th></tr>";
    state.clip.tracks.forEach(function (k) {
      rows += "<tr><td class='sw'><span style='background:" + (k.color || "transparent") + "'></span></td><td>" + k.name + "</td><td>" + k.group + "</td><td>" + k.part + "</td><td>" + k.keys.length / 2 + "</td><td>" + k.min.toFixed(3) + "</td><td>" + k.max.toFixed(3) + "</td></tr>";
    });
    state.clip.held.forEach(function (k) { rows += "<tr><td></td><td>" + k.name + "</td><td>" + k.group + "</td><td></td><td>held</td><td colspan='2'>" + k.value.toFixed(3) + "</td></tr>"; });
    t.innerHTML = rows;
  }

  function text(s) { var d = document.createElement("span"); d.textContent = s; return d.innerHTML; }
  function sceneName(p) { var m = /([^\\\\/]+)\\.scene$/i.exec(p); return m ? m[1] : p; }

  function showLines(data, append) {
    var box = $("scenes");
    if (!append) { box.innerHTML = ""; state.lines = data; } else { state.lines.scenes = state.lines.scenes.concat(data.scenes); state.lines.offset = data.offset; }
    data.scenes.forEach(function (sc) {
      var div = document.createElement("div"); div.className = "scene";
      var html = "<h2>" + text(sceneName(sc.scene)) + "</h2><div class='path'>" + text(sc.scene) + "</div>";
      if (sc.error) html += "<div class='row dim'>" + text(sc.error) + "</div>";
      else if (!sc.lines.length) html += "<div class='row dim'>No lines in this set.</div>";
      div.innerHTML = html;
      sc.lines.forEach(function (l) {
        var row = document.createElement("div"); row.className = "row"; row.dataset.clip = l.clip; row.dataset.set = sc.set;
        row.innerHTML = "<span class='t'>" + (l.text ? text(l.text) : "<span class='dim'>(no words in this language) " + l.clip + "</span>") + "</span>" +
          (state.twoVoices ? "<span class='g'>" + (l.gender === "female" ? "F" : "M") + "</span>" : "") + "<span class='s'>" + l.seconds.toFixed(1) + " s</span>";
        row.onclick = function () { openLine(sc, l, row); };
        if (state.reopen && state.reopen === l.clip) { state.reopen = null; setTimeout(function () { openLine(sc, l, row); row.scrollIntoView({ block: "nearest" }); }, 0); }
        div.appendChild(row);
      });
      box.appendChild(div);
    });
    var shown = state.lines.scenes.length, count = 0;
    state.lines.scenes.forEach(function (s) { count += s.lines.length; });
    $("more").hidden = data.offset + data.scenes.length >= data.total;
    $("more").dataset.offset = String(data.offset + data.scenes.length);
    setStatus(count + (count === 1 ? " line" : " lines") + " in " + shown + " of " + data.total + (data.total === 1 ? " scene" : " scenes"));
  }

  function openLine(sc, l, row) {
    stop();
    Array.prototype.forEach.call(document.querySelectorAll(".row.on"), function (r) { r.classList.remove("on"); });
    row.classList.add("on");
    $("versions").hidden = true; state.line = l; state.clip = null; state.audio = null; state.peaks = null; state.at = 0; state.hover = null; state.audioNote = "Reading the voice";
    $("empty").hidden = true; $("detail").hidden = false;
    $("words").textContent = l.text || "(no words in this language)";
    $("meta").textContent = l.clip + " · " + l.seconds.toFixed(2) + " s, " + l.frames + " frames · line " + l.lineId + " · " + sc.set;
    $("audioNote").textContent = ""; $("readout").textContent = "Reading the clip"; $("tracks").hidden = true;
    var c = $("curves"); c.getContext("2d").clearRect(0, 0, c.width, c.height);
    state.scene = sceneName(sc.scene);
    host.postMessage({ type: "open", set: sc.set, clip: l.clip, audio: l.audio });
    remember();
  }

  // What VS Code keeps for this tab over a window reload: the character, and the line that is open.
  function remember() { if (host.setState) host.setState({ character: state.character, clip: state.line && !state.line.made ? state.line.clip : undefined, scene: state.line && !state.line.made ? state.scene : undefined, volume: Number($("volume").value) }); }

  function setStatus(s, bad) { var e = $("status"); e.textContent = s; e.className = bad ? "bad" : ""; }

  function gotAudio(m) {
    if (!state.line || m.clip !== state.line.clip) return;
    if (m.error) { state.audioNote = "No voice to play"; $("audioNote").textContent = m.error; draw(); return; }
    var bin = atob(m.base64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    audioCtx = audioCtx || new AudioContext();
    audioCtx.decodeAudioData(bytes.buffer).then(function (buf) {
      if (!state.line || m.clip !== state.line.clip) return;
      state.audio = buf;
      var d = buf.getChannelData(0), n = 600, step = Math.max(1, Math.floor(d.length / n)), peaks = new Float32Array(n), top = 0;
      for (var p = 0; p < n; p++) { var mx = 0; for (var j = p * step; j < (p + 1) * step && j < d.length; j++) { var a = Math.abs(d[j]); if (a > mx) mx = a; } peaks[p] = mx; if (mx > top) top = mx; }
      if (top > 0) for (var q = 0; q < n; q++) peaks[q] /= top;
      state.peaks = peaks;
      draw();
    }, function () { state.audioNote = "No voice to play"; $("audioNote").textContent = "This voice file didn't decode."; draw(); });
  }

  window.addEventListener("message", function (e) {
    var m = e.data || {};
    if (m.type === "character") {
      stop();
      $("name").textContent = m.character.name;
      $("tag").textContent = "voice tag " + m.character.voiceTag + " · " + m.character.scenes + (m.character.scenes === 1 ? " scene" : " scenes") + " · " + m.language;
      state.twoVoices = /^v(_|$)/.test(m.character.voiceTag);
      state.character = m.character.voiceTag; state.reopen = m.reopen || null;
      state.clip = null; state.line = null; $("detail").hidden = true; $("empty").hidden = false; $("filter").value = m.scene || "";
      remember();
      $("say").placeholder = "Type a new line for " + m.character.name + ", then press Enter"; $("again").hidden = true; sayNote("");
    } else if (m.type === "made") {
      // A line made from typed words: EDGEwave's voice, and lip sync from when each letter is spoken.
      $("speak").disabled = !!m.busy; $("again").disabled = !!m.busy;
      if (m.busy) { sayNote(m.busy + " ..."); return; }
      if (m.error) { sayNote(m.error, true); return; }
      stop();
      Array.prototype.forEach.call(document.querySelectorAll(".row.on"), function (r) { r.classList.remove("on"); });
      $("versions").hidden = true; state.line = { clip: m.clip.clip, made: true }; state.clip = m.clip; state.audio = null; state.peaks = null; state.at = 0; state.hover = null; state.audioNote = "Reading the voice";
      $("empty").hidden = true; $("detail").hidden = false; $("again").hidden = false;
      $("words").textContent = m.words;
      $("meta").textContent = "A new line · " + m.clip.seconds.toFixed(2) + " s · " + (m.voice ? "voice " + m.voice + " · " : "") + (m.take ? "take " + m.take + (m.cached ? " (kept from before)" : "") + " · " : "") + "mouth shapes: " + m.said;
      $("audioNote").textContent = ""; $("tracks").hidden = true;
      $("readout").innerHTML = "<b>" + m.clip.tracks.length + "</b> lip sync tracks made from the words and the voice's timing. Not in a project yet.";
      sayNote((m.notes || []).join(" "));
      draw(); showTracks();
    } else if (m.type === "lines") showLines(m.data, m.append);
    else if (m.type === "clip") {
      if (!state.line || m.data.clip !== state.line.clip) return;
      state.clip = m.data;
      $("readout").innerHTML = "<b>" + m.data.tracks.length + "</b> of " + m.data.trackCount + " tracks move in this line. Point at a curve to read it.";
      draw(); showTracks();
    } else if (m.type === "versions") {
      // Other lip sync for the same line: switch between them on the same voice, head and marker.
      if (!state.line || m.clip !== state.line.clip || !state.clip) return;
      var all = [{ name: "The game's", clip: state.clip }].concat(m.versions);
      var box = $("versions"); box.innerHTML = "Lip sync: "; box.hidden = false;
      all.forEach(function (v, i) {
        var b = document.createElement("button"); b.className = i ? "quiet" : "quiet on"; b.textContent = v.name;
        b.onclick = function () {
          Array.prototype.forEach.call(box.querySelectorAll("button"), function (x) { x.classList.remove("on"); });
          b.classList.add("on"); state.clip = v.clip; draw(); showTracks();
        };
        box.appendChild(b);
      });
    } else if (m.type === "audio") gotAudio(m);
    else if (m.type === "head") {
      // The head for this clip's rig: its meshes and its facial setup. Until it shows, the sketch stays.
      if (m.error || !window.lipsyncHead) { $("faceNote").textContent = m.error || "A sketch from the jaw and lip tracks, not the game's face"; return; }
      $("faceNote").textContent = "Loading the head";
      window.lipsyncHead.load($("head"), m).then(function () {
        if (!window.lipsyncHead.ready) { $("faceNote").textContent = "The head didn't load; this is a sketch from the jaw and lip tracks"; return; }
        $("head").hidden = false; $("mouth").hidden = true; $("mouthBox").className = "head";
        $("faceNote").textContent = m.note || "The head, moved by the clip's tracks. Drag to turn it.";
        draw();
      }, function (err) { $("faceNote").textContent = "The head didn't load (" + (err && err.message ? err.message : err) + ")"; });
    }
    else if (m.type === "busy") setStatus(m.text + " ...");
    else if (m.type === "error") setStatus(m.text, true);
    else if (m.type === "pick") host.postMessage({ type: "pick", character: m.character });
  });

  $("play").onclick = play;
  function sayNote(s, bad) { var e = $("sayNote"); e.textContent = s || ""; e.className = bad ? "dim bad" : "dim"; }
  function speak(take) {
    var words = $("say").value.trim();
    if (!words || $("speak").disabled) return;
    host.postMessage({ type: "speak", text: words, take: take });
  }
  $("speak").onclick = function () { speak(); };
  $("again").onclick = function () { speak("new"); };
  $("say").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); speak(); } });
  // The volume is kept with the tab, so it is the same after a reload.
  var kept = host.getState ? host.getState() : null;
  if (kept && typeof kept.volume === "number") $("volume").value = String(kept.volume);
  $("volume").oninput = function () { if (gain) gain.gain.value = volume(); remember(); };
  $("toStart").onclick = function () { seek(0); };
  $("toEnd").onclick = function () { seek(seconds()); };
  $("stepBack").onclick = function () { step(-1); };
  $("stepForward").onclick = function () { step(1); };
  $("change").onclick = function () { host.postMessage({ type: "pick" }); };
  $("more").onclick = function () { host.postMessage({ type: "more", offset: Number($("more").dataset.offset) || 0 }); };
  $("overrides").onchange = function () { draw(); };
  $("raw").onchange = showTracks;
  var filterTimer = 0;
  $("filter").oninput = function () { clearTimeout(filterTimer); filterTimer = setTimeout(function () { host.postMessage({ type: "filter", scene: $("filter").value }); }, 350); };
  window.addEventListener("resize", draw);
  window.addEventListener("keydown", function (e) {
    if (!state.clip || (e.target.tagName === "INPUT" && e.target.type !== "checkbox") || e.ctrlKey || e.altKey || e.metaKey) return;
    var keys = { Space: play, ArrowLeft: function () { step(-1); }, ArrowRight: function () { step(1); }, Home: function () { seek(0); }, End: function () { seek(seconds()); } };
    if (keys[e.code]) { e.preventDefault(); keys[e.code](); }
  });

  var curves = $("curves");
  curves.addEventListener("mousemove", function (e) {
    var geo = state.geometry; if (!geo || !state.clip) return;
    var r = curves.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    var s = Math.max(0, Math.min(geo.total, ((px - LEFT) / geo.plotW) * geo.total));
    var row = geo.rows[Math.floor((py - WAVE) / LANE)];
    if (!row || py < WAVE) { state.hover = null; $("readout").textContent = s.toFixed(2) + " s"; if (!state.playing) draw(); return; }
    var top = WAVE + geo.rows.indexOf(row) * LANE + 18, ph = LANE - 18 - PAD, best = null, bestD = 1e9;
    var at = row.tracks.map(function (t) {
      var v = sample(t, s), y = top + ph - ((v - row.lo) / (row.hi - row.lo)) * ph, d = Math.abs(y - py);
      if (d < bestD) { bestD = d; best = t; }
      return { t: t, v: v };
    }).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
    state.hover = { row: row, track: best };
    var raw = $("raw").checked;
    $("readout").innerHTML = "<div>" + s.toFixed(2) + " s · <b style='color:" + best.color + "'>" + text(raw ? best.name : plain(best.name)) + " " + sample(best, s).toFixed(2) + "</b></div><div>Strongest: " +
      at.slice(0, 4).map(function (a) { return text(raw ? a.t.name : plain(a.t.name)) + " " + a.v.toFixed(2); }).join(", ") + "</div>";
    if (!state.playing) draw();
  });
  curves.addEventListener("mouseleave", function () { state.hover = null; if (!state.playing) draw(); });
  var dragging = false;
  function scrub(e) {
    var geo = state.geometry; if (!geo) return;
    var r = curves.getBoundingClientRect();
    seek(((e.clientX - r.left - LEFT) / geo.plotW) * geo.total);
  }
  curves.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || !state.geometry || !state.clip) return;
    e.preventDefault();
    dragging = true; curves.classList.add("drag");
    scrub(e);
  });
  window.addEventListener("mousemove", function (e) { if (dragging) scrub(e); });
  window.addEventListener("mouseup", function () { if (dragging) { dragging = false; curves.classList.remove("drag"); } });

  host.postMessage({ type: "ready" });
})();
</script>
</body>
</html>`;
}
