# Dominance Breakpoints (D19)

Status: design approved by user 2026-09-06. Not yet implemented.
Companion docs: `CINDER_LOOP_MASTERFILE.md` (D-series decisions),
`docs/superpowers/pitches/2026-08-24-post-d13-system-pitches.md` (Tier 2,
item 1 — "connects two shipped-but-never-linked systems; makes colour
choice qualitative, not just a bigger number").

## 0. Why this exists

D2 (the three-colour stat system, `ember`/`umbral`/`verdant`) and D13
(Roll, Ember Dash, Parry) shipped independently and have never once
referenced each other. `Player.prototype.gainStat` (`30-player.js:832-842`)
already computes "is this stat now the unique highest" inline, every time
a stat pickup lands, purely to decide whether to grant a max-hp bump —
that same fact, generalized to "what's the dominant colour of my stats
right now," is a real, connective mechanic sitting unbuilt in the code
that's already there. This spec builds it: three passives, one per
colour, each modifying an existing D13 ability whenever that colour is
currently dominant.

## 1. The extraction — `dominantColour(stats)`

`gainStat`'s own inline check (`30-player.js:834-835`):

```js
var v = this.stats[colour], dominant = true, k;
for (k in this.stats) { if (k !== colour && this.stats[k] >= v) dominant = false; }
```

is "is `colour`'s new value strictly greater than every other stat" —
correct for gainStat's own narrow question (was the JUST-INCREMENTED
colour the one that came out on top), but not directly reusable for "what
colour is dominant right now, given no specific colour to check." A new,
general function replaces it:

```js
// 30-player.js, sibling to pickStatColour above — the general form of the
// same "strictly unique highest, a tie doesn't count" rule gainStat's own
// dominance check already used, extracted so D19's three passives below
// and D20 (Grafts) can both ask "what's dominant right now" without
// re-deriving the rule a second and third time.
function dominantColour(stats) {
  var max = Math.max(stats.ember, stats.umbral, stats.verdant);
  var winner = null, ties = 0, k;
  for (k in stats) {
    if (stats[k] === max) { ties++; winner = k; }
  }
  return ties === 1 ? winner : null;
}
```

`gainStat` becomes:

```js
Player.prototype.gainStat = function (colour, bus) {
  this.stats[colour]++;
  var v = this.stats[colour];
  var dominant = dominantColour(this.stats) === colour;
  if (dominant) {
    this.maxHp += CFG.STAT_HP_GAIN;
    this.hp += CFG.STAT_HP_GAIN;
  }
  bus.emit('statGain', { id: this.id, colour: colour, value: v, dominant: dominant, maxHp: this.maxHp });
  return this;
};
```

Provably equivalent to the code it replaces for every real call:
`gainStat` only ever increments the one `colour` passed in, so at the
moment `dominantColour` is called, `colour`'s value is the only one that
just changed — it is the unique max under the new function's rule if and
only if no other stat was already `>= v` under the old one. Exported as
`C.dominantColour = dominantColour;`, sibling to `C.pickStatColour`/
`C.STAT_COLOURS` at the bottom of the file, for D20's own future reuse.

## 2. "Past a dominance threshold" — resolved as dominance itself, not a second gate

The pitch's own phrase read, at first, like it wanted an extra numeric
floor on top of mere uniqueness (e.g., the dominant stat must also be
`>= 3`). Checked against precedent before assuming that: `gainStat`'s own
comment (`30-player.js:825-828`) explicitly treats "dominant from the very
first pickup" (1,1,1 → 2,1,1) as a deliberate, load-bearing property of
the existing anti-death-spiral mechanic, not an edge case to guard
against. Adding a second threshold here would contradict that precedent
with nothing in the pitch actually requiring it. "Past a dominance
threshold" is read as *becoming dominant* being the threshold, full stop
— the same rule `gainStat` already uses, with no additional floor.

## 3. The three passives — checked fresh, not snapshotted

Mirrors D24's own "capacity read fresh from `meta`, never copied onto the
player" pattern: a player's dominant colour is computed at the moment
each effect is applied, not cached anywhere, so it can shift mid-run as
stats change between one roll/dash/parry and the next — the correct,
intended behavior, not a bug to guard against.

**Ember → shorter Dash cooldown.** `Player.prototype.endDash`
(`30-player.js:774`):

```js
this.dashCd = dominantColour(this.stats) === 'ember'
  ? CFG.DASH_COOLDOWN_FRAMES - CFG.DOMINANCE_DASH_CD_REDUCTION
  : CFG.DASH_COOLDOWN_FRAMES;
```

**Umbral → wider Parry window.** The parry trigger (`30-player.js:625`):

```js
this.parryWindow = dominantColour(this.stats) === 'umbral'
  ? CFG.PARRY_WINDOW_FRAMES + CFG.DOMINANCE_PARRY_WINDOW_BONUS
  : CFG.PARRY_WINDOW_FRAMES;
```

