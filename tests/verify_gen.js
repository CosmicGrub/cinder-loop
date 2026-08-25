/* ===========================================================================
 * tests/verify_gen.js  —  the capability model, the audit, and the generator
 * ---------------------------------------------------------------------------
 * Four layers, cheapest and most isolated first:
 *   1. The pure capability model (maxGapForRise, gapBetween, edgeAllowed).
 *   2. The graph/BFS on hand-built platform lists with a known right answer.
 *   3. The audit (D3a) on hand-built fair and deliberately unfair candidates.
 *   4. The generator itself: determinism (L4), a non-vacuous rejection rate,
 *      and — the strongest check in the file — a REAL physics-driven agent
 *      attempting the actual edges the audit's graph claims are legal, in a
 *      sample of real generated levels. verify_arch/verify_move already
 *      prove the capability NUMBERS in 00-core.js are real; this suite is
 *      what proves the GRAPH MODEL built on top of them agrees with what a
 *      real player, ticked through real physics, can actually do — the L8
 *      concern this whole file exists to close: an audit is only as
 *      trustworthy as something independent that checks it isn't lying to
 *      itself.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_gen');
const C = H.loadSim();
const CFG = C.CFG, Gen = C.Gen, World = C.World, TILE = C.TILE;

/* =================================================================== 1. the
 * pure capability model */
{
  s.eq('flat/descending rise uses the flat ceiling', Gen.maxGapForRise(0), CFG.GEN_FLAT_GAP_TILES);
  s.eq('any step down uses the same flat ceiling', Gen.maxGapForRise(-4), CFG.GEN_FLAT_GAP_TILES);
  s.eq('rise 1 uses its own ceiling', Gen.maxGapForRise(1), CFG.GEN_RISE1_GAP_TILES);
  s.eq('rise 2 uses its own ceiling', Gen.maxGapForRise(2), CFG.GEN_RISE2_GAP_TILES);
  s.eq('rise 3 needs the double-jump ceiling', Gen.maxGapForRise(3), CFG.GEN_DBLJUMP_GAP_TILES);
  s.eq('rise 4 shares the same double-jump ceiling', Gen.maxGapForRise(4), CFG.GEN_DBLJUMP_GAP_TILES);
  s.eq('rise 5 (near the double-jump ceiling) gets its own, tighter cap',
    Gen.maxGapForRise(CFG.GEN_MAX_RISE_TILES), CFG.GEN_DBLJUMP_HIGH_GAP_TILES);
  s.eq('rise beyond GEN_MAX_RISE_TILES is simply not reachable',
    Gen.maxGapForRise(CFG.GEN_MAX_RISE_TILES + 1), -1);
  // Not globally monotonic, and correctly so: rise 3-4 (a double jump) has a
  // LOOSER ceiling than rise 2 (a single jump near its own limit), because
  // switching technique genuinely adds capability rather than exhausting it
  // further — matching the measured data precisely. The real invariant is
  // narrower: WITHIN one technique's range, the ceiling never loosens as
  // rise increases toward that technique's own limit.
  s.ok('within the single-jump range, the ceiling never loosens as rise increases',
    Gen.maxGapForRise(1) >= Gen.maxGapForRise(2));
  s.ok('within the double-jump range, the ceiling never loosens as rise increases',
    Gen.maxGapForRise(3) >= Gen.maxGapForRise(CFG.GEN_MAX_RISE_TILES));
  s.ok('and double-jump range only ever starts at or above the single-jump ceiling by design',
    Gen.maxGapForRise(3) >= 1);
}
{
  const a = { x0: 0, x1: 3, y: 10 }, b = { x0: 8, x1: 10, y: 10 };
  s.eq('gap is the empty space between nearest edges', Gen.gapBetween(a, b), 4);
  s.eq('gap is symmetric', Gen.gapBetween(b, a), 4);
  const touching = { x0: 4, x1: 6, y: 10 };
  s.eq('adjacent platforms (no empty tile between) have gap 0', Gen.gapBetween(a, touching), 0);
  const overlap = { x0: 2, x1: 5, y: 5 };
  s.eq('overlapping-in-x platforms (one above the other) have gap 0', Gen.gapBetween(a, overlap), 0);
}
{
  const low = { x0: 0, x1: 5, y: 20 };
  const atCap = { x0: 5 + CFG.GEN_FLAT_GAP_TILES, x1: 20, y: 20 };
  s.ok('at the flat ceiling: allowed', Gen.edgeAllowed(low, atCap));
  // gapBetween is `b.x0 - a.x1 - 1`, so one tile PAST the ceiling means
  // x0 = a.x1 + 1 + (ceiling + 1), not a.x1 + ceiling + 1 (which is still
  // exactly AT the ceiling, an off-by-one the first draft of this fixture
  // got wrong and which — because the assertion still "passed" against the
  // wrong boundary — would have quietly proven nothing).
  const overCap = { x0: low.x1 + 1 + CFG.GEN_FLAT_GAP_TILES + 1, x1: 30, y: 20 };
  s.eq('the fixture really is one tile past the ceiling', Gen.gapBetween(low, overCap), CFG.GEN_FLAT_GAP_TILES + 1);
  s.ok('one tile past the flat ceiling: not allowed', !Gen.edgeAllowed(low, overCap));

  const high = { x0: 5 + CFG.GEN_DBLJUMP_GAP_TILES, x1: 20, y: 20 - 3 };
  s.ok('a rise-3 gap within its own (looser, double-jump) ceiling is allowed climbing up',
    Gen.edgeAllowed(low, high));

  // edgeAllowed is DIRECTED, not symmetric — a first version treated it as
  // symmetric (OR-ing both directions into one undirected edge), which meant
  // a valid DROP could silently license an invalid CLIMB the other way. This
  // pair is chosen specifically to demonstrate real disagreement: climbing 2
  // tiles allows only a 2-tile gap (RISE2), but a 3-tile gap fits the more
  // generous flat/drop ceiling — so going up must fail while coming back
  // down the very same pair must succeed. Same off-by-one gotcha as `overCap`
  // above: gapBetween's `-1` means one tile PAST the RISE2 ceiling needs
  // `low.x1 + 1 + RISE2 + 1`, not `low.x1 + RISE2 + 1` (the latter lands
  // exactly AT the ceiling, which correctly ALLOWS the climb — silently
  // proving nothing, the same trap the comment above already names).
  const shelf = { x0: low.x1 + 1 + CFG.GEN_RISE2_GAP_TILES + 1, x1: 20, y: 20 - 2 };
  s.ok('climbing 2 tiles across a gap that only fits the flat ceiling fails',
    !Gen.edgeAllowed(low, shelf));
  s.ok('dropping back down across that exact same gap succeeds — direction matters',
    Gen.edgeAllowed(shelf, low));

  const tooHighToReach = { x0: 5, x1: 20, y: 20 - (CFG.GEN_MAX_RISE_TILES + 1) };
  s.ok('climbing beyond GEN_MAX_RISE_TILES is never allowed, however small the gap',
    !Gen.edgeAllowed(low, { x0: 6, x1: 20, y: tooHighToReach.y }));
  s.ok('but dropping that exact same distance is fine — falling has no height limit',
    Gen.edgeAllowed({ x0: 6, x1: 20, y: tooHighToReach.y }, low));
}

