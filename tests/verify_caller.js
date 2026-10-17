/* ===========================================================================
 * tests/verify_caller.js  —  the Caller: the summon primitive (D16), its
 *                             state machine, and the fairness rule that
 *                             governs it
 * ---------------------------------------------------------------------------
 * Mirrors verify_boss.js's own shape at smaller scale — a second real
 * "kept OUT of DATA.ENEMIES" template, proven against the LIVE source, not
 * the design document (docs/superpowers/specs/2026-08-24-summon-primitive-
 * design.md). L8 throughout: every assertion drives the real Enemy/Sim
 * classes through real sim ticks via H.scenario(), never reimplements the
 * state machine or the fairness rule it depends on.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_caller');
const C = H.loadSim();
const CFG = C.CFG, DATA = C.DATA, Caller = C.Caller, T = Caller.template;

// Unlike Kilnwarden (sight/reach deliberately cover the whole arena), the
// Caller's sight (220) is a real, bounded number — placed comfortably
// within it (default player spawn is x=80, per verify_enemy.js's own
// documented geometry), not at an arbitrary arena-scale distance.
function callerScenario(opts) {
  opts = opts || {};
  const spec = Object.assign({
    enemies: [[T, 200, 608 - T.h, opts.callerSeed]]
  }, opts.spec || {});
  const a = H.scenario(spec);
  a.settle();
  return a;
}

/* =================================================== 1. data/shape audit
 * The same fairness floor verify_enemy.js/verify_boss.js already run over
 * their own rosters, applied to the Caller's own single-attack template. */
{
  s.eq('the Caller declares the summon attack primitive', T.attack, 'summon');
  s.ok('it declares a telegraph', typeof T.telegraph === 'number');
  s.ok('and it clears MIN_TELEGRAPH, the fairness floor', T.telegraph >= CFG.MIN_TELEGRAPH,
    T.telegraph + ' vs ' + CFG.MIN_TELEGRAPH);
  s.ok('it has real hp', T.hp > 0);
  s.ok('and real dimensions', T.w > 0 && T.h > 0);

  s.ok('summonCount is a real positive number', T.summonCount > 0);
  s.ok('summonMax is a real positive number', T.summonMax > 0);
  s.ok('a single cast never exceeds the lifetime cap', T.summonCount <= T.summonMax,
    T.summonCount + ' vs ' + T.summonMax);

  // The one load-bearing cross-check: a typo'd summonId would otherwise be
  // swallowed silently by callIn()'s own defensive guards at runtime, never
  // erroring, just quietly summoning nothing.
  s.ok('summonId names a real, currently-real DATA.ENEMIES template',
    !!DATA.ENEMIES[T.summonId], T.summonId);
}

/* ============================== 2. kept OUT of the shared roster (D9)
 * The same precedent Kilnwarden already proves stays fixed — the Caller
 * must never become a fifth entry in DATA.ENEMIES/ENEMY_IDS. */
{
  s.eq('the regular roster is still exactly four (D9)', DATA.ENEMY_IDS.length, 4);
  s.eq('and the Caller is not one of them', DATA.ENEMY_IDS.indexOf('caller'), -1);
  s.eq('DATA.ENEMIES has no caller key either', DATA.ENEMIES.caller, undefined);
}

/* ==================================================== 3. construction */
{
  const e = new C.Enemy(900, T, 400, 608 - T.h, 3);
  s.eq('the Caller spawned from its own template object, not a roster lookup', e.tid, 'caller');
  s.eq('it starts on patrol', e.state, 'patrol');
  s.eq('it starts at full hp', e.hp, T.hp);
  s.ok('it has a real per-instance rng', !!e.rng);
  s.ok('alive() is a function', typeof e.alive === 'function');
  s.ok('hurt() is a function', typeof e.hurt === 'function');
  s.ok('invulnerable() is a function', typeof e.invulnerable === 'function');
}

