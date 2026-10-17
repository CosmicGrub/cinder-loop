/* ===========================================================================
 * tests/verify_hash.js  —  Sim.prototype.hash() covers every piece of live
 *                          state, or says in writing why it does not
 * ---------------------------------------------------------------------------
 * hash() is a hand-maintained field list, ~120 lines long, in a different file
 * from every class whose state it fingerprints. That structure has already
 * produced a real gap once (D16's Enemy.summonsUsed, caught only by a
 * dedicated adversarial pass, not by any standing test), and the first run of
 * THIS suite found eleven more un-hashed fields: enemy patrol heading
 * (wander), per-swing hit list (hits) and wall contact (onWall), the boss's
 * stamped vent tiles (_zoneTiles), the once-per-room checkpoint latch, the
 * three ledge-hang anchors, D17's roll wall-leniency flag and departure row,
 * and a consumed shot's `done` flag.
 *
 * The method is behavioural, not a second copy of the list (L8): for every
 * own field of a live Player, Enemy, Boss, Caller, Shot, pickup, dummy and the
 * Sim itself, perturb the value and ask the REAL hash() whether it noticed.
 *
 *   - a primitive field the hash ignores must carry a written reason in the
 *     rules tables below (a construction constant, a same-tick signal, a
 *     write-only field...). No reason = a failing line naming the field.
 *   - an exemption whose field IS in fact hashed is also a failure, so
 *     exemptions cannot rot into a lie after someone later hashes the field.
 *   - arrays, null-able objects and class instances cannot be perturbed
 *     generically, so each needs either a mutator that proves the hash
 *     notices it, or a written reason.
 *
 * The practical effect: adding `this.buffs = 0` to Player now fails THIS suite
 * in the same commit, with a message naming the field and the two ways out
 * (hash it in 70-sim.js, or document why it cannot matter), instead of waiting
 * for a human to remember a file 1400 lines away.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_hash');

/* ----------------------------------------------------------------- engine */
function isPrim(v) { return typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string'; }
// The sim runs in a vm sandbox, so its objects' constructors are not this
// realm's Object — compare by name.
function isPlain(v) {
  const pr = Object.getPrototypeOf(v);
  return pr === null || (pr.constructor && pr.constructor.name === 'Object');
}
function bump(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v + 1 : 0;
  if (typeof v === 'boolean') return !v;
  return v + 'x';
}
function hashChangesWhen(sim, mutate) {
  const before = sim.hash();
  const undo = mutate();
  let after;
  try { after = sim.hash(); } finally { undo(); }
  return before !== after;
}

/* rules: { 'dotted.path': 'reason' | (obj) => undo }.  A string documents why
 * a field may be absent from hash(); a function mutates the field in place,
 * returns its undo, and must make hash() change. Fields with no rule must be
 * primitives (perturbed automatically) or plain objects (recursed into). */
function audit(sim, label, obj, rules, out, path) {
  path = path || '';
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'function') continue;
    const full = path + k;
    const rule = rules[full];
    out.fields++;

    if (typeof rule === 'string') {
      if (isPrim(v) && hashChangesWhen(sim, () => { obj[k] = bump(v); return () => { obj[k] = v; }; })) {
        out.problems.push(label + '.' + full + ' is exempted ("' + rule.slice(0, 40) + '...") but IS hashed: delete the stale exemption');
      }
      continue;
    }
    if (typeof rule === 'function') {
      if (!hashChangesWhen(sim, () => rule(obj))) {
        out.problems.push(label + '.' + full + ': its mutator did not change hash()');
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && isPlain(v)) audit(sim, label, v, rules, out, full + '.');
      continue;
    }
    if (isPrim(v)) {
      if (!hashChangesWhen(sim, () => { obj[k] = bump(v); return () => { obj[k] = v; }; })) {
        out.problems.push(label + '.' + full + ': UNHASHED (' + typeof v + ' ' + JSON.stringify(v) + ')');
      }
    } else if (v && typeof v === 'object' && !Array.isArray(v) && isPlain(v)) {
      audit(sim, label, v, rules, out, full + '.');
    } else {
      const kind = v === null ? 'null' : Array.isArray(v) ? 'array' : 'object:' + (v.constructor && v.constructor.name);
      out.problems.push(label + '.' + full + ': ' + kind + ' field with NO hash decision');
    }
  }
}