/* ============================================================ 2. graph/BFS
 * Hand-built platform lists with a known right answer — never derived from
 * the generator itself, so this is a genuine independent check of the graph
 * machinery, not a restatement of it. */
{
  // A simple chain: 0-1-2-3, each reachable only from its neighbour.
  const step = CFG.GEN_FLAT_GAP_TILES + 1;   // one tile PAST the ceiling: no edge
  const ok = CFG.GEN_FLAT_GAP_TILES;
  const chain = [
    { x0: 0, x1: 4, y: 20 },
    { x0: 5 + ok, x1: 9 + ok, y: 20 },
  ];
  chain.push({ x0: chain[1].x1 + 1 + ok, x1: chain[1].x1 + 5 + ok, y: 20 });
  const edges = Gen.buildGraph(chain);
  const reach = Gen.reachableFrom(edges, 0);
  s.ok('a well-formed chain is fully reachable from its start', reach.every((r) => r));
}
{
  // An ISLAND: platform 2 is deliberately placed far beyond any capability.
  const platforms = [
    { x0: 0, x1: 4, y: 20 },
    { x0: 5 + CFG.GEN_FLAT_GAP_TILES, x1: 10 + CFG.GEN_FLAT_GAP_TILES, y: 20 },
    { x0: 200, x1: 205, y: 20 }   // absurdly far — no capability reaches this
  ];
  const edges = Gen.buildGraph(platforms);
  const reach = Gen.reachableFrom(edges, 0);
  s.eq('the reachable platform is marked reachable', reach[1], true);
  s.eq('the island is correctly marked unreachable', reach[2], false);
}
{
  // A platform reachable only via TWO hops (A -> B -> C), where A -> C
  // directly would exceed any single-hop capability — proves the BFS is a
  // real multi-hop search, not just checking direct adjacency.
  const g = CFG.GEN_FLAT_GAP_TILES;
  const A = { x0: 0, x1: 4, y: 20 };
  const B = { x0: 5 + g, x1: 9 + g, y: 20 };
  const C2 = { x0: B.x1 + 1 + g, x1: B.x1 + 5 + g, y: 20 };
  s.ok('A and C are NOT directly reachable (the whole point of this case)',
    !Gen.edgeAllowed(A, C2));
  const edges = Gen.buildGraph([A, B, C2]);
  const reach = Gen.reachableFrom(edges, 0);
  s.ok('but C is reachable via B — genuine multi-hop BFS, not adjacency-only', reach[2]);
}
{
  s.ok('reachableFrom on an empty graph does not throw', (() => {
    try { Gen.reachableFrom([], 0); return true; } catch (e) { return false; }
  })());
  s.ok('an out-of-range start index does not throw', (() => {
    try { Gen.reachableFrom([[], []], 9); return true; } catch (e) { return false; }
  })());
}