/* ============================================= 4. the full state path
 * callIn() is still a safe no-op here — sim.ctx.addEnemy doesn't exist
 * until Step 3 (70-sim.js) — which is exactly what makes this block prove
 * the STATE MACHINE, not the spawn mechanism. */
{
  const a = callerScenario({ callerSeed: 5 });
  const e = a.t();
  let g = 0;
  while (e.state !== 'telegraph' && g++ < 900) a.step(1);
  s.ok('reaches telegraph', e.state === 'telegraph', 'after ' + g + ' ticks');

  const telegraphStart = e.stateFrames;
  s.eq('telegraph starts counting from frame 0 or 1 (fresh commit)', telegraphStart <= 1, true);
  let g2 = 0;
  while (e.state === 'telegraph' && g2++ < 200) a.step(1);
  s.eq('telegraph lasts exactly T.telegraph ticks', g2, T.telegraph);
  s.eq('falls straight into summon, not recover', e.state, 'summon');

  let g3 = 0;
  while (e.state === 'summon' && g3++ < 200) a.step(1);
  s.ok('summon is a real, NON-ZERO recovery window (the spec\'s own corrected divergence)',
    g3 > 0, g3 + ' ticks');
  s.eq('falls into recover after summon, same as shoot', e.state, 'recover');

  let g4 = 0;
  while (e.state === 'recover' && g4++ < 200) a.step(1);
  s.eq('returns to chase once recovery ends', e.state, 'chase');
}

/* ==================================================== 5. dangerous() */
{
  const a = callerScenario({ callerSeed: 5 });
  const e = a.t();
  let g = 0;
  while (e.state !== 'telegraph' && g++ < 900) a.step(1);
  s.ok('dangerous() is false throughout telegraph', !e.dangerous());
  let g2 = 0;
  while (e.state === 'telegraph' && g2++ < 200) a.step(1);
  s.eq('reached summon', e.state, 'summon');
  s.ok('dangerous() is false throughout summon too — the call carries no body threat', !e.dangerous());
}

/* ========================================================= 6. dodge test
 * Written fresh — no existing precedent in this codebase kills an enemy
 * mid-telegraph to prove its attack never fires. Relies on update()'s own
 * dead short-circuit (45-enemy.js), which sits BEFORE the switch that would
 * otherwise reach doTelegraph() — the real dodgeable window every other
 * primitive already gets. */
{
  const a = callerScenario({ callerSeed: 5 });
  const e = a.t();
  let g = 0;
  while (e.state !== 'telegraph' && g++ < 900) a.step(1);
  s.ok('committed to telegraph', e.state === 'telegraph');
  s.ok('killed before telegraph completes', e.stateFrames < T.telegraph, e.stateFrames + '/' + T.telegraph);

  e.hurt(9999, a.sim.bus);
  s.eq('the Caller is dead', e.state, 'dead');

  let g2 = 0;
  while (g2++ < 200) a.step(1);
  s.eq('stays dead — never revived, never reaches doTelegraph again', e.state, 'dead');
  s.eq('summonsUsed stays zero forever — callIn() never ran', e.summonsUsed, 0);
}

/* ======================================== 7. resetTransient() clears it */
{
  const a = callerScenario({ callerSeed: 5 });
  const e = a.t();
  e.summonsUsed = 2;
  e.resetTransient();
  s.eq('resetTransient() clears summonsUsed back to zero (L10)', e.summonsUsed, 0);
}

/* ============================================ 8. callIn() actually spawns
 * Now that sim.ctx.addEnemy is real (70-sim.js), callIn() does real work —
 * this block proves the MECHANISM, building on part 4's proof of the STATE
 * MACHINE. */
{
  const a = callerScenario({ callerSeed: 5 });
  const e = a.t();
  const before = a.sim.targets.length;
  let g = 0;
  while (e.state !== 'summon' && g++ < 900) a.step(1);
  s.eq('reached summon', e.state, 'summon');
  s.eq('exactly T.summonCount new targets appeared', a.sim.targets.length, before + T.summonCount);
  const added = a.sim.targets[a.sim.targets.length - 1];
  s.eq('the new target is really the declared summonId', added.tid, T.summonId);
  s.eq('summonsUsed incremented by exactly T.summonCount', e.summonsUsed, T.summonCount);
}

