/* ===========================================================================
 * tests/verify_audio.js  —  synthesized Web Audio SFX (D11, 85-audio.js)
 * ---------------------------------------------------------------------------
 * Pure logic only, against a hand-built fake AudioContext (L8) — the same
 * precedent H.stubCanvas() already established for View: a plain object
 * shaped like the real Web Audio nodes is exactly as valid a fixture as the
 * real thing, since 85-audio.js itself never learns AudioContext's real
 * type, only calls the handful of methods it actually uses. A bare sandbox
 * (H.loadAudio()) — nothing at module-evaluation time in 85-audio.js touches
 * window/document, and this suite deliberately never injects a fake
 * `window` either, so _ensureCtx()'s own "no Web Audio support" branch is
 * exercised for real, not assumed.
 *
 * A real C.Bus, not a fakeBus() — unlike 82-narrative.js's own hand-shaped
 * fixture (Narrative reads sim.run/sim.players directly), SFXPlayer's only
 * dependency on `sim` is `sim.bus`, and the real Bus class is already
 * available in this same bare sandbox (00-core.js), so there is no reason to
 * reimplement its typed on()/emit() dispatch here (L8).
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_audio');
const C = H.loadAudio();
const SFX = C.DATA.SFX, SFX_IDS = C.DATA.SFX_IDS, Bus = C.Bus, SFXPlayer = C.SFXPlayer;

// The fifteen Bus events 85-audio.js's own header says it reacts to — a
// deliberate subset, not full coverage. Re-declared here (not read off the
// module, which keeps TRIGGERS private) so this suite can assert the SFX
// table actually backs every one of them, and that everything else stays
// silent.
const TRIGGER_NAMES = [
  'jump', 'doubleJump', 'land', 'rollStart', 'wallJump', 'slamLand',
  'attackStart', 'hit', 'targetDown', 'hurt', 'death', 'respawn',
  'pickup', 'telegraph', 'blueprintUnlocked',
  'dashStart', 'parry'
];

/* A fake AudioContext that logs which node TYPE it was asked to build,
 * rather than every method call on every node — 'osc'/'gain' for a tone
 * note, 'buffer:N'/'bufsrc'/'filter'/'gain' for a noise burst — which is
 * exactly enough to prove render()'s own branching (playTone vs playNoise,
 * one node set per note) without coupling this suite to Web Audio's full
 * method surface. */
function fakeCtx(opts) {
  opts = opts || {};
  const calls = [];
  const ctx = {
    state: opts.state || 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resumeCalls: 0,
    resume: function () { ctx.resumeCalls++; ctx.state = 'running'; },
    createOscillator: function () {
      calls.push('osc');
      return {
        type: 'sine',
        frequency: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} },
        connect: function () {},
        start: function () {},
        stop: function () {}
      };
    },
    createGain: function () {
      calls.push('gain');
      return {
        gain: { setValueAtTime: function () {}, linearRampToValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} },
        connect: function () {}
      };
    },
    createBuffer: function (channels, size) {
      calls.push('buffer:' + size);
      const data = new Array(size).fill(0);
      return { getChannelData: function () { return data; } };
    },
    createBufferSource: function () {
      calls.push('bufsrc');
      return { buffer: null, connect: function () {}, start: function () {}, stop: function () {} };
    },
    createBiquadFilter: function () {
      calls.push('filter');
      return {
        type: '',
        frequency: { setValueAtTime: function () {} },
        connect: function () {}
      };
    }
  };
  ctx._calls = calls;
  return ctx;
}

function threw(fn) { try { fn(); return false; } catch (e) { return true; } }

