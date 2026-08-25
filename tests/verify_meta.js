/* ===========================================================================
 * tests/verify_meta.js  —  meta progression (D4/D8): persistence, blueprints,
 * capability unlocks
 * ---------------------------------------------------------------------------
 * Two layers, matching verify_run.js's own precedent for a system this
 * shaped: pure MetaLogic logic first (hand-built fixtures, no Sim/Player
 * anywhere — L8), real sim ticks second, proving 70-sim.js actually wires
 * the pure logic in correctly rather than merely proving the logic is
 * self-consistent in isolation. Storage itself (localStorage) is NOT
 * exercised here — 65-meta.js is deliberately storage-agnostic, the same
 * split verify_platform.js already draws for Settings; the two lines of
 * glue in 95-app.js (loadMeta/saveMeta) are a presenter concern, covered
 * for real by verify_render's own "meta persistence" section — real F5/F6
 * key dispatch, a real reload, and a corrupted-payload boot, the identical
 * shape that section already proves for Settings. (An earlier version of
 * this exact comment claimed that coverage before it existed — an
 * adversarially-found gap, corrected by adding the coverage rather than
 * just fixing the claim.)
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_meta');
const C = H.loadSim();
const CFG = C.CFG, MetaLogic = C.MetaLogic, RunLogic = C.RunLogic, DATA = C.DATA;

/* ================================== 0. D15 input plumbing (05-input.js)
 * The same BUTTONS/WINDOW two-map trap parry's own regression already
 * guards. Settings' own DEFAULT_KEYS-must-exist-for-every-BUTTONS-entry
 * contract is covered in verify_platform.js instead — Settings has zero
 * dependency on Sim (this file's own header, echoing 90-settings.js's own
 * split) and loadSim() here never loads it. */
{
  const Pad = C.Pad;
  s.ok('switchWeapon exists in Pad.BUTTONS', Pad.BUTTONS.indexOf('switchWeapon') !== -1);
  s.ok('Pad.WINDOW.switchWeapon is a real positive number',
    Pad.WINDOW.switchWeapon > 0, Pad.WINDOW.switchWeapon);

  const pad = new Pad();
  pad.set('switchWeapon', true); pad.update(false);
  s.ok('a fresh press is buffered', pad.buffered('switchWeapon'));
  s.ok('and actually consumable', pad.consume('switchWeapon'));
  s.ok('consuming clears it', !pad.buffered('switchWeapon'));
}

/* ============================================================ 1. defaults */
{
  const d = MetaLogic.defaults();
  s.eq('defaults declare the current version', d.version, 1);
  s.eq('currency starts at zero', d.currency, 0);
  s.eq('nothing is explicitly unlocked yet', Object.keys(d.unlocked).length, 0);
  s.eq('maxHpBonus starts at zero', d.maxHpBonus, 0);
  s.eq('lastWeapon defaults to blade (D15)', d.lastWeapon, 'blade');
  s.eq('enforceLocks matches Stage 1\'s own default', d.enforceLocks, CFG.META_ENFORCE_LOCKS_DEFAULT);
  s.eq('Stage 1 ships pre-unlocked (D4)', CFG.META_ENFORCE_LOCKS_DEFAULT, false);

  s.ok('two calls to defaults() do not share the unlocked object',
    (() => { const a = MetaLogic.defaults(), b = MetaLogic.defaults();
      a.unlocked.blade = true; return !b.unlocked.blade; })());
}

/* =============================================================== sanitize
 * Every argument here is something a hand-edited or corrupted localStorage
 * payload could actually contain. None of them may throw, and none may
 * produce a result this file's own spend/unlock logic could not safely
 * consume — the identical bar Settings.sanitize() already holds itself to. */
{
  const cases = [
    ['undefined', undefined],
    ['null', null],
    ['a bare string', 'not an object'],
    ['a number', 42],
    ['an array', [1, 2, 3]],
    ['an empty object', {}],
    ['wrong version', { version: 999, currency: 500 }],
    ['currency as a string', { version: 1, currency: '500' }],
    ['currency negative', { version: 1, currency: -5 }],
    ['currency NaN', { version: 1, currency: NaN }],
    ['currency Infinity', { version: 1, currency: Infinity }],
    ['currency fractional (floored, not rejected)', { version: 1, currency: 12.9 }],
    ['maxHpBonus negative', { version: 1, maxHpBonus: -1 }],
    ['enforceLocks as a string', { version: 1, enforceLocks: 'yes' }],
    ['unlocked as a string', { version: 1, unlocked: 'nope' }],
    ['unlocked as an array', { version: 1, unlocked: [] }],
    ['an unknown weapon id in unlocked', { version: 1, unlocked: { flyToTheMoon: true } }],
    ['a real weapon id set to a non-true value', { version: 1, unlocked: { blade: 1 } }],
    ['a deeply nested garbage blob', { version: 1, unlocked: { blade: { nested: true } } }],
    ['lastWeapon a real, valid weapon id (D15)', { version: 1, lastWeapon: 'warmaul' }],
    ['lastWeapon an unknown id (D15)', { version: 1, lastWeapon: 'flyToTheMoon' }]
  ];
  for (const [label, input] of cases) {
    let out, threw = false;
    try { out = MetaLogic.sanitize(input); } catch (e) { threw = true; }
    s.ok('sanitize never throws on ' + label, !threw);
    if (!threw) {
      s.eq('and ' + label + ' always yields the current version', out.version, 1);
      s.ok('and currency is always a finite non-negative number',
        typeof out.currency === 'number' && isFinite(out.currency) && out.currency >= 0);
      s.ok('and maxHpBonus is always a finite non-negative number',
        typeof out.maxHpBonus === 'number' && isFinite(out.maxHpBonus) && out.maxHpBonus >= 0);
      s.eq('and enforceLocks is always strictly boolean', typeof out.enforceLocks, 'boolean');
      s.ok('and lastWeapon is always a real DATA.WEAPON_IDS entry (D15)',
        DATA.WEAPON_IDS.indexOf(out.lastWeapon) !== -1);
      for (const id in out.unlocked) {
        s.ok('and every unlocked key is a real weapon id set to true',
          DATA.WEAPON_IDS.indexOf(id) !== -1 && out.unlocked[id] === true);
      }
    }
  }

  s.eq('a fractional currency is floored, not rejected',
    MetaLogic.sanitize({ version: 1, currency: 12.9 }).currency, 12);
  s.eq('a valid unlocked entry survives sanitize',
    MetaLogic.sanitize({ version: 1, unlocked: { blade: true } }).unlocked.blade, true);
  s.eq('an invalid unlocked entry does not survive sanitize',
    MetaLogic.sanitize({ version: 1, unlocked: { blade: 1 } }).unlocked.blade, undefined);
  s.eq('one bad field does not discard an otherwise-good payload',
    MetaLogic.sanitize({ version: 1, currency: 40, enforceLocks: 'garbage' }).currency, 40);
}

