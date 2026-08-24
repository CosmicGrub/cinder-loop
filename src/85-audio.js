/* ===========================================================================
 * 85-audio.js  —  synthesized Web Audio SFX (D11)
 * ---------------------------------------------------------------------------
 * PRESENTER layer, entirely — same boundary placement as 82-narrative.js and
 * for the identical reason: a sound effect has zero effect on sim state, so
 * it costs nothing in hash()/determinism, and this file never writes a
 * single field on Sim/Player/Enemy, only ever reads them via the Bus.
 *
 * D11's own scope for this file: "hang off the same trigger design" the
 * dialogue system already established, rather than invent a second one —
 * real Bus subscriptions, the identical "sim emits facts, presenter reacts"
 * shape 80-view.js's own `subscribe()` and 82-narrative.js's own
 * `subscribe()` both already use. Seventeen cues (10-data.js's own SFX
 * table; fifteen at D11, plus dashStart/parry for the abilities pass), a
 * deliberate subset of the Bus's full event list, not full
 * coverage — the scope this session chose (SFX only; no music/ambience —
 * a real, named simplification, the same asymmetric "hard to get right
 * without iterative listening" risk that kept flask charges/backpack slot
 * out of 65-meta.js).
 *
 * Two Web Audio primitives back every cue: a `tone` (one or more
 * oscillator + gain-envelope notes, optionally pitch-swept) and a `noise`
 * burst (a filtered buffer, for a whoosh a pitched oscillator can't
 * produce). Both are pure functions of the SAME AudioContext + the cue's
 * own data — no cue-specific code anywhere in this file, matching D7's
 * "content is data, adding content never means writing engine code" one
 * more time.
 *
 * Noise generation needs real randomness — and `Math.random()` is banned
 * in this file exactly as it is in 80-view.js/82-narrative.js
 * (verify_arch's own source scan: "the presenter gets its own generators,
 * but never Math.random — screenshots have to be comparable frame to
 * frame"). This file owns its own local seeded `RNG` instance for that,
 * never `sim.rng` — the identical reasoning 82-narrative.js's own header
 * already gives for why ITS line-picking RNG stays separate from the
 * sim's own stream (a presenter-side draw must never consume from a
 * resource gameplay determinism depends on).
 *
 * The AudioContext itself is lazily constructed — not at construction
 * time, but on first real use — for two independent reasons that happen
 * to want the same fix: (1) most browsers refuse to let an AudioContext
 * actually produce sound until a real user gesture unlocks it (the
 * "autoplay policy"), so building one eagerly at boot would just start
 * suspended anyway; (2) it makes this file trivially testable in a bare
 * Node sandbox (L8) — module-evaluation touches nothing, and a test can
 * inject a fake context shaped like the real one (opts.ctx), the same
 * "a hand-built fixture is exactly as valid as the real thing" precedent
 * `stubCanvas()` already established for View's own tests.
 *
 * Owned by: Audio team.
 * ======================================================================== */
