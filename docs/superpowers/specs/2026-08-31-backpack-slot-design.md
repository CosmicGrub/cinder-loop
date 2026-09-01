# Backpack slot (D24)

Status: design approved by user 2026-08-31. Not yet implemented.
Companion docs: `CINDER_LOOP_MASTERFILE.md` (D-series decisions),
`docs/superpowers/pitches/2026-08-24-post-d13-system-pitches.md` (Tier 1,
item 3 — "small and low-risk on its own terms, but correctly LOW
priority within this tier — its standalone value is thin until a second
carriable resource (cinders) exists to arbitrate against").

## 0. Why this exists

`CFG.META_BLUEPRINT_CAPACITY: 1` (`00-core.js:348`) has carried its own
comment since D4 shipped: "per player; a 'backpack slot' purchase would
raise this later — deferred." This spec is that purchase. Every touch
point already exists in scalar form — `Player.prototype.carriedBlueprint`
(`30-player.js:208`), the drop-assignment loop, `_handInCarriedBlueprints()`,
the death-loss notification, and `hash()`'s own serialization
(`70-sim.js:1318`) — this generalizes each from "exactly one" to
"up to capacity," and adds the one purchase that raises capacity.

## 1. Data model: scalar becomes array

`Player.prototype.resetTransient` (`30-player.js:208`):
`this.carriedBlueprint = null;` becomes `this.carriedBlueprints = [];` —
a plain, dynamic-length array; `.length` IS the current fill level, no
null-padding to a fixed size. `teleport()` (`30-player.js:262-275`)
already deliberately does NOT clear this field ("a live transition is not
a death") — that line simply disappears along with everything else that
isn't reset there; no new code needed to keep preserving it.

## 2. Capacity is read dynamically, never snapshotted — no live top-up needed

Unlike `buyMaxHp`, which copies a `maxHp`/`hp` VALUE onto each player at
reset time (so buying it mid-run needs an explicit live top-up loop to
take effect immediately), a player's blueprint capacity is never stored
on the player at all — every check that cares reads it fresh from
`meta.backpackSlot` at the moment it matters (the drop-assignment site,
below). This means `buyBackpackSlot()` needs no live top-up: the very
next blueprint drop after purchase already sees the raised capacity, mid-
run or not, for free.

```js
// 70-sim.js — a private helper, not exported; the only thing that reads
// meta.backpackSlot to decide a number.
function _blueprintCapacity(meta) {
  return CFG.META_BLUEPRINT_CAPACITY + (meta.backpackSlot ? 1 : 0);
}
```

## 3. The purchase — mirrors `buyMaxHp`/`buyParryRiposte`'s exact shape

New CFG constant (`00-core.js`, sibling to the other four flat-cost
purchases):

```js
META_BACKPACK_SLOT_COST: 15,  // priced at the cheap end of the 15-25
                               // range on purpose — a narrower, situational
                               // QoL purchase (only matters while already
                               // carrying one un-handed-in blueprint AND a
                               // second, different, still-locked one drops
                               // before the next checkpoint), not a
                               // combat-power purchase like its 20-25
                               // siblings
```

New `MetaLogic.spendOnBackpackSlot` (`65-meta.js`), identical shape to
`spendOnParryRiposte` etc.: `return C.RunLogic.spend(currency,
CFG.META_BACKPACK_SLOT_COST);`.

New `Sim.prototype.buyBackpackSlot` (`70-sim.js`), byte-for-byte the same
shape as `buyParryRiposte` (`70-sim.js:527-538`) — double-purchase guard,
spend, flip the flag, done (no live top-up loop needed, per §2 above):

```js
Sim.prototype.buyBackpackSlot = function () {
  if (this.meta.backpackSlot) return false;
  var result = MetaLogic.spendOnBackpackSlot(this.meta.currency);
  if (!result.ok) return false;
  this.meta.currency = result.currency;
  this.meta.backpackSlot = true;
  return true;
};
```

`this.meta.backpackSlot` defaults to `false` wherever `meta` is first
constructed/loaded (mirroring `dashExtraCharge`/`dashExtIframes`/
`parryRiposte`/`parryReflect`'s own default-false init and persistence
round-trip — same file, same pattern, no new persistence machinery).

## 4. The drop-assignment loop generalizes from "empty" to "has room"

`70-sim.js:200-207` (inside the `'hurt'`/kill-roster listener):

```js
for (var pi = 0; pi < self.players.length; pi++) {
  var pl = self.players[pi];
  if (pl.alive() && pl.carriedBlueprints.length < _blueprintCapacity(self.meta)) {
    pl.carriedBlueprints.push(dropId);
    self.bus.emit('blueprintDrop', { id: dropId, playerId: pl.id, x: e.x, y: e.y });
    break;
  }
}
```

Unchanged: still assigned to the first player with room, not attributed
to whoever landed the kill — the existing "a shared run resource" reasoning
this file's own comment already states, untouched by this spec.

## 5. `_handInCarriedBlueprints()` generalizes from "the one" to "everything carried"

`70-sim.js:1048-1080`. The existing per-carrier body (record into
`handedIn`, clear the slot, no-op if already unlocked, else spend and
unlock) becomes a per-item loop inside the per-carrier loop:

```js
Sim.prototype._handInCarriedBlueprints = function () {
  var handedIn = [];
  for (var hi = 0; hi < this.players.length; hi++) {
    var carrier = this.players[hi];
    if (!carrier.alive()) continue;
    for (var ci = 0; ci < carrier.carriedBlueprints.length; ci++) {
      var weaponId = carrier.carriedBlueprints[ci];
      handedIn.push(weaponId);
      if (MetaLogic.isUnlocked(this.meta, weaponId)) continue;
      var result = MetaLogic.spendOnUnlock(this.meta.currency);
      if (result.ok) {
        this.meta.currency = result.currency;
        this.meta.unlocked[weaponId] = true;
        this.bus.emit('blueprintUnlocked', { id: weaponId, playerId: carrier.id });
      }
    }
    carrier.carriedBlueprints = [];
  }
  return handedIn;
};
```

Processed in array order — acquisition order, since items are only ever
`.push()`ed — so a player carrying two different locked blueprints and
short on currency for both opportunistically unlocks whichever they
found FIRST. Not a new rule to design around; the natural consequence of
FIFO array order, worth stating explicitly rather than leaving implicit.
The existing "two carriers of the identical locked weapon" no-op-on-the-
second-one behavior (`MetaLogic.isUnlocked` reads true after the first
processes) already covers a single player's own two-copies-of-the-same-
locked-blueprint case for free — checked directly, not assumed: nothing
in `rollBlueprintDrop` (`65-meta.js:166-174`) excludes a weapon id
currently sitting in someone's carry slot, only weapons already in
`meta.unlocked`, so a duplicate CAN be rolled. This already happens
today in multiplayer (two players, two separate capacity-1 slots, same
locked weapon drops twice) and is explicitly out of scope to change here
— see §8.

## 6. Death-loss notification generalizes to "emit once per carried item"

`70-sim.js:1161-1163` — `_stepRun()`'s own death-moment notification,
fired before `resetTransient()` clears the field a few ticks later:

```js
for (var bi = 0; bi < this.players[i].carriedBlueprints.length; bi++) {
  this.bus.emit('blueprintLost', {
    id: this.players[i].carriedBlueprints[bi], playerId: this.players[i].id
  });
}
```

Same payload shape as today, per item — no new event type, no consumer
of `'blueprintLost'` needs to change.

## 7. `hash()` serialization

`70-sim.js:1318`:
`p.carriedBlueprint === undefined || p.carriedBlueprint === null ? '-' : p.carriedBlueprint,`
becomes
`p.carriedBlueprints && p.carriedBlueprints.length ? p.carriedBlueprints.join(',') : '-',`
— a stable, deterministic string regardless of array length, matching
every other field's own "undefined/empty-safe, one comma-joined
argument" convention in this same call.

## 8. Debug key

`F12` (`95-app.js`) — the next free slot; F2 through F11 are all already
claimed (F11 by the Caller, D16). Mirrors every existing meta-purchase
debug key exactly: `if (e.code === 'F12') { if (sim.buyBackpackSlot())
saveMeta(sim.meta); }`. No player-facing trigger exists for ANY D8
purchase yet (named once, already-accepted scope, in the roadmap pitch
itself) — not something this spec solves.

## 9. Testing approach (L8 — exercise the real functions)

- `_blueprintCapacity`: returns `CFG.META_BLUEPRINT_CAPACITY` with the
  flag unset, `+1` with it set.
- `buyBackpackSlot`: refuses (no-op, returns `false`) once already owned;
  refuses when unaffordable; spends exactly `META_BACKPACK_SLOT_COST` and
  flips the flag on success; takes effect on the very next drop without
  any live top-up (mid-run purchase test, per §2).
- Drop-assignment: with the flag unset, a second drop while already
  carrying one is never assigned to a full player (existing behavior,
  regression-only); with the flag set, a player already carrying one can
  receive a second, different blueprint.
- Hand-in: carrying two different locked blueprints hands in both at one
  checkpoint (two `blueprintUnlocked` events, both ids in the returned
  `handedIn` array); carrying one locked + one already-unlocked hands in
  both but only spends currency once; an unaffordable second item is
  still cleared from the carry slot (spent either way, matching the
  existing single-item behavior's own already-tested contract).
- Death-loss: carrying two blueprints at death emits two `'blueprintLost'`
  events, both ids present.
- `hash()`: two players carrying different blueprint sets produce
  different hashes; order matters (`['a','b']` vs `['b','a']` — a real
  question worth a direct assertion, not assumed).
- Determinism (L4): a full drop→carry→hand-in sequence with the backpack
  slot owned, hashed twice from the same seed, matches.

## 10. Explicitly out of scope for v1

- Cinders — a separate, still-unwired carriable resource (D14's own
  scaffolding, `player.carriedCinders` does not yet exist as a field at
  all). This spec is scoped to blueprints only, per the pitch's own
  framing.
- Any further capacity purchase beyond the one 1→2 bump — one-time flag,
  matching every other D8 boolean purchase; not stackable.
- Changing `rollBlueprintDrop` to exclude currently-carried (not yet
  unlocked) weapon ids — a real, separate, larger change (needs the full
  roster's carry state as a new input) for a benefit that's only ever
  "don't occasionally waste one RNG roll." See §5.
- Any presenter-layer UI for carried blueprints — none exists today for
  the single-slot version either (checked directly: no reference to
  `carriedBlueprint`/`blueprintDrop`/`blueprintUnlocked`/`blueprintLost`
  anywhere in `80-view.js` or `95-app.js` outside the debug key itself),
  so this stays a pure sim-layer change.
- A real player-facing purchase trigger (shop/hub UI) — already-named,
  already-accepted scope gap shared by every D8 purchase, not unique to
  this one.
