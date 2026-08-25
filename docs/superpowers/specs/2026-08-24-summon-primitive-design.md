# The "summon" primitive — elite Caller (D16)

Status: design approved by user 2026-08-24. Not yet implemented.
Companion docs: `CINDER_LOOP_MASTERFILE.md` (D-series decisions),
`docs/superpowers/pitches/2026-08-24-post-d13-system-pitches.md` (the
pitch this spec formalizes, ranked #2 of the post-D13 roadmap, right
behind D15).

## 0. Why this exists

The four movement/attack primitives this game's enemy roster is built
from — melee, charge, shoot, dive (D9, `10-data.js`) — are all
single-threat-vector: each template threatens the player one way, and a
room only escalates by adding more instances of the same four templates.
Nothing in the engine gives a room a sustained/attrition axis. D9's own
framing already answers what a fifth archetype costs: "the engine knows
four movement/attack primitives... a fifth archetype costs one new
primitive." This spec is that fifth primitive: `attack: 'summon'`, an
elite enemy that calls in an existing template mid-fight.

`Sim.prototype.addEnemy` (`70-sim.js:359-363`) already exists, real and
tested, and already produces a collision-safe, deterministic per-instance
seed from position — the primitive is nearly free to add on top of
already-proven infrastructure, not new machinery.

## 1. Kept out of `DATA.ENEMIES` — mirrors Kilnwarden's own precedent exactly

D9's four-template roster is hard-pinned: `verify_enemy.js:32` asserts
`DATA.ENEMY_IDS.length === 4`, and `55-boss.js`'s own header states this
plainly — a plan to insert a fifth row there was one of two real,
source-verified bugs an adversarial judge found in a losing boss-design
panel pitch. The Caller ships as a standalone elite template object, kept
out of that table exactly the way Kilnwarden is (`new C.Enemy(id, tid, x,
y, seed)`'s own constructor already accepts a template *object* directly,
confirmed at `45-enemy.js:89-94` — `templateId` is only looked up in
`DATA.ENEMIES` when it's a string; the boss already proves the
object-direct path works with zero constructor changes needed).

New file: **`src/56-caller.js`**, numbered right after `55-boss.js` — its
own file rather than folded into `45-enemy.js`, matching why the boss got
its own file rather than living inside the generic engine (content that
is one specific elite's own numbers and identity, not general capability).

## 2. The new attack verb — a real correction to the original pitch

`Enemy.prototype.doTelegraph`'s attack switch (`45-enemy.js:374-393`,
confirmed unchanged by D14/D15) gains one new case, sibling to the
existing `'shoot'`:

```js
case 'summon':
  this.callIn(ctx);
  this.enter('summon');
  break;
```

**Deliberate divergence from the original pitch, found by tracing the
real mechanism rather than assumed correct:** the pitch proposed
`this.enter('recover')` directly after the call fires, with no
in-between state. Every OTHER primitive gives the player a real
post-commit punish window — `'shoot'`'s own `doShoot()`
(`45-enemy.js:427-431`) waits `m.recover` frames, standing still, before
falling into the shared cooldown logic in `doRecover()`. Skipping that
window for `'summon'` would make a Caller fully safe the instant its
telegraph ends — the only primitive in the game with zero vulnerability
after committing. Fixed by giving `'summon'` its own trivial state,
mirroring `'shoot'`'s own body exactly:

```js
Enemy.prototype.doSummon = function () {
  var m = this.activeMove || this.t;
  this.body.vx = approach(this.body.vx, 0, CFG.ENEMY_FRICTION);
  if (this.stateFrames >= m.recover) this.enter('recover');
};
```

plus one line in the main per-tick state switch (`45-enemy.js:229-236`):
`case 'summon': this.doSummon(); break;`.

`Enemy.prototype.dangerous()` (`45-enemy.js:150-152`, `'strike'`/
`'charge'`/`'dive'` only) is **not** extended to include `'summon'` —
the call itself carries no body-contact threat, the identical reasoning
`'shoot'` already isn't in that list either.

## 3. `callIn()` — parallel to the existing `fire()`

```js
Enemy.prototype.callIn = function (ctx) {
  var m = this.activeMove || this.t, b = this.body;
  if (!ctx || !ctx.addEnemy || this.summonsUsed >= m.summonMax) return;
  var count = m.summonCount || 1;
  for (var i = 0; i < count; i++) {
    if (this.summonsUsed >= m.summonMax) break;
    var offsetX = this.lockFacing * (CFG.CALLER_SUMMON_OFFSET || 24);
    ctx.addEnemy(m.summonId, b.x + offsetX + i * 12, b.y);
    this.summonsUsed++;
  }
};
```