/* ============================================================= round-trip */
{
  const m = MetaLogic.defaults();
  m.currency = 55; m.maxHpBonus = 2; m.enforceLocks = true; m.unlocked.warmaul = true;
  m.lastWeapon = 'thornspear';
  const text = MetaLogic.serialize(m);
  const back = MetaLogic.deserialize(text);
  s.eq('serialize -> deserialize round-trips currency', back.currency, 55);
  s.eq('and maxHpBonus', back.maxHpBonus, 2);
  s.eq('and enforceLocks', back.enforceLocks, true);
  s.eq('and unlocked', back.unlocked.warmaul, true);
  s.eq('and lastWeapon (D15)', back.lastWeapon, 'thornspear');

  s.ok('deserialize never throws on malformed JSON text',
    (() => { try { MetaLogic.deserialize('{not json'); return true; } catch (e) { return false; } })());
  s.eq('malformed JSON text falls back to defaults',
    MetaLogic.deserialize('{not json').currency, 0);
  s.eq('a non-string deserialize input falls back to defaults',
    MetaLogic.deserialize(null).currency, 0);
}

/* ============================================================= isUnlocked */
{
  const m = MetaLogic.defaults();
  s.eq('Stage 1 default: every weapon reads unlocked with no locks enforced',
    DATA.WEAPON_IDS.every((id) => MetaLogic.isUnlocked(m, id)), true);

  m.enforceLocks = true;
  s.eq('enforced, nothing unlocked: every weapon reads locked',
    DATA.WEAPON_IDS.every((id) => !MetaLogic.isUnlocked(m, id)), true);
  m.unlocked.blade = true;
  s.eq('enforced, one unlocked: that one reads unlocked', MetaLogic.isUnlocked(m, 'blade'), true);
  s.eq('enforced, one unlocked: the others still read locked', MetaLogic.isUnlocked(m, 'warmaul'), false);
}

/* ======================================================= rollBlueprintDrop */
{
  const m = MetaLogic.defaults();   // enforceLocks false — nothing locked
  const rngA = new C.RNG(1);
  let anyDrop = false;
  for (let i = 0; i < 200; i++) if (MetaLogic.rollBlueprintDrop(DATA.WEAPON_IDS, m, rngA)) anyDrop = true;
  s.eq('Stage 1 default (nothing locked): never drops, across 200 rolls', anyDrop, false);

  m.enforceLocks = true;
  const rngB = new C.RNG(1), rngC = new C.RNG(1);
  const seqB = [], seqC = [];
  for (let i = 0; i < 100; i++) { seqB.push(MetaLogic.rollBlueprintDrop(DATA.WEAPON_IDS, m, rngB)); }
  for (let i = 0; i < 100; i++) { seqC.push(MetaLogic.rollBlueprintDrop(DATA.WEAPON_IDS, m, rngC)); }
  s.eq('same seed -> identical drop sequence (L4)', JSON.stringify(seqB), JSON.stringify(seqC));
  s.ok('at least one real drop happens across 100 rolls at the enforced default chance',
    seqB.some((x) => x !== null));
  s.ok('every real drop is a real, still-locked weapon id',
    seqB.filter((x) => x !== null).every((id) => DATA.WEAPON_IDS.indexOf(id) !== -1));

  m.unlocked.blade = true; m.unlocked.daggers = true; m.unlocked.warmaul = true;
  // Only 'thornspear' remains locked — every real drop must be exactly that.
  const rngD = new C.RNG(2);
  const seqD = [];
  for (let i = 0; i < 100; i++) seqD.push(MetaLogic.rollBlueprintDrop(DATA.WEAPON_IDS, m, rngD));
  s.ok('with one weapon left locked, every real drop names exactly that one',
    seqD.filter((x) => x !== null).every((id) => id === 'thornspear'));

  DATA.WEAPON_IDS.forEach((id) => { m.unlocked[id] = true; });
  const rngE = new C.RNG(3);
  let noneLeft = true;
  for (let i = 0; i < 200; i++) if (MetaLogic.rollBlueprintDrop(DATA.WEAPON_IDS, m, rngE) !== null) noneLeft = false;
  s.eq('fully unlocked even under enforceLocks: never drops', noneLeft, true);
}

/* ============================================================== spending */
{
  const affordUnlock = MetaLogic.spendOnUnlock(CFG.META_BLUEPRINT_UNLOCK_COST);
  s.eq('an exactly-affordable unlock spend succeeds', affordUnlock.ok, true);
  s.eq('and leaves zero', affordUnlock.currency, 0);
  const cantUnlock = MetaLogic.spendOnUnlock(CFG.META_BLUEPRINT_UNLOCK_COST - 1);
  s.eq('an unaffordable unlock spend refuses', cantUnlock.ok, false);
  s.eq('and leaves currency untouched', cantUnlock.currency, CFG.META_BLUEPRINT_UNLOCK_COST - 1);

  const affordHp = MetaLogic.spendOnMaxHp(CFG.META_MAXHP_COST);
  s.eq('an exactly-affordable maxHp spend succeeds', affordHp.ok, true);
  const cantHp = MetaLogic.spendOnMaxHp(0);
  s.eq('a zero-currency maxHp spend refuses', cantHp.ok, false);
  s.eq('spendOnUnlock reuses RunLogic.spend directly, not a reimplementation',
    JSON.stringify(MetaLogic.spendOnUnlock(100)),
    JSON.stringify(RunLogic.spend(100, CFG.META_BLUEPRINT_UNLOCK_COST)));

  // Abilities spec §4's four enhancements — same reuse of RunLogic.spend,
  // same affordable/unaffordable pair per spend.
  const spends = [
    ['spendOnDashExtraCharge', CFG.META_DASH_EXTRA_CHARGE_COST],
    ['spendOnDashExtIframes', CFG.META_DASH_EXT_IFRAMES_COST],
    ['spendOnParryRiposte', CFG.META_PARRY_RIPOSTE_COST],
    ['spendOnParryReflect', CFG.META_PARRY_REFLECT_COST]
  ];
  for (const [fn, cost] of spends) {
    const afford = MetaLogic[fn](cost);
    s.eq(fn + ': an exactly-affordable spend succeeds', afford.ok, true);
    s.eq(fn + ': and leaves zero', afford.currency, 0);
    const cant = MetaLogic[fn](cost - 1);
    s.eq(fn + ': an unaffordable spend refuses', cant.ok, false);
    s.eq(fn + ': and leaves currency untouched', cant.currency, cost - 1);
    s.eq(fn + ': reuses RunLogic.spend directly',
      JSON.stringify(MetaLogic[fn](100)), JSON.stringify(RunLogic.spend(100, cost)));
  }
}

/* =============================================================================
 * 2. Integration — real Sim, real ticks. Proves 70-sim.js actually wires the
 * pure logic above in correctly, not just that the logic is self-consistent.
 * ============================================================================= */

// realKill(target)/clearRoomAndAdvance() now live on the scenario() api
// itself (tests/harness.js) — promoted from what used to be independently
// maintained, byte-identical copies here and in verify_run.js.

{
  const a = H.scenario();
  a.settle();
  s.ok('a fresh Sim owns a real Meta instance', a.sim.meta && a.sim.meta.version === 1);
  s.eq('Stage 1 default carries through to a fresh sim', a.sim.meta.enforceLocks, false);
  a.sim.beginRun(20);
  s.eq('no bonus yet: a fresh run\'s maxHp is exactly the CFG baseline', a.p().maxHp, CFG.MAX_HP);
}