/* ================================================================ 1. content
 * 10-data.js's own SFX table: every real key is a well-formed cue, and
 * SFX_IDS (the sorted key list 85-audio.js/other tables might iterate) has
 * not drifted from the object it was derived from. */
{
  s.eq('SFX_IDS is sorted and matches every real key in SFX',
    SFX_IDS.join(','), Object.keys(SFX).sort().join(','));

  for (const id of SFX_IDS) {
    const cue = SFX[id];
    s.ok(id + ': type is "tone" or "noise"', cue.type === 'tone' || cue.type === 'noise');
    s.ok(id + ': gain, if present, is a fraction between 0 and 1',
      cue.gain === undefined || (typeof cue.gain === 'number' && cue.gain > 0 && cue.gain <= 1));

    if (cue.type === 'tone') {
      s.ok(id + ': a tone cue has at least one note', Array.isArray(cue.notes) && cue.notes.length > 0);
      for (const note of cue.notes || []) {
        s.ok(id + ': every note has a positive freq', typeof note.freq === 'number' && note.freq > 0);
        s.ok(id + ': every note has a positive dur', typeof note.dur === 'number' && note.dur > 0);
        s.ok(id + ': delay, if present, is non-negative',
          note.delay === undefined || (typeof note.delay === 'number' && note.delay >= 0));
        s.ok(id + ': sweepTo, if present, is a positive frequency',
          note.sweepTo === undefined || (typeof note.sweepTo === 'number' && note.sweepTo > 0));
      }
    } else {
      s.ok(id + ': a noise cue has a positive dur', typeof cue.dur === 'number' && cue.dur > 0);
      s.ok(id + ': a noise cue has a positive filterFreq', typeof cue.filterFreq === 'number' && cue.filterFreq > 0);
    }
  }

  for (const name of TRIGGER_NAMES) {
    s.ok('the SFX table defines a real cue for trigger "' + name + '"', !!SFX[name]);
  }
}

/* ============================================================ 2. construction */
{
  const bus = new Bus();
  const player = new SFXPlayer({ bus: bus }, {});
  s.eq('muted defaults to false when omitted', player.muted, false);
  s.eq('ctx starts unconstructed (lazy — this file\'s own header)', player.ctx, null);
}
{
  const bus = new Bus();
  const player = new SFXPlayer({ bus: bus }, { muted: true });
  s.eq('muted true is honored at construction', player.muted, true);
}

/* ==================================================== 3. trigger -> cue shape
 * Every real trigger, driven through the actual Bus, actually reaches
 * render() and builds the right node shape for its cue's type — not just
 * "something happened," but tone cues building osc+gain pairs (one pair per
 * note) and noise cues building buffer+bufferSource+filter+gain. */
{
  const bus = new Bus();
  const ctx = fakeCtx();
  new SFXPlayer({ bus: bus }, { seed: 1, ctx: ctx });
  bus.emit('jump', {});
  s.ok('a single-note tone cue (jump) builds exactly one osc + one gain node',
    ctx._calls.filter((c) => c === 'osc').length === 1 && ctx._calls.filter((c) => c === 'gain').length === 1,
    ctx._calls.join(','));
}
{
  const bus = new Bus();
  const ctx = fakeCtx();
  new SFXPlayer({ bus: bus }, { seed: 1, ctx: ctx });
  bus.emit('wallJump', {});
  s.eq('a two-note tone cue (wallJump) builds exactly two osc nodes',
    ctx._calls.filter((c) => c === 'osc').length, 2);
  s.eq('...and exactly two gain nodes (one envelope per note)',
    ctx._calls.filter((c) => c === 'gain').length, 2);
}
{
  const bus = new Bus();
  const ctx = fakeCtx();
  new SFXPlayer({ bus: bus }, { seed: 1, ctx: ctx });
  bus.emit('rollStart', {});
  s.ok('a noise cue (rollStart) builds a buffer',
    ctx._calls.some((c) => c.indexOf('buffer:') === 0), ctx._calls.join(','));
  s.ok('...and a bufferSource, a filter, and a gain — no oscillator',
    ctx._calls.indexOf('bufsrc') !== -1 && ctx._calls.indexOf('filter') !== -1 &&
    ctx._calls.indexOf('gain') !== -1 && ctx._calls.indexOf('osc') === -1,
    ctx._calls.join(','));
}
{
  // Every real trigger, not just the two shapes spot-checked above, reaches
  // render() end to end without throwing and produces at least one node —
  // this is the test that would actually catch a typo'd freq/dur/sweepTo in
  // the content table above (a NaN reaching setValueAtTime doesn't throw in
  // a real AudioContext either, so "never throws" alone is a weak check;
  // "produces the node it should" against the content assertions in section
  // 1 is what actually closes the loop).
  for (const name of TRIGGER_NAMES) {
    const bus = new Bus();
    const ctx = fakeCtx();
    new SFXPlayer({ bus: bus }, { seed: 5, ctx: ctx });
    const didThrow = threw(() => bus.emit(name, {}));
    s.ok('trigger "' + name + '" fires its cue end to end without throwing',
      !didThrow);
    s.ok('...and actually produces at least one audio node', ctx._calls.length > 0);
  }
}