No terrain-probing needed for the spawned add's placement: `Enemy`'s own
constructor starts `b.onGround = false`
(`45-enemy.js`'s `resetTransient`), and gravity/`b.move(world)` resolves
it every tick exactly like every other enemy's own natural fall onto the
floor. `this.summonsUsed` is a new field on `Enemy`, reset in
`resetTransient()` alongside every other per-life field, enforcing a
**lifetime** cap across the whole encounter (not per-cast) — a dead
Caller cannot summon again; a living one that's used up `summonMax` calls
telegraphs for nothing further (the `>=` guard at function entry makes
this a safe, cheap no-op, never re-summoning past the cap).

**No parent/child link between the Caller and what it summons** — this
engine has no such mechanism anywhere for any entity, and building one
isn't warranted for v1: killing the Caller does not despawn its already-
summoned adds, matching the simplest, most engine-natural default (zero
new lifecycle machinery) rather than inventing a first-of-its-kind
linkage.

**Dropped from the original pitch, a real simplification:** no separate
`summonCooldown` template field. The template's own existing `cooldown`
field already does exactly that job for every other primitive — read by
the shared `doRecover()` (`45-enemy.js:539-552`,
`this.cooldown = this.phaseCooldown(m.cooldown)`) — so a second, parallel
field would only duplicate it for no reason.

## 4. `ctx.addEnemy` — the one true new integration point

`Sim`'s `this.ctx` object (`70-sim.js:80-83`) currently exposes `rig` and
`addShot` to every `Enemy.prototype.update(world, players, bus, ctx)`
call — the only channel an `Enemy` instance has back to `Sim`. Gains one
new entry, a two-line mirror of the existing `addShot`:

```js
this.ctx = {
  rig: this.rig,
  addShot: function (shot) { self.shots.push(shot); return shot; },
  addEnemy: function (tid, x, y) { return self.addEnemy(tid, x, y); }
};
```

Reuses `Sim.prototype.addEnemy` exactly as it already exists — no changes
to that method itself. A **separate, presenter-side** debug trigger (§6,
below) calls `sim.addEnemy(...)` directly, bypassing `ctx` entirely, the
same way the boot-path practice Dummy is already added via
`sim.addTarget(...)` directly rather than through any Enemy-facing bridge
— two genuinely different call sites for the same already-real method,
not two implementations of the same thing.

## 5. Room-clear and currency — reuses the existing exclusion mechanism

Summoned adds never count toward a room's clear condition or bank kill
currency. This is not a new rule: `_levelRosterIds` (`70-sim.js`) already
tracks only a room's own generation-time roster specifically so an
undying, non-roster entity (the boot-path practice Dummy) can never block
`isLevelClear()` forever — a Caller's summoned adds are placed the
identical way (via `addEnemy`/`addTarget` outside room-generation time,
never added to `_levelRosterIds`), so they're excluded by the exact same
mechanism already proven correct for exactly this class of entity, not a
new carve-out.

## 6. Placement for v1 — a debug key only, named scope limit

Real procedural-generation placement (extending `50-gen.js`/
`RunLogic.placeEnemies` so a Caller can spawn in a real generated room
from a real run) is explicitly **out of scope** — a real, separate,
larger follow-up that would touch D3a's own fairness-audit pipeline, not
scoped or risked here. For v1, a Caller is reachable only via a new debug
key, **`F11`** (the next free slot — F2 through F10 are all already
claimed), mirroring the boot-path Dummy's own placement pattern: spawns
one Caller a fixed distance in front of player 0.

## 7. Concrete file-level shape

- `src/56-caller.js` — new file. `Caller` template object: `id: 'caller'`,
  `name`, `hp: 36` (2× `ashwalker`'s 18 — the highest hp of the four
  regular templates, `10-data.js:40` — an "elite" judgment, not a
  measurement), `w`/`h`, `mode`/`attack: 'summon'`, `speed`/`accel`,
  `sight`/`reach`, `telegraph` (≥ `CFG.MIN_TELEGRAPH`, the fairness
  floor), `recover`, `cooldown`, `summonId: 'ashwalker'` (genuinely the
  shortest **reach** of the four regular templates — 26px vs. emberrush's
  130/kilnspitter's 200/wickmoth's 62 — but NOT the shortest telegraph;
  ashwalker's 20 is second-shortest, wickmoth's 18 is lower. Adversarially
  found: an earlier draft of this spec overclaimed "shortest reach/
  telegraph" — corrected to what `10-data.js`'s real numbers say, chosen
  for the reach property specifically), `summonCount: 1`, `summonMax: 2`
  (a named judgment, same style guess as `GEN_MIN_FIGHT_TILES`),
  `summonOffset: 24` (moved onto the template rather than CFG or an inline
  literal — the same D7 reasoning `summonId`/`summonCount`/`summonMax`
  already follow), `tint`/`tintDark`/`scale`. Exported as
  `C.Caller.template`, mirroring `C.Boss.template`'s own shape.
- `src/45-enemy.js` — new `case 'summon'` in `doTelegraph`'s switch; new
  `Enemy.prototype.callIn`; new `Enemy.prototype.doSummon`; new `case
  'summon':` in the main state switch; `resetTransient()` gains
  `this.summonsUsed = 0`.
- `src/70-sim.js` — `this.ctx` gains `addEnemy` (2 lines). No changes to
  `Sim.prototype.addEnemy` itself.
- `src/00-core.js` — no new shared CFG beyond one optional
  `CALLER_SUMMON_OFFSET` (or inlined as a literal `24` with a comment —
  decided during implementation); cooldown/count/cap all live on the
  template (D7), not CFG.
- `src/95-app.js` — new `F11` debug key, mirroring the existing
  boot-path Dummy placement.
- New `tests/verify_caller.js` (mirrors `verify_boss.js`'s shape at
  smaller scale): template/shape audit, kept-out-of-`DATA.ENEMIES` proof,
  construction, the dodge test on the call itself (killing the Caller
  before telegraph completion prevents the summon outright — the real
  dodgeable window), `summonMax` hard-cap enforcement (a lifetime cap,
  not per-cast), determinism (L4: same seed → identical summon sequence
  and spawn positions), the post-telegraph `'summon'` recovery window
  actually existing and being non-zero frames, and confirming a summoned
  add's id never collides with anything already in `this.targets`.

## 8. Testing approach (L8 — exercise the real functions)

- `callIn()`: refuses (no-op) once `summonsUsed >= summonMax`; spawns
  exactly `summonCount` adds per successful call, each via the real
  `ctx.addEnemy` bridge; `summonsUsed` increments correctly and is a
  lifetime, not per-cast, counter.
- The full state path: `'patrol'`/`'chase'` → telegraph (≥
  `CFG.MIN_TELEGRAPH`) → `'summon'` (a real, non-zero recovery window,
  distinct from the pitch's originally-proposed zero-window shortcut) →
  `'recover'` → back to `'chase'`.
- Dodge test: killing the Caller mid-telegraph (before `stateFrames >=
  m.telegraph`) prevents the call from ever firing — the real fairness
  window every other primitive already gets, proven directly, not
  assumed by symmetry with `'shoot'`.
- `dangerous()` stays false throughout `'summon'`/telegraph — no
  body-contact threat from the call itself.
- A summoned add never appears in `_levelRosterIds`; killing every
  *real* roster member (not the summoned add) still clears the room even
  while a summoned add is still alive; killing only a summoned add never
  banks currency.
- `resetTransient()` clears `summonsUsed` back to 0 (only relevant if a
  Caller is ever reused across a reset — named for completeness, matching
  L10's "one authoritative reset" discipline).
- Determinism: two identically-seeded Callers produce identical summon
  timing and identical spawned-add ids/positions.

## 9. Explicitly out of scope for v1

- Real procedural-generation placement (`50-gen.js`/
  `RunLogic.placeEnemies`) — debug-key-only for v1 (§6).
- Re-summoning after a summoned add dies — `summonMax` is a lifetime cap
  on the Caller's own casts, not a "keep N adds alive" budget.
- Any parent/child lifecycle link between the Caller and its summons —
  killing the Caller does not despawn what it already summoned.
- Spawn-in VFX/SFX for the summoned add appearing.
- Retrofitting `attack: 'summon'` onto any existing regular
  `DATA.ENEMIES` template — this is an elite-only verb for v1.
- A second or later elite reusing this same primitive with different
  numbers — this spec covers exactly one template, `Caller`.