{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(21);
  s.eq('buyMaxHp refuses with zero currency', a.sim.buyMaxHp(), false);
  s.eq('and nothing changed', a.p().maxHp, CFG.MAX_HP);

  a.sim.meta.currency = CFG.META_MAXHP_COST;
  s.eq('buyMaxHp succeeds when exactly affordable', a.sim.buyMaxHp(), true);
  s.eq('and spends down to zero', a.sim.meta.currency, 0);
  s.eq('and the CURRENT player\'s maxHp grows immediately', a.p().maxHp, CFG.MAX_HP + CFG.META_MAXHP_GAIN);
  s.eq('current hp grows by the identical amount, not just maxHp', a.p().hp, a.p().maxHp);

  a.sim.meta.currency = CFG.META_MAXHP_COST * 2;
  a.sim.buyMaxHp();
  s.eq('a second purchase stacks', a.p().maxHp, CFG.MAX_HP + CFG.META_MAXHP_GAIN * 2);

  a.sim.beginRun(22);
  s.eq('the permanent bonus survives a genuine restart (beginRun())',
    a.p().maxHp, CFG.MAX_HP + CFG.META_MAXHP_GAIN * 2);
}

{
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(23);
  a.sim.meta.maxHpBonus = 1;
  a.sim.meta.lastWeapon = 'daggers';   // D15: _applyMetaToPlayer's own new line
  const joiner = a.sim.addPlayer();
  s.eq('a co-op joiner immediately reflects the current permanent bonus',
    joiner.maxHp, CFG.MAX_HP + 1);
  s.eq('a co-op joiner also reflects the current meta.lastWeapon (D15)',
    joiner.weapon, 'daggers');
}

/* ============================================== ability enhancements (§4)
 * Same shape as buyMaxHp's own integration block above: real Sim, real
 * ticks, checking the actual player-side effect a purchase produces, not
 * just that a flag flipped. */
{
  // dashExtIframes/parryRiposte/parryReflect: simple boolean flags, no
  // resource top-up beyond the flag itself — one shared loop covers the
  // refuse/succeed/double-purchase/persist shape all three share.
  const enh = [
    ['buyDashExtIframes', 'dashExtIframes', CFG.META_DASH_EXT_IFRAMES_COST],
    ['buyParryRiposte', 'parryRiposte', CFG.META_PARRY_RIPOSTE_COST],
    ['buyParryReflect', 'parryReflect', CFG.META_PARRY_REFLECT_COST]
  ];
  for (const [fn, flag, cost] of enh) {
    const a = H.scenario();
    a.settle();
    a.sim.beginRun(24);
    s.eq(fn + ' refuses with zero currency', a.sim[fn](), false);
    s.eq(fn + ': nothing changed', a.p()[flag], false);

    a.sim.meta.currency = cost;
    s.eq(fn + ' succeeds when exactly affordable', a.sim[fn](), true);
    s.eq(fn + ': spends down to zero', a.sim.meta.currency, 0);
    s.eq(fn + ": the CURRENT player's flag flips immediately", a.p()[flag], true);
    s.eq(fn + ': meta itself records ownership', a.sim.meta[flag], true);

    a.sim.meta.currency = cost;
    s.eq(fn + ' refuses a second purchase (already owned)', a.sim[fn](), false);
    s.eq(fn + ": doesn't spend on a refused double-purchase", a.sim.meta.currency, cost);

    a.sim.beginRun(25);
    s.eq(fn + ': ownership survives a genuine restart (beginRun())', a.p()[flag], true);
  }
}
{
  // Dash Extra Charge: the one enhancement whose live top-up does more
  // than flip a flag — it also grants the starting bonus charge itself,
  // immediately, the same "current bonus reflected from the first tick"
  // treatment buyMaxHp's own hp/maxHp growth already gets.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(26);
  s.eq('buyDashExtraCharge refuses with zero currency', a.sim.buyDashExtraCharge(), false);
  s.eq('nothing changed', a.p().dashCharges, 0);

  a.sim.meta.currency = CFG.META_DASH_EXTRA_CHARGE_COST;
  s.eq('buyDashExtraCharge succeeds when exactly affordable', a.sim.buyDashExtraCharge(), true);
  s.eq('spends down to zero', a.sim.meta.currency, 0);
  s.eq("the CURRENT player's flag flips immediately", a.p().dashExtraCharge, true);
  s.eq('and the bonus charge is granted immediately, not on next landing',
    a.p().dashCharges, 1);

  a.sim.meta.currency = CFG.META_DASH_EXTRA_CHARGE_COST;
  s.eq('a second purchase refuses (already owned)', a.sim.buyDashExtraCharge(), false);

  a.sim.beginRun(27);
  s.eq('ownership survives a genuine restart', a.p().dashExtraCharge, true);
  // _applyMetaToPlayer's own immediate grant is real (proven above) but a
  // beginRun()/level transition always follows it with a real teleport()
  // — a fresh spawn is airborne, same as any other spawn, and teleport()
  // clears dashCharges same as every other transient dash field (it is a
  // RESOURCE, not permanent ownership; see teleport()'s own comment) —
  // so the charge is correctly 0 until the player actually lands, exactly
  // the same way it would be for anyone touching ground for the first
  // time this life, not a bug in either direction.
  s.eq('airborne immediately after a fresh spawn, same as always', a.p().dashCharges, 0);
  a.settle();
  s.eq('and refilled the moment it actually lands', a.p().dashCharges, 1);
}
{
  // A THIRD, distinct call site for _applyMetaToPlayer — _stepRun()'s own
  // justRespawned detection (70-sim.js) — is what re-layers ownership onto
  // a player whose OWN Player.prototype.update() 'dead' branch already ran
  // resetTransient() naturally, entirely independent of beginRun()/
  // teleport(). Buy mid-run, force a real lethal hit (not beginRun, not a
  // manual resetTransient()), wait out the real deadFrames countdown, and
  // confirm ownership survived AND dashCharges correctly re-grants once
  // the respawned player actually lands — the same two-part check the
  // beginRun() test above already makes, driven through the genuinely
  // different code path this time.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(29);
  a.sim.meta.currency = CFG.META_DASH_EXTRA_CHARGE_COST;
  a.sim.buyDashExtraCharge();
  s.eq('owned before dying', a.p().dashExtraCharge, true);

  a.p().hurt(999, a.sim.bus);
  s.eq('a real death actually happened', a.p().state, 'dead');
  let g = 0;
  while (a.p().state === 'dead' && g++ < 200) a.step(1);
  s.eq('a natural respawn happened, not a restart', a.p().state !== 'dead', true);
  s.eq('ownership survives a natural respawn too', a.p().dashExtraCharge, true);
  s.eq('airborne immediately after respawn, same as any spawn', a.p().dashCharges, 0);
  a.settle();
  s.eq('and refilled once it actually lands, post-respawn', a.p().dashCharges, 1);
}
{
  // Live top-up reaches every CURRENTLY ALIVE player, additively — the
  // same co-op contract buyMaxHp's own live loop already holds to.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(28);
  a.sim.meta.currency = CFG.META_PARRY_RIPOSTE_COST;
  a.sim.buyParryRiposte();
  s.eq('player 0 owns it', a.p(0).parryRiposte, true);
  s.eq('player 1 owns it too, same live purchase', a.p(1).parryRiposte, true);
}