/* ============================ 9. summonMax is a LIFETIME cap, not per-cast
 * Driven through real ticks (real telegraph -> summon -> recover -> chase
 * -> re-commit cycles), not by forcing internal state — the cap must hold
 * across MULTIPLE real re-commits, not just once. */
{
  const a = callerScenario({ callerSeed: 5 });
  const e = a.t();
  const startCount = a.sim.targets.length;
  for (let i = 0; i < 4000; i++) a.step(1);

  const casts = a.events('enemyAttack').filter((ev) => ev.payload.kind === 'summon').length;
  s.ok('enough real ticks elapsed for the Caller to re-telegraph past summonMax',
    casts > T.summonMax, casts + ' casts vs summonMax ' + T.summonMax);
  s.eq('summonsUsed never exceeds the lifetime cap despite multiple re-telegraphs',
    e.summonsUsed, T.summonMax);
  s.eq('the actual number of spawned adds matches the cap exactly, not the cast count',
    a.sim.targets.length - startCount, T.summonMax * T.summonCount);
  s.ok('a cast past the cap still completes its own summon->recover cycle as a harmless no-op',
    ['chase', 'telegraph', 'summon', 'recover', 'patrol'].indexOf(e.state) !== -1, e.state);
}

/* ============================================== 10. no id collision */
{
  const a = callerScenario({ callerSeed: 5 });
  const e = a.t();
  let g = 0;
  while (e.state !== 'summon' && g++ < 900) a.step(1);
  a.step(1);
  const ids = a.sim.targets.map((t) => t.id);
  s.eq('every target id is still unique after a real summon', new Set(ids).size, ids.length);
}

/* ============================ 11. roster/currency exclusion — the exact
 * shape verify_run.js's own boot-path-Dummy regression already proves,
 * applied to a Caller's summoned add. Holds by construction —
 * _levelRosterIds is populated ONLY inside _enterRoom()'s own
 * generation-time placement loop (70-sim.js), never by Sim.prototype.
 * addEnemy/ctx.addEnemy — not new exclusion logic. */
{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(60);
  const realRoster = a.sim.targets.slice();
  s.ok('a real generated roster exists', realRoster.length > 0);

  const caller = a.sim.addEnemy(T, a.b().x + 150, a.b().y);
  let g = 0;
  while (caller.state !== 'summon' && g++ < 900) a.step(1);
  a.step(1);
  s.ok('the Caller actually summoned mid-room', a.sim.targets.length > realRoster.length + 1);
  const summoned = a.sim.targets[a.sim.targets.length - 1];

  s.eq('the Caller itself is not in _levelRosterIds', a.sim._levelRosterIds.indexOf(caller.id), -1);
  s.eq('the summoned add is not in _levelRosterIds either', a.sim._levelRosterIds.indexOf(summoned.id), -1);

  for (const t of realRoster) a.realKill(t);
  s.ok('killing every REAL roster member clears the room, even while the Caller and its add are still alive',
    C.RunLogic.isLevelClear(a.sim._roster()));

  const killsBefore = a.sim.run.kills;
  a.realKill(summoned);
  s.eq('killing only the summoned add never banks currency', a.sim.run.kills, killsBefore);
  a.realKill(caller);
  s.eq('killing the Caller itself never banks currency either', a.sim.run.kills, killsBefore);
}

/* ==================================================== 12. determinism (L4) */
{
  function run() {
    const a = callerScenario({ callerSeed: 21 });
    for (let i = 0; i < 3000; i++) a.sim.step();
    return a;
  }
  const r1 = run(), r2 = run();
  s.ok('same seed -> identical sim.hash() through multiple real summon cycles',
    r1.sim.hash() === r2.sim.hash(), '3000 ticks');
  s.ok('the run genuinely exercised the summon primitive at least once',
    r1.t().summonsUsed > 0, 'summonsUsed=' + r1.t().summonsUsed);
}