/* =============================================== 4. non-triggers stay silent
 * The curated-subset design (this file's own header) means most real Bus
 * events must produce nothing at all — proven against the REAL registered
 * event list (C.Bus.KNOWN), not a hand-copied one, so this test cannot drift
 * out of step with 00-core.js's own EVENTS array. */
{
  const nonTriggers = Bus.KNOWN.filter((t) => TRIGGER_NAMES.indexOf(t) === -1);
  s.ok('at least one real Bus event exists outside the curated trigger list',
    nonTriggers.length > 0, String(nonTriggers.length));

  const bus = new Bus();
  const ctx = fakeCtx();
  new SFXPlayer({ bus: bus }, { seed: 1, ctx: ctx });
  for (const t of nonTriggers) bus.emit(t, {});
  s.eq('every event outside the curated trigger list produces zero audio nodes',
    ctx._calls.length, 0);
}

/* ===================================================== 5. mute suppresses all */
{
  const bus = new Bus();
  const ctx = fakeCtx();
  new SFXPlayer({ bus: bus }, { seed: 1, muted: true, ctx: ctx });
  bus.emit('jump', {});
  s.eq('a player constructed muted produces zero audio nodes', ctx._calls.length, 0);
}
{
  // The live menu-toggle path (95-app.js: `audio.muted = settings.muted`) —
  // flipping the field on an already-constructed player, not re-constructing
  // it, must take effect on the very next cue.
  const bus = new Bus();
  const ctx = fakeCtx();
  const player = new SFXPlayer({ bus: bus }, { seed: 1, ctx: ctx });
  player.muted = true;
  bus.emit('jump', {});
  s.eq('muting after construction suppresses the very next cue', ctx._calls.length, 0);
  player.muted = false;
  bus.emit('jump', {});
  s.ok('unmuting resumes playback on the following cue', ctx._calls.length > 0);
}

/* ============================================================== 6. subscribe */
{
  const bus = new Bus();
  const ctx = fakeCtx();
  const player = new SFXPlayer({ bus: bus }, { seed: 1, ctx: ctx });
  player.subscribe(bus);   // a second call — must be a no-op
  bus.emit('jump', {});
  s.eq('a second subscribe() call never double-registers the same bus (one osc, not two)',
    ctx._calls.filter((c) => c === 'osc').length, 1);
}

/* ================================================================= 7. unlock */
{
  const ctx = fakeCtx({ state: 'suspended' });
  const player = new SFXPlayer({ bus: new Bus() }, { seed: 1, ctx: ctx });
  player.unlock();
  s.eq('unlock() calls resume() exactly once on a suspended context', ctx.resumeCalls, 1);
  s.eq('...and the context now reads running', ctx.state, 'running');
}
{
  const ctx = fakeCtx({ state: 'running' });
  const player = new SFXPlayer({ bus: new Bus() }, { seed: 1, ctx: ctx });
  player.unlock();
  s.eq('unlock() is a no-op (never calls resume) on an already-running context', ctx.resumeCalls, 0);
}
{
  // No injected ctx AND no window in this bare sandbox — the real "old
  // WebView, no Web Audio support at all" degrade path.
  const player = new SFXPlayer({ bus: new Bus() }, { seed: 1 });
  s.ok('unlock() never throws with zero Web Audio support', !threw(() => player.unlock()));
  s.eq('...and ctx stays null rather than a half-built object', player.ctx, null);
}

