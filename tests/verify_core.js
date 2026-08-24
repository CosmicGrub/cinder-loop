/* ===========================================================================
 * tests/verify_core.js  —  RNG · Bus · World · CFG · sim determinism
 * ---------------------------------------------------------------------------
 * The foundations. If any of this is wrong, every number the other suites
 * measure is measuring the wrong thing.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_core');

const C = H.loadSim();
const { RNG, Bus, World, CFG, TILE } = C;

/* ------------------------------------------------------------------ RNG */
{
  const a = new RNG(12345), b = new RNG(12345);
  const seqA = [], seqB = [];
  for (let i = 0; i < 500; i++) { seqA.push(a.next()); seqB.push(b.next()); }
  s.ok('rng same seed same stream', seqA.join(',') === seqB.join(','), '500 draws');

  const c = new RNG(12346);
  const seqC = [];
  for (let i = 0; i < 500; i++) seqC.push(c.next());
  s.ok('rng different seed diverges', seqA.join(',') !== seqC.join(','));

  // Per-instance state (L4): drawing from one must not advance the other.
  const d = new RNG(7), e = new RNG(7);
  d.next(); d.next(); d.next();
  s.ok('rng instances independent', e.next() === new RNG(7).next());

  const f = new RNG(99);
  f.next(); f.next();
  const snap = f.snapshot();
  const after = [f.next(), f.next(), f.next()];
  f.restore(snap);
  s.ok('rng snapshot restores stream', [f.next(), f.next(), f.next()].join() === after.join());

  const g = new RNG(4242);
  let lo = Infinity, hi = -Infinity, nan = false;
  for (let i = 0; i < 20000; i++) {
    const v = g.next();
    if (Number.isNaN(v)) nan = true;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  s.ok('rng in [0,1)', lo >= 0 && hi < 1, 'min ' + lo.toFixed(5) + ' max ' + hi.toFixed(5));
  s.ok('rng never NaN', !nan, '20000 draws');
  s.ok('rng spans the range', lo < 0.01 && hi > 0.99);

  const i2 = new RNG(5);
  let intOk = true;
  for (let i = 0; i < 5000; i++) { const v = i2.int(6); if (v < 0 || v > 5 || v !== (v | 0)) intOk = false; }
  s.ok('rng.int(n) in [0,n)', intOk);

  const i3 = new RNG(6);
  let rangeOk = true;
  for (let i = 0; i < 5000; i++) { const v = i3.range(-2, 8); if (v < -2 || v >= 8) rangeOk = false; }
  s.ok('rng.range(a,b) in [a,b)', rangeOk);

  const i4 = new RNG(8);
  const src = ['a', 'b', 'c'];
  let pickOk = true;
  for (let i = 0; i < 500; i++) if (src.indexOf(i4.pick(src)) === -1) pickOk = false;
  s.ok('rng.pick stays in array', pickOk);
}

/* ------------------------------------------------------------------ Bus */
{
  const bus = new Bus();
  let got = null;
  bus.on('jump', (p) => { got = p; });
  bus.emit('jump', { id: 3 });
  s.eq('bus delivers payload', got && got.id, 3);

  s.throws('bus.emit rejects unknown type', () => bus.emit('nope', {}));
  s.throws('bus.on rejects unknown type', () => bus.on('nope', () => {}));

  let n = 0;
  const fn = () => { n++; };
  bus.on('land', fn);
  bus.emit('land', {});
  s.eq('bus.off removes listener', (bus.off('land', fn), bus.emit('land', {}), n), 1);
  s.ok('bus.off reports miss', bus.off('land', fn) === false);

  // Two buses must not share listeners; a leak here would make co-op players
  // hear each other's events.
  const busA = new Bus(), busB = new Bus();
  let aHits = 0;
  busA.on('hurt', () => { aHits++; });
  busB.emit('hurt', {});
  s.eq('bus instances isolated', aHits, 0);

  // A listener may unsubscribe itself mid-emit without corrupting iteration.
  const bus2 = new Bus();
  let calls = 0;
  const self = () => { calls++; bus2.off('step', self); };
  bus2.on('step', self);
  bus2.on('step', () => { calls++; });
  bus2.emit('step', {});
  s.eq('listener may unsubscribe itself', calls, 2);
  bus2.emit('step', {});
  s.eq('unsubscribe took effect', calls, 3);

  const bus3 = new Bus();
  bus3.emit('jump', {});
  bus3.emit('land', {});
  s.eq('frame log records emissions', bus3.frame.length, 2);
  bus3.beginFrame();
  s.eq('beginFrame clears frame log', bus3.frame.length, 0);
  s.eq('lifetime counter survives frames', bus3.emitted, 2);

  s.ok('every known event is emittable', C.Bus.KNOWN.every((t) => {
    try { new Bus().emit(t, {}); return true; } catch (e) { return false; }
  }), C.Bus.KNOWN.length + ' types');
}

/* ---------------------------------------------------------------- World */
{
  const w = new World(10, 8);
  w.set(3, 4, TILE.SOLID);
  s.eq('world get/set round trip', w.get(3, 4), TILE.SOLID);
  s.eq('world empty by default', w.get(0, 0), TILE.EMPTY);

  s.eq('out of bounds left is solid', w.get(-1, 4), TILE.SOLID);
  s.eq('out of bounds right is solid', w.get(10, 4), TILE.SOLID);
  s.eq('out of bounds below is solid', w.get(3, 8), TILE.SOLID);
  s.eq('above the map is open sky', w.get(3, -1), TILE.EMPTY);

  w.set(1, 1, TILE.ONEWAY);
  w.set(2, 2, TILE.HAZARD);
  s.ok('isSolid / isOneWay / isHazard agree',
    w.isSolid(3, 4) && w.isOneWay(1, 1) && w.isHazard(2, 2) && !w.isSolid(1, 1));

  s.eq('tileX floors toward -inf', w.tileX(-3), -1);
  s.eq('tileY floors toward -inf', w.tileY(-0.5), -1);
  s.eq('tileX at boundary', w.tileX(16), 1);

  // The half-open span. A 16px box flush at x=16 covers tile 1 and nothing
  // else; if it grabbed tile 2 every wall would snag.
  const sp = w.span(16, 0, 16, 16);
  s.ok('span is half open', sp.x0 === 1 && sp.x1 === 1, 'x0 ' + sp.x0 + ' x1 ' + sp.x1);
  const sp2 = w.span(15, 0, 16, 16);
  s.ok('span crosses when it should', sp2.x0 === 0 && sp2.x1 === 1);

  s.ok('rectSolid finds a tile', w.rectSolid(3 * 16, 4 * 16, 16, 16));
  s.ok('rectSolid misses empty space', !w.rectSolid(5 * 16, 0, 16, 16));
  s.ok('rectHazard finds a hazard', w.rectHazard(2 * 16, 2 * 16, 16, 16));

  const rows = [
    '##########',
    '#..-...^.#',
    '#........#',
    '##########'
  ];
  const parsed = World.fromRows(rows);
  s.ok('world text round trip', parsed.toRows().join('\n') === rows.join('\n'));
  s.eq('glyph - is one-way', parsed.get(3, 1), TILE.ONEWAY);
  s.eq('glyph ^ is hazard', parsed.get(7, 1), TILE.HAZARD);
}

/* ------------------------------------------------------------------ CFG */
{
  s.eq('tick is 1/60', CFG.DT, 1 / 60);
  s.eq('tick hz is 60', CFG.TICK_HZ, 60);
  s.ok('dt and hz agree', Math.abs(CFG.DT * CFG.TICK_HZ - 1) < 1e-12);

  const positive = ['TILE', 'PLAYER_W', 'PLAYER_H', 'RUN_SPEED', 'GRAVITY',
    'MAX_FALL', 'ROLL_FRAMES', 'ROLL_SPEED', 'ROLL_COOLDOWN_FRAMES',
    'COYOTE_FRAMES', 'JUMP_BUFFER_FRAMES', 'PENDING_FRAMES', 'MAX_HP', 'MAX_STEP'];
  s.ok('all sizing tunables positive', positive.every((k) => CFG[k] > 0));
  s.ok('jump velocity is upward', CFG.JUMP_VEL < 0 && CFG.DOUBLE_JUMP_VEL < 0);
  s.ok('crouch is shorter than standing', CFG.PLAYER_CROUCH_H < CFG.PLAYER_H);
  s.ok('crouch clears one tile', CFG.PLAYER_CROUCH_H <= CFG.TILE);
  s.ok('standing does not clear one tile', CFG.PLAYER_H > CFG.TILE);
  s.ok('sub-step is smaller than a tile', CFG.MAX_STEP < CFG.TILE);
  s.ok('slam outruns terminal fall', CFG.SLAM_VEL > CFG.MAX_FALL);
  s.ok('jump cut is a fraction', CFG.JUMP_CUT > 0 && CFG.JUMP_CUT < 1);
}

/* ------------------------------------------------------ sim determinism */
{
  // Same seed, same scripted input, 600 ticks: byte-identical state.
  const script = (t) => ({
    right: (t % 90) < 55,
    jump: t % 37 === 0,
    roll: t % 53 === 0,
    down: (t % 120) > 108
  });

  function run(seed) {
    const a = H.scenario({ seed });
    for (let t = 0; t < 600; t++) {
      const k = script(t);
      a.pad().set('right', k.right).set('jump', k.jump).set('roll', k.roll).set('down', k.down);
      a.sim.step();
    }
    return a;
  }

  const r1 = run(1), r2 = run(1);
  s.ok('sim is deterministic', r1.sim.hash() === r2.sim.hash(), '600 ticks, seed 1');
  s.ok('determinism run was not trivial', r1.sim.tick === 600 && r1.log.length > 0,
    r1.log.length + ' events');
  s.ok('player actually moved', Math.abs(r1.b().x - 80) > 40, 'x ' + Math.round(r1.b().x));

  const fresh = H.scenario({ seed: 1 });
  const dirty = run(1);
  dirty.sim.resetTransient();
  s.ok('resetTransient equals a fresh sim', dirty.sim.hash() === fresh.sim.hash());
}

process.exit(s.done());