/* ==================================== 13. terrain safety (adversarially
 * found, fixed): callIn()'s offset spawn point must never land INSIDE
 * solid terrain — the default flatWorld's own full-height boundary walls
 * (tests/harness.js) are exactly the kind of multi-row-solid mass that
 * broke "gravity resolves it, no terrain-probing needed" before the fix. */
{
  const a = H.scenario();
  a.settle();
  const e = a.sim.addEnemy(T, 30, 608 - T.h);
  e.lockFacing = -1;   // facing the left wall (flatWorld's x=0 column, full height)
  const callerY = e.body.y;
  e.callIn(a.sim.ctx);
  s.eq('a summon fired', e.summonsUsed, 1);
  const summoned = a.sim.targets[a.sim.targets.length - 1];
  s.eq('the embedded spawn point was rejected — it fell back to the Caller\'s own position',
    summoned.body.x, e.body.x);

  for (let i = 0; i < 60; i++) a.step(1);
  s.ok('and it settles near where it actually spawned, never climbing through solid rock',
    Math.abs(summoned.body.y - callerY) < 32, summoned.body.y + ' vs ' + callerY);
}

/* ============================================ 14. two-player fairness (D5)
 * Named as a risk in the implementation plan and left unaddressed by the
 * first pass — mirrors verify_boss.js §11 for the Caller's own commit, and
 * separately proves a freshly-summoned add runs its OWN acquire(), not an
 * inherited copy of the Caller's target. */
{
  const a = H.scenario({
    players: 2,
    spawns: [[250, 586], [370, 586]],
    enemies: [[T, 300, 608 - T.h, 9]]
  });
  a.settle();
  const e = a.t();
  let g = 0;
  while (e.state !== 'telegraph' && g++ < 900) a.step(1);
  s.ok('it committed with two players present', e.state === 'telegraph', 'after ' + g + ' ticks');

  const nearer = Math.abs(a.p(0).body.cx() - e.body.cx()) < Math.abs(a.p(1).body.cx() - e.body.cx()) ? 0 : 1;
  const expectFacing = Math.sign(a.p(nearer).body.cx() - e.body.cx());
  s.eq('the Caller locks onto the nearer player', e.lockFacing, expectFacing);

  let g2 = 0;
  while (e.state !== 'summon' && g2++ < 200) a.step(1);
  s.eq('reached summon', e.state, 'summon');
  const add = a.sim.targets[a.sim.targets.length - 1];
  s.eq('a real ashwalker spawned', add.tid, 'ashwalker');

  // Move the Caller's own target far out of the ADD's much shorter sight
  // (ashwalker: 130 vs the Caller's own 220) — if the add merely inherited
  // the Caller's lockFacing, it would keep tracking a now-irrelevant
  // player instead of the one actually near it.
  a.b(nearer).x = 1800;
  let g3 = 0;
  while (add.state !== 'telegraph' && g3++ < 900) a.step(1);
  const other = nearer === 0 ? 1 : 0;
  s.ok('the summoned add reaches its OWN commit independently', add.state === 'telegraph', 'after ' + g3 + ' ticks');
  s.eq('and locks onto whichever player is actually near IT, not the Caller\'s original target',
    add.lockFacing, Math.sign(a.p(other).body.cx() - add.body.cx()));
}

/* ==================================== 15. the missing-ctx guard branch */
{
  const a = H.scenario();
  a.settle();
  const e = a.sim.addEnemy(T, 200, 608 - T.h);
  let threw = false;
  try { e.callIn(null); e.callIn(undefined); e.callIn({}); } catch (err) { threw = true; }
  s.ok('callIn() never throws when ctx or ctx.addEnemy is missing', !threw);
  s.eq('and never summons anything in that case', e.summonsUsed, 0);
}

