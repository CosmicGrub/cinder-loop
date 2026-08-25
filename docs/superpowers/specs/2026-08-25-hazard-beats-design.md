# Roll-crossable hazard beats (D17)

Status: design approved by user 2026-08-25. Not yet implemented.
Companion docs: `CINDER_LOOP_MASTERFILE.md` (D-series decisions),
`docs/superpowers/pitches/2026-08-24-post-d13-system-pitches.md` (Gen
Pitch 1, the pitch this spec formalizes).

## 0. Why this exists

`CFG.GEN_ROLL_HAZARD_TILES` (`00-core.js:268`) is a real, measured
capability number — `GEN_ROLL_HAZARD_TILES: 4, // ground-level hazard
strip crossable via roll: measured 85.5px = 5.34 tiles` — with zero
consumers anywhere in the codebase. `50-gen.js` never places a gap
wider than `GEN_FLAT_GAP_TILES` (3 tiles) on the main path, so nothing
a generated room ever asks for exercises Roll as a traversal tool —
only as a defensive i-frame move (`invulnerable()`,
`30-player.js:278`). This spec spends that constant: a new beat type
that places a gap strictly wider than a normal jump can cross but
within Roll's own measured reach, stamped as a hazard strip a player
must actually roll across rather than jump over.

## 1. `hazardEdgeAllowed(a, b)` — new, sibling to `edgeAllowed`

```js
function hazardEdgeAllowed(a, b) {
  if (a.y !== b.y) return false;              // flat-rise only, v1 — see below
  var gap = gapBetween(a, b);
  return gap > CFG.GEN_FLAT_GAP_TILES && gap <= CFG.GEN_ROLL_HAZARD_TILES;
}
```

Deliberately its own function, not folded into the existing
`edgeAllowed` (`50-gen.js:88-93`). A hazard-roll edge and a jump edge
are different capabilities with different failure modes — missing a
jump costs nothing extra, rolling into a hazard costs a heart if
mistimed (`CFG.HAZARD_DAMAGE = 1`, applied via
`Player.prototype.hurt` on any un-invulnerable
`world.rectHazard(...)` overlap, `30-player.js`) — and this file's own
precedent names exactly the risk of conflating two different
capabilities into one edge test: `edgeAllowed`'s header comment
documents a real, already-fixed bug where an early undirected version
let a valid drop silently license the reverse climb.