**Verdant → shorter Roll cooldown.** `Player.prototype.endRoll`
(`30-player.js:753`):

```js
this.rollCd = dominantColour(this.stats) === 'verdant'
  ? CFG.ROLL_COOLDOWN_FRAMES - CFG.DOMINANCE_ROLL_CD_REDUCTION
  : CFG.ROLL_COOLDOWN_FRAMES;
```

Three field-write sites, exactly as the pitch names — no other call site
of `ROLL_COOLDOWN_FRAMES`/`DASH_COOLDOWN_FRAMES`/`PARRY_WINDOW_FRAMES`
needs touching (confirmed: each constant is read at exactly the one site
above, nowhere else in `30-player.js`).

## 4. New CFG constants — proportionally consistent, a named judgment

```js
DOMINANCE_DASH_CD_REDUCTION: 8,    // 30 -> 22 frames, ~27% shorter
DOMINANCE_PARRY_WINDOW_BONUS: 3,   // 12 -> 15 frames, 25% wider
DOMINANCE_ROLL_CD_REDUCTION: 6,    // 24 -> 18 frames, 25% shorter
```

Not measured — a design judgment, the same discipline `META_MAXHP_COST`/
`GEN_MIN_FIGHT_TILES` already name themselves as. Picked to land at
roughly the same relative magnitude (~25-27%) across all three, so no
colour's own breakpoint reads as obviously stronger or weaker than the
other two by construction, not by luck.

## 5. Checked for interaction with D13's own enhancements — none exists

`dashExtraCharge`/`dashExtIframes` (abilities spec §4) never touch
`dashCd`'s own duration — the first grants a second charge independent of
cooldown, the second grants POST-dash i-frames. `parryRiposte`/
`parryReflect` never touch `parryWindow`'s own duration — both are
post-parry effects. Roll has no existing enhancement purchase at all.
D19's three modifications are additive on top of every D13 enhancement a
player might also own, with no shared field and no ordering dependency to
design around.

## 6. `hash()` needs no new field

`Sim.prototype.hash()` (`70-sim.js:1357`) already walks
`p.stats.ember`/`umbral`/`verdant` — dominance is fully derived from
already-hashed state, so two identically-seeded runs that reach the same
stats already hash identically regardless of this spec; nothing new to
add.

## 7. Testing approach (L8 — exercise the real functions)

- `dominantColour`: a clean unique max returns that colour; a two-way tie
  and a three-way tie both return `null`; matches `gainStat`'s own
  pre-refactor behavior across a sweep of hand-built stat triples (a
  direct equivalence check, not just spot cases).
- `gainStat`: unchanged observable behavior — the existing `statGain`
  event's `dominant` field and the maxHp/hp bump still fire exactly when
  they did before the refactor (a regression check on the existing
  contract, proving the extraction is behavior-preserving).
- Each of the three passives, driven through the real trigger (a real
  roll/dash/parry, not a hand-set field): with the relevant colour
  dominant, the resulting cooldown/window matches the reduced/bonus value
  exactly; with a DIFFERENT colour dominant (or a tie), the base value
  applies unchanged.
- Mid-run colour shift: dominance changes between one trigger and the
  next (a stat gain in between) produces a DIFFERENT cooldown/window on
  the second trigger than the first — proving this is read fresh, not
  cached at gain-time or anywhere else.
- No interaction with existing D13 enhancements: owning `dashExtraCharge`/
  `dashExtIframes`/`parryRiposte`/`parryReflect` alongside a dominant
  colour still produces the correct combined behavior (the enhancement's
  own effect AND the dominance-modified cooldown/window, neither
  overriding the other).
- `hash()`: two players with different stat totals but the SAME dominant
  colour still hash differently if `stats` itself differs (already
  covered by existing stats hashing — a confirming test, not new
  coverage).
- Determinism (L4): a scripted stat-gain → dominant-colour-shift →
  roll/dash/parry sequence hashes byte-identical across two runs from the
  same seed.

## 8. Explicitly out of scope for v1

- Any additional numeric threshold beyond dominance itself — see §2.
- A fourth passive for the "no colour dominant" (tied) case — ties simply
  fall back to every ability's existing base value, matching how a tie
  already grants no maxHp bonus in `gainStat`.
- Any UI/HUD indicator of which colour is currently dominant — no
  presenter-layer work is part of this spec; whether one is worth adding
  later is a separate, future question.
- Changing the underlying D2 stat-gain weighting (`pickStatColour`) or the
  maxHp-on-dominance mechanic itself — both stay exactly as they are.
- The `dominantColour(stats)` extraction being consumed by D20 (Grafts)
  itself — this spec only builds and exports the function; wiring a
  second consumer is D20's own, separate spec.
