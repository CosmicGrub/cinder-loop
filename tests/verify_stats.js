/* ===========================================================================
 * tests/verify_stats.js  —  D2: the three-colour stat contract, pickups,
 *                            and weapon scaling
 * ---------------------------------------------------------------------------
 * "Each stat starts at 1 every run. A pickup grants +1 to a chosen stat and
 * +HP only if that stat is dominant. Weapons list two colours and scale off
 * the larger; colourless gear scales off the highest. Dual choices are
 * weighted toward the two lowest stats."
 *
 * One real simplification, stated here rather than left to be discovered:
 * 50-gen.js's own pickups are single points, not spatial pairs a player
 * physically chooses between — the "dual choice" weighting is applied as a
 * soft preference at the moment of collection instead (30-player.js's
 * pickStatColour), not a literal two-option UI. Everything else is the real
 * contract, driven through real sim ticks (L8) — nothing here reimplements
 * gainStat/pickStatColour/weaponScale to check them against a copy.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_stats');
const C = H.loadSim();
const CFG = C.CFG, DATA = C.DATA, Combat = C.Combat;

function fresh(spec) {
  const a = H.scenario(spec);
  a.settle();
  return a;
}

/* ==================================================== stat data shape */
{
  const a = fresh();
  const p = a.p();
  s.eq('ember starts at STAT_START', p.stats.ember, CFG.STAT_START);
  s.eq('umbral starts at STAT_START', p.stats.umbral, CFG.STAT_START);
  s.eq('verdant starts at STAT_START', p.stats.verdant, CFG.STAT_START);
  s.eq('maxHp starts at CFG.MAX_HP', p.maxHp, CFG.MAX_HP);
  s.eq('hp starts equal to maxHp', p.hp, p.maxHp);
}

/* ======================================================= gainStat, real */
{
  // First pickup of any run is always dominant (2 vs 1 vs 1 — strictly the
  // highest), by construction — the anti-death-spiral property only needs
  // to matter once stats have diverged, and nothing has diverged yet.
  const a = fresh();
  const p = a.p();
  const hp0 = p.hp, maxHp0 = p.maxHp;
  a.clearLog();
  p.gainStat('ember', a.sim.bus);
  s.eq('the named stat gained exactly 1', p.stats.ember, CFG.STAT_START + 1);
  s.eq('the other two stats are untouched', p.stats.umbral + ',' + p.stats.verdant,
    CFG.STAT_START + ',' + CFG.STAT_START);
  s.eq('the first gain of a run is always dominant', a.count('statGain'), 1);
  s.eq('maxHp grew by STAT_HP_GAIN', p.maxHp, maxHp0 + CFG.STAT_HP_GAIN);
  s.eq('current hp grew by the same amount', p.hp, hp0 + CFG.STAT_HP_GAIN);

  const ev = a.events('statGain')[0].payload;
  s.eq('the event names the right colour', ev.colour, 'ember');
  s.eq('the event reports the new value', ev.value, CFG.STAT_START + 1);
  s.eq('the event reports dominance correctly', ev.dominant, true);
}
{
  // A gain that does NOT overtake the current leader grants no HP. Ember is
  // pushed ahead first (now the sole leader), then umbral gains once — not
  // enough to catch up — and must grant nothing extra.
  const a = fresh();
  const p = a.p();
  p.gainStat('ember', a.sim.bus);              // ember: 2, leader
  const maxHpAfterFirst = p.maxHp;
  a.clearLog();
  p.gainStat('umbral', a.sim.bus);              // umbral: 2, tied with ember — not STRICTLY dominant
  s.eq('a tie is not dominant', a.events('statGain')[0].payload.dominant, false);
  s.eq('no extra maxHp for a non-dominant gain', p.maxHp, maxHpAfterFirst);
}
{
  // Catching up AND overtaking, in one gain, is dominant.
  const a = fresh();
  const p = a.p();
  p.gainStat('ember', a.sim.bus);               // ember: 2
  p.gainStat('ember', a.sim.bus);               // ember: 3
  const maxHpBefore = p.maxHp;
  a.clearLog();
  p.gainStat('umbral', a.sim.bus);              // umbral: 2 — still behind ember (3), not dominant
  s.eq('still behind the leader is not dominant', a.events('statGain')[0].payload.dominant, false);
  s.eq('maxHp unchanged', p.maxHp, maxHpBefore);
}