/* ============================================ D15: _applyMetaToPlayer's
 * new weapon line. The 2-step "reset to baseline, then layer the
 * permanent value" pattern, exercised through the same distinct call
 * sites buyDashExtraCharge's own tests above already prove for maxHp/
 * dashCharges — a genuine restart, a fallback when the pick is no longer
 * unlocked, and the natural per-death respawn path (the exact edge case
 * the design spec's §3 says capture-on-switch avoids needing a second
 * hook for). */
{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(60);
  a.sim.meta.lastWeapon = 'daggers';
  a.sim.beginRun(61);
  s.eq('a genuine restart applies the current meta.lastWeapon', a.p().weapon, 'daggers');
}
{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(62);
  a.sim.meta.enforceLocks = true;
  a.sim.meta.lastWeapon = 'warmaul';   // set while unlocked...
  a.sim.meta.unlocked = {};            // ...then the pool is emptied under it
  a.sim.beginRun(63);
  s.eq('a reset falls back to blade when lastWeapon is no longer unlocked', a.p().weapon, 'blade');
}
{
  // The natural per-death respawn path — a live death, not a restart, not
  // a manual resetTransient() — the exact case the design's §3 says was
  // the reason a run-end capture (rather than capture-on-switch) would
  // have needed a second timing-sensitive hook here.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(64);
  a.sim.meta.lastWeapon = 'thornspear';
  a.p().weapon = 'blade';   // mid-run: playing something OTHER than the saved default
  a.p().hurt(999, a.sim.bus);
  s.eq('a real death actually happened', a.p().state, 'dead');
  let g = 0;
  while (a.p().state === 'dead' && g++ < 200) a.step(1);
  s.eq('a natural respawn happened, not a restart', a.p().state !== 'dead', true);
  s.eq('the natural respawn re-applies meta.lastWeapon, not whatever was equipped before dying',
    a.p().weapon, 'thornspear');
}

/* ================================== D15: Sim.prototype.switchWeapon */
{
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(70);

  a.sim.meta.enforceLocks = true;
  s.eq('refuses a locked weapon (enforceLocks true, nothing unlocked)',
    a.sim.switchWeapon(0, 'daggers'), false);
  s.eq('nothing changed on refusal', a.p().weapon, 'blade');
  a.sim.meta.enforceLocks = false;

  a.tap('attack');
  s.eq('refuses mid-attack', a.sim.switchWeapon(0, 'daggers'), false);
  s.eq('still the old weapon mid-swing', a.p().weapon, 'blade');
  let g = 0;
  while (a.p().attack && g++ < 60) a.step(1);

  s.eq('succeeds once the swing has actually ended', a.sim.switchWeapon(0, 'daggers'), true);
  s.eq('the weapon actually changed', a.p().weapon, 'daggers');
  s.eq('player 0 switching updates meta.lastWeapon', a.sim.meta.lastWeapon, 'daggers');
  s.eq('exactly one weaponSwitch event fired', a.count('weaponSwitch'), 1);
  const ev = a.events('weaponSwitch')[0].payload;
  s.eq('...with the correct playerId', ev.playerId, 0);
  s.eq('...and the correct weaponId', ev.weaponId, 'daggers');

  s.eq('player 1 switching succeeds independently', a.sim.switchWeapon(1, 'warmaul'), true);
  s.eq("player 1's own weapon changed", a.p(1).weapon, 'warmaul');
  s.eq('player 1 switching does NOT touch meta.lastWeapon', a.sim.meta.lastWeapon, 'daggers');

  // Adversarially found: MetaLogic.isUnlocked() alone returns true for ANY
  // argument under the shipped default (enforceLocks false) — every
  // pre-D15 caller only ever passed a real id, so switchWeapon needs its
  // own membership check at this boundary (untrusted argument).
  s.eq('refuses an id that is not a real weapon, even under Stage 1\'s default',
    a.sim.switchWeapon(0, 'not-a-real-weapon'), false);
  s.eq('nothing changed on that refusal either', a.p().weapon, 'daggers');
  s.eq('and meta.lastWeapon is untouched too', a.sim.meta.lastWeapon, 'daggers');

  s.eq('refuses an out-of-range playerIndex (too high)', a.sim.switchWeapon(5, 'blade'), false);
  s.eq('refuses a negative playerIndex', a.sim.switchWeapon(-1, 'blade'), false);
  s.eq('neither touches meta.lastWeapon', a.sim.meta.lastWeapon, 'daggers');

  a.p().hurt(999, a.sim.bus);
  s.eq('a real death actually happened', a.p().state, 'dead');
  s.eq('refuses a dead player', a.sim.switchWeapon(0, 'thornspear'), false);
}

{
  // Adversarially found (coverage gap, plan's own Verification risk #2):
  // canSwitchWeapon's refusal was only ever proven across a SINGLE,
  // non-chaining swing — Combat.start repopulates player.attack IN PLACE
  // on a chain continuation (40-combat.js), never passing through null,
  // so refusal must hold across the entire slashA -> slashB span too, not
  // just slashA's own duration. Mirrors verify_combat.js's own combo test
  // shape exactly (hold+step+release, then an early re-press before
  // chainFrom).
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(76);
  a.hold('attack').step(1).release('attack');
  s.eq('slashA started', a.p().attack.id, 'slashA');
  s.eq('refuses on slashA\'s own first frame', a.sim.switchWeapon(0, 'daggers'), false);

  a.step(1);
  a.hold('attack').step(1).release('attack');   // buffer the chain press early
  s.eq('the early chain press does not restart the move', a.p().attack.id, 'slashA');
  s.eq('still refuses while slashA is still resolving', a.sim.switchWeapon(0, 'daggers'), false);

  let guard = 0;
  while (a.p().attack && a.p().attack.id === 'slashA' && guard++ < 60) {
    s.eq('refuses on every remaining frame of slashA', a.sim.switchWeapon(0, 'daggers'), false);
    a.step(1);
  }
  s.eq('the buffered press actually chained into slashB', a.p().attack ? a.p().attack.id : null, 'slashB');
  s.eq('refusal continues into the chained move, not just the first one',
    a.sim.switchWeapon(0, 'daggers'), false);

  let guard2 = 0;
  while (a.p().attack && guard2++ < 60) {
    s.eq('refuses through the rest of slashB too', a.sim.switchWeapon(0, 'daggers'), false);
    a.step(1);
  }
  s.eq('succeeds once the WHOLE chain has fully ended', a.sim.switchWeapon(0, 'daggers'), true);
}