function run(sim, label, obj, rules, minFields) {
  const out = { fields: 0, problems: [] };
  audit(sim, label, obj, rules, out);
  s.eq(label + ': every field is hashed or exempted with a reason', out.problems.join(' | '), '');
  s.ok(label + ': the audit actually examined fields (not vacuous)', out.fields >= minFields,
    out.fields + ' fields, floor ' + minFields);
  return out;
}

/* ----------------------------------------------------------- mutators */
const setTo = (key, value) => (obj) => { const old = obj[key]; obj[key] = value; return () => { obj[key] = old; }; };
const pushOnto = (key, value) => (obj) => { obj[key].push(value); return () => { obj[key].pop(); }; };
const bumpNested = (key, sub) => (obj) => { const old = obj[key][sub]; obj[key][sub] = old + 1; return () => { obj[key][sub] = old; }; };

/* ------------------------------------------------------------------ rules */
const CONST_SPAWN = 'construction constant';
const POSE = 'the box the rig poses were authored in, assigned once at construction';

const PLAYER = {
  spawnX: CONST_SPAWN, spawnY: CONST_SPAWN,
  rollFrom: 'feeds only the dist field of the rollEnd event payload',
  dashFrom: 'feeds only the dist field of the dashEnd event payload',
  slamLanded: 'one-tick signal: set in Player.update, read and cleared by Combat.resolveSlam in the same step()',
  hitstopRequest: 'same-tick request: zeroed at the top of every Player.update and consumed by Sim.step',
  poseW: POSE, poseH: POSE,
  body: 'audited as its own group (player.body)',
  attack: setTo('attack', { id: 'zz', frame: 2, hits: [] }),
  // The live swing is recursed into by this same audit (id and frame are
  // perturbed directly); its hits list is an array, so it needs a mutator.
  'attack.hits': pushOnto('hits', 7),
  carriedBlueprints: pushOnto('carriedBlueprints', 'zz')
};
const PLAYER_BODY = {};
const TARGET_BODY = {
  w: 'constant per template; only the player ever resizes its body',
  h: 'constant per template; only the player ever resizes its body',
  onCeiling: 'only reset by Enemy construction; no non-player code reads it',
  dropThrough: 'only reset by Enemy construction; no non-player code reads it',
  wallLeniency: 'only the player roll-entry branch ever arms it (30-player.js)',
  leaveRow: 'only the player roll-entry branch ever sets it (30-player.js)'
};
const SHOT_BODY = {
  w: 'constant per shot, fixed at construction', h: 'constant per shot, fixed at construction',
  onGround: 'recomputed by Body.move() inside the same Shot.update and consumed there',
  onCeiling: 'recomputed by Body.move() inside the same Shot.update and consumed there',
  onWall: 'recomputed by Body.move() inside the same Shot.update and consumed there',
  dropThrough: 'never set for a projectile',
  wallLeniency: 'only the player roll-entry branch ever arms it (30-player.js)',
  leaveRow: 'only the player roll-entry branch ever sets it (30-player.js)'
};
const ENEMY = {
  tid: CONST_SPAWN + ' (template id)',
  t: 'immutable, shared template data',
  spawnX: CONST_SPAWN, spawnY: CONST_SPAWN, homeX: CONST_SPAWN + ' (patrol anchor)',
  seed: CONST_SPAWN + '; the live stream is rng.s, hashed',
  maxHp: 'template constant',
  poseW: POSE, poseH: POSE,
  diveY: 'dead field: assigned once at construction, never read anywhere in src/',
  dist: 'write-only: assigned every tick by acquire() and never read back',
  body: 'audited as its own group (target.body)',
  attack: setTo('attack', { id: 'zz', frame: 5 }),
  'attack.id': 'constant per template for a regular enemy (t.move); boss and Caller moves are covered by activeMove.id',
  hits: pushOnto('hits', 7),
  rng: (obj) => { const old = obj.rng.s; obj.rng.s = old + 1; return () => { obj.rng.s = old; }; },
  activeMove: setTo('activeMove', { id: 'zz' }),
  _zoneTiles: setTo('_zoneTiles', [[3, 4], [5, 6]])
};
const DUMMY = {
  spawnX: CONST_SPAWN, spawnY: CONST_SPAWN, maxHp: 'construction constant',
  body: 'audited as its own group (target.body)'
};
const SHOT = {
  spec: 'immutable, shared projectile template',
  damage: 'fixed at construction from the shooter template',
  knock: 'fixed at construction from the shooter template',
  facing: 'fixed at construction from the shooter facing',
  owner: 'reference to the shooter, fixed at construction',
  body: 'audited as its own group (shot.body)'
};
const PICKUP = {
  x: 'construction constant (id, which is hashed, fixes it)',
  y: 'construction constant (id, which is hashed, fixes it)',
  w: 'construction constant', h: 'construction constant'
};
const SIM = {
  seed: CONST_SPAWN,
  world: 'tile map: fully seed-determined, except the boss vents, which hash() covers through Enemy._zoneTiles',
  spawns: CONST_SPAWN,
  pads: 'player INPUT: supplied to the sim by its caller (a replay), not produced by it',
  players: 'walked element by element by hash(); each audited as its own group',
  targets: 'walked element by element by hash(); each audited as its own group',
  shots: 'walked element by element by hash(); each audited as its own group',
  pickups: 'walked element by element by hash(); each audited as its own group',
  rig: 'immutable baked move data',
  ctx: 'closure bridge back into this same Sim',
  rng: (sim) => { const old = sim.rng.s; sim.rng.s = old + 1; return () => { sim.rng.s = old; }; },
  bus: (sim) => { const old = sim.bus.emitted; sim.bus.emitted = old + 1; return () => { sim.bus.emitted = old; }; },
  run: 'audited as its own group (sim.run)',
  meta: 'audited as its own group (sim.meta)',
  exit: setTo('exit', [3, 4]),
  tube: setTo('tube', [3, 4]),
  bossTarget: setTo('bossTarget', { id: 99999 }),
  _pendingLevel: 'pure function of run.runSeed and runsCompleted (hashed) plus Gen determinism',
  _levelRosterIds: 'pure function of run.levelSeed (hashed)',
  _wasDead: 'pure re-derivation of Player.state (hashed), per hash()\'s own comment'
};
const RUN = {};
const META = { version: 'save-schema constant' };

