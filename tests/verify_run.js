/* ===========================================================================
 * tests/verify_run.js  —  the run loop (D1): spawn -> clear -> boss -> die ->
 * spend -> respawn
 * ---------------------------------------------------------------------------
 * Two layers, matching verify_gen.js's own precedent for a fairness-audited
 * system: pure logic first (hand-built facts, no Sim/World/Player/Enemy
 * anywhere — L8), real sim ticks second, proving 70-sim.js actually wires
 * the pure logic in correctly rather than merely proving the logic is
 * self-consistent in isolation.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_run');
const C = H.loadSim();
const CFG = C.CFG, RunLogic = C.RunLogic, Run = C.Run, DATA = C.DATA, Gen = C.Gen;

/* ============================================================ 1. seeding */
{
  s.eq('same run+index -> same level seed (L4)',
    RunLogic.deriveLevelSeed(42, 0), RunLogic.deriveLevelSeed(42, 0));
  s.ok('different level indices diverge',
    RunLogic.deriveLevelSeed(42, 0) !== RunLogic.deriveLevelSeed(42, 1));
  s.ok('different run seeds diverge at the same index',
    RunLogic.deriveLevelSeed(42, 0) !== RunLogic.deriveLevelSeed(43, 0));
  s.ok('a level seed is never the zero sentinel', RunLogic.deriveLevelSeed(0, 0) !== 0);

  s.eq('same inputs -> same next run seed (L4)',
    RunLogic.nextRunSeed(7, 0), RunLogic.nextRunSeed(7, 0));
  s.ok('successive runsCompleted values diverge',
    RunLogic.nextRunSeed(7, 0) !== RunLogic.nextRunSeed(7, 1));
  s.ok('the next run seed is never the zero sentinel', RunLogic.nextRunSeed(0, 0) !== 0);

  s.ok('enemy seed differs from boss seed for the same level',
    RunLogic.deriveEnemySeed(99) !== RunLogic.deriveBossSeed(99));
  s.ok('enemy seed is never the level seed itself',
    RunLogic.deriveEnemySeed(99) !== 99);

  // room-checkpoint-structure spec: deriveRoomSeed needs the same L4
  // determinism + divergence proof every other derived seed in this file
  // already gets, plus distinctness from the OTHER three derivations at
  // the same levelSeed — a real regression this file's own header names as
  // the whole reason mix32 exists (four functions sharing one bare-XOR
  // shape once collided for real).
  s.eq('same level+room -> same room seed (L4)',
    RunLogic.deriveRoomSeed(42, 0), RunLogic.deriveRoomSeed(42, 0));
  s.ok('different room indices diverge',
    RunLogic.deriveRoomSeed(42, 0) !== RunLogic.deriveRoomSeed(42, 1));
  s.ok('different level seeds diverge at the same room index',
    RunLogic.deriveRoomSeed(42, 0) !== RunLogic.deriveRoomSeed(43, 0));
  s.ok('a room seed is never the zero sentinel', RunLogic.deriveRoomSeed(0, 0) !== 0);
  s.ok('room 0\'s seed differs from the level\'s own enemy seed at the same levelSeed',
    RunLogic.deriveRoomSeed(99, 0) !== RunLogic.deriveEnemySeed(99));
  s.ok('room 0\'s seed differs from the level\'s own boss seed at the same levelSeed',
    RunLogic.deriveRoomSeed(99, 0) !== RunLogic.deriveBossSeed(99));
  s.ok('a room seed is never the level seed itself',
    RunLogic.deriveRoomSeed(99, 0) !== 99);
}

/* ================================================================ 2. Run */
{
  const r = new Run(5);
  s.eq('starts in the level phase', r.phase, 'level');
  s.eq('runSeed takes the constructor argument', r.runSeed, 5);
  s.eq('levelSeed starts at 0, set only once a level actually loads', r.levelSeed, 0);
  s.eq('currency starts at zero', r.currency, 0);
  s.eq('runsCompleted starts at zero', r.runsCompleted, 0);
  s.eq('kills starts at zero', r.kills, 0);
  s.eq('roomIndex starts at zero', r.roomIndex, 0);

  s.eq('a zero seed still produces a real, non-zero runSeed', new Run(0).runSeed !== 0, true);
}

/* ========================================================= 3. "clear" */
{
  s.eq('zero enemies is never vacuously clear', RunLogic.isLevelClear([]), false);
  s.eq('every enemy at 0 hp is clear', RunLogic.isLevelClear([{ hp: 0 }, { hp: 0 }]), true);
  s.eq('a single survivor blocks it', RunLogic.isLevelClear([{ hp: 0 }, { hp: 3 }]), false);
  s.eq('a hand-built fixture works identically to a real target — no type check anywhere',
    RunLogic.isLevelClear([{ hp: 0, tid: 'ashwalker' }]), true);
}

/* ====================================================== 4. exit proximity */
{
  const exit = [100, 100];
  s.ok('standing exactly on the exit reaches it',
    RunLogic.reachedExit(100, 100, exit, CFG.RUN_EXIT_RADIUS));
  s.ok('just inside the radius reaches it',
    RunLogic.reachedExit(100 + CFG.RUN_EXIT_RADIUS - 1, 100, exit, CFG.RUN_EXIT_RADIUS));
  s.ok('just outside the radius does not',
    !RunLogic.reachedExit(100 + CFG.RUN_EXIT_RADIUS + 1, 100, exit, CFG.RUN_EXIT_RADIUS));
  s.ok('far away never reaches it', !RunLogic.reachedExit(0, 0, exit, CFG.RUN_EXIT_RADIUS));
  s.eq('a null exit (the boss arena) never counts as reached',
    RunLogic.reachedExit(100, 100, null, CFG.RUN_EXIT_RADIUS), false);
}

