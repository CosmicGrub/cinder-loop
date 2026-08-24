/* ===========================================================================
 * 50-gen.js  —  procedural tile generation + the fairness audit (D3, D3a)
 * ---------------------------------------------------------------------------
 * SIM layer. Produces a `World` plus spawn/exit/pickup points, exactly the
 * shape `70-sim.js` already consumes from a hand-built or demo level — this
 * file has no idea Sim exists, and Sim will have no idea this file exists.
 * Enemy placement is deliberately NOT here: that is `60-run.js`'s job once it
 * exists (spawn → clear → boss → death → spend, D1), not a level-geometry
 * concern. This file's whole job is producing a fair, traversable shape.
 *
 * THE AUDIT IS THE POINT (D3). A generated layout that occasionally strands
 * a pickup on an island, or asks for a jump nobody can make, is not a bug
 * that shows up in a stack trace — it shows up as "that run felt bad," the
 * hardest bug class to chase, because nothing crashed. D3a's answer is to
 * make it a number: every candidate layout is reachability-audited before
 * it is ever handed to a player, unfair candidates are thrown away and
 * regenerated, and the REJECTION RATE is reported rather than hidden —
 * `Gen.generate()`'s return value carries `attempts`/`rejected` so a caller
 * (today: the test suite; later: real telemetry) can see exactly how often
 * the generator's own risk-taking actually produced something to reject.
 *
 * The capability numbers the audit reasons with are MEASURED, not guessed —
 * see the GEN_* block in 00-core.js for exactly how and the margin taken
 * below each measured ceiling. Owned by: Generation team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, TILE = C.TILE, World = C.World, RNG = C.RNG;

/* ------------------------------------------------------- capability model
 * `rise` is in TILES, positive means the target platform is HIGHER (world
 * rows count downward, so a higher platform has a SMALLER row index — every
 * caller passes `fromY - toY`, never a raw row subtraction, so this sign
 * convention lives in exactly one place). Returns the widest gap (tiles)
 * capability allows for that rise, or -1 if the rise itself is beyond
 * anything reachable at all (GEN_MAX_RISE_TILES).
 *
 * Falling to a LOWER or equal platform is modeled as the flat-gap case
 * throughout — a conservative floor, not a claim that a long drop cannot
 * cover more horizontal distance than a flat jump (it can; it was not
 * separately measured, and understating capability here only ever makes the
 * audit MORE cautious, never less). */
function maxGapForRise(rise) {
  if (rise <= 0) return CFG.GEN_FLAT_GAP_TILES;
  if (rise === 1) return CFG.GEN_RISE1_GAP_TILES;
  if (rise === 2) return CFG.GEN_RISE2_GAP_TILES;
  if (rise <= 4) return CFG.GEN_DBLJUMP_GAP_TILES;
  if (rise <= CFG.GEN_MAX_RISE_TILES) return CFG.GEN_DBLJUMP_HIGH_GAP_TILES;
  return -1;
}

// The floor under a double-jump climb — see GEN_DBLJUMP_MIN_GAP_TILES in
// 00-core.js for why gap 0 is specifically excluded from that range. Flat
// and single-jump rises have no such requirement; a flush step is fine.
function minGapForRise(rise) {
  if (rise < 3) return 0;
  // Mirrors maxGapForRise's own HIGH-band split at the same boundary (rise
  // <= 4 vs. rise 5): the floor tightens right where the ceiling does,
  // because both are governed by the same shrinking margin near the limit
  // of what a double jump can reach at all. See GEN_DBLJUMP_HIGH_MIN_GAP_TILES
  // in 00-core.js for the measurement that found rise 5 needed a higher floor
  // than rise 3-4.
  return rise <= 4 ? CFG.GEN_DBLJUMP_MIN_GAP_TILES : CFG.GEN_DBLJUMP_HIGH_MIN_GAP_TILES;
}

// The horizontal gap between two platforms, in tiles: 0 if they overlap in
// x (one directly above/below the other counts as zero-gap, reachable at
// any rise the capability table allows), otherwise the empty space between
// their nearest edges.
function gapBetween(a, b) {
  if (a.x1 >= b.x0 && b.x1 >= a.x0) return 0;
  return a.x1 < b.x0 ? (b.x0 - a.x1 - 1) : (a.x0 - b.x1 - 1);
}