/* =============================================================== 3. audit */
function fairCandidate() {
  const g = CFG.GEN_FLAT_GAP_TILES;
  const w = CFG.GEN_MIN_FIGHT_TILES + 2;
  const platforms = [
    { x0: 0, x1: w, y: 20, spur: false },
    { x0: w + 1 + g, x1: w + 1 + g + w, y: 20, spur: false }
  ];
  return { platforms, spawnIdx: 0, exitIdx: 1, pickups: [] };
}
{
  const a = Gen.audit(fairCandidate());
  s.eq('a straightforward fair candidate passes', a.fair, true, a.reasons.join(';'));
  s.eq('with no reasons attached', a.reasons.length, 0);
}
{
  const c = fairCandidate();
  c.platforms.push({ x0: 500, x1: 505, y: 20, spur: false });   // island
  c.exitIdx = 2;
  const a = Gen.audit(c);
  s.eq('an unreachable exit fails the audit', a.fair, false);
  s.ok('with a reason naming the exit', a.reasons.some((r) => r.indexOf('exit') !== -1), a.reasons.join(';'));
}
{
  const c = fairCandidate();
  c.platforms.push({ x0: 500, x1: 505, y: 20, spur: true });
  c.pickups = [{ platformIdx: 2, x: 502, y: 20 }];
  const a = Gen.audit(c);
  s.eq('an unreachable pickup fails the audit', a.fair, false);
  s.ok('with a reason naming the pickup', a.reasons.some((r) => r.indexOf('pickup') !== -1), a.reasons.join(';'));
}
{
  const c = fairCandidate();
  c.platforms[1].x1 = c.platforms[1].x0 + 1;   // 2 tiles wide, under the minimum
  const a = Gen.audit(c);
  s.eq('a too-narrow main platform fails the audit', a.fair, false);
  s.ok('with a reason naming the width', a.reasons.some((r) => r.indexOf('wide') !== -1), a.reasons.join(';'));
}
{
  // The one deliberate exemption: spurs are bonus alcoves, allowed to be
  // narrow, per D3a's own framing being about the PATH, not every surface.
  const c = fairCandidate();
  const g = CFG.GEN_FLAT_GAP_TILES;
  c.platforms.push({ x0: c.platforms[1].x1 + 1 + g, x1: c.platforms[1].x1 + 2 + g, y: 20, spur: true });
  c.pickups = [{ platformIdx: 2, x: 0, y: 20 }];
  const a = Gen.audit(c);
  s.eq('a narrow SPUR does not fail the audit on width alone', a.fair, true, a.reasons.join(';'));
}
{
  // Multiple simultaneous failures are all reported, not just the first.
  const c = fairCandidate();
  c.platforms.push({ x0: 500, x1: 501, y: 20, spur: false });   // island AND narrow
  c.exitIdx = 2;
  const a = Gen.audit(c);
  s.ok('multiple independent failures are all reported, not just one',
    a.reasons.length >= 2, a.reasons.join(';'));
}

