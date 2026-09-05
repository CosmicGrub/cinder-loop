# Weapon equip & switch (D15)

Status: design approved by user 2026-08-24. Not yet implemented.
Companion docs: `CINDER_LOOP_MASTERFILE.md` (D-series decisions),
`docs/superpowers/pitches/2026-08-24-post-d13-system-pitches.md` (the
pitch this spec formalizes, ranked #1 of the post-D13 roadmap).

## 0. Why this exists

`DATA.WEAPONS` has four fully real, distinct rows (`10-data.js:182-186`,
D9's locked roster) and `Combat.weaponScale` already reads `player.weapon`
to pick which two D2 stat colours scale a hit (`40-combat.js:302-313`,
fully tested). But `Player.prototype.resetTransient` hardcodes
`this.weapon = 'blade'` (`30-player.js:191`) and nothing else in the
codebase ever writes to that field outside a test. Every one of D9's four
weapons, and D2's entire per-weapon colour-scaling axis, has been dead
build-diversity from a player's perspective since v0.2.8 — this is the
single largest already-built-but-inert surface in the game (masterfile
§5's own "designed, not built" list already names this gap in these
words).

D4's blueprint system already tracks `meta.unlocked[weaponId]`
(`65-meta.js:56,140-143`) and already carries/loses/hands-in a blueprint
on kill/death/transition — but "unlocked" has had no path to "equipped."
This spec is that path, and nothing else: it does not touch generation,
enemies, or the checkpoint/cinders work.

## 1. The switch-lockout rule — a correctness requirement, not a feel choice

`Player.prototype.canSwitchWeapon = function () { return !this.attack; };`

`Combat.step` re-reads `player.weapon` **every tick** an attack resolves,
to compute `Combat.weaponScale(player)` fresh (`40-combat.js:335`,
`damage: Math.round(m.data.damage * Combat.weaponScale(player))`).
Switching weapons mid-swing would silently reweight an in-flight move's
damage using the *new* weapon's stat-colour pair, not the one the move
actually belongs to — a real correctness bug, confirmed by reading the
live source, not assumed. Gating on "no active attack" is both necessary
and sufficient: `player.weapon` is read nowhere else outside that one
path, so no additional check against roll/dash/ledge state is needed.

## 2. Two Sim-level methods

- **`Sim.prototype.switchWeapon(playerIndex, weaponId)`** — the real
  primitive. Validates `player.alive()`, `player.canSwitchWeapon()`, and
  `MetaLogic.isUnlocked(this.meta, weaponId)`; sets `player.weapon =
  weaponId`; if `playerIndex === 0`, also writes `this.meta.lastWeapon =
  weaponId` (§3); emits `'weaponSwitch'`; returns bool. Same shape as
  `buyMaxHp` (`70-sim.js:436-446`) — check preconditions, mutate, return
  success — and directly unit-testable against an exact target weapon.
- **`Sim.prototype.cycleWeapon(playerIndex)`** — a thin wrapper. Finds the
  player's current position in `DATA.WEAPON_IDS` (already alphabetically
  sorted, L4-deterministic), advances to the next **unlocked** id
  (wrapping around), calls `switchWeapon`. This is what the real input
  button (§4) actually triggers in v1.

Two small, independently-testable methods rather than one: the cycle
button is the only trigger v1 ships, but the primitive stays honest and
testable without needing to cycle N times to reach an arbitrary target
weapon in a test.

## 3. Persistence — `meta.lastWeapon`, captured on switch, not at run-end

**A genuine simplification over the original pitch**, found by reading
the actual reset-timing source rather than assuming the pitch's proposed
shape was correct: capturing "last weapon" at run-end is more complex
than it needs to be, and wrong in one real case. If player 0 is the one
who *died*, their own natural respawn (`deadFrames` reaching 0) already
fires `resetTransient()` — wiping `player.weapon` back to `'blade'` —
**before** `_commitPendingLevel()`'s own reset loop (`70-sim.js:902-907`)
ever runs. A run-end capture would need a second hook at the moment of
death, mirroring `blueprintLost`'s own timing dance (`70-sim.js`'s
`justDied` branch) — real, avoidable complexity.

Instead: **`meta.lastWeapon` updates immediately, inside `switchWeapon()`
itself**, the instant player 0 explicitly switches. No death-timing edge
case exists at all, and it is arguably a more honest reading of "your
choice" than a run-end snapshot would be — the value is always exactly
whatever player 0 last explicitly picked, full stop.