/* ---------------------------------------------------------------- fixture */
function fixture() {
  const a = H.scenario({
    seed: 7, log: false,
    enemies: [['ashwalker', 200, 586], ['emberrush', 260, 586], ['kilnspitter', 320, 586], ['wickmoth', 380, 560]],
    pickups: [[300, 560]],
    dummies: [[700, 586, 30]]
  });
  const C = a.C;
  a.sim.addTarget(new C.Enemy(900, C.Boss.template, 500, 570, 3));
  a.sim.addTarget(new C.Enemy(901, C.Caller.template, 600, 586, 4));
  a.settle();
  a.step(40);
  // Run until at least one enemy is mid-attack so a LIVE enemy attack object
  // is audited, not only the null case (bounded: never an open-ended wait).
  let g = 0;
  while (!a.sim.targets.some((t) => t.attack) && g++ < 600) a.step(1);
  // A real player swing, so p.attack is a live object too.
  a.hold('attack').step(3);
  // A real projectile.
  const sp = C.DATA.ENEMIES.kilnspitter.projectile;
  a.sim.ctx.addShot(new C.Shot(500, 340, 580, -1, 0, sp, 1, [1, -1], -1, null));
  return a;
}

const a = fixture();
const sim = a.sim;
s.ok('the fixture has a live player swing', !!sim.players[0].attack);
s.ok('the fixture has a live enemy attack', sim.targets.some((t) => t.attack));
s.ok('the fixture has a live projectile', sim.shots.length > 0);
s.ok('the fixture has the boss and the Caller', sim.targets.some((t) => t.tid === 'kilnwarden') &&
  sim.targets.some((t) => t.tid === 'caller'));

/* ---------------------------------------------------------------- the audit */
run(sim, 'player', sim.players[0], PLAYER, 40);
run(sim, 'player.body', sim.players[0].body, PLAYER_BODY, 10);

for (const t of sim.targets) {
  const isDummy = t.constructor.name === 'Dummy';
  const lab = 'target:' + (t.tid || 'dummy');
  run(sim, lab, t, isDummy ? DUMMY : ENEMY, isDummy ? 6 : 25);
  run(sim, lab + '.body', t.body, TARGET_BODY, 10);
}
run(sim, 'shot', sim.shots[0], SHOT, 6);
run(sim, 'shot.body', sim.shots[0].body, SHOT_BODY, 8);
run(sim, 'pickup', sim.pickups[0], PICKUP, 5);
run(sim, 'sim.run', sim.run, RUN, 5);
run(sim, 'sim.meta', sim.meta, META, 8);
run(sim, 'sim', sim, SIM, 20);