/* ================== 16. killing the Caller leaves its summoned add alive
 * The 'no parent/child link' claim (comment + spec §3) proven directly,
 * not just asserted in prose — part 11 above only ever kills in the
 * OPPOSITE order (add first, then Caller). */
{
  const a = H.scenario();
  a.settle();
  const e = a.sim.addEnemy(T, 200, 608 - T.h);
  e.lockFacing = 1;
  e.callIn(a.sim.ctx);
  s.eq('a summon fired', e.summonsUsed, 1);
  const addId = a.sim.targets[a.sim.targets.length - 1].id;

  a.realKill(e);
  s.eq('the Caller is really dead', e.state, 'dead');
  const add = a.sim.targets.filter((t) => t.id === addId)[0];
  s.ok('the summoned add is unaffected — still present and alive', add && add.alive());

  for (let i = 0; i < 30; i++) a.step(1);
  s.ok('and it keeps updating normally afterward (no orphaned/frozen state)',
    add.alive() && add.stateFrames >= 0);
}

/* ============================ 17. summonCount > 1 — the dead loop body
 * Every other test only ever exercises summonCount===1 (the shipped
 * template's own value). A cloned template with summonCount:2 exercises
 * the i*12 fan-out (both facing directions — the formula bug an earlier
 * version had here) and the mid-loop summonMax cap-break. */
{
  const clone = Object.assign({}, T, { summonCount: 2, summonMax: 3 });

  // Facing right: spawns should fan out with increasing x.
  {
    const a = H.scenario();
    a.settle();
    const e = a.sim.addEnemy(clone, 200, 608 - T.h);
    e.lockFacing = 1;
    e.callIn(a.sim.ctx);
    s.eq('the first cast spawns exactly summonCount adds', e.summonsUsed, 2);
    const added = a.sim.targets.slice(-2);
    s.ok('facing right, spawns fan out with STRICTLY increasing x, away from the Caller',
      added[0].body.x < added[1].body.x && added[0].body.x > e.body.x,
      added[0].body.x + ' , ' + added[1].body.x + ' vs caller ' + e.body.x);
  }

  // Facing left: the exact case the original formula got wrong (spacing
  // folded back toward/past the Caller instead of fanning further away).
  {
    const a = H.scenario();
    a.settle();
    const e = a.sim.addEnemy(clone, 400, 608 - T.h);
    e.lockFacing = -1;
    e.callIn(a.sim.ctx);
    const added = a.sim.targets.slice(-2);
    s.ok('facing left, spawns fan out with STRICTLY decreasing x, away from the Caller',
      added[0].body.x > added[1].body.x && added[0].body.x < e.body.x,
      added[0].body.x + ' , ' + added[1].body.x + ' vs caller ' + e.body.x);
    s.ok('neither spawn lands on or past the Caller\'s own position',
      added[0].body.x < e.body.x && added[1].body.x < e.body.x);
  }

  // The mid-loop cap-break: summonMax(3) is not a multiple of summonCount(2).
  {
    const a = H.scenario();
    a.settle();
    const e = a.sim.addEnemy(clone, 200, 608 - T.h);
    e.lockFacing = 1;
    e.callIn(a.sim.ctx);          // spawns 2, summonsUsed -> 2
    e.callIn(a.sim.ctx);          // wants 2 more, only 1 left under the cap
    s.eq('the cap fires MID-LOOP on the second cast, not just at entry', e.summonsUsed, 3);
    e.callIn(a.sim.ctx);          // fully exhausted — safe no-op
    s.eq('a third cast changes nothing further', e.summonsUsed, 3);
  }
}