/* ======================================================== 5. D8's stub */
{
  s.eq('kills alone', RunLogic.currencyEarned(3, false), 3 * CFG.RUN_CURRENCY_PER_KILL);
  s.eq('a boss bonus stacks on top of kills',
    RunLogic.currencyEarned(3, true), 3 * CFG.RUN_CURRENCY_PER_KILL + CFG.RUN_CURRENCY_PER_BOSS);
  s.ok('a boss clear is worth strictly more than an equal number of trash kills',
    RunLogic.currencyEarned(0, true) > RunLogic.currencyEarned(0, false));

  const affordable = RunLogic.spend(10, 4);
  s.eq('an affordable spend succeeds', affordable.ok, true);
  s.eq('and actually deducts', affordable.currency, 6);
  const unaffordable = RunLogic.spend(3, 10);
  s.eq("an unaffordable spend refuses", unaffordable.ok, false);
  s.eq('and leaves currency untouched, never negative', unaffordable.currency, 3);
  s.eq('spend is exercised, real infrastructure, even at the current stub price',
    RunLogic.spend(5, CFG.RUN_SPEND_STUB_COST).ok, true);
}

/* ================================================== 6. enemy placement */
{
  const platforms = [
    { x0: 2, x1: 8, y: 30, spur: false },      // [0] spawn platform — must never get one
    { x0: 20, x1: 26, y: 30, spur: false },
    { x0: 40, x1: 44, y: 5, spur: true },      // pickup alcove — must never get one
    { x0: 60, x1: 70, y: 28, spur: false },
    { x0: 80, x1: 86, y: 26, spur: false }
  ];
  const placed = RunLogic.placeEnemies(platforms, 1);
  s.eq('places at most one per roster template', placed.length, DATA.ENEMY_IDS.length);
  s.ok('every placed id is a real roster entry',
    placed.every((p) => DATA.ENEMY_IDS.indexOf(p.tid) !== -1));
  s.ok('never placed on the spawn platform (index 0)',
    placed.every((p) => p.x >= platforms[1].x0 * CFG.TILE));
  s.ok('never placed on a spur (pickup alcove)',
    placed.every((p) => !(p.x >= platforms[2].x0 * CFG.TILE && p.x <= platforms[2].x1 * CFG.TILE)));
  s.ok('every entry carries its own distinct per-instance seed',
    new Set(placed.map((p) => p.seed)).size === placed.length);

  const again = RunLogic.placeEnemies(platforms, 1);
  s.eq('same seed -> identical placement (L4)', JSON.stringify(placed), JSON.stringify(again));
  const different = RunLogic.placeEnemies(platforms, 2);
  s.ok('a different seed actually produces a different result',
    JSON.stringify(placed) !== JSON.stringify(different));

  s.eq('a roster with no eligible platforms places nothing',
    RunLogic.placeEnemies([{ x0: 0, x1: 4, y: 10, spur: false }], 1).length, 0);

  const flyer = DATA.ENEMY_IDS.filter((tid) => DATA.ENEMIES[tid].mode === 'fly');
  if (flyer.length) {
    const p = RunLogic.placeEnemies(platforms, 1).find((e) => e.tid === flyer[0]);
    s.ok('a flying template is placed above its platform, not resting on it',
      p && p.y < platforms.find((pl) => Math.floor((pl.x0 + pl.x1) / 2) * CFG.TILE === p.x).y * CFG.TILE);
  }
}

/* =============================================================================
 * 7. Integration — real Sim, real ticks. Proves 70-sim.js actually wires the
 * pure logic above in correctly, not just that the logic is self-consistent.
 * ============================================================================= */

// realKill(target)/clearRoomAndAdvance() now live on the scenario() api
// itself (tests/harness.js) — promoted from what used to be independently
// maintained, byte-identical copies here and in verify_meta.js.

