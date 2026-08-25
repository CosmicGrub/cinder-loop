/* ===========================================================================
 * 65-meta.js  —  meta progression (D4/D8): persistence, blueprints,
 * capability unlocks
 * ---------------------------------------------------------------------------
 * SIM layer, pure — same discipline 60-run.js already established for this
 * exact reason: this file never references Sim, Player, Enemy, World, or
 * Body. `Meta` is a plain data holder (no methods of its own), owned and
 * mutated by 70-sim.js the same way it already owns `this.run`; `MetaLogic`
 * is the pure decision/derivation layer, mirroring `RunLogic`'s own split
 * exactly rather than inventing a different shape for a closely analogous
 * problem.
 *
 * Storage-agnostic, the same way `90-settings.js` is and for the identical
 * reason: nothing here touches localStorage, window, or the DOM.
 * `sanitize()`/`serialize()`/`deserialize()` are pure data-in, data-out, so
 * `verify_meta` can exercise the REAL sanitizer in a bare Node sandbox with
 * hand-built payloads rather than reimplementing its rules to check against
 * (L8). 95-app.js owns the two lines of localStorage glue, wrapped in
 * try/catch there, not here — the same division of labor `90-settings.js`'s
 * own header already states, applied to a second, unrelated payload.
 *
 * SCOPE, DECIDED EXPLICITLY (not silently): D8 names four things meta
 * currency buys — "flask charges, +max HP, backpack slot, starting-loadout
 * choice." This file builds ONLY the D4 blueprint loop (drop, carry, lose on
 * death, hand in at a transition, pay to unlock into the pool — the four
 * already-built, D9-locked weapons are what a blueprint targets, since
 * nothing else in this project's content is presently blueprint-shaped) and
 * D8's +max HP purchase (a direct reuse of D2's own "+HP" vocabulary, one
 * layer up, permanent rather than within-run). Flask charges and a backpack
 * slot are real, named parts of D8's list and are deliberately NOT built
 * here — both are genuinely new mechanics with no existing engine surface to
 * hang off (unlike +max HP or blueprint unlocks), the kind of open design
 * space this project scopes explicitly before building rather than folding
 * in quietly (the same two-step discipline D11/D12 already used).
 *
 * Owned by: Meta team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG;
var VERSION = 1;

/* --------------------------------------------------------------- Meta
 * A plain data holder, not an engine — the same shape `Run` (60-run.js)
 * already established for "a handful of fields something needs to remember,
 * owned and mutated by 70-sim.js." Deliberately NOT reset by `beginRun()`:
 * a within-session restart is a fresh RUN, not a wipe of everything the
 * player has permanently earned — the whole point of this file existing at
 * all. */
