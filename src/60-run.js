/* ===========================================================================
 * 60-run.js  —  the run loop (D1): spawn -> clear -> boss -> die -> spend -> respawn
 * ---------------------------------------------------------------------------
 * SIM layer. Everything exported here is pure — plain numbers, booleans, and
 * plain arrays/objects in, the same shape out. This file never references
 * Sim, Player, Enemy, World, or Body, the same discipline 50-gen.js's own
 * buildGraph()/audit() already established for reachability (plain platform
 * lists, no World object ever touches that half of the fairness audit). The
 * one stateful thing here, `Run`, is a plain data holder with no methods of
 * its own — it is not a decision engine, just a named, cohesive place for
 * the handful of fields a run needs to remember between ticks (its own seed,
 * which level it's on, how much it's banked), owned and mutated by 70-sim.js
 * the same way Sim already owns this.rig/this.pads as sub-objects it did not
 * itself author.
 *
 * Chosen by a judged 3-pitch design panel (see CINDER_LOOP_CHANGELOG.md's
 * v0.2.13 entry for the full record) — genuinely open design space, unlike
 * wall interaction/slam impact/ledge grab, which all skipped a panel because
 * an existing rule already dictated their shape. This is a synthesis of the
 * panel's strongest, judge-verified pieces, not a straight adoption of any
 * one pitch: two independent judges found real, source-verifiable bugs in
 * ALL THREE competing pitches (a self-contradicting RNG stream in one, a
 * central transition that was promised but never actually written in
 * another, and a nested-guard deadlock in the third that permanently froze
 * the game after any boss victory that wasn't preceded by a death) — none
 * shipped as originally pitched.
 *
 * "Clear," precisely: every enemy this level placed has hp <= 0, AND a
 * living player has reached the level's own exit point (RUN_EXIT_RADIUS).
 * Reaching the exit alone would let a player tunnel past every enemy this
 * file placed; killing everything without ever reaching the door would
 * strand the run with nothing to advance it. Both, unanimous across all
 * three competing panel pitches and both judges.
 *
 * Zero new Bus events — also unanimous across the panel. Every transition
 * this file drives is read off state Sim already needs to own for other
 * reasons (which world is loaded, this.exit's own nullness, a target's own
 * hp) or reuses an existing event that already fires at exactly the right
 * moment ('death'/'respawn'/'targetDown' — none of them new). This directly
 * extends the precedent this codebase already set for the boss's own
 * phase-1/phase-2 transition (45-enemy.js: `this.phase = 1;`, zero
 * accompanying Bus event) one level up, to which level/phase of a RUN is
 * currently loaded.
 *
 * Owned by: Run team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, RNG = C.RNG, DATA = C.DATA;

/* -------------------------------------------------------------------- Run
 * A plain data holder, not an engine. `phase` mirrors this codebase's own
 * existing precedent for a closely analogous problem (Sim.hash()'s comment,
 * unprompted, already states it directly: "this codebase has ALREADY
 * CHOSEN, for the... boss-phase problem, to store phase as an explicit
 * integer field on the entity and hash it directly, not to derive it on
 * demand each tick") — an explicit stored field, not re-derived from other
 * state every tick the way a losing panel pitch tried and left its own
 * central transition unwritten while attempting.
 *
 * Deliberately owns no RNG of its own: an earlier panel pitch gave Run a
 * private `new RNG(seed)` stream seeded from the exact same value Sim's own
 * `this.rng` already uses — two PRNGs built from an identical seed produce
 * byte-identical output, so that "independent" stream was not independent
 * at all, a real, source-verified bug an adversarial judge caught directly
 * against this file's own L4 (per-instance seeded RNG) discipline. Nothing
 * here needs a live RNG cursor: `nextRunSeed`/`deriveLevelSeed` below are
 * pure integer-mixing functions of their own arguments, not draws from a
 * stream, so there is no second stream to accidentally collide with Sim's. */
function Run(seed) {
  this.phase = 'level';         // 'level' | 'boss'
  this.runSeed = (seed >>> 0) || 1;
  this.levelSeed = 0;           // set by Sim the moment a level actually loads
  this.currency = 0;            // D8's thin stub — 65-meta.js's real economy hangs off this later
  this.runsCompleted = 0;
  this.kills = 0;               // regular (non-boss) kills banked toward THIS run's payout
}