{
  // Adversarially found and fixed — TWICE, the second time by this exact
  // test catching what the first fix missed, not assumed safe just because
  // it fixed the first, real, reproduced failure mode:
  //
  // (1) An earlier version of Sim.prototype._buildCheckpointAlcove()
  //     stamped every column in its requested range SOLID unconditionally,
  //     including columns belonging to some OTHER platform at a different
  //     row — turning that platform's own column into a ceiling directly
  //     above it. Blocked the one real incoming jump path D3a's own
  //     fairness audit had already proven legal, in roughly a third of
  //     rooms fuzzed.
  // (2) Protecting only a lower platform's own literal column was NOT
  //     enough: a rising jump drifts sideways WHILE still climbing, so it
  //     can clip a new ceiling several real tiles beyond that platform's
  //     own edge, well past where the first fix stopped stamping — this
  //     test's own first version (comparing against a hardcoded `0`
  //     blocked, not a real pre-alcove baseline) caught 17/150 rooms still
  //     newly broken by the alcove even after fix (1) landed.
  //
  // clearRoomAndAdvance() (tests/harness.js) cannot catch either — it
  // TELEPORTS to the exit rather than physically jumping there — so this
  // reuses H.attemptHop() (the SAME real, multi-strategy physics prover
  // verify_gen.js's own "strongest claim in the file" already trusts,
  // promoted to tests/harness.js specifically so this could reuse it
  // rather than fork an independently-tuned, weaker copy) to compare
  // reachability WITH and WITHOUT the alcove stamped, for every real
  // platform with a pre-alcove audited edge into the exit. Comparing
  // against a real pre-alcove baseline, not a flat "always reachable"
  // expectation, is deliberate: a handful of rooms are already unreachable
  // by this prover even with NO alcove at all (a real, separate, out-of-
  // scope limitation of comparing an isolated-pair capability model against
  // a full room's real geometry — not this feature's own bug to fix). The
  // claim this test actually needs to hold is narrower and exactly
  // correct: the checkpoint alcove itself never NEWLY breaks a path that
  // was reachable before it existed.
  const N = 150;
  let roomsChecked = 0, newlyBlocked = [];
  for (let seed = 1; seed <= N; seed++) {
    const gen = Gen.generate(seed, { beats: CFG.ROOM_BEATS, pickups: CFG.ROOM_PICKUPS });
    const exitIdx = gen.platforms.length - 1 - gen.pickups.length;
    const edges = Gen.buildGraph(gen.platforms);
    const approaches = [];
    for (let i = 0; i < gen.platforms.length; i++) {
      if (i !== exitIdx && edges[i].indexOf(exitIdx) !== -1) approaches.push(i);
    }
    if (!approaches.length) continue;   // exit only reached from spawn itself — out of scope here
    roomsChecked++;
    const exitPlatform = gen.platforms[exitIdx];
    const successCheck = (b) => {
      const dx = (b.x + b.w / 2) - gen.exit[0], dy = (b.y + b.h / 2) - gen.exit[1];
      return (dx * dx + dy * dy) <= CFG.RUN_EXIT_RADIUS * CFG.RUN_EXIT_RADIUS;
    };

    const reachedBefore = approaches.some((fromIdx) =>
      H.attemptHop(C, gen.platforms[fromIdx], exitPlatform, { world: gen.world, successCheck }));

    const gen2 = Gen.generate(seed, { beats: CFG.ROOM_BEATS, pickups: CFG.ROOM_PICKUPS });
    const sim = new C.Sim({ world: gen2.world, seed, players: 1, spawns: [gen2.spawn] });
    sim.tube = sim._buildCheckpointAlcove(gen2);   // the exact call _enterRoom() makes
    const reachedAfter = approaches.some((fromIdx) =>
      H.attemptHop(C, gen2.platforms[fromIdx], gen2.platforms[exitIdx], { world: gen2.world, successCheck }));

    if (reachedBefore && !reachedAfter) newlyBlocked.push(seed);
  }
  s.ok('sampled a meaningful number of rooms with a real pre-alcove approach to the exit',
    roomsChecked > 50, roomsChecked + '/' + N);
  s.eq('the checkpoint alcove never newly blocks a real physics path that was reachable before it was stamped',
    newlyBlocked.length, 0, newlyBlocked.slice(0, 10).join(','));
}

{
  const a = H.scenario({ dummies: [[100, 300, 40]] });
  a.settle();
  a.step(30);
  s.eq('a plain scenario() never engages the loop — exit stays null', a.sim.exit, null);
  s.eq('bossTarget stays null too', a.sim.bossTarget, null);
  s.eq('run.phase never leaves its constructed default', a.sim.run.phase, 'level');
}

{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(11);
  s.ok('beginRun() actually loads a real level', a.sim.exit !== null);
  s.eq('run.phase is level', a.sim.run.phase, 'level');
  s.ok('a real, audited-fair roster got placed', a.sim.targets.length > 0);
  s.eq('run.levelSeed matches what deriveLevelSeed(runSeed,0) predicts',
    a.sim.run.levelSeed, RunLogic.deriveLevelSeed(a.sim.run.runSeed, 0));
  s.eq('the player actually stands at the generated spawn, not wherever settle() left them',
    a.b().x, 48);
  s.eq('sim.spawns is updated too, so a LATER co-op join lands in this level, not a stale point',
    JSON.stringify(a.sim.spawns), JSON.stringify([[48, 458]]));
  const joiner = a.sim.addPlayer();
  s.eq('a player joining after beginRun() lands at the real current spawn', joiner.body.x, 48);
}

{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(12);
  const before = a.sim.run.levelSeed;
  for (const t of a.sim.targets) a.realKill(t);
  a.step(1);
  s.eq('killing everything without reaching the exit does not enter the boss',
    a.sim.run.phase, 'level');
  a.b().x = a.sim.exit[0] - 500; a.b().y = 40;
  a.step(1);
  s.eq('reaching the exit without clearing everything does not enter the boss either',
    a.sim.run.phase, 'level');
}

{
  // Regression: an undying, non-roster entity (a practice dummy, exactly
  // like boot()'s own — added directly, the same way boot() does) living in
  // sim.targets alongside a real beginRun() roster must never block "clear"
  // forever. Found by driving the real built game end to end in a browser,
  // not caught by any sim-only test until this one existed.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(17);
  a.sim.addTarget(new C.Combat.Dummy(100, a.b().x + 20, a.b().y, 40));
  for (const t of a.sim.targets) { if (t.id !== 100) a.realKill(t); }
  s.eq('every real roster member is dead, only the dummy survives',
    a.sim.targets.filter((t) => t.alive()).length, 1);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  // room-checkpoint-structure spec: clearing ROOM 0 advances to room 1, not
  // straight to the boss — a level is a chain now, not a single room. The
  // dummy's own claim (never blocks a real clear) is proven the same way
  // regardless: room advanced, still 'level' phase, not stuck in room 0.
  s.eq('the undying dummy never blocks the room from clearing', a.sim.run.roomIndex, 1);
  s.eq('advancing a room stays in the level phase, not the boss', a.sim.run.phase, 'level');
}