function Meta() {
  this.version = VERSION;
  this.currency = 0;          // permanent — the SAME pool `Run.currency` already
                               // accumulates within a session; this file's only
                               // new contribution is making it survive a reload
  this.unlocked = {};         // weaponId -> true, meaningful only once enforceLocks is true
  // D15 (weapon equip & switch): which WEAPONS id a fresh reset applies
  // (see 70-sim.js's own _applyMetaToPlayer). Defaults to 'blade' — the
  // same default resetTransient() already uses, so a first boot needs no
  // migration. Updated by Sim.prototype.switchWeapon the instant player 0
  // explicitly switches (design spec §3) — not a run-end snapshot.
  this.lastWeapon = 'blade';
  this.maxHpBonus = 0;        // permanent +max HP, stacked one META_MAXHP_GAIN at a time
  this.enforceLocks = CFG.META_ENFORCE_LOCKS_DEFAULT;   // D4's own "debug-room toggle"
  // Ability enhancements (abilities spec §4) — four independent flat-cost
  // booleans, the same "own it or don't, no stacking" shape a weapon
  // unlock already has (`unlocked`, above), just flat fields instead of a
  // dictionary since there are only ever exactly four of these.
  this.dashExtraCharge = false;
  this.dashExtIframes = false;
  this.parryRiposte = false;
  this.parryReflect = false;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isFiniteNonNeg(v) {
  return typeof v === 'number' && isFinite(v) && v >= 0;
}

function defaults() {
  return new Meta();
}

/* Take anything — a freshly parsed JSON blob, `undefined`, a corrupted or
 * hand-edited payload, an object from a future version — and always return a
 * COMPLETE, valid Meta object. Never throws. Missing or invalid fields fall
 * back to defaults() field by field, mirroring `90-settings.js`'s own
 * sanitize() precisely: one bad key must not discard an otherwise-good
 * currency balance, the same reasoning that keeps a corrupted keybind from
 * discarding a good one.
 *
 * No migration logic exists yet because no version but 1 has ever shipped —
 * a version mismatch is treated as "unknown, discard" rather than guessed
 * at, the same safe failure `90-settings.js` already chose. */
function sanitize(raw) {
  var out = defaults();
  if (!isPlainObject(raw)) return out;
  if (raw.version !== VERSION) return out;

  if (isFiniteNonNeg(raw.currency)) out.currency = Math.floor(raw.currency);
  if (isFiniteNonNeg(raw.maxHpBonus)) out.maxHpBonus = Math.floor(raw.maxHpBonus);
  if (typeof raw.enforceLocks === 'boolean') out.enforceLocks = raw.enforceLocks;
  if (typeof raw.dashExtraCharge === 'boolean') out.dashExtraCharge = raw.dashExtraCharge;
  if (typeof raw.dashExtIframes === 'boolean') out.dashExtIframes = raw.dashExtIframes;
  if (typeof raw.parryRiposte === 'boolean') out.parryRiposte = raw.parryRiposte;
  if (typeof raw.parryReflect === 'boolean') out.parryReflect = raw.parryReflect;

  if (isPlainObject(raw.unlocked)) {
    var ids = C.DATA.WEAPON_IDS, i;
    for (i = 0; i < ids.length; i++) {
      if (raw.unlocked[ids[i]] === true) out.unlocked[ids[i]] = true;
    }
  }
  // D15: the same "validate against DATA.WEAPON_IDS, fall back to the
  // safe default otherwise" pattern `unlocked` above already uses.
  if (C.DATA.WEAPON_IDS.indexOf(raw.lastWeapon) !== -1) out.lastWeapon = raw.lastWeapon;
  return out;
}

function serialize(meta) {
  return JSON.stringify(sanitize(meta));
}

// The one function allowed to see a raw string (or null/undefined, the shape
// `localStorage.getItem` returns for a missing key). JSON.parse's own
// exception is the only thing caught here; sanitize() handles every other
// way a payload can be wrong — identical division of labor to
// `Settings.deserialize`.
function deserialize(text) {
  if (typeof text !== 'string') return defaults();
  var parsed;
  try { parsed = JSON.parse(text); } catch (e) { return defaults(); }
  return sanitize(parsed);
}

/* ----------------------------------------------------------- blueprints
 * D4, read precisely. "Stage 1 ships with the pool pre-unlocked" means
 * `isUnlocked` returns true unconditionally while `enforceLocks` is false
 * (CFG's own default) — every weapon already reads as available, so there
 * is genuinely nothing left for a blueprint to unlock, and (see
 * rollBlueprintDrop below) nothing drops. The debug-room toggle is what
 * makes the whole mechanic observable before any FUTURE content exists to
 * gate behind it for real — the identical shape D8's own now-retired
 * RUN_SPEND_STUB_COST used ("real and exercised, just always affordable,
 * because pretending a shop exists before this file did would be
 * dishonest"), one layer up. */
function isUnlocked(meta, weaponId) {
  if (!meta.enforceLocks) return true;
  return !!meta.unlocked[weaponId];
}

// `weaponIds`: DATA.WEAPON_IDS, passed in rather than reached for directly —
// this file stays a pure function of its own arguments, the same L8
// discipline `RunLogic.placeEnemies` already holds itself to for DATA.
// `rng`: the caller's OWN live stream (Sim's `this.rng`), consumed directly
// rather than a fresh per-call instance — the identical convention
// `pickStatColour` already established for in-run, reactive randomness (as
// opposed to `RunLogic`'s derived-seed functions, which build a level
// independently reproducible from one seed and so own a throwaway RNG of
// their own). Returns a weapon id, or null if nothing is eligible to drop —
// never rolls the drop chance itself when there is nothing left to offer,
// so a fully-unlocked pool (Stage 1's default) costs zero RNG draws, not a
// wasted one.
function rollBlueprintDrop(weaponIds, meta, rng) {
  var locked = [], i;
  for (i = 0; i < weaponIds.length; i++) {
    if (!isUnlocked(meta, weaponIds[i])) locked.push(weaponIds[i]);
  }
  if (!locked.length) return null;
  if (rng.next() >= CFG.META_BLUEPRINT_DROP_CHANCE) return null;
  return rng.pick(locked);
}

/* ------------------------------------------------------------- spending
 * Both reuse `RunLogic.spend` directly rather than re-deriving the same
 * "refuse an unaffordable cost, never go negative" rule a second time in
 * this file — the exact function is already pure, already generic (plain
 * currency/cost numbers in, no `Run`-specific field it depends on), and
 * already proven (verify_run.js). Reused, not duplicated (L8's own spirit,
 * extended to this file's own two spends). Both return the SAME
 * `{currency, spent, ok}` shape `RunLogic.spend` already does — callers
 * (70-sim.js) still own deciding what `ok` should also flip on success
 * (marking a blueprint unlocked, growing maxHpBonus), the same way
 * `_beginRunEnd`/`_commitPendingLevel` already own applying `RunLogic`'s
 * own pure results to real state. */
function spendOnUnlock(currency) {
  return C.RunLogic.spend(currency, CFG.META_BLUEPRINT_UNLOCK_COST);
}
function spendOnMaxHp(currency) {
  return C.RunLogic.spend(currency, CFG.META_MAXHP_COST);
}

// Abilities spec §4's four enhancements — same reuse of RunLogic.spend as
// the two spends above, one per flat-cost purchase, no new logic to derive.
function spendOnDashExtraCharge(currency) {
  return C.RunLogic.spend(currency, CFG.META_DASH_EXTRA_CHARGE_COST);
}
function spendOnDashExtIframes(currency) {
  return C.RunLogic.spend(currency, CFG.META_DASH_EXT_IFRAMES_COST);
}
function spendOnParryRiposte(currency) {
  return C.RunLogic.spend(currency, CFG.META_PARRY_RIPOSTE_COST);
}
function spendOnParryReflect(currency) {
  return C.RunLogic.spend(currency, CFG.META_PARRY_REFLECT_COST);
}

C.Meta = Meta;
C.MetaLogic = {
  defaults: defaults,
  sanitize: sanitize,
  serialize: serialize,
  deserialize: deserialize,
  isUnlocked: isUnlocked,
  rollBlueprintDrop: rollBlueprintDrop,
  spendOnUnlock: spendOnUnlock,
  spendOnMaxHp: spendOnMaxHp,
  spendOnDashExtraCharge: spendOnDashExtraCharge,
  spendOnDashExtIframes: spendOnDashExtIframes,
  spendOnParryRiposte: spendOnParryRiposte,
  spendOnParryReflect: spendOnParryReflect
};

})(CINDER);