/* ---------------------------------------------------------------- seeding
 * A proper 32-bit avalanche mix, not a bare XOR-and-hope. Reuses the exact
 * mixing step already proven inside `RNG.prototype.next()` (00-core.js) —
 * the established, already-tested way this codebase turns one 32-bit
 * integer into a well-distributed one — rather than inventing a second,
 * different hash for this file alone.
 *
 * This function's own first draft (every function below just did
 * `a ^ (b * constant)`, no further mixing) did NOT avalanche: a LINEARLY
 * GROWING salt XORed straight into an accumulator lets several consecutive
 * salts cancel back to an earlier value. Found for real, adversarially, in
 * `nextRunSeed` specifically — the one function here actually CHAINED many
 * times across a play session (once per run) rather than freshly derived
 * each time: `u32(301*40503) ^ u32(302*40503) ^ u32(303*40503) ^
 * u32(304*40503) === 0` for every starting seed tried, meaning the
 * accumulated runSeed (and therefore the very next level, since a "run" is
 * always `deriveLevelSeed(runSeed, 0)`) at run #304 was byte-identical to
 * run #300 — every player who reached their 304th run would have replayed
 * their 300th level, platforms/spawn/exit/pickups/roster all identical,
 * confirmed with a real script, not algebra alone. A synthetic 2,000,000-run
 * chain showed 32,789 such collisions total — a properly avalanched 32-bit
 * hash would show none until run counts in the tens of thousands (the
 * birthday bound near sqrt(2^32) ≈ 65,000). Applied to all four
 * functions below, not just the one caught chaining — `deriveLevelSeed`
 * carries an unused `levelIndex` parameter for exactly this kind of
 * iteration and is one future caller away from the same bug. */
function mix32(x) {
  x = (x + 0x6D2B79F5) >>> 0;
  x = Math.imul(x ^ (x >>> 15), x | 1) >>> 0;
  x = (x + Math.imul(x ^ (x >>> 7), x | 61)) >>> 0;
  return (x ^ (x >>> 14)) >>> 0;
}

/* Both are plain multiplicative-hash mixes, not RNG draws — the same shape
 * 45-enemy.js's own Enemy constructor already uses to salt a per-instance
 * seed off its id (`id * 2654435761`, a real odd Knuth multiplicative
 * constant already established in this exact codebase). Two different
 * multipliers keep a run's own seed sequence and one level's per-run seed
 * from ever colliding at the same "distance" from their shared root. */
function deriveLevelSeed(runSeed, levelIndex) {
  return (mix32(runSeed ^ ((levelIndex + 1) * 2654435761)) >>> 0) || 1;
}
function nextRunSeed(prevRunSeed, runsCompleted) {
  return (mix32(prevRunSeed ^ ((runsCompleted + 1) * 40503)) >>> 0) || 1;
}
// A level's enemy placement gets its own salted seed, distinct from the
// level's own geometry seed — so re-rolling placement logic later never
// silently perturbs which geometry a given level seed produces, and vice
// versa. 0x504C4143 spells "PLAC" in ASCII hex, purely a readable tag.
function deriveEnemySeed(levelSeed) {
  return (mix32(levelSeed ^ 0x504C4143) >>> 0) || 1;
}
// Same idea, for the boss's own per-instance seed (its brain/telegraph
// timing) — kept distinct from deriveEnemySeed's own salt so the boss and
// a level's regular roster never draw from the same derived stream, even
// though only one of the two is ever alive at a time. 0x424F5353 = "BOSS".
function deriveBossSeed(levelSeed) {
  return (mix32(levelSeed ^ 0x424F5353) >>> 0) || 1;
}

/* --------------------------------------------------------------- "clear"
 * `targets`: plain objects with a numeric `.hp` — real Enemy/Dummy
 * instances satisfy this by construction, but nothing here calls a method
 * on them or checks their type, so a hand-built `[{hp:5},{hp:0}]` fixture
 * is exactly as valid an argument as a real roster (L8: testable without a
 * Sim, a World, or an Enemy anywhere in sight). An empty roster is never
 * vacuously "clear" — a level whose enemy-placement roll happened to place
 * zero of them still requires a player to actually walk to the door, not
 * silently clear the instant it loads. */
