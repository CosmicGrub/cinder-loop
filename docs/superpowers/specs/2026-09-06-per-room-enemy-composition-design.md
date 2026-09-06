# Per-room enemy composition (D27)

Status: design pitched in the 2026-09-06 roadmap audit (pitch A, that
doc's own top recommendation), proceeding directly per explicit user
authorization to act on the audit's recommendations. Not yet implemented.
Companion docs: `docs/superpowers/pitches/2026-09-06-roadmap-audit-and-new-pitches.md`
(§6/§7/§8 — the finding and pitch this formalizes).

## 0. Why this exists

`RunLogic.placeEnemies` (`60-run.js:212-235`) loops `DATA.ENEMY_IDS`
unconditionally — every room of every run places exactly one of each of
the 4 regular templates, in the same alphabetical/teaching order, spaced
evenly across platforms. No `roomIndex` input, no seeded variation. A
player has seen the entire regular roster by the end of room 0 of their
very first run, and room 0 and the room right before the boss door
currently present an identical threat level and composition — the single
thinnest content axis in the game, confirmed against real numbers in the
audit this formalizes.

This is a genuinely small, low-risk change: `placeEnemies` is already a
pure function (`platforms`, `seed` in, a plain array out — no `World`, no
Sim, no mutation), already independently unit-tested
(`tests/verify_run.js:118-149`), and touches none of the files the
roadmap's own standing-risk paragraph names (`70-sim.js`'s core,
`45-enemy.js`'s state machine, `40-combat.js`'s `Combat.resolveBox`).
Matching D21's own precedent for a change this scoped, this spec skips a
dedicated multi-agent adversarial-verification pass in favor of thorough
test coverage — stated as a reasoned choice, not an oversight.

## 1. `roomIndex` — a new, optional third parameter

`Sim.prototype._enterRoom(roomIndex, gen)` (`70-sim.js:728`) already has
`roomIndex` in scope at its own `placeEnemies` call site
(`70-sim.js:775`). The only change needed there:

```js
var placed = RunLogic.placeEnemies(gen.platforms, RunLogic.deriveEnemySeed(roomSeed), roomIndex);
```

`placeEnemies` treats a missing/`undefined` third argument as "not the
first or last room" — the exact same composition (`DATA.ENEMY_IDS`
unmodified) the function already produces today. This is what keeps
`tests/verify_run.js`'s three existing calls
(`RunLogic.placeEnemies(platforms, 1)`, no third argument) passing
unchanged: `roomIndex === 0` and `roomIndex === CFG.ROOM_COUNT - 1` are
both `false` when `roomIndex` is `undefined`, falling through to the
existing default.

## 2. The composition draw — one new function, `pickRoomComposition`

```js
// Distinct random picks from `pool`, order not preserved by this function
// alone (see pickRoomComposition's own room-0 branch for why the CALLER
// re-sorts the result back into pool order there).
function pickDistinct(rng, pool, count) {
  var remaining = pool.slice(), picked = [];
  count = Math.min(count, remaining.length);
  for (var k = 0; k < count; k++) {
    var idx = rng.int(remaining.length);
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picked;
}

// roomIndex undefined, or any room that is neither first nor last, gets
// the existing default: one of each, unmodified — this is the "normal"
// case, not a fallback bolted on afterward.
function pickRoomComposition(rng, roomIndex) {
  var all = DATA.ENEMY_IDS;
  if (roomIndex === CFG.ROOM_COUNT - 1) {
    // The room right before the boss door: every template, PLUS 1-2
    // repeats — a felt escalation, not just "the same four again."
    var order = all.slice();
    var repeats = 1 + rng.int(2);
    for (var k = 0; k < repeats; k++) order.push(all[rng.int(all.length)]);
    return order;
  }
  if (roomIndex === 0) {
    // A gentler opener: 2-3 templates, not all 4. DATA.ENEMY_IDS' own
    // order (melee, charge, shoot, fly) is already a deliberate teaching
    // progression — this function's own header comment already says so —
    // so the subset is chosen randomly but then re-filtered back into
    // ENEMY_IDS' own relative order, not left in whatever order
    // pickDistinct happened to draw them, so the intro still reads as a
    // deliberate ramp, not a shuffled one.
    var count = 2 + rng.int(2);
    var chosen = pickDistinct(rng, all, count);
    return all.filter(function (id) { return chosen.indexOf(id) !== -1; });
  }
  return all.slice();
}
```

`placeEnemies` itself changes by exactly one line — `var order =
DATA.ENEMY_IDS;` becomes `var order = pickRoomComposition(rng,
roomIndex);` — reusing the SAME `rng` instance already constructed at the
top of the function from the caller's own seed, so this new draw
consumes real RNG state (L4-compliant) rather than a second, parallel
stream. `order.length` now varies (2-3 for room 0, 4 for a middle room,
5-6 for the last room), which the existing `step = Math.max(1,
Math.floor(candidates.length / order.length))` spacing math already
handles correctly without modification — it was never hardcoded to
exactly 4.

**Named edge case, not defended against:** `CFG.ROOM_COUNT` is currently
locked at 3 (D14). If it were ever 1, `roomIndex === CFG.ROOM_COUNT - 1`
(checked first) and `roomIndex === 0` would both be true for the same
room; the escalation branch wins by check order. Not worth special-casing
for a constant this project has no stated intention of changing.

## 3. Testing approach (L8 — exercise the real functions)

- Room 0: across a real seed sweep, the composition always has 2 or 3
  distinct templates (never 1, never 4), every chosen id is a real member
  of `DATA.ENEMY_IDS`, and the OUTPUT order always matches `ENEMY_IDS`'
  own relative order (the specific claim §2 makes about preserving the
  teaching progression — a direct assertion, not assumed).
- The last room (`CFG.ROOM_COUNT - 1`): across a real seed sweep, the
  composition always contains all 4 base templates plus exactly 1 or 2
  extra repeats (length 5 or 6, never fewer than 4).
- A middle room (`roomIndex` = any value strictly between 0 and
  `CFG.ROOM_COUNT - 1`, plus `roomIndex === undefined`): produces the
  EXACT existing default (`DATA.ENEMY_IDS`, unmodified, one of each) —
  the direct regression proving the three pre-existing tests still exercise
  real, unchanged behavior, not a coincidentally-matching new path.
- Determinism (L4): the same seed and `roomIndex` produce byte-identical
  compositions across two calls; a different seed with the SAME
  `roomIndex` produces a different composition (not always — real
  variance, not just theoretical support for it).
- Integration: a full `beginRun()`-driven multi-room sequence
  (`H.clearRoomAndAdvance()`) actually reaches `_enterRoom` with the real
  `roomIndex` at each step, and the resulting roster composition for room
  0 and the final room differs from what the OLD unconditional
  `DATA.ENEMY_IDS` loop would have produced for those same seeds — proving
  the wiring through `_enterRoom` actually reaches the new logic, not just
  that `placeEnemies` behaves correctly in isolation.

## 4. Explicitly out of scope for v1

- Enemy DENSITY changes beyond the escalation-room's own repeat count
  (still "up to one platform per placed enemy," the existing spacing
  model, unmodified).
- Any change to per-template stats, telegraph timing, or the elite
  roster (Caller, Kilnwarden) — this spec only touches which REGULAR
  templates are chosen and how many, never their own definitions.
- Elite affix variants (audit pitch B) — a separate, later pitch.
- Any UI/HUD indication of "this room is escalated" — the composition
  itself is the only signal, matching how the game currently gives no
  advance warning of room difficulty at all.