{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(13);
  s.eq('a fresh level starts with zero banked kills', a.sim.run.kills, 0);
  // room-checkpoint-structure spec: clear every combat room but the last
  // through the shared helper first — run.kills is level-scoped, not
  // room-scoped (it only resets at a true level end), so kills already
  // banked from the earlier rooms are still on the counter below.
  a.clearRoomAndAdvance(CFG.ROOM_COUNT - 1);
  const killsBefore = a.sim.run.kills;
  const targets = a.sim.targets.slice();
  for (const t of targets) a.realKill(t);
  s.eq('every real kill through Combat.resolveBox is banked',
    a.sim.run.kills, killsBefore + targets.length);

  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  s.eq('cleared AND at the exit of the FINAL room enters the boss', a.sim.run.phase, 'boss');
  s.eq('the arena replaces the generated level', a.sim.world.w, C.Boss.ARENA_W);
  s.eq('the exit no longer exists — a true fact about the arena, not a phase flag',
    a.sim.exit, null);
  s.ok('exactly Kilnwarden was added', a.sim.bossTarget && a.sim.bossTarget.tid === C.Boss.template.id);
  s.eq('current hp carries through the door — no free heal at the threshold',
    a.p().hp, a.p().maxHp);
  s.eq('boss kills are never double-counted into run.kills',
    a.sim.run.kills, killsBefore + targets.length);
}