function isLevelClear(targets) {
  if (!targets.length) return false;
  for (var i = 0; i < targets.length; i++) if (targets[i].hp > 0) return false;
  return true;
}

// `exit`: a plain [x,y] or null. `px`/`py` are a player body's OWN center,
// computed by the caller (Sim, which has the Body) — this function never
// touches a Body directly.
function reachedExit(px, py, exit, radius) {
  if (!exit) return false;
  var dx = px - exit[0], dy = py - exit[1];
  return (dx * dx + dy * dy) <= radius * radius;
}

/* ------------------------------------------------------------ D8's stub
 * `spend` genuinely refuses an unaffordable cost rather than letting
 * currency go negative — exercised real infrastructure even though
 * RUN_SPEND_STUB_COST is 0 today, so the day 65-meta.js gives it a real,
 * nonzero price the call site does not need to change, only the constant
 * does. */
function currencyEarned(kills, bossDefeated) {
  return kills * CFG.RUN_CURRENCY_PER_KILL + (bossDefeated ? CFG.RUN_CURRENCY_PER_BOSS : 0);
}
function spend(currency, cost) {
  if (cost > currency) return { currency: currency, spent: 0, ok: false };
  return { currency: currency - cost, spent: cost, ok: true };
}

/* --------------------------------------------------------- enemy placement
 * Ports 95-app.js's own `placeGeneratedEnemies`/`ENEMY_BODY_H`/`ROSTER_ORDER`
 * verbatim in spirit — that function's own comment already named this file
 * as its intended replacement ("60-run.js's job once it exists... a
 * temporary stand-in that is honest about being one"). `DATA.ENEMY_IDS` is
 * already alphabetical (ashwalker, emberrush, kilnspitter, wickmoth), which
 * happens to already be the intended teaching order too (melee, then
 * charge, then shoot, then fly) — one fewer hand-maintained table to drift
 * out of sync with 10-data.js than the original had, since `t.h`/`t.mode`
 * already exist on every ENEMIES entry.
 *
 * `platforms`: the exact plain-record shape Gen.generate()'s own return
 * value already carries (`{x0,x1,y,kind,spur}`) — no World, matching
 * buildGraph()/audit()'s own precedent. Up to one enemy per roster
 * template, spaced evenly across eligible (non-spawn, non-spur) platforms,
 * so each is met alone before any are met together — the same reasoning
 * the ported original already stated for its own layout. */
function placeEnemies(platforms, seed) {
  var candidates = [], i;
  for (i = 1; i < platforms.length; i++) {
    if (!platforms[i].spur) candidates.push(i);
  }
  if (!candidates.length) return [];

  var rng = new RNG(seed);
  var order = DATA.ENEMY_IDS;
  var placed = [], step = Math.max(1, Math.floor(candidates.length / order.length));
  for (var r = 0; r < order.length; r++) {
    var ci = Math.min(r * step, candidates.length - 1);
    var p = platforms[candidates[ci]];
    var tid = order[r];
    var t = DATA.ENEMIES[tid];
    var x = Math.floor((p.x0 + p.x1) / 2) * CFG.TILE;
    // Flying wickmoth does not need to rest on a surface — mode 'fly' skips
    // gravity entirely and hovers toward the player — so it is placed a few
    // tiles above its chosen platform instead of on it.
    var y = t.mode === 'fly' ? (p.y - 3) * CFG.TILE : (p.y * CFG.TILE - t.h);
    placed.push({ tid: tid, x: x, y: y, seed: (rng.int(0xFFFFFFFF) ^ (ci * 2654435761)) >>> 0 });
  }
  return placed;
}

C.Run = Run;
C.RunLogic = {
  deriveLevelSeed: deriveLevelSeed,
  nextRunSeed: nextRunSeed,
  deriveEnemySeed: deriveEnemySeed,
  deriveBossSeed: deriveBossSeed,
  isLevelClear: isLevelClear,
  reachedExit: reachedExit,
  currencyEarned: currencyEarned,
  spend: spend,
  placeEnemies: placeEnemies
};

})(CINDER);