/* =================================== D15: Sim.prototype.cycleWeapon */
{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(71);
  // Every id unlocked (Stage 1 default) — cycles through DATA.WEAPON_IDS
  // in its own alphabetical order and wraps.
  s.eq('starts on blade', a.p().weapon, 'blade');
  a.sim.cycleWeapon(0);
  s.eq('advances to daggers', a.p().weapon, 'daggers');
  a.sim.cycleWeapon(0);
  s.eq('advances to thornspear', a.p().weapon, 'thornspear');
  a.sim.cycleWeapon(0);
  s.eq('advances to warmaul', a.p().weapon, 'warmaul');
  a.sim.cycleWeapon(0);
  s.eq('wraps from the last unlocked id back to the first', a.p().weapon, 'blade');
}
{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(72);
  a.sim.meta.enforceLocks = true;
  a.sim.meta.unlocked = { blade: true, warmaul: true };
  s.eq('starts on blade', a.p().weapon, 'blade');
  a.sim.cycleWeapon(0);
  s.eq('skips locked daggers/thornspear, lands on warmaul', a.p().weapon, 'warmaul');
  a.sim.cycleWeapon(0);
  s.eq('skips locked ids again, wraps to blade', a.p().weapon, 'blade');
}
{
  // Real, reachable state (F5 toggled true with nothing handed in yet).
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(73);
  a.sim.meta.enforceLocks = true;
  a.sim.meta.unlocked = { blade: true };   // ONLY the current weapon unlocked
  const before = a.p().weapon;
  let threw = false;
  try { a.sim.cycleWeapon(0); } catch (e) { threw = true; }
  s.ok('never throws when only one weapon is unlocked', !threw);
  s.eq('a safe no-op, weapon unchanged', a.p().weapon, before);
  s.eq('and correctly reports no switch happened', a.sim.cycleWeapon(0), false);
}
{
  // Adversarially found (coverage gap, plan's own Verification risk #3):
  // the indexOf===-1 -> start=0 fallback (guarding an out-of-band
  // player.weapon) was safe by inspection but never actually exercised —
  // this is a REAL reachable state (verify_stats.js's own Combat.
  // weaponScale fallback fixture sets player.weapon this exact way).
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(74);
  a.p().weapon = 'not-a-real-weapon';   // same fixture verify_stats.js uses
  let threw = false;
  try { a.sim.cycleWeapon(0); } catch (e) { threw = true; }
  s.ok('never throws on an out-of-band player.weapon', !threw);
  s.ok('lands on a real, unlocked WEAPON_IDS entry', DATA.WEAPON_IDS.indexOf(a.p().weapon) !== -1);
  // The loop checks candidates starting at (start+1), not start itself —
  // with start=0 (the fallback's own value), the first candidate actually
  // checked is DATA.WEAPON_IDS[1], not [0].
  s.eq('specifically DATA.WEAPON_IDS[1] — the first candidate the start=0 fallback actually checks',
    a.p().weapon, DATA.WEAPON_IDS[1]);
}
{
  // Same fallback, but forced to walk the FULL ids.length range before
  // landing on its wrap-around target — proves the loop doesn't stop
  // early via the (dead, for an invalid starting id) self-match guard.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(75);
  a.sim.meta.enforceLocks = true;
  a.sim.meta.unlocked = { blade: true };   // only index 0 unlocked
  a.p().weapon = 'not-a-real-weapon';
  a.sim.cycleWeapon(0);
  s.eq('walks the full range and lands on the only unlocked id (index 0)', a.p().weapon, 'blade');
}
{
  // Out-of-range playerIndex — switchWeapon/cycleWeapon are the FIRST Sim
  // mutators in this codebase to take a bare playerIndex, and the guard's
  // actual behavior was unproven, not just unlikely.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(77);
  s.eq('cycleWeapon refuses an out-of-range playerIndex', a.sim.cycleWeapon(5), false);
  s.eq('cycleWeapon refuses a negative playerIndex', a.sim.cycleWeapon(-1), false);
  s.eq('player 0 is untouched by either refusal', a.p().weapon, 'blade');
}

/* ============================ D15: phase 0 in Sim.prototype.step — proves
 * the whole feature is reachable through real input (pad.set()), not just
 * through direct sim.switchWeapon()/sim.cycleWeapon() calls above. */
{
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(80);
  s.eq('starts on blade', a.p().weapon, 'blade');
  a.tap('switchWeapon');
  s.eq('a real buffered press actually cycles the weapon', a.p().weapon, 'daggers');
}
{
  // Destructive consume: one press must never fire two switches, even
  // held across several ticks (mirrors Pad's own "one press, one action"
  // contract every other button already relies on).
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(81);
  a.hold('switchWeapon').step(5);
  s.eq('holding the button only cycles once, not once per tick', a.p().weapon, 'daggers');
  a.release('switchWeapon').step(1);
}
{
  // Same-tick switch-then-attack: phase 0 resolves identity before phase
  // 1 resolves action, so the swing that starts THIS tick already reads
  // the newly-equipped weapon (design spec §4's own "zero added latency"
  // claim).
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(82);
  a.hold('switchWeapon').hold('attack').step(1);
  s.eq('the weapon switched this exact tick', a.p().weapon, 'daggers');
  s.ok('and the attack that started this SAME tick already used it',
    a.p().attack && a.p().attack.id === DATA.WEAPONS.daggers.light);
  a.release('switchWeapon').release('attack');
}
{
  // Co-op: independent pads, independent player.weapon, no cross-talk.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(83);
  a.tap('switchWeapon', 0);
  s.eq('player 0 cycled', a.p(0).weapon, 'daggers');
  s.eq('player 1 untouched by player 0\'s own press', a.p(1).weapon, 'blade');
  // A real extra tick between the two presses — tap()'s own release only
  // actually lands on the sim's NEXT processed step (its own release() is
  // a zero-tick call), so back-to-back taps with no step between them
  // would read as one continuous hold, not two presses.
  a.tap('switchWeapon', 1).step(1);
  a.tap('switchWeapon', 1);
  s.eq('player 1 cycled independently, twice', a.p(1).weapon, 'thornspear');
  s.eq('player 0 unaffected by player 1\'s presses', a.p(0).weapon, 'daggers');
  s.eq('only player 0\'s cycling touched meta.lastWeapon', a.sim.meta.lastWeapon, 'daggers');
}
{
  // Adversarially found (coverage gap): "pads update even while frozen...
  // a press made during hitstop arms its buffer and is still there when
  // the freeze lifts" is verify_arch's own contract for every OTHER
  // button (its own "hitstop does not eat input" section) — switchWeapon
  // must hold to it too, unproven until now. Same real-hitstop trigger
  // that section already uses (a real slam landing).
  const a = H.scenario({ seed: 9 });
  a.settle();
  a.tap('jump');
  a.step(6);
  a.tap('down');
  for (let i = 0; i < 60 && a.sim.hitstop === 0; i++) a.sim.step();
  s.ok('a real hitstop is in effect', a.sim.hitstop > 0, a.sim.hitstop + ' frames');

  a.hold('switchWeapon');
  a.step(1);
  s.ok('the press is latched', a.pad().down('switchWeapon'));
  s.ok('the buffer armed even though frozen', a.pad().buffered('switchWeapon'));
  s.eq('phase 0 does NOT consume it while frozen — the weapon is unchanged', a.p().weapon, 'blade');

  for (let i = 0; i < 20 && a.sim.hitstop > 0; i++) a.sim.step();
  a.step(1);
  s.eq('the buffered press survives hitstop and cycles once the freeze lifts', a.p().weapon, 'daggers');
  a.release('switchWeapon').step(5);
  s.eq('and only once — not once per frozen tick', a.p().weapon, 'daggers');
}
{
  // Adversarially found (coverage gap): no action in this codebase is
  // phase-gated (attack/roll/jump/parry are never checked against
  // run.phase either), so switchWeapon staying live mid-boss-fight is
  // correct-by-construction — but it was an unconfirmed assumption, not
  // a proven one, and the design spec never mentions the boss phase.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(84);
  a.sim._enterBoss();
  s.eq('run.phase is really boss', a.sim.run.phase, 'boss');
  s.eq('switchWeapon still works mid-boss-fight', a.sim.switchWeapon(0, 'daggers'), true);
  a.tap('switchWeapon');
  s.eq('and the real input path works mid-boss-fight too', a.p().weapon, 'thornspear');
}
{
  // Adversarially found (coverage gap, plan's own Verification risk #4):
  // player 1 independently cycling while player 0 dies and naturally
  // respawns (re-triggering _applyMetaToPlayer) in the same window — the
  // two are structurally disjoint (per-player state, playerIndex===0 gate
  // on meta.lastWeapon), but that claim was never actually driven by a
  // combined test.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(85);
  a.sim.switchWeapon(0, 'warmaul');
  s.eq('meta.lastWeapon reflects player 0\'s own switch', a.sim.meta.lastWeapon, 'warmaul');

  a.p(0).hurt(999, a.sim.bus);
  s.eq('player 0 is really dead', a.p(0).state, 'dead');

  // Player 1 keeps cycling independently WHILE player 0 is mid-countdown.
  a.tap('switchWeapon', 1);
  s.eq('player 1 cycled while player 0 was dead', a.p(1).weapon, 'daggers');
  s.eq('meta.lastWeapon is untouched by player 1\'s own cycling', a.sim.meta.lastWeapon, 'warmaul');

  let g = 0;
  while (a.p(0).state === 'dead' && g++ < 200) {
    a.tap('switchWeapon', 1);   // keep cycling player 1 through the whole window
    a.step(1);
  }
  s.eq('player 0 naturally respawned, not a restart', a.p(0).state !== 'dead', true);
  s.eq('player 0\'s respawn re-applied meta.lastWeapon regardless of player 1\'s activity',
    a.p(0).weapon, 'warmaul');
  s.eq('meta.lastWeapon still reflects only player 0\'s own last real switch',
    a.sim.meta.lastWeapon, 'warmaul');
  s.ok('player 1\'s own weapon kept advancing independently the whole time',
    a.p(1).weapon !== 'blade');
}