/* ============================================ pickStatColour weighting
 * "Weighted toward the two lowest stats" — proven statistically, over many
 * real seeded draws, not by inspecting the formula. A stat pushed ahead of
 * the other two must be picked measurably less often than either of them,
 * and the two behind it roughly comparably to each other. */
{
  const rng = new C.RNG(11);
  const stats = { ember: 5, umbral: 1, verdant: 1 };   // ember way out ahead
  const counts = { ember: 0, umbral: 0, verdant: 0 };
  const N = 3000;
  for (let i = 0; i < N; i++) counts[C.pickStatColour(stats, rng)]++;

  s.ok('the leading stat is picked measurably less than either trailing one',
    counts.ember < counts.umbral * 0.6 && counts.ember < counts.verdant * 0.6,
    JSON.stringify(counts));
  s.ok('the two trailing stats are picked roughly comparably',
    Math.abs(counts.umbral - counts.verdant) < N * 0.12,
    counts.umbral + ' vs ' + counts.verdant);
  s.ok('the leading stat still has SOME chance — a soft weighting, not a hard exclusion',
    counts.ember > 0, counts.ember);
}
{
  // All tied: no preference, roughly uniform across all three.
  const rng = new C.RNG(4);
  const stats = { ember: 1, umbral: 1, verdant: 1 };
  const counts = { ember: 0, umbral: 0, verdant: 0 };
  const N = 3000;
  for (let i = 0; i < N; i++) counts[C.pickStatColour(stats, rng)]++;
  const spread = Math.max(counts.ember, counts.umbral, counts.verdant) -
                  Math.min(counts.ember, counts.umbral, counts.verdant);
  s.ok('a three-way tie is roughly uniform', spread < N * 0.12,
    JSON.stringify(counts));
}
{
  // Same seed, same sequence of picks — L4.
  const draw = (seed) => {
    const rng = new C.RNG(seed);
    const stats = { ember: 3, umbral: 1, verdant: 2 };
    const out = [];
    for (let i = 0; i < 20; i++) out.push(C.pickStatColour(stats, rng));
    return out.join(',');
  };
  s.eq('the same seed always draws the same sequence', draw(77), draw(77));
}

/* ==================================================== weapon scaling (D2) */
{
  const a = fresh();
  const p = a.p();
  s.eq('a fresh blade scales at exactly 1x', Combat.weaponScale(p), 1);

  const bladeColours = DATA.WEAPONS.blade.colours;
  p.stats[bladeColours[0]] = CFG.STAT_START + 4;
  const scaled = Combat.weaponScale(p);
  const expected = 1 + 4 * CFG.STAT_SCALE_PER_POINT;
  s.near('scaling matches the formula off the LARGER of the two colours',
    scaled, expected, 0.0001);
}
{
  // Scales off the LARGER of its two colours, never their sum, and never
  // the third, unrelated colour.
  const a = fresh();
  const p = a.p();
  const [c0, c1] = DATA.WEAPONS.blade.colours;
  const other = C.STAT_COLOURS.find((c) => c !== c0 && c !== c1);
  p.stats[c0] = CFG.STAT_START + 2;
  p.stats[c1] = CFG.STAT_START + 6;
  p.stats[other] = CFG.STAT_START + 50;   // way out ahead, but not one of the weapon's colours
  const scaled = Combat.weaponScale(p);
  const expected = 1 + 6 * CFG.STAT_SCALE_PER_POINT;   // the larger of c0/c1, not `other`, not the sum
  s.near('the unrelated third colour never contributes', scaled, expected, 0.0001);
}
{
  // Colourless gear (no weapon entry, or an unregistered id) scales off the
  // highest of all three instead — the fallback D2 names explicitly.
  const a = fresh();
  const p = a.p();
  p.weapon = 'not-a-real-weapon';
  p.stats.ember = CFG.STAT_START + 1;
  p.stats.umbral = CFG.STAT_START + 7;
  p.stats.verdant = CFG.STAT_START + 3;
  const scaled = Combat.weaponScale(p);
  const expected = 1 + 7 * CFG.STAT_SCALE_PER_POINT;
  s.near('falls back to the highest of all three', scaled, expected, 0.0001);
}
{
  // Integration, not just the pure function: real scaled damage actually
  // lands through the unmodified Combat.resolveBox path.
  const a = H.scenario({ dummies: [[96, 586, 60]] });
  a.settle();
  const p = a.p();
  const [c0] = DATA.WEAPONS.blade.colours;
  p.stats[c0] = CFG.STAT_START + 4;   // +60% per the tuned CFG.STAT_SCALE_PER_POINT
  const hp0 = a.t().hp;
  a.hold('attack').step(1).release('attack');
  a.step(40);
  const dealt = hp0 - a.t().hp;
  const base = C.RIG.move('slashA').data.damage;
  s.eq('real scaled damage matches the rounded formula, through real resolution',
    dealt, Math.round(base * (1 + 4 * CFG.STAT_SCALE_PER_POINT)));
  s.ok('and it is strictly more than the unscaled base', dealt > base, dealt + ' vs base ' + base);
}