{
  // Boss victory, no death anywhere in the sequence — the branch a losing
  // panel pitch deadlocked on.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(14);
  a.clearRoomAndAdvance(CFG.ROOM_COUNT - 1);
  for (const t of a.sim.targets) a.realKill(t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  const oldLevelSeed = a.sim.run.levelSeed;
  a.realKill(a.sim.bossTarget);
  a.step(1);
  // No decrement happens on the trigger tick itself (the decrement-check
  // runs BEFORE the trigger this same tick, finds -1, skips) — the counter
  // is set to the full value here and only starts counting down next tick,
  // the same one-tick timing Player's own deadFrames already has.
  s.eq('a boss kill starts the run-end countdown at the full value', a.sim.runEndFrames, CFG.RESPAWN_FRAMES);
  s.ok('the pending next level is computed eagerly', !!a.sim._pendingLevel);
  s.eq('the world has NOT swapped yet — still the arena', a.sim.world.w, C.Boss.ARENA_W);

  let n = 0;
  while (a.sim.run.phase !== 'level' && n < CFG.RESPAWN_FRAMES + 10) { a.step(1); n++; }
  s.eq('commits exactly CFG.RESPAWN_FRAMES ticks after the kill, not one more or fewer',
    n, CFG.RESPAWN_FRAMES);
  s.ok('a genuinely new level loaded', a.sim.run.levelSeed !== oldLevelSeed);
  s.eq('runsCompleted advanced', a.sim.run.runsCompleted, 1);
  s.eq('kills reset for the new run', a.sim.run.kills, 0);
  s.ok('currency includes the boss bonus', a.sim.run.currency >= CFG.RUN_CURRENCY_PER_BOSS);
  s.eq('runEndFrames returns to its resting value, not stuck at 0', a.sim.runEndFrames, -1);
}

{
  // Death mid-level — the run's OTHER ending, reusing Player's own existing
  // deadFrames/resetTransient() machinery entirely unmodified.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(15);
  const oldLevelSeed = a.sim.run.levelSeed;
  // Bank one real kill first, THEN die — proves kills already earned this
  // level are still paid out even though the level was never cleared, not
  // just that a full clear pays out (the boss-victory test above already
  // covers that case).
  a.realKill(a.sim.targets[0]);
  a.p().hp = 1;
  a.p().hurt(1, a.sim.bus, [0, 0]);
  // Unlike the boss-victory case above, hurt() is called OUT OF BAND, before
  // any step() — so deadFrames is already decremented once (30->29) by the
  // very first step below, the same tick _stepRun() first sees justDied and
  // opens the pending run end. n therefore starts at 1, not 0, to keep
  // counting total ticks since hurt() rather than ticks since this file's
  // own code first ran — the two tests measure the same real quantity
  // (CFG.RESPAWN_FRAMES) from two different, equally valid starting points.
  a.step(1);
  s.eq('dying immediately begins a pending run end', !!a.sim._pendingLevel, true);
  s.eq('the world has not changed yet — still mid-death-animation', a.sim.run.levelSeed, oldLevelSeed);

  let n = 1;
  while (a.p().state === 'dead' && n < CFG.RESPAWN_FRAMES + 5) { a.step(1); n++; }
  s.eq('respawns on Player\'s own existing RESPAWN_FRAMES schedule, unmodified',
    n, CFG.RESPAWN_FRAMES);
  s.ok('a genuinely new level loaded', a.sim.run.levelSeed !== oldLevelSeed);
  s.eq('hp is fully restored by the ordinary respawn path', a.p().hp, a.p().maxHp);
  s.eq('a death still banks currency for kills already earned this level, even without a clear',
    a.sim.run.currency, RunLogic.currencyEarned(1, false));
}

{
  // Co-op (D5): the run ends at the FIRST death, and the survivor is never
  // force-killed — the exact bug an adversarial judge found in a losing
  // panel pitch's own force-death loop.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(16);
  const p0 = a.sim.players[0], p1 = a.sim.players[1];
  p1.body.x = 900; p1.body.y = 40;   // somewhere clearly NOT the level spawn
  p0.hp = 1;
  p0.hurt(1, a.sim.bus, [0, 0]);
  a.step(1);
  s.eq('the dying player enters the dead state', p0.state, 'dead');
  s.ok('the surviving partner is NOT forced into the dead state', p1.state !== 'dead');
  s.ok('the surviving partner stays fully alive', p1.alive());

  let n = 1;
  while (p0.state === 'dead' && n < CFG.RESPAWN_FRAMES + 5) { a.step(1); n++; }
  s.ok('the survivor is still alive once the run actually commits', p1.alive());
  // Every generated level's spawn platform is built at the same fixed
  // {x0:2, y:30} start (50-gen.js's own generateCandidate — not seed-varied),
  // so every real spawn lands at pixel (48, 458) regardless of which level
  // seed actually generated it; asserting the literal value (rather than
  // re-deriving it here, L8) is what actually proves the survivor moved.
  s.eq('the survivor lands in the new level\'s real spawn, not left in the discarded one',
    p1.body.x, 48);
  s.eq('a second exit->boss check never fires while a run end is already pending',
    a.sim.run.phase, 'level');
}

{
  // Determinism (L4): two identical scripted death->respawn->boss sequences
  // hash byte-identical.
  function run(seed) {
    const a = H.scenario({ seed });
    a.settle();
    a.sim.beginRun(seed);
    a.clearRoomAndAdvance(CFG.ROOM_COUNT - 1);
    for (const t of a.sim.targets) a.realKill(t);
    a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
    a.step(1);
    a.realKill(a.sim.bossTarget);
    a.step(CFG.RESPAWN_FRAMES + 2);
    a.p().hp = 1;
    a.p().hurt(1, a.sim.bus, [0, 0]);
    a.step(CFG.RESPAWN_FRAMES + 2);
    return a.sim.hash();
  }
  s.eq('identical seed -> byte-identical hash across a full clear/boss/death loop',
    run(21), run(21));
}

{
  // Regression (adversarial pass): a STAGGERED co-op death — P0 dies, P1
  // dies independently a few ticks later, P0's own countdown finishes
  // FIRST and commits the level while P1 is still genuinely mid-death.
  // _enterRoom()'s player-relocation must not stomp P1's still-running
  // countdown just because a commit is landing for the run as a whole.
  // The transition exercised below (clearing room 0 and reaching its own
  // exit) advances to room 1, not the boss — any transition proves the
  // same claim (a still-dead partner must never be relocated by one), so
  // this does not need to walk the whole chain to the boss to be valid.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(31);
  const p0 = a.sim.players[0], p1 = a.sim.players[1];

  p0.hp = 1; p0.hurt(1, a.sim.bus, [0, 0]);
  a.step(6);
  s.eq('p0 is mid-countdown', p0.state, 'dead');
  p1.hp = 1; p1.hurt(1, a.sim.bus, [0, 0]);
  s.eq('p1 independently enters the dead state a few ticks later', p1.state, 'dead');
  s.ok('p1 is meaningfully BEHIND p0 in its own countdown',
    p1.deadFrames > p0.deadFrames, p1.deadFrames + ' vs ' + p0.deadFrames);

  // Drive until p0's own countdown reaches zero and commits the level —
  // p1's countdown (started later) must still have real frames left.
  let n = 0;
  while (p0.state === 'dead' && n < CFG.RESPAWN_FRAMES + 5) { a.step(1); n++; }
  s.eq('the level committed once p0 (the first death) respawned', p0.state, 'fall');
  s.eq('p1 is still genuinely dead, not silently revived by the commit', p1.state, 'dead');
  s.ok('p1\'s own countdown is still counting down, not stomped to some other value',
    p1.deadFrames > 0 && p1.deadFrames < CFG.RESPAWN_FRAMES);

  // Immediately after the commit, walk p0 to the new level's exit while
  // p1 is STILL dead — the level->boss transition must not relocate p1
  // out of their own countdown either.
  //
  // Test-coverage gap (adversarial pass): this is also the one place in
  // this file a real checkpoint fires while a co-op partner is genuinely
  // dead — the exact case _healAtCheckpoint()'s `if (!p.alive()) continue;`
  // guard exists for. Give p0 a real, distinct partial injury first so
  // p0's own share of the heal is provably nonzero and separately
  // checkable — p1's hp already reads exactly 0 from hurt() above, which
  // would make a weaker "missing <= 0" skip reason look identical to the
  // real "not alive" one; this tells the two apart.
  p0.hp = p0.maxHp - 6;
  let checkpointPayload = null;
  a.sim.bus.on('checkpoint', (e) => { checkpointPayload = e; });
  for (const t of a.sim.targets) a.realKill(t);
  a.b(0).x = a.sim.exit[0]; a.b(0).y = a.sim.exit[1] - a.b(0).h;
  a.step(1);
  s.eq('the still-dead p1 is untouched by a room-advance transition too', p1.state, 'dead');
  s.ok('a checkpoint really did fire while p1 was still genuinely dead', !!checkpointPayload);
  s.eq('the alive partner (p0) is healed for their own real share',
    p0.hp, p0.maxHp - 6 + Math.ceil(6 * CFG.CHECKPOINT_HEAL_FRAC));
  s.eq('checkpoint.healed reflects ONLY the alive partner\'s share, no phantom share for the dead one',
    checkpointPayload.healed, Math.ceil(6 * CFG.CHECKPOINT_HEAL_FRAC));
  s.eq('p1\'s hp is left exactly as hurt() set it — never touched by the heal despite "missing" almost all of it',
    p1.hp, 0);

  // Let p1's own countdown finish out naturally.
  let n2 = 0;
  while (p1.state === 'dead' && n2 < CFG.RESPAWN_FRAMES + 5) { a.step(1); n2++; }
  s.eq('p1 eventually respawns correctly on their own schedule, never orphaned', p1.state, 'fall');
  s.eq('p1 lands at hp restored by the ordinary respawn path, not a stomped 0', p1.hp, p1.maxHp);
}

{
  // Regression (adversarial pass): beginRun() must be a genuine restart,
  // not just a first-time initializer — a run-end already in flight from a
  // PRIOR beginRun() call must never survive into a fresh one and later
  // commit stale data mid-tick.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(40);
  a.p().hp = 1;
  a.p().hurt(1, a.sim.bus, [0, 0]);
  a.step(1);
  s.ok('a pending level end is in flight from the first run', !!a.sim._pendingLevel);

  a.sim.beginRun(41);
  s.eq('beginRun() clears a stale pending level from a prior run', a.sim._pendingLevel, null);
  s.eq('beginRun() clears a stale runEndFrames countdown too', a.sim.runEndFrames, -1);
  s.eq('the fresh run actually reflects the NEW seed', a.sim.run.runSeed, 41);
  s.ok('player is alive again in the fresh level, not still counting down', a.p().alive());

  const seedBefore = a.sim.run.levelSeed;
  a.step(CFG.RESPAWN_FRAMES + 10);
  s.eq('no stale pending data silently commits a level swap that was never asked for',
    a.sim.run.levelSeed, seedBefore);
}

/* =============================================================================
 * 8. Regressions from the dedicated adversarial-verification pass this
 * project's own discipline requires of every feature once it is built and
 * green (§5g/§5i/§5j/§5k in the masterfile) — this file's own §5l entry.
 * Four independent lenses found four real, distinct bugs; each gets its own
 * regression here, the same way every prior pass in this project has.
 * ============================================================================= */

{
  // Regression: a boot-path practice Dummy (id 100, added AFTER beginRun()
  // the exact way 95-app.js's own boot() does) must never bank real run
  // currency. isLevelClear()/_roster() were already guarded against it via
  // _levelRosterIds; the SEPARATE currency-banking targetDown listener was
  // not — a real, adversarially-found gap.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(80);
  const dummy = a.sim.addTarget(new C.Combat.Dummy(100, a.b().x + 20, a.b().y, 40));
  s.eq('kills start at zero even with a boot-path dummy present', a.sim.run.kills, 0);
  a.realKill(dummy);
  s.eq('killing the boot-path dummy through the real damage path never banks a kill',
    a.sim.run.kills, 0);
}

{
  // Regression: kills landed by a surviving co-op partner DURING the
  // death-pending window (after a teammate dies, before the level actually
  // commits — the OLD level stays fully live and simulating the whole
  // time) must still be paid out, not silently discarded when run.kills
  // resets to 0 at commit. The old _beginRunEnd() banked currency from
  // run.kills too early — at the moment of the trigger, not the commit —
  // so any kill landed afterward was counted (run.kills visibly climbed)
  // but never paid.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(90);
  const p0 = a.sim.players[0], p1 = a.sim.players[1];
  const targets = a.sim.targets.slice();
  a.realKill(targets[0]);
  p0.hp = 1; p0.hurt(1, a.sim.bus, [0, 0]);
  a.step(1);
  s.ok('a pending level end is in flight after the first death', !!a.sim._pendingLevel);
  s.ok('p1 is still alive and free to keep fighting the old, still-live level', p1.alive());

  for (let i = 1; i < targets.length; i++) if (targets[i].alive()) a.realKill(targets[i]);
  s.eq('run.kills keeps counting every real kill landed during the pending window',
    a.sim.run.kills, targets.length);

  let n = 1;
  while (p0.state === 'dead' && n < CFG.RESPAWN_FRAMES + 5) { a.step(1); n++; }
  s.eq('every kill landed before the COMMIT — not just before the death — is paid out',
    a.sim.run.currency, RunLogic.currencyEarned(targets.length, false));
}

{
  // Regression, co-op: D2 ("each stat starts at 1 every run") must reset
  // EVERY player at a run boundary, not just whichever one happened to
  // die. Before this, a surviving partner's stats/maxHp carried straight
  // through a boundary the game's own bookkeeping (runsCompleted) calls
  // brand new, as an accidental side effect of resetTransient() only ever
  // firing from beginRun() or a dying player's own natural respawn.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(95);
  const p0 = a.sim.players[0], p1 = a.sim.players[1];
  p0.gainStat('ember', a.sim.bus);
  p1.gainStat('umbral', a.sim.bus);
  s.ok('p1 has grown past the starting baseline before any run boundary',
    p1.stats.umbral > CFG.STAT_START);

  p0.hp = 1; p0.hurt(1, a.sim.bus, [0, 0]);
  a.step(1);
  let n = 1;
  while (p0.state === 'dead' && n < CFG.RESPAWN_FRAMES + 5) { a.step(1); n++; }
  s.eq('runsCompleted advanced — the game calls this a new run', a.sim.run.runsCompleted, 1);
  s.eq('the player who died is back at the D2 baseline', p0.stats.ember, CFG.STAT_START);
  s.eq('the SURVIVING partner is ALSO reset to the D2 baseline at the same boundary',
    p1.stats.umbral, CFG.STAT_START);
  s.eq("and the survivor's maxHp too", p1.maxHp, CFG.MAX_HP);
}

{
  // Regression, solo: a boss victory with nobody dying is ALSO a real run
  // boundary (runsCompleted still advances) and must ALSO reset stats —
  // not just the death path, which is the only one beginRun()'s own fix
  // and the co-op regression above happen to exercise.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(96);
  a.p().gainStat('verdant', a.sim.bus);
  s.ok('grown past the baseline before the boss fight', a.p().stats.verdant > CFG.STAT_START);

  a.clearRoomAndAdvance(CFG.ROOM_COUNT - 1);
  for (const t of a.sim.targets) a.realKill(t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  a.realKill(a.sim.bossTarget);
  let n = 0;
  while (a.sim.run.phase !== 'level' && n < CFG.RESPAWN_FRAMES + 10) { a.step(1); n++; }
  s.eq('a boss victory with no death also resets stats at the boundary',
    a.p().stats.verdant, CFG.STAT_START);
}

{
  // Test-coverage gap (adversarial pass): a room's roster clearing on the
  // EXACT SAME tick a player dies must not fire a checkpoint at all —
  // _stepRun()'s own room-clear block is gated on `!justDied`, the same
  // "a fatal trade always wins" rule already documented above it for the
  // boss-door check. A room lost to a death in the same tick is not saved.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(154);
  const p0 = a.sim.players[0];
  let fires = 0;
  a.sim.bus.on('checkpoint', () => { fires++; });
  const targets = a.sim.targets.slice();
  for (let i = 0; i < targets.length - 1; i++) a.realKill(targets[i]);
  p0.hp = 1; p0.hurt(1, a.sim.bus, [0, 0]);        // p0 dies...
  a.realKill(targets[targets.length - 1]);          // ...the SAME tick the roster clears
  a.step(1);
  s.eq('a room clearing on the exact tick a player dies never fires a checkpoint',
    fires, 0);
  s.ok('the death itself is still real and in flight', !!a.sim._pendingLevel);

  let n = 1;
  while (p0.state === 'dead' && n < CFG.RESPAWN_FRAMES + 5) { a.step(1); n++; }
  s.eq('no checkpoint fired at any point across the whole death/respawn sequence',
    fires, 0);
}

/* =============================================================================
 * 9. Test-coverage additions from this project's own adversarial-
 * verification pass on the room/checkpoint/cinders feature (§5l again) —
 * real, confirmed absences of coverage for already-correct behavior,
 * distinct from the CRITICAL alcove-reachability bug already regression-
 * tested in section 7 above: the heal math, the tube's own placement
 * geometry, the ROOM_COUNT boundary, and the checkpoint event's own
 * payload fields.
 * ============================================================================= */

{
  // _healAtCheckpoint()'s own math: CFG.CHECKPOINT_HEAL_FRAC of the
  // MISSING hp (not of maxHp), rounded up — and the checkpoint event's own
  // `healed`/`roomIndex` fields must report the exact real numbers, not an
  // approximation.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(400);
  a.p().hp = a.p().maxHp - 7;   // an odd number specifically, to exercise the ceil()
  let payload = null;
  a.sim.bus.on('checkpoint', (e) => { payload = e; });
  for (const t of a.sim.targets) a.realKill(t);
  a.step(1);
  const expected = Math.ceil(7 * CFG.CHECKPOINT_HEAL_FRAC);
  s.ok('the checkpoint fires the instant the roster clears, independent of the player ever reaching the exit',
    !!payload);
  s.eq('checkpoint.roomIndex names the room that was just cleared, not wherever the run ends up next',
    payload.roomIndex, 0);
  s.eq('checkpoint.healed matches ceil(missing * CHECKPOINT_HEAL_FRAC) exactly',
    payload.healed, expected);
  s.eq('the player actually received that exact heal, not just the event claiming it',
    a.p().hp, a.p().maxHp - 7 + expected);
}

{
  // A checkpoint reached at full health heals exactly nothing — a real
  // fraction of MISSING hp, not a flat number wasted on a player who
  // needed none of it.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(401);
  let payload = null;
  a.sim.bus.on('checkpoint', (e) => { payload = e; });
  for (const t of a.sim.targets) a.realKill(t);
  a.step(1);
  s.eq('a checkpoint reached at full health heals exactly nothing', payload.healed, 0);
  s.eq('and never overheals past maxHp', a.p().hp, a.p().maxHp);
}

{
  // _checkpointFired guards _onRoomClear() to once per room — the roster
  // stays cleared for many ticks before the player happens to reach the
  // exit, and it must not refire every one of them.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(402);
  let fires = 0;
  a.sim.bus.on('checkpoint', () => { fires++; });
  for (const t of a.sim.targets) a.realKill(t);
  a.step(20);   // room stays clear, far from the exit, for many real ticks
  s.eq('the checkpoint fires exactly once per room clear, not once per tick it stays true',
    fires, 1);
}

{
  // Co-op: the checkpoint heals EVERY alive player, and the event's own
  // `healed` total is the SUM across every partner's own share, not just
  // whichever player happens to be checked first.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(403);
  const p0 = a.sim.players[0], p1 = a.sim.players[1];
  p0.hp = p0.maxHp - 10; p1.hp = p1.maxHp - 4;
  let payload = null;
  a.sim.bus.on('checkpoint', (e) => { payload = e; });
  for (const t of a.sim.targets) a.realKill(t);
  a.step(1);
  const e0 = Math.ceil(10 * CFG.CHECKPOINT_HEAL_FRAC), e1 = Math.ceil(4 * CFG.CHECKPOINT_HEAL_FRAC);
  s.eq('p0 is healed by its own real share', p0.hp, p0.maxHp - 10 + e0);
  s.eq('p1 is healed by its own real share too', p1.hp, p1.maxHp - 4 + e1);
  s.eq('checkpoint.healed is the SUM across both partners, not just one',
    payload.healed, e0 + e1);
}

{
  // ROOM_COUNT boundary: the chain advances room-by-room (checked at every
  // step, not skipped straight to the end the way other tests in this file
  // convenience-jump via clearRoomAndAdvance(ROOM_COUNT-1)), and
  // clearing+exiting the LAST combat room enters the boss — never a room
  // CFG.ROOM_COUNT that doesn't exist.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(404);
  s.eq('starts at room 0', a.sim.run.roomIndex, 0);
  for (let expected = 1; expected < CFG.ROOM_COUNT; expected++) {
    a.clearRoomAndAdvance(1);
    s.eq('advances to room ' + expected + ' exactly', a.sim.run.roomIndex, expected);
    s.eq('still the level phase — the last combat room is not the boss itself',
      a.sim.run.phase, 'level');
  }
  for (const t of a.sim.targets) a.realKill(t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  s.eq('clearing+exiting the FINAL combat room enters the boss, never a room CFG.ROOM_COUNT',
    a.sim.run.phase, 'boss');
}

{
  // The tube's own placement geometry (decision 3, room-checkpoint-
  // structure spec): its own interact radius must never overlap the
  // exit's own advance-trigger radius — a static claim about the two CFG
  // constants themselves, not seed-dependent.
  s.ok('TUBE_OFFSET_X leaves real clearance between the tube\'s own interact radius and the exit\'s advance radius',
    CFG.TUBE_OFFSET_X - CFG.TUBE_INTERACT_RADIUS >= CFG.RUN_EXIT_RADIUS,
    CFG.TUBE_OFFSET_X + '/' + CFG.TUBE_INTERACT_RADIUS + '/' + CFG.RUN_EXIT_RADIUS);

  // And per-room: _buildCheckpointAlcove() always returns a tube level with
  // the exit and within the real widened stamped run — by construction
  // (the fallback branch, taken whenever neither side has a full
  // TUBE_OFFSET_X of room, clamps to whichever edge of the stamped run is
  // furthest from the exit, never past it).
  let sampled = 0, fullOffset = 0;
  for (let seed = 500; seed < 530; seed++) {
    const gen = Gen.generate(seed, { beats: CFG.ROOM_BEATS, pickups: CFG.ROOM_PICKUPS });
    const sim = new C.Sim({ world: gen.world, seed, players: 1, spawns: [gen.spawn] });
    const tube = sim._buildCheckpointAlcove(gen);
    sampled++;
    s.eq('the tube sits level with the exit (same y)', tube[1], gen.exit[1]);
    const exitTileX = Math.round(gen.exit[0] / CFG.TILE);
    const half = Math.floor(CFG.CHECKPOINT_ALCOVE_TILES / 2);
    const minXTile = Math.max(1, exitTileX - half), maxXTile = Math.min(gen.world.w - 2, exitTileX + half);
    s.ok('the tube never lands outside the widened stamped run',
      tube[0] >= minXTile * CFG.TILE && tube[0] <= maxXTile * CFG.TILE,
      'seed ' + seed + ': ' + tube[0] + ' not in [' + (minXTile * CFG.TILE) + ',' + (maxXTile * CFG.TILE) + ']');
    if (Math.abs(tube[0] - gen.exit[0]) === CFG.TUBE_OFFSET_X) fullOffset++;
  }
  // Named honestly rather than assumed: at CHECKPOINT_ALCOVE_TILES/
  // CLIMB_CLEARANCE_TILES's real current values, the CLAMPED fallback
  // placement is actually the COMMON case at these room dimensions, not a
  // rare edge one — measured at 9/30 (30%) full-offset placements across
  // this sample when this test was written. That is a real, acceptable
  // characteristic of the current tuning (the tube is still always safely
  // placed within the stamped run, proven above), not a bug to chase; the
  // only claim actually load-bearing here is that the ideal branch is
  // real, reachable code, not dead weight.
  s.ok('the full, ideal offset is real, reachable placement code, not dead code',
    fullOffset > 0, fullOffset + '/' + sampled);
}

{
  // Regression: nextRunSeed's own iterated chain — the one seed-derivation
  // function actually chained many times across a play session, once per
  // run, unlike the others which are always freshly derived — must not
  // repeat a levelSeed within a realistic session length. The bare-XOR
  // version (no real avalanche mix) repeated at exactly run #300 -> #304
  // for every starting seed tried, a structural collision, not a
  // probabilistic one: byte-identical platforms/spawn/exit/pickups/roster,
  // confirmed with a real script before this was called a bug.
  function levelSeedChain(startSeed, n) {
    var runSeed = (startSeed >>> 0) || 1, out = [];
    for (var i = 0; i < n; i++) {
      out.push(RunLogic.deriveLevelSeed(runSeed, 0));
      runSeed = RunLogic.nextRunSeed(runSeed, i);
    }
    return out;
  }
  [1, 42, 777777777, 2026].forEach((startSeed) => {
    const chain = levelSeedChain(startSeed, 500);
    const seen = new Set(chain);
    s.eq('500 consecutive runs from seed ' + startSeed + ' produce 500 distinct levels',
      seen.size, chain.length);
  });
}

process.exit(s.done());