{
  const a = H.scenario();
  a.settle();
  s.eq('toggleEnforceLocks flips from Stage 1\'s default', a.sim.toggleEnforceLocks(), true);
  s.eq('and flips back', a.sim.toggleEnforceLocks(), false);
}

{
  // Regression (adversarial pass): opts.meta / applyMeta() must COPY, not
  // share, a caller-supplied Meta object — a bare reference assignment let
  // two Sims constructed from (or applyMeta()'d with) the SAME object end
  // up with sim.meta === otherSim.meta, including the shared `unlocked`
  // object, so a purchase made through one Sim's real API silently
  // mutated the other's future ticks too.
  const shared = C.MetaLogic.defaults();
  shared.currency = CFG.META_MAXHP_COST;
  const simA = new C.Sim({ seed: 1, meta: shared, world: H.flatWorld(C) });
  const simB = new C.Sim({ seed: 2, meta: shared, world: H.flatWorld(C) });
  simA.resetTransient(); simB.resetTransient();
  s.ok('two sims constructed from the same object do not share it', simA.meta !== simB.meta);
  s.ok('nor do they share the unlocked object inside it', simA.meta.unlocked !== simB.meta.unlocked);
  simA.buyMaxHp();
  s.eq('a purchase through simA spends simA\'s own copy', simA.meta.currency, 0);
  s.eq('and never touches simB\'s independent copy, still at its own starting value',
    simB.meta.currency, CFG.META_MAXHP_COST);
  s.eq('or simB\'s maxHpBonus', simB.meta.maxHpBonus, 0);
  simB.beginRun(99);
  s.eq('simB\'s own fresh player is unaffected by simA\'s purchase', simB.players[0].maxHp, CFG.MAX_HP);

  // applyMeta() itself — otherwise zero-coverage before this pass.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(41);
  const loaded = C.MetaLogic.defaults();
  loaded.currency = 500; loaded.maxHpBonus = 2; loaded.lastWeapon = 'thornspear';
  a.sim.applyMeta(loaded);
  s.eq('applyMeta() adopts the new currency', a.sim.meta.currency, 500);
  s.eq('and immediately re-applies maxHpBonus to the current player',
    a.p().maxHp, CFG.MAX_HP + 2);
  s.eq('and immediately re-applies lastWeapon to the current player too (D15)',
    a.p().weapon, 'thornspear');
  s.ok('applyMeta() copies rather than adopts the reference', a.sim.meta !== loaded);
  loaded.currency = 999999;
  s.eq('mutating the caller\'s own object afterward does not reach back into the sim',
    a.sim.meta.currency, 500);
}

{
  // Blueprint drop, real kill, enforceLocks on — the pool has something to
  // offer. Brute-force a real seed known to drop within its own roster
  // (matching this suite's own pure-logic section's own confirmed real
  // rolls) rather than asserting on a fragile single try.
  let found = null;
  for (let seed = 0; seed < 60 && !found; seed++) {
    const a = H.scenario({ seed });
    a.settle();
    a.sim.beginRun(seed);
    a.sim.meta.enforceLocks = true;
    for (const t of a.sim.targets) {
      a.realKill(t);
      if (a.p().carriedBlueprint) { found = { a, id: a.p().carriedBlueprint }; break; }
    }
  }
  s.ok('a real kill under enforceLocks eventually drops a real blueprint', !!found);
  if (found) {
    s.ok('the dropped id is a real weapon', DATA.WEAPON_IDS.indexOf(found.id) !== -1);
    s.eq('a blueprintDrop event fired', found.a.count('blueprintDrop') > 0, true);
  }
}

{
  // Capacity (CFG.META_BLUEPRINT_CAPACITY = 1): a player already carrying
  // one never receives a second, even across many more real kills.
  let found = null;
  for (let seed = 0; seed < 60 && !found; seed++) {
    const a = H.scenario({ seed });
    a.settle();
    a.sim.beginRun(seed);
    a.sim.meta.enforceLocks = true;
    for (const t of a.sim.targets) {
      a.realKill(t);
      if (a.p().carriedBlueprint) { found = { a, first: a.p().carriedBlueprint }; break; }
    }
  }
  if (found) {
    // Add and kill a fresh roster of dummies to force many more drop rolls
    // while the player is still carrying the first one.
    for (let i = 0; i < 10; i++) {
      const d = found.a.sim.addTarget(new C.Combat.Dummy(500 + i, found.a.b().x, found.a.b().y, 10));
      found.a.sim._levelRosterIds.push(d.id);
      found.a.realKill(d);
    }
    s.eq('the carried blueprint never changes once carrying, capacity respected',
      found.a.p().carriedBlueprint, found.first);
  } else {
    s.ok('a drop was found to test capacity against', false);
  }
}

{
  // Default Stage-1 mode: even a full, real-roster clear never drops
  // anything, since nothing is locked to offer.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(30);
  for (const t of a.sim.targets) a.realKill(t);
  s.eq('Stage 1 default: a real clear never drops a blueprint', a.p().carriedBlueprint, null);
}

{
  // D4: "lose on death." Force a carry, then die before any hand-in.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(31);
  a.sim.meta.enforceLocks = true;
  a.p().carriedBlueprint = 'thornspear';
  a.p().hp = 1;
  a.p().hurt(1, a.sim.bus, [0, 0]);
  a.step(1);
  s.eq('a blueprintLost event fires at the moment of death', a.count('blueprintLost'), 1);
  s.eq('carriedBlueprint is still readable the same tick (not yet cleared)',
    a.p().carriedBlueprint, 'thornspear');

  let n = 1;
  while (a.p().state === 'dead' && n < CFG.RESPAWN_FRAMES + 5) { a.step(1); n++; }
  s.eq('the blueprint is gone once the natural respawn actually fires', a.p().carriedBlueprint, null);
  s.eq('it was never unlocked — lost, not handed in', a.sim.meta.unlocked.thornspear, undefined);
}