;(function (C) {
'use strict';

var RNG = C.RNG, SFX = C.DATA.SFX;

function SFXPlayer(sim, opts) {
  opts = opts || {};
  this.rng = new RNG(opts.seed === undefined ? 1 : opts.seed);
  this.muted = !!opts.muted;
  // Injected for tests (a fake context shaped like the real one); real
  // production code never passes this and gets a lazily-constructed real
  // AudioContext instead, built on first actual use (see _ensureCtx()).
  this._injectedCtx = opts.ctx || null;
  this.ctx = null;
  this.subscribe(sim.bus);
}

/* The Bus events this file reacts to — a deliberate subset (see this
 * file's own header), not the full list. Event payload fields are never
 * read: every cue is a fixed, data-driven sound regardless of WHERE/WHO,
 * matching how a bark (82-narrative.js) only ever needs `e.tid`, not this
 * file's own concern at all — a sound doesn't need to know who jumped. */
var TRIGGERS = [
  'jump', 'doubleJump', 'land', 'rollStart', 'wallJump', 'slamLand',
  'attackStart', 'hit', 'targetDown', 'hurt', 'death', 'respawn',
  'pickup', 'telegraph', 'blueprintUnlocked',
  // Abilities spec §6: "a dash whoosh and a parry clang." dashEnd gets no
  // cue of its own, the same as rollEnd's own precedent (not in this list
  // either) — only the START of a committed burst reads as a real,
  // distinct moment worth a sound.
  'dashStart', 'parry'
];

// Adversarially found (v0.2.16): the idempotency guard used to be keyed
// purely on "have I ever subscribed", not "am I already subscribed to
// THIS bus" — a second call against a genuinely DIFFERENT Bus instance
// silently wired nothing at all, with no error, while still returning
// `this` as if it had succeeded. A single SFXPlayer is constructed once
// per real Sim/Bus for the whole process (95-app.js's own boot(), never
// re-subscribed to a different bus anywhere in production), so
// re-subscribing to a genuinely new bus is never something real code
// needs to succeed at. Failing loudly on that case, rather than silently
// no-op'ing, matches this codebase's own stated preference
// (installFallback()'s own header names the same lesson) — the SAME-bus
// case (this file's own regression test, and any re-entrant construction
// path) still returns cleanly, unchanged.
SFXPlayer.prototype.subscribe = function (bus) {
  if (this._subscribed) {
    if (bus !== this._bus) throw new Error('SFXPlayer.subscribe: already subscribed to a different bus');
    return this;
  }
  this._subscribed = true;
  this._bus = bus;
  var self = this, i;
  function on(name) { bus.on(name, function () { self.play(name); }); }
  for (i = 0; i < TRIGGERS.length; i++) on(TRIGGERS[i]);
  return this;
};

// Constructed lazily, and only ever once — see this file's own header for
// why. Returns null (never throws) if no Web Audio support exists at all
// (an old WebView, a locked-down browser) — this feature degrades
// silently, the same "never crash the game over an optional layer"
// instinct touch/gamepad support already follow.
SFXPlayer.prototype._ensureCtx = function () {
  if (this.ctx) return this.ctx;
  if (this._injectedCtx) { this.ctx = this._injectedCtx; return this.ctx; }
  var Ctor = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
  if (!Ctor) return null;
  this.ctx = new Ctor();
  return this.ctx;
};

// Call from a REAL user-gesture handler (95-app.js's own existing keydown/
// touchstart listeners — the same real entry points already there, not a
// new one invented for this). Idempotent: safe to call on every gesture,
// not just the first, since resume() on an already-running context is a
// harmless no-op.
//
// Wrapped in try/catch — adversarially found (v0.2.16): unlock() is called
// directly from a real DOM listener (95-app.js), which has none of its
// own. A construction failure or a resume() that itself throws on some
// non-conforming real browser must degrade to silence, matching the "no
// Web Audio support at all" branch this file already treats as safe to
// swallow, not surface as an uncaught listener error.
SFXPlayer.prototype.unlock = function () {
  try {
    var ctx = this._ensureCtx();
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume();
  } catch (e) { /* an optional layer degrading to silence, not a crash */ }
  return this;
};

// Wrapped in try/catch — adversarially found (v0.2.16): a real-but-degraded
// AudioContext (a missing method on a minimal WebView, a context the
// browser has already put into 'closed' state) throwing from
// createOscillator/createGain/createBufferSource/createBiquadFilter used
// to escape this synchronous Bus listener uncaught — Bus.prototype.emit
// (00-core.js) has no try/catch around listener dispatch either — out of
// whichever real Sim method emitted the trigger, and into 95-app.js's own
// sim.step() try/catch, whose ONLY recovery is installFallback(): a REAL,
// disruptive sim-state mutation that resets the player's entire current
// run. A presenter-only, optional subsystem must never be able to force
// that. Caught here so a broken AudioContext degrades to silence, exactly
// like the "no Web Audio support at all" branch already does, never a
// lost run.
SFXPlayer.prototype.play = function (name) {
  if (this.muted) return this;
  var cue = SFX[name];
  if (!cue) return this;
  try {
    var ctx = this._ensureCtx();
    if (!ctx) return this;
    render(ctx, this.rng, cue);
  } catch (e) { /* an optional layer degrading to silence, not a crash */ }
  return this;
};

function render(ctx, rng, cue) {
  var now = ctx.currentTime;
  if (cue.type === 'noise') { playNoise(ctx, rng, now, cue); return; }
  var notes = cue.notes || [], i;
  for (i = 0; i < notes.length; i++) playTone(ctx, now, cue, notes[i]);
}

// One oscillator + one linear-attack/exponential-decay gain envelope per
// note — a real ADSR would be more expressive, but nothing here needs a
// sustain phase (every cue is a short, percussive or chime-like hit, never
// a held tone), so attack+decay alone is the honest shape, not a
// simplified stand-in for something this file actually needs.
function playTone(ctx, now, cue, note) {
  var start = now + (note.delay || 0);
  var dur = note.dur || 0.1;

  var osc = ctx.createOscillator();
  osc.type = note.wave || cue.wave || 'sine';
  osc.frequency.setValueAtTime(note.freq, start);
  if (note.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, note.sweepTo), start + dur);

  var gainNode = ctx.createGain();
  var peak = cue.gain === undefined ? 0.2 : cue.gain;
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.linearRampToValueAtTime(peak, start + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// A filtered noise burst — genuinely a different timbre from any pitched
// oscillator, which is the whole reason this exists as a second primitive
// rather than a 'tone' cue with an unusual waveform. The buffer's own
// samples come from this file's own seeded RNG (this.rng, threaded in by
// the caller), never Math.random() — see this file's own header.
function playNoise(ctx, rng, now, cue) {
  var dur = cue.dur || 0.15;
  var size = Math.max(1, Math.floor(ctx.sampleRate * dur));
  var buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  var data = buffer.getChannelData(0);
  var i;
  for (i = 0; i < size; i++) data[i] = rng.next() * 2 - 1;

  var src = ctx.createBufferSource();
  src.buffer = buffer;
  var filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cue.filterFreq || 2000, now);

  var gainNode = ctx.createGain();
  var peak = cue.gain === undefined ? 0.2 : cue.gain;
  // Adversarially found (v0.2.16): this used to jump straight to `peak` at
  // sample 0 — unlike playTone()'s own envelope, which always ramps up
  // over ~5ms before its decay. A noise buffer's first sample is a random
  // value near the full [-1,1] range (never naturally near zero the way a
  // sine/triangle oscillator's first sample is), so starting at full gain
  // is exactly the step discontinuity an attack ramp exists to avoid — the
  // asymmetry looked like an oversight, not a deliberate synthesis choice
  // (nothing here ever said an instant onset was intentional). Given the
  // same short linear attack playTone() already uses, so every cue in the
  // table shares one anti-click envelope shape, not two.
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.linearRampToValueAtTime(peak, now + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  src.start(now);
  src.stop(now + dur + 0.02);
}

C.SFXPlayer = SFXPlayer;

})(CINDER);