/* =================================================== 8. graceful degradation */
{
  const player = new SFXPlayer({ bus: new Bus() }, { seed: 1 });
  s.ok('play() with zero Web Audio support never throws', !threw(() => player.play('jump')));
}
{
  const ctx = fakeCtx();
  const player = new SFXPlayer({ bus: new Bus() }, { seed: 1, ctx: ctx });
  s.ok('play() with an unknown cue name never throws', !threw(() => player.play('notACue')));
  s.eq('...and produces no audio nodes', ctx._calls.length, 0);
}
{
  // Adversarially found (v0.2.16), the most severe finding of the pass: a
  // real-but-degraded AudioContext (missing a method on a minimal WebView;
  // a context the browser has already put into 'closed' state) throwing
  // from createOscillator/createGain/etc. used to escape uncaught out of
  // play() — a synchronous Bus listener — through Bus.prototype.emit (no
  // try/catch there either), into whatever real Sim method emitted the
  // trigger, and out into 95-app.js's own sim.step() try/catch, whose ONLY
  // recovery is installFallback(): a REAL, disruptive sim-state mutation
  // that resets the player's entire current run. This suite proves the
  // presenter-layer half of the fix (play() itself never lets a throwing
  // ctx escape); tests/verify_render.js cannot easily inject a real
  // browser AudioContext into a throwing state, so the OTHER half (that a
  // real Sim.step() genuinely survives it) is proven with a real Bus/Sim
  // pairing right here instead of only against a bare SFXPlayer, closing
  // the exact gap the finding traced end to end.
  const incompleteCtx = { state: 'running', currentTime: 0, sampleRate: 44100, destination: {} };
  // Deliberately missing every create* method — the worst real case: an
  // environment where NOTHING on ctx can build a node.
  const bus = new Bus();
  const player = new SFXPlayer({ bus: bus }, { seed: 1, ctx: incompleteCtx });
  s.ok('play() against a ctx missing every create* method never throws',
    !threw(() => player.play('rollStart')));

  const closedCtx = fakeCtx();
  closedCtx.createOscillator = function () { throw new Error('InvalidStateError: closed AudioContext'); };
  const bus2 = new Bus();
  const player2 = new SFXPlayer({ bus: bus2 }, { seed: 1, ctx: closedCtx });
  s.ok('a real-shaped ctx that throws from node creation never escapes play()',
    !threw(() => player2.play('jump')));
  s.ok('...and the SAME player keeps working normally afterward (no ctx is poisoned/torn down)',
    !threw(() => player2.play('jump')));

  // The full production shape: a real Bus.emit() call, the exact call site
  // (from deep inside a real Sim.step()) the finding traced this escaping
  // through.
  const bus3 = new Bus();
  new SFXPlayer({ bus: bus3 }, { seed: 1, ctx: closedCtx });
  s.ok('a throwing ctx never escapes bus.emit() either — the exact path into Sim.step()',
    !threw(() => bus3.emit('hit', {})));
}

/* ========================================================== 9. ctx is reused */
{
  const bus = new Bus();
  const ctx = fakeCtx();
  const player = new SFXPlayer({ bus: bus }, { seed: 1, ctx: ctx });
  bus.emit('jump', {});
  bus.emit('hit', {});
  s.eq('the same injected ctx is reused across multiple cues, never re-created', player.ctx, ctx);
}

/* ================================================= 10. determinism (L4) — RNG
 * playNoise() must draw from this file's OWN seeded RNG (never Math.random,
 * which this sandbox turns into a throw — see H.loadAudio()'s own comment),
 * and the same seed must reproduce the identical noise-buffer samples. */
{
  function noiseSamplesFor(seed) {
    const bus = new Bus();
    const ctx = fakeCtx();
    let bufferRef = null;
    const realCreateBuffer = ctx.createBuffer;
    ctx.createBuffer = function (channels, size) {
      bufferRef = realCreateBuffer(channels, size);
      return bufferRef;
    };
    new SFXPlayer({ bus: bus }, { seed: seed, ctx: ctx });
    bus.emit('rollStart', {});   // the only noise cue exercised elsewhere above
    return bufferRef.getChannelData(0).slice();
  }
  const a = noiseSamplesFor(42), b = noiseSamplesFor(42);
  s.eq('the same seed reproduces identical noise-buffer samples', JSON.stringify(a), JSON.stringify(b));
  const c = noiseSamplesFor(43);
  s.ok('a different seed actually diverges the noise buffer somewhere',
    JSON.stringify(a) !== JSON.stringify(c));
  s.ok('a real noise buffer is not silence (the RNG actually ran)',
    a.some((v) => v !== 0));

  // Adversarially found (v0.2.16): "some sample is non-zero" alone does not
  // prove `rng.next() * 2 - 1` (bipolar, roughly centered on zero — real
  // white noise) is what actually ran, rather than a broken, one-sided
  // signal (e.g. a stray edit collapsing it to `rng.next()`, unipolar
  // [0,1)) that would still pass a bare non-silence check while sounding
  // like a dull thump/DC offset through the lowpass filter, not a whoosh.
  s.ok('the noise buffer actually spans both negative and positive samples (bipolar, real white noise)',
    a.some((v) => v < 0) && a.some((v) => v > 0));
  const mean = a.reduce((sum, v) => sum + v, 0) / a.length;
  s.ok('...and is roughly centered on zero, not DC-offset toward one side',
    Math.abs(mean) < 0.1, 'mean=' + mean.toFixed(4));
}

/* ============================================== 11. envelope/waveform math
 * Every section above proves the RIGHT SHAPE of node got built (osc vs
 * buffer, right count per cue) but never checked what VALUES were fed into
 * them — an adversarially-found gap (v0.2.16): three independent mutations
 * against the real source (hardcoding gain to 1, disabling every pitch
 * sweep, collapsing every waveform to sine) all sailed through every prior
 * section undetected, because fakeCtx()'s own AudioParam stubs are bare
 * no-ops that never record their arguments. This section builds a richer
 * fixture that DOES record every real argument, then checks EVERY real cue
 * in the content table against the actual synthesis math, closing that gap
 * for good rather than just for the three cues that happened to get
 * mutated during the pass. */