`Sim.prototype._applyMetaToPlayer` — the one shared hook already called
from every reset site (`70-sim.js:375`, constructor, `beginRun`,
`applyMeta`, `_commitPendingLevel`, and the natural per-player respawn
path) — gains one line, placed after the existing `maxHpBonus`/
`dashExtraCharge` lines:

```js
player.weapon = MetaLogic.isUnlocked(this.meta, this.meta.lastWeapon)
  ? this.meta.lastWeapon : 'blade';
```

The exact same "reset to a safe baseline, then layer the permanent value
back on" two-step every other meta field already uses.

**Named judgment, decided explicitly:** only **player 0's** switches
update `meta.lastWeapon`. Co-op partners can each freely cycle their own
live `player.weapon` independently in any given run (that's ordinary
per-player state, unaffected by this); it's only the shared "what does a
*fresh run* start on" value that's single and player-0-sourced, applying
uniformly to every player at the next reset. Both halves of this are
trivially overridable — switching is free and instant — so the cost of
this being the "wrong" choice for a given group is one button press per
affected player. No separate per-player memory is built for v1.

`Meta`'s default `lastWeapon` is `'blade'` — matching the existing
default, safe from tick one, requiring no migration.

## 4. Input — a real, permanent, player-facing trigger from day one

Unlike every meta-currency purchase before it (`F5`-`F10`, all
debug-key-only stand-ins because they're genuine *purchases* with no shop
UI yet), switching an already-unlocked weapon is not a purchase — it's a
live gameplay action a player wants constantly. It gets a real input from
the start, not a debug key:

- **`05-input.js`**: add `'switchWeapon'` to `Pad.BUTTONS`, and a
  `WINDOW.switchWeapon: CFG.PENDING_FRAMES` entry. The file's own header
  names a `BUTTONS`-only addition as a silent trap (`WINDOW[name]` stays
  `undefined`, `buffered()` always reads false, no error anywhere) —
  copying `parry`'s exact two-table shape avoids it.
- **`90-settings.js`**: `DEFAULT_KEYS.switchWeapon: ['KeyI']` — a free key
  next to the J/K/L/U cluster the other actions already claim (confirmed
  unclaimed by grep). Rebindable like every other action; this is only
  the default.