{
  // D4, read precisely: "lose on death" and "hand in at a transition" are
  // the run's own TWO endings (D1: "...die -> spend -> respawn" names
  // death as one of exactly two ways a run ends), not two sequential steps
  // of the same outcome. A player whose OWN death is what ends the run
  // never reaches a transition ALIVE — resetTransient() (their own natural
  // respawn) already clears carriedBlueprint before _commitPendingLevel()
  // ever runs, the same tick. "Hand in" is therefore only reachable via
  // the OTHER ending: surviving to a boss victory with no death (solo) or
  // being the co-op partner who lives (tested separately below).
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(32);
  // room-checkpoint-structure spec: clear every room but the last BEFORE
  // enforceLocks/currency/the carried blueprint are ever set — with
  // enforceLocks already true, the real kills clearRoomAndAdvance() lands
  // could themselves roll a REAL, random blueprint drop, which a
  // checkpoint would then hand in on its own, contaminating this
  // specifically-controlled scenario before it even starts (found by
  // tracing a real, unexpected extra blueprintUnlocked event back to its
  // source, not assumed safe). Stage 1's own default (enforceLocks false,
  // nothing locked, nothing ever drops) keeps the room-clearing phase
  // inert; enforceLocks only flips true once the controlled scenario
  // itself begins.
  a.clearRoomAndAdvance(CFG.ROOM_COUNT - 1);
  a.sim.meta.enforceLocks = true;
  // Comfortably affordable regardless of whatever this run's OWN real
  // kills/boss bonus also sweep into meta.currency before the spend runs
  // (this._commitPendingLevel() banks earnings into the SAME pool first,
  // by design — see its own comment) — the exact expected remainder is
  // computed below from the real roster size, not guessed.
  a.sim.meta.currency = 10000;
  a.p().carriedBlueprint = 'daggers';
  const earned = RunLogic.currencyEarned(a.sim.run.kills + a.sim.targets.length, true);

  for (const t of a.sim.targets) a.realKill(t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  a.realKill(a.sim.bossTarget);
  let n = 0;
  while (a.sim.run.phase !== 'level' && n < CFG.RESPAWN_FRAMES + 10) { a.step(1); n++; }

  s.eq('a boss victory (no death) hands in the carried blueprint', a.sim.meta.unlocked.daggers, true);
  s.eq('and spends exactly the real unlock cost, on top of this run\'s own real earnings',
    a.sim.meta.currency, 10000 + earned - CFG.META_BLUEPRINT_UNLOCK_COST);
  s.eq('a blueprintUnlocked event fired', a.count('blueprintUnlocked'), 1);
  s.eq('a runEnd event fired exactly once for this transition', a.count('runEnd'), 1);
  s.eq('the carry slot is empty again in the new level', a.p().carriedBlueprint, null);
}

{
  // The named simplification: an unaffordable hand-in still consumes the
  // carried blueprint (no banked-for-later queue) and currency never goes
  // negative. Same boss-victory transition as above — a death-path hand-in
  // is not reachable at all, per the previous test's own comment.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(33);
  // room-checkpoint-structure spec: same clear-then-enable-locks-then-arm-
  // the-carry ordering as the affordable case above, and for the identical
  // reason — enforceLocks true during the room-clearing phase risks a
  // REAL random blueprint drop the checkpoint would hand in on its own,
  // and carrying the intended weapon before clearing would hand IT in at
  // the first room too. Both contaminate this specifically-controlled
  // scenario before it starts.
  a.clearRoomAndAdvance(CFG.ROOM_COUNT - 1);
  a.sim.meta.enforceLocks = true;
  a.p().carriedBlueprint = 'warmaul';
  // room-checkpoint-structure spec: the hand-in attempt below now fires at
  // THIS room's own checkpoint (§7d — every room clear hands in, not just
  // a true level end), which happens BEFORE _commitPendingLevel() ever
  // sweeps this run's real kills/boss bonus into meta.currency (that sweep
  // is _commitPendingLevel()'s own job, reached only once the boss is
  // later defeated). So the affordability check the checkpoint actually
  // makes reads meta.currency ALONE, with nothing yet earned — unlike the
  // affordable-case test above (still correct on its own terms, since
  // addition commutes: spend-then-earn and earn-then-spend land on the
  // identical final total), an UNAFFORDABLE precondition only needs
  // currency held below the cost at THIS moment, not "total minus earned."
  a.sim.meta.currency = CFG.META_BLUEPRINT_UNLOCK_COST - 1;
  const currencyBeforeSpend = a.sim.meta.currency;
  s.ok('this scenario genuinely cannot afford the unlock (test precondition)',
    currencyBeforeSpend < CFG.META_BLUEPRINT_UNLOCK_COST);

  for (const t of a.sim.targets) a.realKill(t);
  const earned = RunLogic.currencyEarned(a.sim.run.kills, true);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  a.realKill(a.sim.bossTarget);
  let n = 0;
  while (a.sim.run.phase !== 'level' && n < CFG.RESPAWN_FRAMES + 10) { a.step(1); n++; }

  s.eq('an unaffordable hand-in does NOT unlock the weapon', a.sim.meta.unlocked.warmaul, undefined);
  // The refused spend leaves currency untouched at the checkpoint — the
  // LATER boss-defeat commit still unconditionally sweeps this run's real
  // earnings in afterward (that sweep does not depend on whether a hand-in
  // happened or succeeded), so the final total is the untouched pre-spend
  // currency PLUS those real earnings, never charged for the refused spend.
  s.eq('the refused spend leaves currency untouched; only real earnings land afterward',
    a.sim.meta.currency, currencyBeforeSpend + earned);
  s.eq('no blueprintUnlocked event fired', a.count('blueprintUnlocked'), 0);
  s.eq('the carry slot is still cleared (consumed, not banked)', a.p().carriedBlueprint, null);
}

{
  // Currency: this.meta.currency accumulates the SAME earned amount
  // this.run.currency does, at the same commit — the permanent pool, not a
  // second, disconnected number.
  const a = H.scenario();
  a.settle();
  a.sim.beginRun(34);
  a.clearRoomAndAdvance(CFG.ROOM_COUNT - 1);
  for (const t of a.sim.targets) a.realKill(t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  a.realKill(a.sim.bossTarget);
  let n = 0;
  while (a.sim.run.phase !== 'level' && n < CFG.RESPAWN_FRAMES + 10) { a.step(1); n++; }
  s.eq('meta.currency accumulates the same earnings run.currency does',
    a.sim.meta.currency, a.sim.run.currency);
  s.ok('a boss clear pays real, non-zero currency into the permanent pool', a.sim.meta.currency > 0);
}

{
  // Co-op: the two D4 outcomes happening SIMULTANEOUSLY to two different
  // players at the same commit. p0 dies carrying 'blade' — lost, per D4's
  // own "lose on death." p1 survives carrying 'warmaul' — handed in, per
  // D4's own "hand in at a transition." One commit, both real outcomes,
  // proven independently rather than assumed symmetric.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(35);
  a.sim.meta.enforceLocks = true;
  a.sim.meta.currency = CFG.META_BLUEPRINT_UNLOCK_COST * 2;
  const p0 = a.sim.players[0], p1 = a.sim.players[1];
  p0.carriedBlueprint = 'blade';
  p1.carriedBlueprint = 'warmaul';

  p0.hp = 1; p0.hurt(1, a.sim.bus, [0, 0]);
  a.step(1);
  s.eq('p1 (the survivor) is still carrying, untouched by p0\'s own death',
    p1.carriedBlueprint, 'warmaul');
  let n = 1;
  while (p0.state === 'dead' && n < CFG.RESPAWN_FRAMES + 5) { a.step(1); n++; }

  s.eq('the player who died: their blueprint is LOST, never unlocked', a.sim.meta.unlocked.blade, undefined);
  s.eq('the SURVIVING partner: their blueprint IS handed in and unlocked', a.sim.meta.unlocked.warmaul, true);
  s.eq('only the survivor\'s unlock cost is spent (one, not two)',
    a.sim.meta.currency, CFG.META_BLUEPRINT_UNLOCK_COST);
  s.eq('a blueprintLost event fired for p0', a.events('blueprintLost').some((e) => e.payload.playerId === p0.id), true);
  s.eq('a blueprintUnlocked event fired for p1', a.events('blueprintUnlocked').some((e) => e.payload.playerId === p1.id), true);
}

{
  // Regression (adversarial pass): two SURVIVING co-op partners carrying a
  // blueprint for the SAME still-locked weapon at one commit. The second
  // carrier's spend is correctly a no-op (MetaLogic.isUnlocked() already
  // true by the time their turn comes up in the loop) — but the event's
  // own `handedIn` list must still report BOTH consumed carries, not just
  // the one that also happened to spend currency. Both carry slots empty
  // either way (the loop's own comment already commits to that for the
  // unaffordable-spend case); the event payload has to say so for this
  // case too.
  //
  // room-checkpoint-structure spec: `_handInCarriedBlueprints()` is now
  // shared between two call sites, and THIS scenario's own hand-in fires
  // at the final combat room's own checkpoint (reached by the kill+exit
  // walk below), not at the later runEnd — a checkpoint hands in at EVERY
  // room clear now (§7d), and this test's clear+exit sequence IS one.
  // Listening on 'checkpoint' rather than 'runEnd' proves the identical
  // claim (both consumed carries reported in one event's payload) against
  // whichever event is the one that actually carries it.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(45);
  const p0 = a.sim.players[0], p1 = a.sim.players[1];
  // room-checkpoint-structure spec: clear every room but the last BEFORE
  // enforceLocks or either carry slot are ever set — enforceLocks true
  // during the room-clearing phase risks a REAL random blueprint drop the
  // checkpoint would hand in on its own, and carrying either weapon any
  // earlier would hand IT in at the first room-clear too. Both contaminate
  // this specifically-controlled scenario before it starts.
  a.clearRoomAndAdvance(CFG.ROOM_COUNT - 1);
  a.sim.meta.enforceLocks = true;
  a.sim.meta.currency = 10000;
  p0.carriedBlueprint = 'blade';
  p1.carriedBlueprint = 'blade';   // same weapon, two independent carriers

  // Counting every fire (not a keep-first idiom) so this test can also
  // catch a real double-fire regression of _onRoomClear() itself — a
  // keep-first idiom would silently pass even if the checkpoint fired
  // twice for this one room clear.
  let checkpointFires = 0, handedInPayload = null;
  a.sim.bus.on('checkpoint', (e) => { checkpointFires++; if (!handedInPayload) handedInPayload = e; });
  for (const t of a.sim.targets) a.realKill(t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  a.realKill(a.sim.bossTarget);
  let n = 0;
  while (a.sim.run.phase !== 'level' && n < CFG.RESPAWN_FRAMES + 10) { a.step(1); n++; }

  s.eq('the weapon unlocks exactly once', a.sim.meta.unlocked.blade, true);
  s.eq('exactly one blueprintUnlocked event fires, not two', a.count('blueprintUnlocked'), 1);
  s.eq('both carry slots are empty in the new level', p0.carriedBlueprint, null);
  s.eq('for both players', p1.carriedBlueprint, null);
  s.ok('a checkpoint event actually fired to hand these in', !!handedInPayload);
  s.eq('the checkpoint fires exactly once for this one room clear, not twice',
    checkpointFires, 1);
  s.eq('checkpoint.handedIn reports BOTH consumed carries, not just the one that spent currency',
    handedInPayload.handedIn.filter((id) => id === 'blade').length, 2);
}

{
  // hash() coverage: differing meta state must produce a differing hash —
  // proof the new fields are actually walked, not silently ignored.
  const base = H.scenario(); base.settle(); base.sim.beginRun(40);
  const alt = H.scenario(); alt.settle(); alt.sim.beginRun(40);
  s.eq('two identically-seeded, identically-driven sims hash identically first', base.sim.hash(), alt.sim.hash());
  alt.sim.meta.currency = 999;
  s.ok('a differing meta.currency changes the hash', base.sim.hash() !== alt.sim.hash());

  const alt2 = H.scenario(); alt2.settle(); alt2.sim.beginRun(40);
  alt2.sim.meta.enforceLocks = true;
  s.ok('a differing meta.enforceLocks changes the hash', base.sim.hash() !== alt2.sim.hash());

  const alt3 = H.scenario(); alt3.settle(); alt3.sim.beginRun(40);
  alt3.p().carriedBlueprint = 'daggers';
  s.ok('a differing carriedBlueprint changes the hash', base.sim.hash() !== alt3.sim.hash());

  // Abilities spec §4's four enhancement flags — both the meta-level
  // record and each player-side mirror.
  const flags = ['dashExtraCharge', 'dashExtIframes', 'parryRiposte', 'parryReflect'];
  for (const flag of flags) {
    const altMeta = H.scenario(); altMeta.settle(); altMeta.sim.beginRun(40);
    altMeta.sim.meta[flag] = true;
    s.ok('a differing meta.' + flag + ' changes the hash', base.sim.hash() !== altMeta.sim.hash());

    const altP = H.scenario(); altP.settle(); altP.sim.beginRun(40);
    altP.p()[flag] = true;
    s.ok('a differing player.' + flag + ' changes the hash', base.sim.hash() !== altP.sim.hash());
  }
  const altDc = H.scenario(); altDc.settle(); altDc.sim.beginRun(40);
  altDc.p().dashCharges = 1;
  s.ok('a differing dashCharges changes the hash', base.sim.hash() !== altDc.sim.hash());

  // room-checkpoint-structure spec: run.roomIndex and the tube's own
  // position are new per-room state — both must actually be walked by
  // hash(), not silently excluded the way a naive extension could leave
  // them (confirmed by the adversarial pass: both were real gaps before
  // being added directly to hash() rather than just documented).
  const altRoom = H.scenario(); altRoom.settle(); altRoom.sim.beginRun(40);
  altRoom.clearRoomAndAdvance(1);
  s.ok('a differing run.roomIndex changes the hash', base.sim.hash() !== altRoom.sim.hash());

  // D15: meta.lastWeapon decides a FUTURE reset's player.weapon.
  const altW = H.scenario(); altW.settle(); altW.sim.beginRun(40);
  altW.sim.meta.lastWeapon = 'daggers';
  s.ok('a differing meta.lastWeapon changes the hash', base.sim.hash() !== altW.sim.hash());
}

{
  // Determinism (L4): two identical scripted clear/boss/blueprint-drop/
  // hand-in sequences hash byte-identical.
  function run(seed) {
    const a = H.scenario({ seed });
    a.settle();
    a.sim.beginRun(seed);
    a.sim.meta.enforceLocks = true;
    a.sim.meta.currency = 50;
    a.clearRoomAndAdvance(CFG.ROOM_COUNT - 1);
    for (const t of a.sim.targets) a.realKill(t);
    a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
    a.step(1);
    a.realKill(a.sim.bossTarget);
    a.step(CFG.RESPAWN_FRAMES + 2);
    return a.sim.hash();
  }
  s.eq('identical seed -> byte-identical hash across a full clear/boss/meta loop',
    run(50), run(50));
}

process.exit(s.done());