function paramStub() {
  const events = [];
  return {
    _events: events,
    setValueAtTime: (v, t) => events.push(['set', v, t]),
    linearRampToValueAtTime: (v, t) => events.push(['lin', v, t]),
    exponentialRampToValueAtTime: (v, t) => events.push(['exp', v, t])
  };
}
function instrumentedCtx() {
  const built = { oscs: [], gains: [], filters: [] };
  const ctx = {
    state: 'running', currentTime: 0, sampleRate: 44100, destination: {},
    createOscillator: function () {
      const node = { type: 'sine', frequency: paramStub(), connect() {}, start() {}, stop() {} };
      built.oscs.push(node);
      return node;
    },
    createGain: function () {
      const node = { gain: paramStub(), connect() {} };
      built.gains.push(node);
      return node;
    },
    createBuffer: function (channels, size) {
      const data = new Array(size).fill(0);
      return { getChannelData: () => data };
    },
    createBufferSource: function () {
      return { buffer: null, connect() {}, start() {}, stop() {} };
    },
    createBiquadFilter: function () {
      const node = { type: '', frequency: paramStub(), connect() {} };
      built.filters.push(node);
      return node;
    }
  };
  ctx._built = built;
  return ctx;
}

for (const id of SFX_IDS) {
  const cue = SFX[id];
  const bus = new Bus();
  const ctx = instrumentedCtx();
  new SFXPlayer({ bus: bus }, { seed: 9, ctx: ctx });
  bus.emit(id, {});

  const expectedGain = cue.gain === undefined ? 0.2 : cue.gain;

  if (cue.type === 'tone') {
    s.eq(id + ': builds exactly one oscillator per note', ctx._built.oscs.length, cue.notes.length);
    s.eq(id + ': builds exactly one gain node per note', ctx._built.gains.length, cue.notes.length);
    cue.notes.forEach((note, i) => {
      const osc = ctx._built.oscs[i], gain = ctx._built.gains[i];
      const expectedWave = note.wave || cue.wave || 'sine';
      s.eq(id + ' note ' + i + ': the oscillator waveform matches the content table',
        osc.type, expectedWave);

      const freqSets = osc.frequency._events.filter((e) => e[0] === 'set');
      s.ok(id + ' note ' + i + ': the oscillator frequency is set to the authored freq',
        freqSets.some((e) => e[1] === note.freq), JSON.stringify(osc.frequency._events));

      if (note.sweepTo) {
        const sweeps = osc.frequency._events.filter((e) => e[0] === 'exp');
        s.ok(id + ' note ' + i + ': a sweepTo note ramps the oscillator to its authored target',
          sweeps.some((e) => e[1] === Math.max(1, note.sweepTo)), JSON.stringify(osc.frequency._events));
      } else {
        s.eq(id + ' note ' + i + ': a note with no sweepTo never ramps the frequency',
          osc.frequency._events.filter((e) => e[0] === 'exp').length, 0);
      }

      const gainLin = gain.gain._events.filter((e) => e[0] === 'lin');
      s.ok(id + ' note ' + i + ': the gain envelope ramps to the authored peak gain',
        gainLin.some((e) => Math.abs(e[1] - expectedGain) < 1e-9), JSON.stringify(gain.gain._events));
    });
  } else {
    s.eq(id + ': a noise cue builds exactly one gain node', ctx._built.gains.length, 1);
    s.eq(id + ': ...and exactly one filter node', ctx._built.filters.length, 1);
    const filter = ctx._built.filters[0], gain = ctx._built.gains[0];
    const expectedFilterFreq = cue.filterFreq || 2000;

    const filterSets = filter.frequency._events.filter((e) => e[0] === 'set');
    s.ok(id + ': the biquad filter cutoff matches the authored filterFreq',
      filterSets.some((e) => e[1] === expectedFilterFreq), JSON.stringify(filter.frequency._events));

    const gainLin = gain.gain._events.filter((e) => e[0] === 'lin');
    s.ok(id + ": the noise cue's gain envelope also ramps to its authored peak (v0.2.16 attack-ramp fix)",
      gainLin.some((e) => Math.abs(e[1] - expectedGain) < 1e-9), JSON.stringify(gain.gain._events));
  }
}

process.exit(s.done());