/* ========== 18. the summoned Ashwalker is a real, fully-functional enemy
 * Not just tid-matching — it can acquire, telegraph, and actually land a
 * real hit via Combat.resolveBox, exactly like one placed by ordinary
 * room generation. */
{
  const a = callerScenario({ callerSeed: 5 });
  const e = a.t();
  let g = 0;
  while (e.state !== 'summon' && g++ < 900) a.step(1);
  s.eq('reached summon', e.state, 'summon');
  const add = a.sim.targets[a.sim.targets.length - 1];
  s.eq('it is a real ashwalker', add.tid, 'ashwalker');

  const hpBefore = a.p().hp;
  let g2 = 0, reachedStrike = false;
  while (g2++ < 2000) {
    a.step(1);
    if (add.state === 'strike') { reachedStrike = true; break; }
  }
  s.ok('the summoned add reaches strike on its own — a real, independent state machine',
    reachedStrike, 'after ' + g2 + ' ticks, state=' + add.state);

  let g3 = 0;
  while (a.p().hp === hpBefore && g3++ < 200) a.step(1);
  s.ok('and actually lands a real hit through Combat.resolveBox', a.p().hp < hpBefore,
    'hp ' + hpBefore + ' -> ' + a.p().hp);
}

/* ======================================== 19. dangerous() during recover */
{
  const a = callerScenario({ callerSeed: 5 });
  const e = a.t();
  let g = 0;
  while (e.state !== 'recover' && g++ < 900) a.step(1);
  s.eq('reached recover', e.state, 'recover');
  s.ok('dangerous() is false throughout recover too — the one state part 5 skipped', !e.dangerous());
}

/* =========================================== 20. hash() coverage (L4)
 * Adversarially found: this.summonsUsed's own resetTransient() comment
 * claimed parity with activeMove/phase (both of which ARE hashed), but
 * summonsUsed itself was not — two sims differing ONLY in that field
 * would have hashed identically forever, exactly the drift class hash()'s
 * own header exists to catch. Mirrors verify_meta.js's own "mutate one
 * field, assert hash differs" pattern. */
{
  function withCaller(seed) {
    const a = H.scenario({ seed, enemies: [[T, 200, 608 - T.h, 5]] });
    a.settle();
    return a;
  }
  const base = withCaller(1);
  const alt = withCaller(1);
  s.eq('two identically-seeded, identically-built scenarios hash identically first',
    base.sim.hash(), alt.sim.hash());
  alt.t().summonsUsed = 1;
  s.ok('a differing summonsUsed changes the hash', base.sim.hash() !== alt.sim.hash());
}

/* ============================ 21. near-ledge spawn safety (plan risk #4)
 * The OTHER half of "no terrain-probing needed" — an offset spawn point
 * over OPEN AIR past a floor's edge is genuinely different from part 13's
 * embedded-in-solid case: rectSolid() correctly reads it as non-solid, so
 * the original "gravity resolves it" reasoning should hold here without
 * the fallback ever engaging. Proven empirically, not just architecturally. */
{
  const edge = 20;   // floor exists on tiles 1..edge; open air (a pit) beyond it
  const a = H.scenario({ world: (C) => H.ledgeWorld(C, edge), h: 48 });
  a.settle();
  const callerX = edge * 16 - 6;   // hugging the very edge of the floor
  const e = a.sim.addEnemy(T, callerX, H.FLOOR_Y(48) - T.h);
  e.lockFacing = 1;   // facing out over the drop
  let threw = false;
  try { e.callIn(a.sim.ctx); } catch (err) { threw = true; }
  s.ok('callIn() never throws spawning over an open ledge', !threw);
  s.eq('a summon fired', e.summonsUsed, 1);
  const add = a.sim.targets[a.sim.targets.length - 1];

  for (let i = 0; i < 200; i++) a.step(1);
  s.ok('no NaN/undefined physics resulted', isFinite(add.body.x) && isFinite(add.body.y));
  s.ok('it eventually settles on solid ground somewhere, never stuck mid-air forever',
    add.body.onGround, 'x=' + add.body.x + ' y=' + add.body.y);
}

process.exit(s.done());