/* ========================================================== pickups (D2) */
{
  const a = H.scenario({ pickups: [[300, 560], [500, 560]] });
  a.settle();
  s.eq('both pickups constructed', a.sim.pickups.length, 2);
  s.ok('neither starts collected', a.sim.pickups.every((pu) => !pu.collected));
  s.ok('each pickup has a stable id', a.sim.pickups[0].id !== a.sim.pickups[1].id);
}
{
  // Real collision, real gain — walk the player into one. The pickup sits
  // well clear of spawn (not edge-touching it, which is not an overlap —
  // aabb needs real overlap, not two boxes merely flush against each
  // other) and the player has to actually be DRIVEN into it; a first draft
  // of this test never held a direction at all and the player, standing
  // still the entire time, never collected anything — a bug this exact
  // assertion (rather than a later, weaker one) is what caught.
  const a = H.scenario({ spawns: [[80, 586]], pickups: [[120, 586]] });
  a.settle();
  const p = a.p();
  const totalBefore = p.stats.ember + p.stats.umbral + p.stats.verdant;
  a.clearLog();
  a.hold('right');
  let g = 0;
  while (!a.sim.pickups[0].collected && g++ < 60) a.step(1);
  s.ok('the pickup was actually collected', a.sim.pickups[0].collected, 'after ' + g + ' ticks');
  s.eq('a pickup event fired', a.count('pickup'), 1);
  s.eq('a statGain followed it', a.count('statGain'), 1);
  const totalAfter = p.stats.ember + p.stats.umbral + p.stats.verdant;
  s.eq('exactly one stat point was granted', totalAfter, totalBefore + 1);
}
{
  // A collected pickup cannot be collected twice, even standing on top of
  // it. Asserts collection actually happened FIRST — the earlier draft of
  // this test skipped that check and the assertion below passed for the
  // wrong reason (nothing was ever collected at all, so of course nothing
  // extra was granted) — exactly the "check quietly becomes a no-op"
  // failure mode this project's own rig audit exists to avoid elsewhere.
  const a = H.scenario({ spawns: [[80, 586]], pickups: [[120, 586]] });
  a.settle();
  a.hold('right');
  let g = 0;
  while (!a.sim.pickups[0].collected && g++ < 60) a.step(1);
  s.ok('collection actually happened before testing its absence the second time',
    a.sim.pickups[0].collected, 'after ' + g + ' ticks');
  a.clearLog();
  a.step(60);
  s.eq('standing on an already-collected pickup grants nothing more',
    a.count('statGain'), 0);
}
{
  // resetTransient() restores an uncollected world — L10, extended to
  // pickups the same way it already covers players/targets/shots. Same
  // "prove it was collected first" discipline as the test above.
  const a = H.scenario({ spawns: [[80, 586]], pickups: [[120, 586]] });
  a.settle();
  a.hold('right');
  let g = 0;
  while (!a.sim.pickups[0].collected && g++ < 60) a.step(1);
  s.ok('collected before the reset, or the assertion below proves nothing',
    a.sim.pickups[0].collected, 'after ' + g + ' ticks');
  a.sim.resetTransient();
  s.eq('resetTransient un-collects every pickup', a.sim.pickups[0].collected, false);
}

/* ========================================================== determinism */
{
  function run() {
    const a = H.scenario({
      seed: 15, log: false,
      spawns: [[80, 586]],
      pickups: [[90, 586], [200, 586], [320, 586]]
    });
    a.settle();
    a.hold('right');
    for (let n = 0; n < 500; n++) a.sim.step();
    return a;
  }
  const r1 = run(), r2 = run();
  s.ok('a pickup-collecting run is deterministic (L4)', r1.sim.hash() === r2.sim.hash(), '500 ticks');
  s.ok('the run genuinely collected something',
    r1.sim.pickups.some((pu) => pu.collected), 'not a vacuous comparison');
}

process.exit(s.done());