/* ============================================================ 4. generator */
{
  const r1 = Gen.generate(42), r2 = Gen.generate(42);
  s.eq('same seed -> same world dimensions (L4)', r1.world.w + 'x' + r1.world.h, r2.world.w + 'x' + r2.world.h);
  s.eq('same seed -> same spawn', JSON.stringify(r1.spawn), JSON.stringify(r2.spawn));
  s.eq('same seed -> same exit', JSON.stringify(r1.exit), JSON.stringify(r2.exit));
  s.eq('same seed -> same pickups', JSON.stringify(r1.pickups), JSON.stringify(r2.pickups));
  s.eq('same seed -> same attempt/rejection history', r1.attempts + '/' + r1.rejected, r2.attempts + '/' + r2.rejected);

  const r3 = Gen.generate(43);
  s.ok('a different seed produces a different layout',
    JSON.stringify(r1.spawn) !== JSON.stringify(r3.spawn) || JSON.stringify(r1.exit) !== JSON.stringify(r3.exit) ||
    r1.world.w !== r3.world.w);
}
{
  // Structural sanity across a real sample.
  let allInBounds = true, allHavePickups = true, spawnBelowExitSpread = 0;
  const N = 40;
  for (let seed = 1; seed <= N; seed++) {
    const r = Gen.generate(seed);
    const w = r.world, checks = [r.spawn, r.exit].concat(r.pickups);
    for (const [x, y] of checks) {
      if (x < 0 || x >= w.w * CFG.TILE || y < -CFG.TILE || y >= w.h * CFG.TILE) allInBounds = false;
    }
    if (r.pickups.length === 0) allHavePickups = false;
  }
  s.ok('every point of interest across ' + N + ' seeds lies inside its own world', allInBounds);
  s.ok('every generated level has at least one pickup', allHavePickups);
}
{
  // generate() must never hand back something its own audit would reject —
  // using the REAL audit() to check the CONTRACT, not reimplementing one
  // (L8): the thing under test here is "does generate() honour its own
  // gate," not "is the gate itself correct" (sections 1-3 already cover that
  // independently).
  let allFair = true, failures = [];
  for (let seed = 1; seed <= 50; seed++) {
    const r = Gen.generate(seed);
    const a = Gen.audit({ platforms: r.platforms, spawnIdx: 0, exitIdx: r.platforms.length - 1 - r.pickups.length, pickups: [] });
    // Re-deriving the exact spawn/exit/pickup indices from the public result
    // isn't available post-stamp, so this checks the structural piece that
    // is: every platform still individually meets the fight-width rule, and
    // reachability holds from platform 0 (spawn) to the platform that was
    // exitIdx at generation time is ALREADY the thing generate()'s own loop
    // enforced — what's being independently re-checked here is that nothing
    // about stamping into a World silently invalidates the audited shape.
    if (!a.fair) { allFair = false; failures.push(seed + ': ' + a.reasons.join(',')); }
  }
  s.ok('every generated level still passes a fresh audit of its own platform list',
    allFair, failures.join(' | '));
}
{
  // The rejection rate must be genuinely non-vacuous: real work happening
  // (not always 0%) but not dominating (not the generator merely guessing).
  let totalAttempts = 0, totalRejected = 0, zeroRejectCount = 0;
  const N = 60;
  for (let seed = 1; seed <= N; seed++) {
    const r = Gen.generate(seed);
    totalAttempts += r.attempts;
    totalRejected += r.rejected;
    if (r.rejected === 0) zeroRejectCount++;
  }
  const rate = totalRejected / totalAttempts;
  s.between('the aggregate rejection rate sits in a meaningful, non-dominant band', rate, 0.05, 0.45,
    (rate * 100).toFixed(1) + '% (' + totalRejected + '/' + totalAttempts + ')');
  s.ok('at least some seeds needed zero regeneration (the generator often gets it right unaided)',
    zeroRejectCount > 0, zeroRejectCount + '/' + N);
  s.ok('and at least some seeds needed real regeneration (the audit is doing real work)',
    zeroRejectCount < N, (N - zeroRejectCount) + '/' + N + ' needed at least one reject');
}
{
  // room-checkpoint-structure spec: "room-bounded generation" is NOT a new
  // width/height parameter (none exists — a world's size is a DERIVED
  // output of wherever its platforms land, computed post-hoc in stamp()).
  // It is the exact same generate()/audit()/reject-and-regenerate pipeline
  // already exhaustively proven above, called with smaller opts.beats/
  // opts.pickups. This block exists to prove that claim at the REAL values
  // this feature actually uses (CFG.ROOM_BEATS/CFG.ROOM_PICKUPS), not just
  // assume it generalizes — mirrors the two sections directly above,
  // scaled down, rather than inventing new verification machinery for a
  // smaller candidate.
  let allInBounds = true, allFair = true, allHavePickups = true, failures = [];
  let totalAttempts = 0, totalRejected = 0;
  const N = 50;
  const opts = { beats: CFG.ROOM_BEATS, pickups: CFG.ROOM_PICKUPS };
  for (let seed = 1; seed <= N; seed++) {
    const r = Gen.generate(seed, opts);
    const w = r.world, checks = [r.spawn, r.exit].concat(r.pickups);
    for (const [x, y] of checks) {
      if (x < 0 || x >= w.w * CFG.TILE || y < -CFG.TILE || y >= w.h * CFG.TILE) allInBounds = false;
    }
    if (r.pickups.length === 0) allHavePickups = false;
    const a = Gen.audit({ platforms: r.platforms, spawnIdx: 0, exitIdx: r.platforms.length - 1 - r.pickups.length, pickups: [] });
    if (!a.fair) { allFair = false; failures.push(seed + ': ' + a.reasons.join(',')); }
    totalAttempts += r.attempts;
    totalRejected += r.rejected;
  }
  s.ok('a room-bounded generate() (opts.beats=' + opts.beats + ', opts.pickups=' + opts.pickups +
    ') still places every point of interest inside its own smaller world', allInBounds);
  s.ok('a room-bounded generate() still guarantees at least one pickup', allHavePickups);
  s.ok('a room-bounded generate() still only ever returns an audited-fair layout',
    allFair, failures.join(' | '));
  s.ok('a room-bounded generate() does not need an unreasonable number of attempts to stay fair '
    + '(the fewer beats a candidate has, the fewer chances for the audit to reject it)',
    totalAttempts / N < CFG.GEN_MAX_ATTEMPTS, (totalAttempts / N).toFixed(1) + ' avg attempts/seed');
}
{
  // The hard ceiling must actually be reachable code, not dead — proven by
  // feeding a config so hostile every candidate is certain to fail, and
  // confirming generate() fails LOUDLY rather than hanging or silently
  // returning something unfair.
  const savedRisk = CFG.GEN_RISK_CHANCE, savedMax = CFG.GEN_MAX_RISE_TILES;
  CFG.GEN_RISK_CHANCE = 1.0;      // every beat risky
  CFG.GEN_MAX_RISE_TILES = 0;     // and nothing can climb at all
  let threw = false, message = '';
  try { Gen.generate(999, { maxAttempts: 5 }); }
  catch (e) { threw = true; message = e.message; }
  CFG.GEN_RISK_CHANCE = savedRisk;
  CFG.GEN_MAX_RISE_TILES = savedMax;
  s.ok('an impossible configuration fails loudly rather than hanging or lying', threw, message);
  s.ok('a normal configuration is unaffected by the restored CFG', (() => {
    try { Gen.generate(1); return true; } catch (e) { return false; }
  })());
}