/* Platformer reachability is DIRECTED, not symmetric — dropping from a high
 * platform to a low one is always free; climbing the reverse is bounded by
 * real capability. A first version computed both directions and OR'd them
 * into one undirected edge, which meant a valid DROP from b down to a could
 * silently license the graph to also claim the CLIMB from a up to b — a real
 * correctness bug, not a theoretical one: it is very likely the majority
 * cause of every case the physics cross-check below found the graph
 * disagreeing with a real held jump on. `edgeAllowed(from, to)` now answers
 * exactly one direction; the rise sign is computed once, unambiguously,
 * from that direction's own perspective, and `maxGapForRise` already folds
 * "dropping" onto its generous flat ceiling on its own — no second branch
 * needed to special-case it. */
function edgeAllowed(from, to) {
  var gap = gapBetween(from, to);
  var rise = from.y - to.y;        // positive: `to` is higher, a real climb
  var cap = maxGapForRise(rise);
  return cap >= 0 && gap <= cap && gap >= minGapForRise(rise);
}

/* ------------------------------------------------------------------ graph
 * Plain data in, plain data out — no World, no tiles, so this half of the
 * audit is testable with hand-built platform lists and nothing else.
 * DIRECTED: edges[i] lists every j reachable FROM i, which is not generally
 * the same set as what can reach i. */
function buildGraph(platforms) {
  var n = platforms.length, edges = [], i, j;
  for (i = 0; i < n; i++) edges.push([]);
  for (i = 0; i < n; i++) {
    for (j = 0; j < n; j++) {
      if (i === j) continue;
      if (edgeAllowed(platforms[i], platforms[j])) edges[i].push(j);
    }
  }
  return edges;
}

// BFS from a starting platform index; returns a boolean array of which
// platform indices are reachable. Deterministic traversal order (ascending
// index) — not load-bearing for correctness, but keeps it reproducible for
// anyone stepping through a failure by hand.
function reachableFrom(edges, startIdx) {
  var seen = new Array(edges.length).fill(false);
  if (startIdx < 0 || startIdx >= edges.length) return seen;
  var queue = [startIdx];
  seen[startIdx] = true;
  while (queue.length) {
    var cur = queue.shift();
    var next = edges[cur];
    for (var k = 0; k < next.length; k++) {
      if (!seen[next[k]]) { seen[next[k]] = true; queue.push(next[k]); }
    }
  }
  return seen;
}

/* --------------------------------------------------------------- THE AUDIT
 * `candidate.platforms` — every platform the generator placed, each
 * `{ x0, x1, y, kind, spur }` in TILE units. `spawnIdx`/`exitIdx` index into
 * it; `pickups` is a list of `{ platformIdx, x, y }`.
 *
 * D3a, verbatim: reachability from spawn to exit and to every pickup;
 * minimum fightable-platform widths; nothing here mutates the candidate —
 * audit() only ever reads and reports. */
function audit(candidate) {
  var platforms = candidate.platforms;
  var edges = buildGraph(platforms);
  var reach = reachableFrom(edges, candidate.spawnIdx);
  var reasons = [];

  if (!reach[candidate.exitIdx]) reasons.push('exit unreachable from spawn');

  var i;
  for (i = 0; i < candidate.pickups.length; i++) {
    var pu = candidate.pickups[i];
    if (!reach[pu.platformIdx]) reasons.push('pickup ' + i + ' unreachable from spawn');
  }

  // Spurs are bonus alcoves, not the intended combat path — narrow is fine.
  // Every other platform is somewhere a fight can land, and must be wide
  // enough to actually fight on (GEN_MIN_FIGHT_TILES, a design judgment, not
  // a measurement — see 00-core.js).
  for (i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    if (p.spur) continue;
    var width = p.x1 - p.x0 + 1;
    if (width < CFG.GEN_MIN_FIGHT_TILES) {
      reasons.push('platform ' + i + ' is ' + width + ' tiles wide, under the ' +
        CFG.GEN_MIN_FIGHT_TILES + '-tile fightable minimum');
    }
  }

  return { fair: reasons.length === 0, reasons: reasons, reachable: reach };
}

/* -------------------------------------------------------------- candidate
 * One attempt. May or may not be fair — that is audit()'s job to decide,
 * not this function's. `rng` is the caller's own RNG instance, advanced by
 * this call; generate() below is what makes the whole seed→layout mapping
 * deterministic (L4) by owning that single RNG across every attempt. */
