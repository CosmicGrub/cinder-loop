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

/* ============================================================ 1. defaults */
{
  const d = MetaLogic.defaults();
  s.eq('defaults declare the current version', d.version, 1);
  s.eq('currency starts at zero', d.currency, 0);
  s.eq('nothing is explicitly unlocked yet', Object.keys(d.unlocked).length, 0);
  s.eq('maxHpBonus starts at zero', d.maxHpBonus, 0);
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
    ['a deeply nested garbage blob', { version: 1, unlocked: { blade: { nested: true } } }]
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
  const text = MetaLogic.serialize(m);
  const back = MetaLogic.deserialize(text);
  s.eq('serialize -> deserialize round-trips currency', back.currency, 55);
  s.eq('and maxHpBonus', back.maxHpBonus, 2);
  s.eq('and enforceLocks', back.enforceLocks, true);
  s.eq('and unlocked', back.unlocked.warmaul, true);

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

function realKill(a, target) {
  const hb = { x: target.body.x, y: target.body.y, w: target.body.w, h: target.body.h };
  C.Combat.resolveBox(a.p(), hb, a.sim.targets, { damage: 99999, knock: [0, 0], facing: 1 }, a.sim.bus);
}

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
  const joiner = a.sim.addPlayer();
  s.eq('a co-op joiner immediately reflects the current permanent bonus',
    joiner.maxHp, CFG.MAX_HP + 1);
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
  loaded.currency = 500; loaded.maxHpBonus = 2;
  a.sim.applyMeta(loaded);
  s.eq('applyMeta() adopts the new currency', a.sim.meta.currency, 500);
  s.eq('and immediately re-applies maxHpBonus to the current player',
    a.p().maxHp, CFG.MAX_HP + 2);
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
      realKill(a, t);
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
      realKill(a, t);
      if (a.p().carriedBlueprint) { found = { a, first: a.p().carriedBlueprint }; break; }
    }
  }
  if (found) {
    // Add and kill a fresh roster of dummies to force many more drop rolls
    // while the player is still carrying the first one.
    for (let i = 0; i < 10; i++) {
      const d = found.a.sim.addTarget(new C.Combat.Dummy(500 + i, found.a.b().x, found.a.b().y, 10));
      found.a.sim._levelRosterIds.push(d.id);
      realKill(found.a, d);
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
  for (const t of a.sim.targets) realKill(a, t);
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
  a.sim.meta.enforceLocks = true;
  // Comfortably affordable regardless of whatever this run's OWN real
  // kills/boss bonus also sweep into meta.currency before the spend runs
  // (this._commitPendingLevel() banks earnings into the SAME pool first,
  // by design — see its own comment) — the exact expected remainder is
  // computed below from the real roster size, not guessed.
  a.sim.meta.currency = 10000;
  a.p().carriedBlueprint = 'daggers';
  const earned = RunLogic.currencyEarned(a.sim.targets.length, true);

  for (const t of a.sim.targets) realKill(a, t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  realKill(a, a.sim.bossTarget);
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
  a.sim.meta.enforceLocks = true;
  a.p().carriedBlueprint = 'warmaul';
  // This run's own real kills/boss bonus ALSO sweep into meta.currency
  // before the spend runs (same mechanism as the affordable case above) —
  // computed from the real roster so the total stays genuinely short of
  // the cost regardless of how many enemies this seed happens to place.
  const earned = RunLogic.currencyEarned(a.sim.targets.length, true);
  a.sim.meta.currency = Math.max(0, CFG.META_BLUEPRINT_UNLOCK_COST - 1 - earned);
  const totalBeforeSpend = a.sim.meta.currency + earned;
  s.ok('this scenario genuinely cannot afford the unlock (test precondition)',
    totalBeforeSpend < CFG.META_BLUEPRINT_UNLOCK_COST);

  for (const t of a.sim.targets) realKill(a, t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  realKill(a, a.sim.bossTarget);
  let n = 0;
  while (a.sim.run.phase !== 'level' && n < CFG.RESPAWN_FRAMES + 10) { a.step(1); n++; }

  s.eq('an unaffordable hand-in does NOT unlock the weapon', a.sim.meta.unlocked.warmaul, undefined);
  s.eq('the refused spend leaves currency exactly where the sweep-in left it (never negative, never charged)',
    a.sim.meta.currency, totalBeforeSpend);
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
  for (const t of a.sim.targets) realKill(a, t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  realKill(a, a.sim.bossTarget);
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
  // true by the time their turn comes up in the loop) — but the runEnd
  // event's own `handedIn` list must still report BOTH consumed carries,
  // not just the one that also happened to spend currency. Both carry
  // slots empty either way (the loop's own comment already commits to
  // that for the unaffordable-spend case); the event payload has to say
  // so for this case too.
  const a = H.scenario({ players: 2 });
  a.settle();
  a.sim.beginRun(45);
  a.sim.meta.enforceLocks = true;
  a.sim.meta.currency = 10000;
  const p0 = a.sim.players[0], p1 = a.sim.players[1];
  p0.carriedBlueprint = 'blade';
  p1.carriedBlueprint = 'blade';   // same weapon, two independent carriers

  for (const t of a.sim.targets) realKill(a, t);
  a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
  a.step(1);
  realKill(a, a.sim.bossTarget);
  let handedInPayload = null;
  a.sim.bus.on('runEnd', (e) => { handedInPayload = e; });
  let n = 0;
  while (a.sim.run.phase !== 'level' && n < CFG.RESPAWN_FRAMES + 10) { a.step(1); n++; }

  s.eq('the weapon unlocks exactly once', a.sim.meta.unlocked.blade, true);
  s.eq('exactly one blueprintUnlocked event fires, not two', a.count('blueprintUnlocked'), 1);
  s.eq('both carry slots are empty in the new level', p0.carriedBlueprint, null);
  s.eq('for both players', p1.carriedBlueprint, null);
  s.eq('runEnd.handedIn reports BOTH consumed carries, not just the one that spent currency',
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
    for (const t of a.sim.targets) realKill(a, t);
    a.b().x = a.sim.exit[0]; a.b().y = a.sim.exit[1] - a.b().h;
    a.step(1);
    realKill(a, a.sim.bossTarget);
    a.step(CFG.RESPAWN_FRAMES + 2);
    return a.sim.hash();
  }
  s.eq('identical seed -> byte-identical hash across a full clear/boss/meta loop',
    run(50), run(50));
}

process.exit(s.done());