/* ------------------------------------- the detector can fail (anti-vacuous)
 * An audit that cannot report a problem proves nothing. Each case below plants
 * exactly the mistake the audit exists to catch and asserts it is reported. */
{
  const p = sim.players[0];

  p.brandNewField = 5;                       // a new primitive nobody hashed
  let out = { fields: 0, problems: [] };
  audit(sim, 'player', p, PLAYER, out);
  s.eq('a new unhashed primitive is reported, by name',
    out.problems.filter((x) => x.indexOf('brandNewField') !== -1 && x.indexOf('UNHASHED') !== -1).length, 1);
  delete p.brandNewField;

  p.brandNewList = [];                       // a new structured field with no decision
  out = { fields: 0, problems: [] };
  audit(sim, 'player', p, PLAYER, out);
  s.eq('a new structured field with no decision is reported, by name',
    out.problems.filter((x) => x.indexOf('brandNewList') !== -1 && x.indexOf('NO hash decision') !== -1).length, 1);
  delete p.brandNewList;

  out = { fields: 0, problems: [] };         // an exemption that has gone stale
  audit(sim, 'player', p, Object.assign({}, PLAYER, { hp: 'wrongly claimed to be irrelevant' }), out);
  s.eq('an exemption on a field that IS hashed is reported as stale',
    out.problems.filter((x) => x.indexOf('player.hp') !== -1 && x.indexOf('stale') !== -1).length, 1);

  out = { fields: 0, problems: [] };         // a mutator that proves nothing
  audit(sim, 'player', p, Object.assign({}, PLAYER, { carriedBlueprints: () => () => {} }), out);
  s.eq('a mutator that does not move the hash is reported',
    out.problems.filter((x) => x.indexOf('carriedBlueprints') !== -1 && x.indexOf('did not change hash') !== -1).length, 1);

  s.eq('and after all of that the real audit is clean again',
    (() => { const o = { fields: 0, problems: [] }; audit(sim, 'player', p, PLAYER, o); return o.problems.join('|'); })(), '');
}

/* ------------------------------------------ the eleven gaps this suite found
 * Named explicitly (the generic audit above already covers them) so the next
 * reader sees WHY each one matters rather than a bare field list. Each flips
 * ONE field and requires the fingerprint to move. */
{
  const flips = [
    ['Enemy.wander (patrol heading, persists across attacks)', sim.targets.find((t) => t.tid === 'ashwalker'), 'wander', (v) => -v],
    ['Player.ledgeRow (hang anchor)', sim.players[0], 'ledgeRow', (v) => v + 1],
    ['Player.ledgeWallTx (hang anchor)', sim.players[0], 'ledgeWallTx', (v) => v + 1],
    ['Player.ledgeDir (hang anchor)', sim.players[0], 'ledgeDir', (v) => v + 1],
    ['Body.wallLeniency (D17 roll exemption)', sim.players[0].body, 'wallLeniency', (v) => !v],
    ['Body.leaveRow (D17 roll exemption row)', sim.players[0].body, 'leaveRow', (v) => v + 1],
    ['Sim._checkpointFired (once-per-room latch)', sim, '_checkpointFired', (v) => !v],
    ['Shot.done (consumed shot)', sim.shots[0], 'done', (v) => !v]
  ];
  for (const [name, obj, key, f] of flips) {
    s.ok(name + ' moves the fingerprint',
      hashChangesWhen(sim, () => { const old = obj[key]; obj[key] = f(old); return () => { obj[key] = old; }; }));
  }
  const boss = sim.targets.find((t) => t.tid === 'kilnwarden');
  s.ok('Enemy._zoneTiles (boss vent hazards) moves the fingerprint',
    hashChangesWhen(sim, () => { boss._zoneTiles = [[3, 4]]; return () => { boss._zoneTiles = null; }; }));
  s.ok('Enemy.hits (per-swing dedupe) moves the fingerprint',
    hashChangesWhen(sim, () => { boss.hits.push(1); return () => { boss.hits.pop(); }; }));
  s.ok('a target\'s Body.onWall (read back by patrol and by the charge) moves the fingerprint',
    hashChangesWhen(sim, () => { const b = boss.body, old = b.onWall; b.onWall = old + 1; return () => { b.onWall = old; }; }));
}

/* ----------------------------------------------------- hash is still honest */
{
  const h1 = fixture().sim.hash(), h2 = fixture().sim.hash();
  s.eq('two identically built fixtures hash identically (the new fields add no nondeterminism)', h1, h2);
}

process.exit(s.done());