var RISE_WEIGHTS = [
  [0, 3], [1, 4], [-1, 2], [-2, 1], [2, 3], [3, 2], [4, 1], [5, 1]
];

function pickRise(rng) {
  var total = 0, i;
  for (i = 0; i < RISE_WEIGHTS.length; i++) total += RISE_WEIGHTS[i][1];
  var roll = rng.range(0, total), acc = 0;
  for (i = 0; i < RISE_WEIGHTS.length; i++) {
    acc += RISE_WEIGHTS[i][1];
    if (roll < acc) return RISE_WEIGHTS[i][0];
  }
  return 0;
}

function placeMainBeat(rng, platforms, cursorX, cursorY) {
  var rise = pickRise(rng);
  // maxGapForRise already folds every rise <= 0 (a step down, however far)
  // onto the flat ceiling — falling is not the constrained direction, see
  // its own comment — so this needs no separate negative-rise branch.
  var cap = maxGapForRise(rise);
  var floor = minGapForRise(rise);

  var risky = rng.next() < CFG.GEN_RISK_CHANCE;
  var gap = risky
    ? cap + 1 + rng.int(2)                          // deliberately beyond capability
    : floor + rng.int(Math.max(1, cap - floor + 1));  // floor..cap inclusive, safely inside it

  var width = (risky && rng.next() < 0.5)
    ? 2 + rng.int(CFG.GEN_MIN_FIGHT_TILES - 2)   // deliberately too narrow
    : CFG.GEN_MIN_FIGHT_TILES + rng.int(6);

  var newX0 = cursorX + 1 + gap;
  var newY = cursorY - rise;
  var kind = rng.next() < 0.18 ? TILE.ONEWAY : TILE.SOLID;

  var p = { x0: newX0, x1: newX0 + width - 1, y: newY, kind: kind, spur: false };
  platforms.push(p);
  return p;
}

// A short side alcove branching off an existing platform — up or down,
// left or right — reachable only via its own capability-constrained hop,
// which is what makes "reachable to every pickup" a genuine question for
// the audit rather than trivially true by construction.
function placeSpur(rng, fromPlatform) {
  var rise = pickRise(rng);
  var cap = maxGapForRise(rise);
  var floor = minGapForRise(rise);
  var risky = rng.next() < CFG.GEN_RISK_CHANCE;
  var gap = risky ? cap + 1 + rng.int(2) : floor + rng.int(Math.max(1, cap - floor + 1));
  // Spurs are small on purpose, but not razor-thin: a 2-tile landing at the
  // end of a jump is the kind of precision a level design should not be
  // quietly demanding of every player. Found empirically, not guessed — the
  // physics cross-check below (verify_gen.js) struggled to reliably land a
  // real held jump on 2-tile targets even with correctly-modeled timing,
  // which reads as a genuine fairness-adjacent concern, not just a test
  // artifact: if a deliberately-tuned prover finds it fiddly, a player will
  // too. 3-5 tiles gives real, if modest, landing margin.
  var width = 3 + rng.int(3);
  var goRight = rng.next() < 0.5;
  var anchorX = goRight ? fromPlatform.x1 : fromPlatform.x0 - width;
  var newX0 = goRight ? anchorX + 1 + gap : anchorX - gap;
  var newY = fromPlatform.y - rise;
  return { x0: newX0, x1: newX0 + width - 1, y: newY, kind: TILE.SOLID, spur: true };
}

function generateCandidate(rng, opts) {
  var beats = opts.beats, pickupCount = opts.pickups;
  var platforms = [];
  var startY = 30;
  var start = { x0: 2, x1: 2 + CFG.GEN_MIN_FIGHT_TILES + 2, y: startY, kind: TILE.SOLID, spur: false };
  platforms.push(start);

  var cursor = start, i;
  for (i = 0; i < beats; i++) {
    cursor = placeMainBeat(rng, platforms, cursor.x1, cursor.y);
  }
  var exitIdx = platforms.length - 1;

  var pickups = [];
  var mainCount = platforms.length;   // spurs, once added, must not host more spurs
  for (i = 0; i < pickupCount; i++) {
    var hostIdx = 1 + rng.int(mainCount - 1);   // never spawn's own platform
    var host = platforms[hostIdx];
    var spur = placeSpur(rng, host);
    platforms.push(spur);
    pickups.push({
      platformIdx: platforms.length - 1,
      x: spur.x0 + Math.floor((spur.x1 - spur.x0) / 2),
      y: spur.y
    });
  }

  return { platforms: platforms, spawnIdx: 0, exitIdx: exitIdx, pickups: pickups };
}