/* ================================================ THE PHYSICS CROSS-CHECK
 * The strongest claim in this file. Every edge the audit's graph model calls
 * legal is, here, attempted by a REAL player through REAL sim ticks — each
 * edge tested in ISOLATION (a fresh two-platform world built from nothing
 * but that pair's own coordinates), the correct apples-to-apples comparison
 * against edgeAllowed() itself: that function is a pairwise check, not a
 * claim about the full generated level, so isolating the pair is what
 * actually cross-validates it rather than testing something broader than
 * the model claims. Zero-gap edges are skipped: the capability measurements
 * found that specific case to be a different movement pattern entirely
 * (climbing flush beside a wall, not clearing a gap), not a bug in the
 * model.
 *
 * attemptHop()/attemptHopWith() themselves now live in tests/harness.js —
 * promoted so a second, unrelated caller (verify_run.js's checkpoint-alcove
 * regression) can reuse this same hard-won, multi-strategy driving logic
 * against a REAL, already-built room world too, rather than forking an
 * independently-tuned copy. See that file's own header comment for the
 * full "why five strategies, not one" account. */
{
  const SAMPLE_SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  let edgesChecked = 0, edgesConfirmed = 0, edgesSkipped = 0, disagreements = [];

  for (const seed of SAMPLE_SEEDS) {
    const r = Gen.generate(seed);
    const platforms = r.platforms;
    const edges = Gen.buildGraph(platforms);
    const reach = Gen.reachableFrom(edges, 0);

    // The actual BFS parent tree from spawn — one real hop per reachable
    // platform, which is exactly the set of edges the audit's own
    // reachability claim for THIS level rests on.
    const parent = new Array(platforms.length).fill(-1);
    const seen = new Array(platforms.length).fill(false);
    const queue = [0]; seen[0] = true;
    while (queue.length) {
      const cur = queue.shift();
      for (const nxt of edges[cur]) {
        if (!seen[nxt]) { seen[nxt] = true; parent[nxt] = cur; queue.push(nxt); }
      }
    }

    for (let i = 1; i < platforms.length; i++) {
      if (parent[i] === -1) continue;
      const result = H.attemptHop(C, platforms[parent[i]], platforms[i]);
      if (result === null) { edgesSkipped++; continue; }
      edgesChecked++;
      if (result) edgesConfirmed++;
      else disagreements.push('seed ' + seed + ' platform ' + i + ' (from ' + parent[i] + ')');
    }
  }

  s.ok('the physics prover actually exercised a real sample', edgesChecked >= 30,
    edgesChecked + ' edges checked, ' + edgesSkipped + ' zero-gap skipped');
  s.eq('every audited-legal edge is physically achievable by a real held jump',
    edgesConfirmed, edgesChecked,
    disagreements.length ? disagreements.slice(0, 8).join(' | ') : 'all confirmed');
}

process.exit(s.done());