**Flat-rise only, and why that is physically grounded, not just a
scope limit.** A roll keeps accumulating `CFG.GRAVITY` (0.3/tick)
every frame even off a ledge (`30-player.js:345`, "a roll off a ledge
still falls") for its full `CFG.ROLL_FRAMES` (18) duration at
`CFG.ROLL_SPEED` (4.75px/tick — 18 × 4.75 = 85.5px, the exact measured
number `GEN_ROLL_HAZARD_TILES`'s own comment cites). That measurement
was taken on flat ground. Any real rise risks the roll falling short
of a higher target, or overshooting a lower one into the hazard strip
itself before regaining footing — neither is measured, so v1 does not
attempt it. `CFG.GEN_ROLL_HAZARD_TILES` (4 tiles = 64px) leaves about
1.3 tiles / 21.5px of margin under the full 85.5px measured distance —
the same kind of safety margin every other `GEN_*` capability ceiling
in this file already takes below its own measured maximum.

**Symmetric, unlike `edgeAllowed`.** Since rise is always 0 here,
roll-crossability is genuinely the same in both directions. Hazard
edges are added to the graph in both directions (§2) — a deliberate,
reasoned departure from `edgeAllowed`'s directed climb/drop model, not
an oversight of it: that model is directed specifically because
*climbing* is capability-bounded and *dropping* is not, a distinction
that does not exist when both platforms sit at the same height.

## 2. Graph + audit extension

`buildGraph` (`50-gen.js:100-110`) gains an optional second parameter:
`buildGraph(platforms, hazardEdges)`. `hazardEdges` is a list of
`[fromIdx, toIdx]` pairs recorded by `generateCandidate` (§3) whenever
it placed a hazard beat. For each pair, `buildGraph` independently
re-validates via `hazardEdgeAllowed(platforms[fromIdx],
platforms[toIdx])` before adding `toIdx` to `edges[fromIdx]` **and**
`fromIdx` to `edges[toIdx]` — never trusting the generator's own
bookkeeping that a pair it *meant* to place as a valid hazard beat
actually *is* one. This is the same discipline this file's own header
already states as its reason for existing: "THE AUDIT IS THE POINT...
audit() only ever reads and reports" — a hand-built `hazardEdges` entry
that fails re-validation must simply not appear in the graph, with no
special-casing.

`audit()` (`50-gen.js:139-168`) passes `candidate.hazardEdges` through
to `buildGraph`. Everything downstream — `reachableFrom`, the
reachability reasons, the fightable-width check — is unchanged; a
platform on either side of a hazard beat is a normal main-path
platform and must still clear `GEN_MIN_FIGHT_TILES` like every other.

## 3. `placeHazardBeat` — new, sibling to `placeMainBeat`

Inside `generateCandidate`'s main-beat loop (`50-gen.js:250-252`),
before calling `placeMainBeat` for a given beat, roll a new
`CFG.GEN_HAZARD_BEAT_CHANCE` (**0.15** — see below for why). Capped at
one hazard beat per candidate via a local flag: once placed, every
later beat in that candidate falls through to the normal
`placeMainBeat` path regardless of further rolls.

```js
function placeHazardBeat(rng, platforms, cursorX, cursorY) {
  var gap = CFG.GEN_FLAT_GAP_TILES + 1 +
    rng.int(CFG.GEN_ROLL_HAZARD_TILES - CFG.GEN_FLAT_GAP_TILES);
  var width = CFG.GEN_MIN_FIGHT_TILES + rng.int(6);
  var newX0 = cursorX + 1 + gap;
  var kind = rng.next() < 0.18 ? TILE.ONEWAY : TILE.SOLID;
  var p = { x0: newX0, x1: newX0 + width - 1, y: cursorY, kind: kind, spur: false };
  platforms.push(p);
  return p;
}
```

`gap`'s formula only ever evaluates to exactly 4 today — the valid
range `(GEN_FLAT_GAP_TILES, GEN_ROLL_HAZARD_TILES]` = `(3, 4]` has
exactly one integer in it. Written as a formula rather than a literal
`4` anyway, so it stays correct if either constant is ever retuned
(the way most `GEN_*` numbers in this file already carry a "not yet
swept" or "measured, could move" caveat). `cursorY` is passed through
unchanged (`newY = cursorY`, not `cursorY - rise` — there is no rise
parameter at all, enforcing flat-rise at the call site, not just in
the validator). Main-path only — `placeSpur` is untouched; a hazard
beat never appears on a spur, keeping optional pickup alcoves free of
this added risk, which is a genuinely different, unreviewed design
question.

The caller records the edge:

```js
var hazardEdges = [];
// ...inside the beat loop, when the roll hits and the cap isn't spent:
var beforeIdx = platforms.length - 1;
cursor = placeHazardBeat(rng, platforms, cursor.x1, cursor.y);
hazardEdges.push([beforeIdx, platforms.length - 1]);
hazardPlaced = true;
```

`generateCandidate`'s return value gains `hazardEdges` alongside
`platforms`/`spawnIdx`/`exitIdx`/`pickups`.

**Frequency: 0.15, not `GEN_RISK_CHANCE`'s 0.02.** These are different
kinds of rolls. `GEN_RISK_CHANCE` exists so the audit has real,
non-zero rejection work to do — it is *supposed* to be rare, tuned
specifically to keep aggregate rejection near 20% (`00-core.js:272-281`).
A hazard beat is not a deliberately-unfair placement for the audit to
catch; it is a valid, intended traversal variety the pitch frames as
something the constant should actually be *spent* on. 0.15 per beat
against a typical 14-beat main path puts a real hazard beat in the
large majority of generated levels without ever risking more than the
capped one per room.

## 4. `stamp()` extension

`stamp()` (`50-gen.js:277-311`) gains a loop over `candidate.hazardEdges`
placed right after the death-row stamping it already does, using the
exact same convention: for each `[i, j]` pair, one row of `TILE.HAZARD`
at the shared `y`, spanning `[platforms[i].x1 + 1, platforms[j].x0 - 1]`
— mirroring `for (var x2 = 0; x2 < w; x2++) world.set(x2, deathRow,
TILE.HAZARD);` (`50-gen.js:299`) at the scale of one gap instead of the
whole level width.

`generate()`'s return value (`50-gen.js:341-347`) gains `hazardEdges`
(the platform-index pairs, passed through from `candidate`), mirroring
how it already exposes `attempts`/`rejected`/`rejectionRate` — so
tests, and later real telemetry, can see hazard-beat placement directly
rather than re-deriving it from tile scanning.

## 5. New CFG constant

`src/00-core.js`, sibling to `GEN_ROLL_HAZARD_TILES`:

```js
GEN_HAZARD_BEAT_CHANCE: 0.15,  // per-beat roll to place a hazard beat instead of a normal one; capped at 1/candidate
```

## 6. Physics-prover addition — `attemptRoll` in `tests/harness.js`

`tests/harness.js` already hosts the shared physics-prover
(`attemptHop`/`attemptHopWith`, `harness.js:378-576`) — promoted there
specifically so more than one test file can reuse "a REAL player,
attempted through REAL sim ticks" without forking the logic. This adds
a sibling, `attemptRoll(C, from, to, opts)`, exported the same way.

Unlike `attemptHop`, roll has no strategic variation to fan out over —
fixed speed, fixed duration, no player timing choice beyond *when* to
press the button while grounded and off cooldown. `attemptRoll` drives
one deterministic sequence: position a real `Player` on `from`, hold
facing toward `to`, press `roll` once (`pad.buffered('roll')` +
`pad.consume('roll')`, the real trigger path at `30-player.js:527-538`),
let physics run for real ticks, and confirm the body ends grounded on
`to`'s platform without ever registering a hazard hit along the way
(checked via the sim's own hazard-overlap state, not reimplemented
here). `opts.world`/`opts.successCheck` follow `attemptHopWith`'s own
existing optional shape for reuse against a real generated room instead
of an isolated two-platform world.

`verify_gen.js` feeds every real `hazardEdges` pair produced across its
existing seed sweep through `attemptRoll`, exactly the way it already
physics-confirms jump edges via `attemptHop` — proving `GEN_ROLL_HAZARD_TILES`
is actually crossable by a real player in the context of a real
generated gap, not just trusting the isolated 85.5px measurement that
originally produced the constant.

## 7. Testing plan (L8 — exercise the real functions)

- `hazardEdgeAllowed` unit tests: gap 3 rejected, gap 4 accepted, gap 5
  rejected, any non-zero rise rejected regardless of gap (both a higher
  and a lower `b.y`).
- `buildGraph` extension: a hand-built candidate with a `hazardEdges`
  entry that fails re-validation (wrong gap, non-flat rise) must not
  appear in the resulting graph in either direction — proving the audit
  re-derives fairness rather than trusting the generator's own claim.
- A hazard edge that *does* validate appears in the graph bidirectionally
  (`edges[i]` contains `j` AND `edges[j]` contains `i`), unlike a normal
  jump edge.
- Rejection-rate sweep: measure the aggregate rejection rate with hazard
  beats enabled across the existing seed sweep and confirm it does not
  meaningfully move from the established ~20% baseline (`GEN_RISK_CHANCE`'s
  own comment, `00-core.js:277`) — measured, not assumed, matching this
  file's own discipline ("verify_gen measures the resulting rate directly
  rather than trusting this comment").
- Every `hazardEdges` pair produced across the seed sweep gets a real
  `attemptRoll` physics confirmation; report the pass rate the same way
  the existing jump-edge cross-check does.
- Placement regression: across the seed sweep, no candidate ever has more
  than one hazard beat, and no hazard beat's platform has `spur: true`.
- Determinism (L4): the same seed produces the same `hazardEdges`
  placement (or none) every time.

## 8. Explicitly out of scope for v1

- Any rise other than 0 for a hazard beat — flat-rise only, per §1's
  physics grounding.
- Hazard beats on spurs — main-path only.
- More than one hazard beat per generated candidate.
- Ember Dash crossing the same strip. Only Roll's 85.5px distance is
  actually measured (`GEN_ROLL_HAZARD_TILES`'s own comment); extending
  this to Dash needs its own real measurement, not an assumption of
  parity, and is a real, separate follow-up.
- Any change to `edgeAllowed`, `maxGapForRise`, `minGapForRise`, or any
  existing jump-capability constant — hazard beats are strictly additive.
- Reacting to hazard-beat placement in room-checkpoint narration,
  telemetry dashboards, or anywhere else outside `50-gen.js` +
  `tests/harness.js` + `tests/verify_gen.js`.
