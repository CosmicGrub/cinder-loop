/* ===========================================================================
 * tests/verify_render.js  —  the built file, in a real browser
 * ---------------------------------------------------------------------------
 * The other three suites prove the sim is correct. This one proves the thing
 * a person can actually open is correct, which is a different claim: a canvas
 * can be laid out at 0x0, requestAnimationFrame can be throttled to nothing,
 * a keydown listener can be bound to the wrong property, and every unit test
 * in the project would still be green.
 *
 * Screenshots are Page.captureScreenshot — the composited frame (L12).
 * ======================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const H = require('./harness');
const cdp = require('./cdp');

const s = new H.Suite('verify_render');
const BUILD = path.join(H.ROOT, 'cinder-loop.html');
const SHOT = path.join(H.ROOT, 'tests', 'out', 'frame.png');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const read = (c, sid, expr) => cdp.evaluate(c, sid, expr);

// Poll rather than a flat sleep: how long boot/settle/input-latency takes to
// reach any given real condition is CPU-load-dependent, not a fixed number.
// A single evaluated boolean expression, polled at a short interval, outlasts
// load spikes a fixed sleep does not — the general form `waitForBoot` below
// already used for the reload paths, generalized here (v0.2.10) after a real
// adversarial re-run of this exact suite, 6 times back to back, found the
// ORIGINAL fixed sleeps at boot (900ms) and post-keydown (80ms) genuinely
// flaky under load: 5 of 6 runs failed 'the presenter is drawing frames' or
// 'the attack key starts a swing' outright, not a hypothetical risk.
async function waitForCondition(c, sid, expr, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 4000);
  while (Date.now() < deadline) {
    const ok = await read(c, sid, expr);
    if (ok) return true;
    await cdp.sleep(80);
  }
  return false;
}
async function waitForBoot(c, sid, timeoutMs) {
  return waitForCondition(c, sid, '!!(window.CINDER_APP && window.CINDER_APP.sim)', timeoutMs);
}

async function main() {
  if (!fs.existsSync(BUILD)) {
    console.log('  FAIL  verify_render                    no cinder-loop.html; run build.py first');
    process.exit(1);
  }

  const exe = cdp.findChromium();
  s.ok('a chromium binary is available', !!exe, exe ? path.basename(exe) : 'none found');
  if (!exe) return s.done();

  const { proc, wsUrl, userDir } = await cdp.launch(exe);
  let client = null;

  try {
    client = await cdp.CDP.connect(wsUrl);
    const errors = cdp.collectErrors(client);
    const sid = await cdp.openPage(client);

    // Installed BEFORE the very first navigate (Page.addScriptToEvaluateOnNewDocument
    // runs ahead of every page script on every subsequent load too, including
    // the reloads further down this suite) so it is in place before 95-app.js's
    // own auto-boot IIFE ever constructs a real SFXPlayer. Counts real
    // AudioContext node creation from OUTSIDE 85-audio.js's own code — proof
    // that the real boot() wiring reaches a real AudioContext and a real cue
    // actually plays through it, which a fake-ctx unit suite (verify_audio.js,
    // which already covers 85-audio.js's own internals thoroughly) cannot
    // establish by itself.
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(function () {
        window.__audioNodeCalls = { osc: 0, buf: 0 };
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        var origOsc = Ctor.prototype.createOscillator;
        Ctor.prototype.createOscillator = function () {
          window.__audioNodeCalls.osc++;
          return origOsc.apply(this, arguments);
        };
        var origBufSrc = Ctor.prototype.createBufferSource;
        Ctor.prototype.createBufferSource = function () {
          window.__audioNodeCalls.buf++;
          return origBufSrc.apply(this, arguments);
        };
      })()`
    }, sid);

    await cdp.navigate(client, sid, pathToFileURL(BUILD).href);
    // Real condition, not a guessed duration: boot, at least 11 drawn
    // frames, and the player actually settled on the ground.
    await waitForCondition(client, sid,
      '!!(window.CINDER_APP && window.CINDER_APP.frames > 10 && window.CINDER_APP.sim && ' +
      'window.CINDER_APP.sim.players[0].body.onGround)', 5000);

    /* ------------------------------------------------------ the canvas */
    const canvas = await read(client, sid, `(function () {
      var c = document.getElementById('game');
      if (!c) return null;
      var r = c.getBoundingClientRect();
      return { w: c.width, h: c.height, cw: Math.round(r.width), ch: Math.round(r.height) };
    })()`);

    s.ok('the canvas element exists', canvas !== null);
    s.ok('the canvas is laid out', canvas && canvas.cw > 0 && canvas.ch > 0,
      canvas ? canvas.cw + 'x' + canvas.ch + ' css px' : 'absent');
    s.ok('the backing store is not 0x0', canvas && canvas.w > 0 && canvas.h > 0,
      canvas ? canvas.w + 'x' + canvas.h : 'absent');

    /* --------------------------------------------------------- the app */
    const booted = await read(client, sid, `(function () {
      var a = window.CINDER_APP;
      if (!a || !a.sim) return null;
      var b = a.sim.players[0].body;
      return { tick: a.sim.tick, frames: a.frames, players: a.sim.players.length,
               state: a.sim.players[0].state, hp: a.sim.players[0].hp,
               x: b.x, y: b.y, onGround: b.onGround };
    })()`);
    s.ok('the app booted', booted !== null);
    s.ok('the presenter is drawing frames', booted && booted.frames > 10, booted ? booted.frames + ' frames' : '0');
    s.ok('the spawn is a real coordinate', booted && Number.isFinite(booted.x) && Number.isFinite(booted.y),
      booted ? Math.round(booted.x) + ',' + Math.round(booted.y) : '?');
    // Standing, not merely "not dead". The weaker check passed a build whose
    // player was falling through a world he could never touch.
    s.ok('the player settled on the floor', booted && booted.onGround && booted.hp === 3,
      booted ? booted.state : '?');

    /* ------------------------------------------------------------ audio
     * "Lazy until first real use" (85-audio.js's own header) is already
     * proven directly against the class itself in verify_audio.js, right
     * after construction with no bus activity at all. It is NOT retestable
     * here the same way: this suite's own boot-wait condition already
     * requires the player to be onGround, and landing is itself one of the
     * fifteen real SFX triggers — by the time "booted" is even true, a real
     * 'land' cue has already fired and legitimately constructed the
     * context. That is correct production behavior (first REAL use, same
     * as any other cue), not a leak of the lazy contract. */
    const audioBoot = await read(client, sid, `(function () {
      var a = window.CINDER_APP.audio;
      return { exists: !!a, muted: a ? a.muted : null };
    })()`);
    s.ok('window.CINDER_APP.audio exists', audioBoot.exists);
    s.eq('audio starts unmuted, matching a fresh settings default', audioBoot.muted, false);

    /* ------------------------------------------------ audio: pointerdown
     * Adversarially found (v0.2.16): 95-app.js wires audio.unlock() to
     * THREE real-gesture listeners (keydown/pointerdown/touchstart), but
     * before this only the keydown leg had any coverage anywhere in the
     * gate — a mouse-first player who clicks before ever pressing a key or
     * touching the screen was untested. Spies on the real audio.unlock
     * method (rather than reading ctx state, which the natural 'land' SFX
     * cue already constructs during ordinary boot independent of any
     * gesture — see the comment above) so this proves the WIRING
     * specifically. A real, trusted Input.dispatchMouseEvent (the same
     * input pipeline keydown/touch dispatch below already use), not a
     * synthetic/untrusted DOM dispatchEvent call. */
    await read(client, sid, `(function () {
      var a = window.CINDER_APP.audio;
      window.__unlockCalls = 0;
      var orig = a.unlock.bind(a);
      a.unlock = function () { window.__unlockCalls++; return orig(); };
      return true;
    })()`);
    await cdp.mouseDown(client, sid, 40, 40);
    await cdp.mouseUp(client, sid, 40, 40);
    const pointerUnlockCalls = await read(client, sid, 'window.__unlockCalls');
    s.ok('a real pointerdown reaches audio.unlock() (previously untested)',
      pointerUnlockCalls > 0, String(pointerUnlockCalls));

    /* ------------------------------------------------- ticking in real time */
    const t0 = await read(client, sid, 'window.CINDER_APP.sim.tick');
    await cdp.sleep(1000);
    const t1 = await read(client, sid, 'window.CINDER_APP.sim.tick');
    const rate = t1 - t0;
    // A wide band on purpose. This asserts the loop is live and roughly
    // real-time, not that a CI box can hold a perfect 60 — that number is the
    // frame meter's job on real hardware, and it is not measurable from here.
    s.between('the sim ticks in real time (ticks/s)', rate, 30, 75);

    const shotIdle = await cdp.screenshot(client, sid);

    /* ------------------------------------------------ combat, for real
     * Done BEFORE the movement test, while the player is still standing at
     * spawn within reach of the training dummy. Found by its own id (100,
     * boot()'s own fixed dummy id — H.scenario()'s dummies use the same
     * 100+i convention), not by array position: since 60-run.js (v0.2.13),
     * sim.beginRun() populates targets with this level's real roster BEFORE
     * boot() adds the dummy, so it is no longer reliably targets[0]. */
    const before = await read(client, sid, `(function () {
      var t = window.CINDER_APP.sim.targets;
      var dummy = t.filter(function (x) { return x.id === 100; })[0];
      return { n: t.length, hp: dummy ? dummy.hp : null, alive: dummy ? dummy.alive() : false };
    })()`);
    s.ok('training dummies exist', before && before.n >= 1, before ? before.n + ' targets' : '0');
    s.ok('the practice dummy (id 100) is among them', before && before.hp !== null,
      before ? JSON.stringify(before) : '?');

    await cdp.keyDown(client, sid, 'KeyJ');
    await waitForCondition(client, sid, '!!window.CINDER_APP.sim.players[0].attack', 1000);
    const swinging = await read(client, sid, `(function () {
      var p = window.CINDER_APP.sim.players[0];
      return p.attack ? p.attack.id : null;
    })()`);
    await cdp.keyUp(client, sid, 'KeyJ');
    s.eq('the attack key starts a swing', swinging, 'slashA');

    const DUMMY_HP = `window.CINDER_APP.sim.targets.filter(function(x){return x.id===100;})[0].hp`;
    await waitForCondition(client, sid, DUMMY_HP + ' < ' + before.hp, 1500);
    const after = await read(client, sid, DUMMY_HP);
    s.ok('the swing damaged the dummy', after < before.hp,
      before.hp + ' -> ' + after + ' hp');

    // The debug overlay draws the live hitbox through the same transform the
    // sim tests with. If it renders, the two agree on screen.
    await cdp.keyDown(client, sid, 'F4');
    await cdp.keyUp(client, sid, 'F4');
    const overlay = await read(client, sid, 'window.CINDER_APP.view.showBoxes');
    s.eq('F4 toggles the hitbox overlay', overlay, true);
    await cdp.keyDown(client, sid, 'F4');
    await cdp.keyUp(client, sid, 'F4');

    /* --------------------------------------------------------- narrative
     * 82-narrative.js's own real production wiring — a real Sim, a real
     * Bus, a real Narrative instance subscribed to it, a real canvas —
     * proven end to end. Emits directly on the real bus rather than
     * waiting for a real enemy's own AI to naturally telegraph: this suite
     * is proving NARRATIVE's reaction and rendering, not enemy timing,
     * which verify_enemy.js already covers on its own; the bus instance
     * emitted on here is the identical one a real telegraph would use. */
    const narrBefore = await read(client, sid, `(function () {
      var n = window.CINDER_APP.narrative;
      return { exists: !!n, current: n.current };
    })()`);
    s.ok('window.CINDER_APP.narrative exists', narrBefore.exists);
    s.eq('nothing showing yet on a quiet boot', narrBefore.current, null);

    // Regression (adversarial pass): the real boot() call site must
    // actually pass a real, varying seed to Narrative, not silently fall
    // back to the class's own hardcoded default (1) forever — the bug
    // that made every real boot, ever, produce byte-identical dialogue.
    // Checked BEFORE anything triggers a real dialogue pick — rng.s is the
    // PRNG's own live, mutating state, advanced by every pick() call, so
    // this has to run against the pristine, just-constructed instance.
    const seedCheck = await read(client, sid, `(function () {
      var simSeed = (window.CINDER_APP.sim.seed >>> 0) || 1;
      return { narrRngS: window.CINDER_APP.narrative.rng.s, simSeedDerived: simSeed };
    })()`);
    s.eq('narrative.rng is seeded from the real boot seed, not the class default',
      seedCheck.narrRngS, seedCheck.simSeedDerived);

    await read(client, sid,
      "window.CINDER_APP.sim.bus.emit('telegraph', { id: 999, tid: 'ashwalker', frames: 20, x: 0, y: 0, facing: 1 })");
    const narrAfter = await read(client, sid, 'window.CINDER_APP.narrative.current');
    s.ok('a real telegraph on the real bus produces a real displayed line',
      narrAfter && narrAfter.kind === 'bark', JSON.stringify(narrAfter));

    const barkShot = await cdp.screenshot(client, sid);
    s.ok('the text box actually composites into a real frame',
      barkShot.length > 1000, barkShot.length + ' bytes');

    /* -------------------------------------------- keystrokes reach it */
    const xBefore = await read(client, sid, 'window.CINDER_APP.sim.players[0].body.x');
    await cdp.keyDown(client, sid, 'KeyD');
    // Real condition (displacement, which accumulates over real SIM TICKS),
    // not a guessed wall-clock duration — a fixed sleep here assumes enough
    // ticks ran in that window, the same class of flake this suite already
    // fixed twice this version for boot/attack timing.
    await waitForCondition(client, sid,
      'window.CINDER_APP.sim.players[0].body.x - ' + xBefore + ' > 20', 2000);
    const xAfter = await read(client, sid, 'window.CINDER_APP.sim.players[0].body.x');
    s.ok('a keystroke moves the character', xAfter - xBefore > 20,
      'moved ' + Math.round(xAfter - xBefore) + 'px right');

    // Sample the height across the whole arc rather than guessing when the
    // apex lands.
    await read(client, sid, `(function () {
      window.__minY = 1e9;
      window.__sampler = setInterval(function () {
        var y = window.CINDER_APP.sim.players[0].body.y;
        if (y < window.__minY) window.__minY = y;
      }, 8);
      window.__y0 = window.CINDER_APP.sim.players[0].body.y;
      return true;
    })()`);
    await cdp.keyDown(client, sid, 'Space');
    await cdp.sleep(400);
    const shotMoving = await cdp.screenshot(client, sid, SHOT);
    await cdp.keyUp(client, sid, 'Space');
    // Real condition again: the sampler above already runs continuously off
    // an in-page interval, independent of this wait — poll for it to have
    // actually observed a real 20px rise rather than assuming 300ms of
    // wall-clock covers enough ticks for the arc to get there.
    await waitForCondition(client, sid, 'window.__y0 - window.__minY > 20', 1500);
    const jump = await read(client, sid, `(function () {
      clearInterval(window.__sampler);
      return { y0: window.__y0, min: window.__minY };
    })()`);
    await cdp.keyUp(client, sid, 'KeyD');

    s.ok('the jump key lifts the character', jump.y0 - jump.min > 20,
      'rose ' + Math.round(jump.y0 - jump.min) + 'px');

    /* ------------------------------------------------ audio: real playback
     * By this point real keydowns (KeyJ's attack, Space's jump) have
     * already fired real 'attackStart'/'hit'/'jump' bus events on the real
     * sim — proving both that a real user gesture actually constructs and
     * unlocks a real AudioContext, and that a real cue reaches it (the
     * injected monkeypatch's own node-creation count, not anything
     * 85-audio.js reports about itself). */
    const audioAfterJump = await read(client, sid, `(function () {
      var a = window.CINDER_APP.audio;
      return { ctxExists: !!a.ctx, state: a.ctx ? a.ctx.state : null,
               oscCalls: window.__audioNodeCalls ? window.__audioNodeCalls.osc : -1 };
    })()`);
    s.ok('a real user gesture constructs a real AudioContext', audioAfterJump.ctxExists);
    s.ok('...reporting a real, valid Web Audio state',
      ['running', 'suspended', 'closed'].indexOf(audioAfterJump.state) !== -1, String(audioAfterJump.state));
    s.ok('...and a real oscillator node was created (a tone cue actually played)',
      audioAfterJump.oscCalls > 0, 'osc calls: ' + audioAfterJump.oscCalls);

    /* ---------------------------------------------------- audio: mute toggle
     * The real Sound row (92-menu.js), reached with real keys exactly like
     * the Options navigation the pause section below exercises — proving the
     * toggle reaches the live SFXPlayer 95-app.js actually constructed, not
     * just that Settings.sanitize() round-trips a `muted` field in isolation
     * (verify_platform.js already covers that). The bus.emit() calls below
     * are the same "emit directly on the real bus" pattern the narrative
     * bark test above already uses, not a new shortcut invented for this. */
    // window.CINDER_APP.settings.keybinds has exactly one entry per
    // Pad.BUTTONS action (Settings.defaults()'s own invariant, proven in
    // verify_platform.js) — read off the live app rather than the CINDER
    // namespace itself, which the build wraps in its own closure and never
    // exposes as a global (L2/L5's own boundary, intact even here).
    const padLen = await read(client, sid, 'Object.keys(window.CINDER_APP.settings.keybinds).length');
    await cdp.keyDown(client, sid, 'Escape'); await cdp.keyUp(client, sid, 'Escape');       // open pause menu
    await cdp.keyDown(client, sid, 'ArrowDown'); await cdp.keyUp(client, sid, 'ArrowDown'); // -> Options row
    await cdp.keyDown(client, sid, 'Enter'); await cdp.keyUp(client, sid, 'Enter');         // -> options screen
    for (let i = 0; i < padLen + 2; i++) {
      await cdp.keyDown(client, sid, 'ArrowDown'); await cdp.keyUp(client, sid, 'ArrowDown');
    }
    const soundRow = await read(client, sid, `(function () {
      var m = window.CINDER_APP.menu;
      return { cursor: m.cursor, label: m.rowLabels()[m.cursor] };
    })()`);
    s.eq('navigation lands exactly on the Sound row', soundRow.label.indexOf('Sound:'), 0);

    await cdp.keyDown(client, sid, 'Enter'); await cdp.keyUp(client, sid, 'Enter');   // toggle it off
    const mutedOn = await read(client, sid, `(function () {
      return { audioMuted: window.CINDER_APP.audio.muted, settingsMuted: window.CINDER_APP.settings.muted,
               stored: JSON.parse(localStorage.getItem('cinderloop.settings.v1')).muted };
    })()`);
    s.eq('the Sound row flips the live SFXPlayer\'s own muted flag', mutedOn.audioMuted, true);
    s.eq('...and the settings object it was derived from', mutedOn.settingsMuted, true);
    s.eq('...and persists immediately, not just on the next save point', mutedOn.stored, true);

    const oscBeforeMuted = await read(client, sid, 'window.__audioNodeCalls.osc');
    await read(client, sid, `window.CINDER_APP.sim.bus.emit('hit', {})`);
    const oscWhileMuted = await read(client, sid, 'window.__audioNodeCalls.osc');
    s.eq('a real bus event while muted creates no new oscillator node', oscWhileMuted, oscBeforeMuted);

    await cdp.keyDown(client, sid, 'Enter'); await cdp.keyUp(client, sid, 'Enter');   // toggle it back on
    s.eq('toggling the row again flips it back off',
      await read(client, sid, 'window.CINDER_APP.audio.muted'), false);

    await read(client, sid, `window.CINDER_APP.sim.bus.emit('hit', {})`);
    const oscAfterUnmute = await read(client, sid, 'window.__audioNodeCalls.osc');
    s.ok('the identical event, unmuted, creates a real new oscillator node',
      oscAfterUnmute > oscWhileMuted, oscWhileMuted + ' -> ' + oscAfterUnmute);

    // Leave the menu closed, exactly as the pause section below expects to find it.
    await cdp.keyDown(client, sid, 'Escape'); await cdp.keyUp(client, sid, 'Escape');   // options -> root
    await cdp.keyDown(client, sid, 'Escape'); await cdp.keyUp(client, sid, 'Escape');   // root -> closed
    await cdp.sleep(60);
    const menuClosedAfterAudio = await read(client, sid, `(function () {
      var a = window.CINDER_APP;
      return { paused: a.paused, screen: a.menu.screen };
    })()`);
    s.eq('the menu is left closed for the pause section below', menuClosedAfterAudio.paused, false);
    s.eq('...back on the root screen', menuClosedAfterAudio.screen, 'root');

    // The toggle above legitimately persisted through the real saveSettings()
    // path (already proven), which would otherwise falsely pre-empt the
    // "a first boot has no stored settings yet" check in the persistence
    // section far below — that section is testing a truly virgin
    // localStorage, a precondition this block is not the one meant to prove
    // or disprove. Cleared here, not skipped there, so the persistence
    // section keeps testing the real thing it always has.
    await read(client, sid, "localStorage.removeItem('cinderloop.settings.v1')");

    /* ------------------------------------------------- ability VFX (§6)
     * Real key input for dash (the same "keystrokes reach it" precedent
     * already used for jump/roll above); a direct real bus.emit() for
     * parry (the identical shortcut the telegraph bark test already uses
     * above, rather than orchestrating a full real enemy-attack-then-
     * parry sequence through whatever the live level happens to contain
     * at this point in the suite — the SIM-side mechanic is already
     * exhaustively proven against real enemies in verify_enemy.js; this
     * suite's own job is only proving the VIEW actually reacts). Both
     * read window.CINDER_APP.view directly, which the app already
     * exposes, the same way earlier sections already read
     * window.CINDER_APP.sim/settings/menu/audio. */
    // Start from a known-grounded state — by this point in the suite the
    // character has real momentum left over from earlier real movement/
    // combat sections, so jumping from an arbitrary already-airborne
    // moment is not a safe assumption the way it is at a fresh boot.
    //
    // The whole jump-then-roll-press attempt is wrapped in a bounded retry
    // (found necessary by an adversarial re-run of this exact check under
    // real machine load, not assumed): the roll/dash trigger reads off
    // pad.buffered(), which only stays true for CFG's own pending-input
    // window (measured at 8 frames, ~133ms — §3) — genuinely narrower than
    // jump's own airborne detection margin. A CDP round trip that happens
    // to land slow under real system contention (GC pause, OS scheduler
    // hiccup — this is real, not hypothetical: measured directly during
    // this session's own verification) can push the ShiftLeft keydown's
    // actual arrival past that window, and the press is silently dropped —
    // exactly the kind of narrow-buffer miss the pending-input window is,
    // by design, allowed to produce for a genuinely late real press. This
    // is a claim about CDP DISPATCH reliability under load, not about the
    // MECHANIC: verify_move.js already proves the sim-level trigger
    // deterministically, tick by tick, with zero flakiness ever observed.
    // A real player whose press did not land presses again; this retry
    // does the same, and still fails for real if dashing genuinely breaks.
    let midAirForDash = false, dashed = false;
    for (let attempt = 0; attempt < 3 && !dashed; attempt++) {
      await waitForCondition(client, sid, 'window.CINDER_APP.sim.players[0].body.onGround', 2000);
      await cdp.keyDown(client, sid, 'Space');   // jump, to get airborne
      // Polled, not a flat sleep — found the hard way (an adversarial
      // re-run of this exact check, not assumed): a fixed real-world delay
      // here is exactly the load-dependent flakiness this file's own
      // waitForCondition helper already exists to avoid (see its header
      // comment — the original v0.2.10 boot/keydown fixed sleeps failed 5
      // of 6 runs under load). Space is held throughout (never released
      // early), so this is always a full, un-cut jump — 36 real frames of
      // airtime (§3) once airborne, plenty of margin for the roll press
      // that follows immediately after this resolves true.
      midAirForDash = await waitForCondition(client, sid,
        '!window.CINDER_APP.sim.players[0].body.onGround', 3000);
      await cdp.keyDown(client, sid, 'ShiftLeft');
      // A real gap between down and up, not back-to-back — found the hard
      // way (an adversarial re-run of this exact check, not assumed): with
      // no delay at all, the whole press-release cycle can complete before
      // the next real SIM TICK's Pad.update() ever samples `.next`, which
      // only runs once per tick, not once per dispatched key event — the
      // press is genuinely invisible to the tick-rate-sampled Pad system,
      // not merely late. Every OTHER real key press in this file already
      // has natural real-world gaps around it (a poll loop, a sleep, a
      // waitForCondition) that happened to cover this same requirement
      // without ever stating it as one — this is the first press dispatched
      // back-to-back with nothing else in between, which is what surfaced it.
      await cdp.sleep(50);
      await cdp.keyUp(client, sid, 'ShiftLeft');
      await cdp.keyUp(client, sid, 'Space');
      // Checking live state === 'dash' alone is racy in a way a flat sleep
      // or extra CDP round-trip latency actually triggers, not a
      // hypothetical: Ember Dash only lasts 14 frames (~233ms, §3) — by the
      // time this poll's first read reaches the browser (after the
      // keyDown/50ms-sleep/two keyUps already spent above, each its own CDP
      // round trip), the dash can already be OVER, and the poll then never
      // sees 'dash' again because it has already moved on to idle/fall.
      // dashCd is the durable signal instead: endDash() always arms a
      // 30-frame (~500ms) cooldown the instant a dash completes, which
      // stays true long after the state itself has moved on — found by an
      // adversarial re-run of this exact check, not assumed. Either the
      // dash is still active or it already completed and left its cooldown
      // behind; both prove a real dash fired.
      dashed = await waitForCondition(client, sid,
        "window.CINDER_APP.sim.players[0].state === 'dash' || window.CINDER_APP.sim.players[0].dashCd > 0", 3000);
    }
    s.ok('actually airborne before the roll press', midAirForDash);
    s.ok('a real airborne roll-key press actually dashes', dashed);
    const dashParticles = await read(client, sid, `(function () {
      var list = window.CINDER_APP.view.particles.list;
      return list.map(function (p) { return { x: p.x, y: p.y, kind: p.kind }; });
    })()`);
    s.ok('the dash produced real particles', dashParticles.length > 0);
    s.ok('every dash particle has a real, finite position (regression: rollStart\'s own burst spawned at y=NaN, silently invisible, until this pass fixed it — and 30-player.js\'s \'step\' emit had the identical bug, caught by this same sweep, see 30-player.js)',
      dashParticles.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      JSON.stringify(dashParticles.slice(0, 3)));
    s.ok('dash particles use the ember spark color, not the plain dust one',
      dashParticles.some((p) => p.kind === 'spark'));

    const glowBefore = await read(client, sid, 'window.CINDER_APP.view.parryGlow[0] || 0');
    s.eq('no parry glow before a parry has ever happened', glowBefore, 0);
    const playerId0 = await read(client, sid, 'window.CINDER_APP.sim.players[0].id');
    await read(client, sid,
      `window.CINDER_APP.sim.bus.emit('parry', { id: ${playerId0}, source: 999, x: 0, y: 0 })`);
    const glowAfter = await read(client, sid, 'window.CINDER_APP.view.parryGlow[' + playerId0 + ']');
    s.ok('a real parry event arms the real hood-glow timer', glowAfter > 0, String(glowAfter));

    // Let a few real frames render, and confirm the SAME live timer actually
    // decays — not just that it was set once, which render()'s own
    // decrement loop (not this test) is responsible for.
    await cdp.sleep(200);
    const glowLater = await read(client, sid, 'window.CINDER_APP.view.parryGlow[' + playerId0 + ']');
    s.ok('the glow timer decays over real rendered frames, not stuck held',
      glowLater < glowAfter, glowAfter + ' -> ' + glowLater);

    /* -------------------------------------------- the composited frame */
    s.ok('the screenshot is a real PNG', shotMoving.subarray(0, 8).equals(PNG_MAGIC));
    s.ok('the frame has substance', shotMoving.length > 3000, shotMoving.length + ' bytes');
    s.ok('the frame is live, not a still', !shotIdle.equals(shotMoving),
      shotIdle.length + ' vs ' + shotMoving.length + ' bytes');
    s.ok('the composited frame was written', fs.existsSync(SHOT),
      path.relative(H.ROOT, SHOT));

    /* ---------------------------------------------------------------- pause
     * Real Escape key, real browser: the sim must actually stop advancing,
     * not just report a flag that nothing reads. */
    const beforePause = await read(client, sid, 'window.CINDER_APP.sim.tick');
    await cdp.keyDown(client, sid, 'Escape');
    await cdp.keyUp(client, sid, 'Escape');
    await cdp.sleep(60);
    const pausedState = await read(client, sid, `(function () {
      var a = window.CINDER_APP;
      return { paused: a.paused, menuOpen: a.menu.open, screen: a.menu.screen };
    })()`);
    s.eq('Escape opens the pause menu', pausedState.paused, true);
    s.eq('the menu reports open', pausedState.menuOpen, true);
    s.eq('landing on the root screen', pausedState.screen, 'root');

    const tPausedStart = await read(client, sid, 'window.CINDER_APP.sim.tick');
    await cdp.sleep(400);
    const tPausedEnd = await read(client, sid, 'window.CINDER_APP.sim.tick');
    s.eq('the sim does not advance while paused', tPausedEnd, tPausedStart);

    const shotPaused = await cdp.screenshot(client, sid);
    s.ok('the paused frame still renders something', shotPaused.length > 500, shotPaused.length + ' bytes');

    // Navigate into Options and back out, then all the way closed, purely
    // with the keyboard — the same path a player has.
    await cdp.keyDown(client, sid, 'ArrowDown'); await cdp.keyUp(client, sid, 'ArrowDown');
    await cdp.keyDown(client, sid, 'Enter'); await cdp.keyUp(client, sid, 'Enter');
    const inOptions = await read(client, sid, 'window.CINDER_APP.menu.screen');
    s.eq('ArrowDown + Enter reaches Options', inOptions, 'options');

    await cdp.keyDown(client, sid, 'Escape'); await cdp.keyUp(client, sid, 'Escape');
    const backAtRoot = await read(client, sid, 'window.CINDER_APP.menu.screen');
    s.eq('Escape from Options returns to root, not closing outright', backAtRoot, 'root');

    await cdp.keyDown(client, sid, 'Escape'); await cdp.keyUp(client, sid, 'Escape');
    await cdp.sleep(60);
    const resumed = await read(client, sid, 'window.CINDER_APP.paused');
    s.eq('Escape at root closes the menu and resumes', resumed, false);

    await cdp.sleep(200);
    const tAfterResume = await read(client, sid, 'window.CINDER_APP.sim.tick');
    s.ok('the sim resumes advancing after unpausing', tAfterResume > tPausedEnd,
      tPausedEnd + ' -> ' + tAfterResume);

    /* ------------------------------------------------------- window resize
     * DPR-aware and extreme-aspect-ratio hardening: every number the camera
     * and the backing store compute must stay finite, and the app must keep
     * producing frames, across sizes nobody would deliberately choose. */
    async function metricsCheck(label, width, height, dsf) {
      await client.send('Emulation.setDeviceMetricsOverride',
        { width: width, height: height, deviceScaleFactor: dsf || 1, mobile: false }, sid);
      await cdp.sleep(220);
      const m = await read(client, sid, `(function () {
        var v = window.CINDER_APP.view;
        return { cssW: v.cssW, cssH: v.cssH, dpr: v.dpr, bw: v.canvas.width, bh: v.canvas.height,
                 clientW: v.canvas.clientWidth, clientH: v.canvas.clientHeight,
                 zoom: v.camera.zoom, x: v.camera.x, y: v.camera.y };
      })()`);
      const finite = [m.cssW, m.cssH, m.dpr, m.bw, m.bh, m.zoom, m.x, m.y].every(Number.isFinite);
      s.ok(label + ': every camera/canvas number stays finite', finite, JSON.stringify(m));
      s.ok(label + ': the backing store has real area', m.bw > 0 && m.bh > 0, m.bw + 'x' + m.bh);
      s.between(label + ': zoom stays inside its own clamp', m.zoom, 0.9, 3.1);
      /* The regression this exists to catch: an early version pinned
       * canvas.style.width/height to a fixed px value on the first resize,
       * which outranks the stylesheet's percentage rule and makes clientWidth
       * echo back whatever was last written instead of measuring the real
       * container — silently freezing the game at its boot-time size for the
       * rest of the session. Asserting cssW actually reflects THIS call's
       * width (floor-clamped to 320/240, exactly like fit() clamps it) is
       * what "stays finite" alone does not catch, because a frozen value is
       * still a finite one.
       *
       * clientWidth is asserted against the RAW requested size, not the
       * clamped one: nothing in this codebase overrides canvas layout any
       * more (that was the bug), so the browser reports the canvas's true
       * on-screen box — which is smaller than our 320/240 floor exactly when
       * the real window is. That gap is expected and is why the floor exists
       * only in the camera's zoom math, not as a claim about what the canvas
       * actually occupies on screen. */
      const wantW = Math.max(320, width), wantH = Math.max(240, height);
      s.eq(label + ': the logical size tracks the real viewport', m.cssW + 'x' + m.cssH, wantW + 'x' + wantH);
      s.eq(label + ": the canvas's own clientWidth matches the true container",
        m.clientW + 'x' + m.clientH, width + 'x' + height);
      return m;
    }
    await metricsCheck('very narrow (320x2000)', 320, 2000);
    await metricsCheck('very wide (2000x240)', 2000, 240);
    await metricsCheck('tiny (200x150, below the 320x240 floor)', 200, 150);
    await metricsCheck('square (500x500)', 500, 500);

    const hiDpr = await metricsCheck('high-density (480x360 @3x)', 480, 360, 3);
    const realDpr = await read(client, sid, 'window.devicePixelRatio');
    s.eq('the browser really did report a 3x device pixel ratio', Math.round(realDpr), 3);
    s.eq('but the app clamps its own dpr to 2', hiDpr.dpr, 2);
    s.eq('and the backing store reflects the clamped dpr, not the raw one',
      hiDpr.bw, Math.round(hiDpr.cssW * 2));

    await client.send('Emulation.clearDeviceMetricsOverride', {}, sid);
    await cdp.sleep(250);
    const framesAfterResize = await read(client, sid, 'window.CINDER_APP.frames');
    s.ok('the app is still producing frames after the resize sweep', framesAfterResize > 0);
    // The regression check in reverse: after five overrides in a row, the
    // canvas must still be tracking its real container, not stuck echoing
    // whichever override happened to land last.
    const afterClear = await read(client, sid, `(function () {
      var v = window.CINDER_APP.view, r = document.getElementById('game').getBoundingClientRect();
      return { cssW: v.cssW, cssH: v.cssH, rectW: Math.round(r.width), rectH: Math.round(r.height) };
    })()`);
    s.eq('the logical size snaps back to the real window', afterClear.cssW, afterClear.rectW);
    s.eq('in both dimensions', afterClear.cssH, afterClear.rectH);

    /* --------------------------------------------------------- persistence
     * The two lines of localStorage glue in 95-app.js, exercised for real —
     * not the pure sanitizer, which verify_platform already covers
     * thoroughly. A known-valid payload is built with the REAL Settings
     * module (loaded Node-side, not reimplemented) and injected directly, so
     * this section is testing the storage round trip and live wiring, not
     * re-deriving sanitize()'s own correctness. */
    const STORAGE_KEY = 'cinderloop.settings.v1';
    const Platform = H.loadPlatform();
    const fresh = await read(client, sid, `(function () {
      return { stored: localStorage.getItem(${JSON.stringify(STORAGE_KEY)}),
               showMeter: window.CINDER_APP.settings.showMeter };
    })()`);
    s.eq('a first boot has no stored settings yet', fresh.stored, null);
    s.eq('and the frame meter defaults on', fresh.showMeter, true);

    const custom = Platform.Settings.sanitize({
      version: 1, reducedMotion: true, showMeter: false,
      keybinds: { jump: ['KeyP'] }
    });
    const customPayload = Platform.Settings.serialize(custom);
    await read(client, sid,
      `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(customPayload)})`);
    await cdp.navigate(client, sid, pathToFileURL(BUILD).href);
    const bootedCustom = await waitForBoot(client, sid);
    s.ok('the app reboots after a reload with a saved payload', bootedCustom);
    await cdp.sleep(150);   // one settled frame past first paint
    const restored = await read(client, sid, `(function () {
      var s = window.CINDER_APP.settings;
      return { reducedMotion: s.reducedMotion, showMeter: s.showMeter, jump: s.keybinds.jump.join(',') };
    })()`);
    s.eq('a saved reducedMotion survives a reload', restored.reducedMotion, true);
    s.eq('a saved showMeter survives a reload', restored.showMeter, false);
    s.eq('a saved custom keybind survives a reload', restored.jump, 'KeyP');
    s.eq('and the live app actually reflects showMeter off',
      await read(client, sid, 'window.CINDER_APP.showMeter'), false);

    await read(client, sid,
      `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, 'not json at all {{{')`);
    await cdp.navigate(client, sid, pathToFileURL(BUILD).href);
    const bootedCorrupt = await waitForBoot(client, sid);
    s.ok('a corrupted settings payload does not prevent boot', bootedCorrupt);
    await cdp.sleep(150);
    const survived = await read(client, sid, `(function () {
      var a = window.CINDER_APP;
      return (a && a.sim) ? { booted: true, version: a.settings.version, hp: a.sim.players[0].hp } : { booted: false };
    })()`);
    s.ok('and the boot is a real, playable sim', survived.booted);
    s.eq('falling back to the current settings version', survived.version, 1);
    s.eq('with a perfectly normal game underneath it', survived.hp, 3);

    /* ---------------------------------------------------- meta persistence
     * 65-meta.js's own two lines of localStorage glue (loadMeta/saveMeta),
     * exercised for real — the identical shape the settings block above
     * already proves, plus the specific gap an adversarial pass found: F5/
     * F6 are the ONLY currently-exposed way to trigger a real, permanent
     * meta mutation (no shop UI exists), and the only save hook wired at
     * boot was the `runEnd` bus event, which never fires from either debug
     * key. A real F6 purchase sat correctly mutated in memory but reverted
     * on an ordinary reload. Driven through the REAL F6 key dispatch, not
     * a direct sim.meta poke, so this proves the actual player-facing path
     * the bug was found through, not just the underlying spend logic
     * verify_meta.js already covers. */
    const META_KEY = 'cinderloop.meta.v1';
    const CFG = H.loadSim().CFG;
    // Earlier sections of this same suite run real gameplay (combat/movement/
    // hazards) where the test player can legitimately die, firing the real
    // 'runEnd' bus event — which 95-app.js already wires to auto-save
    // sim.meta. That can leave an all-default Meta object sitting in
    // localStorage before this "first boot" check ever runs, exactly the
    // same class of leak the settings-key precedent above this block
    // exists to prevent. Cleared here for the identical reason.
    await read(client, sid, "localStorage.removeItem('cinderloop.meta.v1')");
    const freshMeta = await read(client, sid, `(function () {
      return { stored: localStorage.getItem(${JSON.stringify(META_KEY)}),
               currency: window.CINDER_APP.sim.meta.currency };
    })()`);
    s.eq('a first boot has no stored meta yet', freshMeta.stored, null);
    s.eq('and currency starts at zero', freshMeta.currency, 0);

    // Grant currency directly (substitutes for grinding real kills — the
    // SPEND itself goes through the real F6 key, the path under test).
    await read(client, sid, 'window.CINDER_APP.sim.meta.currency = 10000');
    await cdp.keyDown(client, sid, 'F6');
    await cdp.keyUp(client, sid, 'F6');
    const afterBuy = await read(client, sid, `(function () {
      var m = window.CINDER_APP.sim.meta;
      return { currency: m.currency, maxHpBonus: m.maxHpBonus, stored: localStorage.getItem(${JSON.stringify(META_KEY)}) };
    })()`);
    s.eq('F6 spends real currency immediately', afterBuy.currency, 10000 - CFG.META_MAXHP_COST);
    s.eq('and grants the permanent bonus immediately', afterBuy.maxHpBonus, 1);
    s.ok('and F6 saves to localStorage immediately, not just on the next runEnd',
      afterBuy.stored !== null, String(afterBuy.stored));

    await cdp.navigate(client, sid, pathToFileURL(BUILD).href);
    const bootedAfterBuy = await waitForBoot(client, sid);
    s.ok('the app reboots after a reload following an F6 purchase', bootedAfterBuy);
    await cdp.sleep(150);
    const metaAfterReload = await read(client, sid, `(function () {
      var m = window.CINDER_APP.sim.meta;
      return { currency: m.currency, maxHpBonus: m.maxHpBonus, playerMaxHp: window.CINDER_APP.sim.players[0].maxHp };
    })()`);
    s.eq('the F6 purchase survives a real reload — currency', metaAfterReload.currency, 10000 - CFG.META_MAXHP_COST);
    s.eq('and the permanent bonus', metaAfterReload.maxHpBonus, 1);
    s.eq('and a freshly booted player actually reflects it', metaAfterReload.playerMaxHp, CFG.MAX_HP + 1);

    // F5 (toggleEnforceLocks) — the other debug-key mutation the same gap
    // affected — proven the identical way.
    await cdp.keyDown(client, sid, 'F5');
    await cdp.keyUp(client, sid, 'F5');
    const afterToggle = await read(client, sid, `(function () {
      return { enforceLocks: window.CINDER_APP.sim.meta.enforceLocks,
               stored: JSON.parse(localStorage.getItem(${JSON.stringify(META_KEY)})).enforceLocks };
    })()`);
    s.eq('F5 flips enforceLocks immediately', afterToggle.enforceLocks, true);
    s.eq('and saves the flip immediately', afterToggle.stored, true);
    await cdp.navigate(client, sid, pathToFileURL(BUILD).href);
    await waitForBoot(client, sid);
    await cdp.sleep(150);
    s.eq('the F5 toggle survives a real reload',
      await read(client, sid, 'window.CINDER_APP.sim.meta.enforceLocks'), true);

    await read(client, sid,
      `localStorage.setItem(${JSON.stringify(META_KEY)}, 'not json at all {{{')`);
    await cdp.navigate(client, sid, pathToFileURL(BUILD).href);
    const bootedCorruptMeta = await waitForBoot(client, sid);
    s.ok('a corrupted meta payload does not prevent boot', bootedCorruptMeta);
    await cdp.sleep(150);
    const survivedMeta = await read(client, sid, `(function () {
      var a = window.CINDER_APP;
      return (a && a.sim) ? { booted: true, currency: a.sim.meta.currency } : { booted: false };
    })()`);
    s.ok('and the boot is a real, playable sim', survivedMeta.booted);
    s.eq('falling back to a fresh, zeroed meta state', survivedMeta.currency, 0);

    /* ------------------------------------------------------------- PWA
     * Manifest and icons are embedded as data: URIs (L2 forbids a second
     * file). Fetching the manifest link and parsing it as JSON is what
     * proves the base64 payload build.py generated is actually well-formed,
     * not just present. */
    const pwa = await read(client, sid, `(function () {
      var m = document.querySelector('link[rel=manifest]');
      var icon = document.querySelector('link[rel=icon][type="image/svg+xml"]');
      var apple = document.querySelector('link[rel=apple-touch-icon]');
      return {
        manifestHref: m ? m.href.slice(0, 30) : null,
        hasIcon: !!icon, hasAppleIcon: !!apple,
        safeTopIsCSS: /^-?\\d+(\\.\\d+)?px$/.test(getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim())
      };
    })()`);
    s.ok('a manifest link is present', !!pwa.manifestHref, pwa.manifestHref || 'missing');
    s.ok('it is embedded as a data: URI, not a second file', (pwa.manifestHref || '').indexOf('data:') === 0);
    s.ok('a favicon and an apple-touch-icon are both present', pwa.hasIcon && pwa.hasAppleIcon);
    s.ok('the safe-area custom properties resolve to a real CSS length', pwa.safeTopIsCSS);

    const manifestJson = await read(client, sid, `(function () {
      var href = document.querySelector('link[rel=manifest]').href;
      return fetch(href).then(function (r) { return r.text(); });
    })()`);
    let manifestParsed = null, manifestErr = null;
    try { manifestParsed = JSON.parse(manifestJson); } catch (e) { manifestErr = e.message; }
    s.ok('the manifest data: URI parses as valid JSON', manifestParsed !== null, manifestErr || 'ok');
    if (manifestParsed) {
      s.eq('with the right name', manifestParsed.name, 'CINDER LOOP');
      s.eq('standalone display', manifestParsed.display, 'standalone');
      s.eq('a landscape preference for installed instances', manifestParsed.orientation, 'landscape');
      s.ok('at least one icon entry', Array.isArray(manifestParsed.icons) && manifestParsed.icons.length > 0);
    }

    /* --------------------------------------------------- touch detection
     * 'ontouchstart' in window / navigator.maxTouchPoints are both known
     * false-positive traps — a plain headless launch with ZERO touch
     * emulation active reported touch support through them (measured
     * directly, during development of this feature). matchMedia
     * '(pointer: coarse)' is what the app actually uses now, and this
     * section proves it answers correctly in both directions, not just the
     * direction that happened to work first. */
    const touchOff = await read(client, sid, 'window.CINDER_APP.touch()');
    s.eq('no touch emulation: app.touch() is false', touchOff, false);
    const rotateHiddenAtBoot = await read(client, sid,
      `!document.getElementById('rotate').classList.contains('active')`);
    s.ok('and the rotate hint stays hidden', rotateHiddenAtBoot);

    await client.send('Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, sid);
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true }, sid);
    await cdp.sleep(280);
    const touchPortrait = await read(client, sid, `(function () {
      var r = document.getElementById('rotate');
      return { touch: window.CINDER_APP.touch(), active: r.classList.contains('active'),
               display: getComputedStyle(r).display };
    })()`);
    s.eq('touch + portrait: app.touch() is true', touchPortrait.touch, true);
    s.eq('and the rotate hint becomes active', touchPortrait.active, true);
    s.eq('and is actually visible, not just flagged', touchPortrait.display, 'flex');

    await client.send('Emulation.setDeviceMetricsOverride',
      { width: 844, height: 390, deviceScaleFactor: 3, mobile: true }, sid);
    await cdp.sleep(280);
    const touchLandscape = await read(client, sid, `(function () {
      var r = document.getElementById('rotate');
      return { touch: window.CINDER_APP.touch(), active: r.classList.contains('active') };
    })()`);
    s.eq('touch + landscape: still touch', touchLandscape.touch, true);
    s.eq('but the rotate hint hides once rotated', touchLandscape.active, false);

    /* ------------------------------------------------------- real touch play
     * Still in the 844x390 landscape+touch emulation from above. This drives
     * the WHOLE pipeline for real — CDP synthesizes actual touch input, the
     * browser dispatches real touchstart/move/end events, TouchControls
     * classifies them and calls Pad.set(), the next sim tick consumes them —
     * and checks the SIM's own state changed, not just that TouchControls'
     * internal bookkeeping looks right. verify_touch already proves the
     * bookkeeping is correct in isolation; this is the end-to-end claim that
     * a finger on real glass actually moves the character. */
    const geom = await read(client, sid, `(function () {
      var v = window.CINDER_APP.view;
      return { cssW: v.cssW, cssH: v.cssH };
    })()`);
    const T_ = { top: 48, pause: 48 };
    const rH = geom.cssH - T_.top;
    // attackY at 0.9, not 0.8 (the old ATTACK band's own former start) —
    // the new PARRY zone split ATTACK's old 0.60-1.0 range at
    // PARRY_FRAC=0.80, so 0.8 is now the exact PARRY/ATTACK boundary
    // itself: still correctly ATTACK, but with zero margin, fragile
    // against any future PARRY_FRAC nudge.
    const jumpY = T_.top + rH * 0.20, rollY = T_.top + rH * 0.50, attackY = T_.top + rH * 0.90;
    const moveX = geom.cssW * 0.2, actionX = geom.cssW * 0.85;

    s.ok('TouchControls was lazily constructed once touch was observed',
      await read(client, sid, '!!window.CINDER_APP.touchControls()'));

    // Adversarially found (v0.2.16): touchstart-triggered audio.unlock()
    // had zero coverage anywhere in the gate — by this point in the suite
    // audio was already unlocked via earlier keydowns, so even the real
    // touchStart dispatches below already exercised the touchstart
    // listener without anything ever checking its effect. Re-installs a
    // fresh spy here (the one from the pointerdown check earlier does not
    // survive the several real page reloads the settings/meta persistence
    // sections in between this and that check perform) and checks the
    // COUNT actually advances across this one specific touchStart, proving
    // the listener still fires, independent of whatever already unlocked
    // the context earlier.
    await read(client, sid, `(function () {
      var a = window.CINDER_APP.audio;
      window.__unlockCalls = 0;
      var orig = a.unlock.bind(a);
      a.unlock = function () { window.__unlockCalls++; return orig(); };
      return true;
    })()`);
    const unlockCallsBeforeTouch = await read(client, sid, 'window.__unlockCalls');
    const beforeMove = await read(client, sid, 'window.CINDER_APP.sim.players[0].body.x');
    await cdp.touchStart(client, sid, [{ x: moveX, y: 220, id: 1 }]);
    const unlockCallsAfterTouch = await read(client, sid, 'window.__unlockCalls');
    s.ok('a real touchstart also reaches audio.unlock() (previously untested)',
      unlockCallsAfterTouch > unlockCallsBeforeTouch,
      unlockCallsBeforeTouch + ' -> ' + unlockCallsAfterTouch);
    await cdp.touchMove(client, sid, [{ x: moveX + 60, y: 220, id: 1 }]);
    // Real condition, same reasoning as the keystroke/jump checks above.
    await waitForCondition(client, sid,
      'window.CINDER_APP.sim.players[0].body.x > ' + beforeMove + ' + 5', 1500);
    const afterMove = await read(client, sid, 'window.CINDER_APP.sim.players[0].body.x');
    s.ok('a real dispatched touch drag actually moves the character',
      afterMove > beforeMove + 5, beforeMove.toFixed(1) + ' -> ' + afterMove.toFixed(1));
    await cdp.touchEnd(client, sid, [{ x: moveX + 60, y: 220, id: 1 }]);
    // Real condition (friction has actually brought vx to rest), not a
    // guessed duration — a fixed 120ms sleep assumes enough SIM TICKS ran
    // in that wall-clock window, which is exactly the class of flake this
    // suite already found and fixed once this version (v0.2.10) for boot
    // and attack timing; found flaky here too under the same real re-run
    // pressure, fixed the same way.
    await waitForCondition(client, sid,
      'Math.abs(window.CINDER_APP.sim.players[0].body.vx) < 0.05', 1500);
    s.eq('releasing the drag stops the character',
      await read(client, sid, `(function () {
        var b = window.CINDER_APP.sim.players[0].body;
        return Math.abs(b.vx) < 0.05;
      })()`), true);

    const groundedBeforeJump = await read(client, sid, 'window.CINDER_APP.sim.players[0].body.onGround');
    await cdp.touchStart(client, sid, [{ x: actionX, y: jumpY, id: 2 }]);
    let midJump = { vy: 0 };
    for (let i = 0; i < 30 && midJump.vy >= 0; i++) {
      midJump = await read(client, sid, `(function () {
        var p = window.CINDER_APP.sim.players[0];
        return { state: p.state, vy: p.body.vy };
      })()`);
      if (midJump.vy >= 0) await cdp.sleep(16);
    }
    await cdp.touchEnd(client, sid, [{ x: actionX, y: jumpY, id: 2 }]);
    s.ok('a real dispatched tap in the jump band actually jumps',
      groundedBeforeJump && midJump.vy < 0, JSON.stringify(midJump));

    // Heavy attack: the whole reason the winning scheme needed no combined-
    // gesture recognition. Two real, independently dispatched touch points,
    // one holding 'down' via the stick, one tapping ATTACK — Combat.begin
    // reads pad.down('down') at the moment it consumes the buffered attack.
    //
    // pad.down() reads pad.CUR.down, which only advances from .next one sim
    // tick after Pad.set() writes it — so the down-drag must be confirmed to
    // have actually reached `cur` before the attack touch fires, not just
    // "probably enough real time has passed." A fixed sleep here passed
    // standalone and then flaked inside the full gate (more going on, more
    // scheduling jitter), which is exactly the failure mode polling for the
    // real observable state avoids.
    await cdp.sleep(300);   // let any prior motion fully settle
    await cdp.touchStart(client, sid, [{ x: moveX, y: 220, id: 3 }]);
    await cdp.touchMove(client, sid, [{ x: moveX, y: 220 + 40, id: 3 }]);   // drag down
    let downSettled = false;
    for (let i = 0; i < 30 && !downSettled; i++) {
      downSettled = await read(client, sid, 'window.CINDER_APP.sim.pads.get(0).cur.down');
      if (!downSettled) await cdp.sleep(16);
    }
    s.ok('the down-drag reaches pad.cur before the attack fires', downSettled);

    await cdp.touchStart(client, sid, [{ x: actionX, y: attackY, id: 4 }]);
    let heavy = null;
    for (let i = 0; i < 30 && heavy === null; i++) {
      heavy = await read(client, sid, `(function () {
        var p = window.CINDER_APP.sim.players[0];
        return p.attack ? p.attack.id : null;
      })()`);
      if (heavy === null) await cdp.sleep(16);
    }
    await cdp.touchEnd(client, sid, [{ x: actionX, y: attackY, id: 4 }]);
    await cdp.touchEnd(client, sid, [{ x: moveX, y: 260, id: 3 }]);
    s.eq('two real simultaneous touches produce a real heavy attack', heavy, 'heavy');

    /* ---------------------------------------------------- touch assist
     * Abilities spec §2b. verify_touch.js already proves TouchControls'
     * own bookkeeping (arm/release, cross-zone protection, the recency
     * gate) against a fake controller — this is the end-to-end claim that
     * flipping the REAL Touch Parry Assist row actually changes what a
     * real dispatched touch does, reading a real telegraph off the real
     * bus and a real elapsed sim.tick, not a stubbed one. */
    const padLen2 = await read(client, sid, 'Object.keys(window.CINDER_APP.settings.keybinds).length');
    await cdp.keyDown(client, sid, 'Escape'); await cdp.keyUp(client, sid, 'Escape');       // open pause menu
    await cdp.keyDown(client, sid, 'ArrowDown'); await cdp.keyUp(client, sid, 'ArrowDown'); // -> Options row
    await cdp.keyDown(client, sid, 'Enter'); await cdp.keyUp(client, sid, 'Enter');         // -> options screen
    for (let i = 0; i < padLen2 + 3; i++) {   // one row past Sound: Touch Parry Assist
      await cdp.keyDown(client, sid, 'ArrowDown'); await cdp.keyUp(client, sid, 'ArrowDown');
    }
    const assistRow = await read(client, sid, `(function () {
      var m = window.CINDER_APP.menu;
      return { cursor: m.cursor, label: m.rowLabels()[m.cursor] };
    })()`);
    s.eq('navigation lands exactly on the Touch Parry Assist row',
      assistRow.label.indexOf('Touch Parry Assist:'), 0);
    await cdp.keyDown(client, sid, 'Enter'); await cdp.keyUp(client, sid, 'Enter');   // turn it on
    s.eq('the real settings object actually flips',
      await read(client, sid, 'window.CINDER_APP.settings.touchParryAssist'), true);
    await cdp.keyDown(client, sid, 'Escape'); await cdp.keyUp(client, sid, 'Escape');   // options -> root
    await cdp.keyDown(client, sid, 'Escape'); await cdp.keyUp(client, sid, 'Escape');   // root -> closed

    // A real telegraph, right on the real bus (the identical pattern the
    // narrative bark test above already uses).
    await read(client, sid,
      "window.CINDER_APP.sim.bus.emit('telegraph', { id: 998, tid: 'ashwalker', frames: 20, x: 0, y: 0, facing: 1 })");
    await cdp.touchStart(client, sid, [{ x: actionX, y: rollY, id: 7 }]);
    let parryArmed = false;
    for (let i = 0; i < 30 && !parryArmed; i++) {
      parryArmed = await read(client, sid, 'window.CINDER_APP.sim.pads.get(0).cur.parry');
      if (!parryArmed) await cdp.sleep(16);
    }
    await cdp.touchEnd(client, sid, [{ x: actionX, y: rollY, id: 7 }]);
    s.ok('a real roll-zone touch, right after a real telegraph, really arms parry', parryArmed);
    // The staleness half (assist stops firing once the telegraph is no
    // longer recent) is deliberately NOT proven with a real wall-clock
    // wait here — this section runs against a real, live generated level
    // with real enemies that can genuinely telegraph their own attacks at
    // any point, which would silently refresh lastTelegraphTick and make
    // a timing-based wait here flake for reasons that have nothing to do
    // with the code under test (found by actually running this exact
    // check, not assumed). recentTelegraph()'s own window-expiry LOGIC is
    // already deterministically proven in tests/verify_touch.js against a
    // fully-controlled fake controller — this section's own job is only
    // proving the real wiring (a real telegraph really reaches a real
    // arm), which the check above already does.

    // Pause corner, dispatched as a real touch rather than a keyboard Escape.
    await cdp.sleep(200);
    const pausedBefore = await read(client, sid, 'window.CINDER_APP.paused');
    s.eq('not paused yet', pausedBefore, false);
    await cdp.touchStart(client, sid, [{ x: geom.cssW - 15, y: 15, id: 5 }]);
    await cdp.sleep(80);
    await cdp.touchEnd(client, sid, [{ x: geom.cssW - 15, y: 15, id: 5 }]);
    s.eq('tapping the pause corner with a real touch opens the menu',
      await read(client, sid, 'window.CINDER_APP.paused'), true);
    // Close it the same way, so emulation teardown below starts from a clean,
    // unpaused, un-held state.
    await cdp.touchStart(client, sid, [{ x: geom.cssW - 15, y: 15, id: 6 }]);
    await cdp.sleep(60);
    await cdp.touchEnd(client, sid, [{ x: geom.cssW - 15, y: 15, id: 6 }]);
    s.eq('tapping it again closes the menu', await read(client, sid, 'window.CINDER_APP.paused'), false);

    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false }, sid);
    await client.send('Emulation.clearDeviceMetricsOverride', {}, sid);
    await cdp.sleep(280);
    s.eq('reverting emulation returns app.touch() to false',
      await read(client, sid, 'window.CINDER_APP.touch()'), false);

    /* ------------------------------------------------------ no errors */
    s.eq('zero console errors across pause, resize, persistence, and PWA/touch checks', errors.length, 0);
    if (errors.length) for (const e of errors) console.log('        - ' + e);
  } finally {
    if (client) client.close();
    // Tree-kill, not proc.kill() — Chrome spawns its own GPU/renderer
    // helpers as further children; a plain kill only reaches the ONE pid
    // Node handed us and leaves the rest orphaned (see cdp.js's own
    // killTree comment for how this was actually found).
    cdp.killTree(proc);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }

  return s.done();
}

/* A throw mid-suite used to exit with one bare error line and zero visibility
 * into which of the assertions before it had already passed — the opposite
 * of useful when the browser itself is what is misbehaving. s.done() now
 * always prints whatever was recorded before the throw, and the crash is
 * reported as one more failing line rather than replacing the report. */
main().then((code) => process.exit(code)).catch((err) => {
  s.ok('the suite ran to completion without throwing', false, err.stack || err.message);
  s.done();
  process.exit(1);
});