- **`95-app.js`**: gamepad button **4** (LB on a standard mapping) —
  confirmed genuinely unused anywhere in this codebase today (buttons
  0,1,2,3,5,9,12-15 are the only ones read; grep confirms zero hits on 4).
  `95-app.js`'s job stops at translating raw hardware into `pad.set(
  'switchWeapon', true/false)` — exactly like every other action already
  works (`Settings.actionForCode` + `p1.set(...)` for keyboard,
  `pollGamepad`/`padAssist` for a pad) — it does **not** itself decide
  when a switch fires.
- **`70-sim.js`**: the actual consume-and-act belongs in the SIM layer,
  not the presenter, for the same reason every other action already lives
  there — `verify_move.js`-style tests script `pad.set()` and step the
  sim directly, with no fake DOM events, and 05-input.js's own header
  states this split is exactly what makes that possible. Confirmed by
  reading `Sim.prototype.step` (`70-sim.js:241-264`): `roll`/`jump`/
  `parry` are all consumed inside `Player.prototype.update(pad, ...)`,
  and `attack` inside `Combat.begin(player, pad, ...)`, both called from
  `Sim.prototype.step`'s own per-tick, per-player loops — never from
  `95-app.js`. `switchWeapon` gets the identical treatment: a new phase
  **0**, immediately before the existing "1. Attack input" phase (so
  identity resolves before action — a same-tick switch-then-attack combo
  correctly swings with the newly-equipped weapon, zero added latency,
  matching the file's own "costs zero frames of latency" discipline for
  attack/jump):
  ```js
  // 0. Weapon switch is consumed before attack input, so identity
  //    resolves before action — a same-tick switch-then-swing combo
  //    correctly attacks with the newly-equipped weapon.
  for (i = 0; i < this.players.length; i++) {
    if (this.pads.get(i).consume('switchWeapon')) this.cycleWeapon(i);
  }
  ```
- **`92-menu.js`**: **zero changes.** Confirmed (not assumed) that the
  Options screen's rebind row list and keybind logic are already fully
  generic over `Pad.BUTTONS.length` (`92-menu.js:90-93,126-128`) — the
  new action becomes rebindable in the existing menu the moment it exists
  in `BUTTONS`, the exact same "adding a button is a same-step, two-file
  change" precedent D13's own Parry addition already established.

## 5. Bus event and hash coverage

- New `'weaponSwitch'` entry in `00-core.js`'s `EVENTS` whitelist, payload
  `{playerId: player.id, weaponId: weaponId}` — named more explicitly than
  `blueprintUnlocked`'s own `{id, playerId}` shape (where `id` means the
  *weapon*, easy to misread), a deliberate small clarity improvement, not
  an oversight.
- `p.weapon` is **already** hashed per-player (`70-sim.js:1193`) — no new
  per-player hash coverage needed for the in-run field. `meta.lastWeapon`
  is a **new** field that affects future ticks (decides what a later
  reset applies) and must join the `this.meta.*` hash tuple
  (`70-sim.js:1168`) — hashed directly, following this project's own
  stated preference (see the `this.tube` hash comment,
  `70-sim.js:1150-1157`) for hashing a value outright rather than trusting
  it's a pure re-derivation of already-hashed state.
- `65-meta.js` `sanitize()`: `if (DATA.WEAPON_IDS.indexOf(raw.lastWeapon)
  !== -1) out.lastWeapon = raw.lastWeapon;` — the same pattern `unlocked`
  already uses for validating against `DATA.WEAPON_IDS`.

## 6. Concrete file-level shape

- `src/00-core.js` — `EVENTS` gains `'weaponSwitch'`.
- `src/05-input.js` — `BUTTONS` gains `'switchWeapon'`; `WINDOW` gains a
  matching entry.
- `src/10-data.js` — no changes (`WEAPONS`/`WEAPON_IDS` already complete).
- `src/30-player.js` — new `Player.prototype.canSwitchWeapon`.
- `src/65-meta.js` — `Meta` constructor gains `this.lastWeapon = 'blade';`;
  `sanitize()` gains the `lastWeapon` validation line above.
- `src/70-sim.js` — new `Sim.prototype.switchWeapon`,
  `Sim.prototype.cycleWeapon`; a new phase 0 in `Sim.prototype.step`
  consuming `switchWeapon` per player (§4); `_applyMetaToPlayer` gains the
  one weapon line; `hash()` gains `this.meta.lastWeapon` in the meta
  tuple.
- `src/90-settings.js` — `DEFAULT_KEYS` gains `switchWeapon: ['KeyI']`.
- `src/95-app.js` — gamepad button 4 wiring via `pad.set('switchWeapon',
  ...)` only, mirroring every other action; no Sim-mutating logic here.
- `src/92-menu.js` — no changes (confirmed generic).

## 7. Testing approach (L8 — exercise the real functions)

- `switchWeapon`: refuses mid-attack (`player.attack` truthy), refuses a
  locked weapon, refuses a dead player, succeeds otherwise and emits
  `weaponSwitch` with the right payload; player-index-0 success updates
  `meta.lastWeapon`, player-index-1 success does not.
- `cycleWeapon`: advances through `DATA.WEAPON_IDS` in order, skips locked
  weapons, wraps from the last unlocked id back to the first; a safe
  no-op (never a crash or infinite loop) when the current weapon is the
  ONLY unlocked one — a real, reachable state (e.g. `enforceLocks` toggled
  true via F5 with nothing handed in yet).
- `_applyMetaToPlayer`: a fresh reset applies `meta.lastWeapon` when it's
  unlocked, falls back to `'blade'` when (hypothetically) it isn't.
- `hash()`: two otherwise-identical sims diverge once `meta.lastWeapon`
  differs — the same "mutate one field, assert hash differs" pattern
  every other hash-coverage test in `verify_meta.js` already uses.
- Input: `Pad.WINDOW.switchWeapon` is a real positive number (mirrors the
  existing direct regression already written for the identical D13 trap
  in `verify_move.js`).
- Co-op: two players cycling independently never cross-contaminate each
  other's `player.weapon`; only player 0's cycle touches `meta.lastWeapon`.

## 8. Explicitly out of scope for v1

- Dual-wielding, or carrying more than one active weapon.
- Weapon-flavored move variants or ability variants (blocked on this
  landing first — already named as blocked in the abilities spec, §1).
- Touch input wiring for `switchWeapon` (L13: desktop + gamepad first).
- Any HUD indicator of which weapon is currently equipped — a real,
  separate `80-view.js` gap, named here rather than silently built.
- Per-player independent "last weapon" memory (§3's named judgment) —
  `meta.lastWeapon` is single and shared, sourced from player 0 only.
- Any currency cost anywhere in this feature — both starting-loadout
  selection and in-run switching are free, per the approved design.