/* ---------------------------------------------------------------- stamp
 * Turn an audited-fair candidate into a real World. Kept separate from
 * generateCandidate() on purpose: the audit runs on the cheap platform-list
 * representation, never on a full tilemap, so rejecting and regenerating a
 * candidate never pays for a World that gets thrown away. */
function stamp(candidate, rng) {
  var platforms = candidate.platforms;
  var minX = 0, maxX = 0, minY = Infinity, maxY = -Infinity, i;
  for (i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    if (p.x1 > maxX) maxX = p.x1;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  var w = maxX + 6;
  var skyAbove = 8;
  var deathRow = maxY + 10;         // room to actually fall, not just clip the pit
  var h = deathRow + 3;
  var world = new World(w, h);

  for (i = 0; i < platforms.length; i++) {
    var pl = platforms[i];
    for (var x = pl.x0; x <= pl.x1; x++) world.set(x, pl.y, pl.kind);
  }
  // The floor a missed jump eventually lands on — a hazard, matching how the
  // hand-built demo level's own pit is never a silent free fall (masterfile
  // §"honest state": falling costs a heart, it is not a teleport to spawn).
  for (var x2 = 0; x2 < w; x2++) world.set(x2, deathRow, TILE.HAZARD);
  for (var y = 0; y < h; y++) { world.set(0, y, TILE.SOLID); world.set(w - 1, y, TILE.SOLID); }

  var spawnP = platforms[candidate.spawnIdx];
  var exitP = platforms[candidate.exitIdx];
  var spawn = [(spawnP.x0 + 1) * CFG.TILE, spawnP.y * CFG.TILE - CFG.PLAYER_H];
  var exit = [Math.floor((exitP.x0 + exitP.x1) / 2) * CFG.TILE, exitP.y * CFG.TILE];
  var pickups = candidate.pickups.map(function (pu) {
    return [pu.x * CFG.TILE, pu.y * CFG.TILE];
  });

  return { world: world, spawn: spawn, exit: exit, pickups: pickups };
}

/* ------------------------------------------------------------- generate
 * The reject-and-regenerate loop (D3a). One RNG, owned here and advanced
 * across every attempt — same seed always produces the same sequence of
 * attempts and the same final layout (L4), including which candidates got
 * rejected along the way. */
function generate(seed, opts) {
  opts = opts || {};
  var beats = opts.beats === undefined ? 14 : opts.beats;
  var pickups = opts.pickups === undefined ? 4 : opts.pickups;
  var maxAttempts = opts.maxAttempts === undefined ? CFG.GEN_MAX_ATTEMPTS : opts.maxAttempts;

  var rng = new RNG(seed);
  var attempts = 0, rejected = 0, candidate = null, result = null;

  while (attempts < maxAttempts) {
    candidate = generateCandidate(rng, { beats: beats, pickups: pickups });
    result = audit(candidate);
    attempts++;
    if (result.fair) break;
    rejected++;
    candidate = null;
  }

  if (!candidate) {
    throw new Error('Gen.generate: no fair layout in ' + maxAttempts +
      ' attempts (seed ' + seed + '); last rejection: ' + (result ? result.reasons.join('; ') : '?'));
  }

  var stamped = stamp(candidate, rng);
  return {
    world: stamped.world, spawn: stamped.spawn, exit: stamped.exit, pickups: stamped.pickups,
    attempts: attempts, rejected: rejected,
    rejectionRate: rejected / attempts,
    platforms: candidate.platforms
  };
}

C.Gen = {
  generate: generate,
  generateCandidate: generateCandidate,
  audit: audit,
  buildGraph: buildGraph,
  reachableFrom: reachableFrom,
  maxGapForRise: maxGapForRise,
  minGapForRise: minGapForRise,
  gapBetween: gapBetween,
  edgeAllowed: edgeAllowed,
  stamp: stamp
};

})(CINDER);
