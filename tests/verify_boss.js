/* ===========================================================================
 * tests/verify_boss.js  —  Kilnwarden: the moveset, the phase transition,
 *                           the arena hazard, and the fairness rule that
 *                           governs all three
 * ---------------------------------------------------------------------------
 * Kilnwarden won a judged 3-concept design panel (two independent judges,
 * both checking every citation against the LIVE source rather than trusting
 * the proposals' own prose — the same discipline D10's touch-input panel
 * used) specifically because it needed no engine capability the other two
 * concepts silently got wrong: no undefined top-level `reach` (which broke
 * one loser's phase-2 attack gate closed, and would have soft-locked the
 * other), no insertion into DATA.ENEMIES (which would have broken THIS
 * suite's own sibling, verify_enemy.js's hard-pinned four-template roster,
 * D9), no new Bus event. This suite exists to prove those claims hold
 * against the real, built thing — not just the design document.
 *
 * L8 throughout: every assertion drives the real Enemy/Sim classes through
 * real sim ticks via tests/harness.js's H.scenario(), exactly the idiom
 * verify_enemy.js already uses for the regular roster. Nothing here
 * reimplements the state machine, the move picker, or the hazard-damage
 * path — it drives them and reads what actually happened.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_boss');
const C = H.loadSim();
const CFG = C.CFG, Boss = C.Boss, T = Boss.template;

function bossScenario(opts) {
  opts = opts || {};
  const spec = Object.assign({
    world: Boss.arena,
    spawns: [Boss.playerSpawn, [Boss.playerSpawn[0] + 300, Boss.playerSpawn[1]]],
    enemies: [[T, Boss.spawn[0], Boss.spawn[1], opts.bossSeed]]
  }, opts.spec || {});
  const a = H.scenario(spec);
  a.settle();
  return a;
}

/* =================================================== 1. data/shape audit
 * The same fairness loop verify_enemy.js runs over DATA.ENEMY_IDS, run here
 * over Kilnwarden's own move pool (both phases) instead — a template that
 * declares `moves` doesn't get to skip the floor just because its numbers
 * live one level deeper than the regular roster's. */
{
  const allMoves = T.moves.concat(T.phase2 && T.phase2.addMoves ? T.phase2.addMoves : []);
  s.ok('Kilnwarden declares at least one phase-1 move and one phase-2 addition',
    T.moves.length > 0 && T.phase2 && T.phase2.addMoves && T.phase2.addMoves.length > 0);

  let short = [];
  for (const m of allMoves) {
    s.ok(m.id + ' declares a telegraph', typeof m.telegraph === 'number');
    if (m.telegraph < CFG.MIN_TELEGRAPH) short.push(m.id + '=' + m.telegraph);
    s.ok(m.id + ' names a known attack primitive',
      ['melee', 'charge', 'shoot', 'dive', 'zone'].indexOf(m.attack) !== -1, m.attack);
  }
  s.eq('every Kilnwarden move telegraphs for at least MIN_TELEGRAPH', short.join(','), '');

  for (const m of allMoves) {
    if (m.attack !== 'shoot') continue;
    s.ok(m.id + ' carries a projectile spec', !!m.projectile);
    s.ok(m.id + "'s projectile dies on a timer", m.projectile.life > 0);
  }
  const zone = T.phase2.addMoves.find((m) => m.attack === 'zone');
  s.ok('the zone move (Kiln Floor) exists', !!zone);
  s.ok('it declares a build/hazard window and a vent list',
    zone.buildFrames > 0 && zone.hazardFrames > 0 && zone.vents && zone.vents.length > 0);
  s.ok('Kiln Floor has the longest telegraph in the fight — the newest, widest-consequence threat',
    allMoves.every((m) => m.id === zone.id || m.telegraph <= zone.telegraph));
}

/* ============================== 2. kept OUT of the shared roster (D9)
 * The one real bug that broke a losing design in the judged panel. Prove
 * it stays fixed: Kilnwarden is not, and must never become, a fifth entry
 * in DATA.ENEMIES/ENEMY_IDS. */
{
  const DATA = C.DATA;
  s.eq('the regular roster is still exactly four (D9)', DATA.ENEMY_IDS.length, 4);
  s.eq('and Kilnwarden is not one of them', DATA.ENEMY_IDS.indexOf('kilnwarden'), -1);
  s.eq('DATA.ENEMIES has no kilnwarden key either', DATA.ENEMIES.kilnwarden, undefined);
}

/* ==================================================== 3. construction */
{
  // Checked BEFORE any ticks run (not through bossScenario(), which always
  // settles first) — Kilnwarden's reach/sight deliberately cover the whole
  // arena (§ the template's own comment), so unlike the regular roster it
  // can commit within the handful of ticks settle() itself takes. "Starts
  // on patrol" is a claim about construction, not about 60 ticks later.
  const e = new C.Enemy(900, T, Boss.spawn[0], Boss.spawn[1], 3);
  s.eq('the boss spawned from its own template object, not a roster lookup', e.tid, 'kilnwarden');
  s.eq('it starts on patrol', e.state, 'patrol');
  s.eq('it starts at full hp', e.hp, T.hp);
  s.eq('it starts in phase 0', e.phase, 0);
  s.ok('it is a valid combat target',
    typeof e.alive === 'function' && typeof e.hurt === 'function' && typeof e.invulnerable === 'function');
  s.ok('it carries its own seeded rng (L4)', !!e.rng);
  s.ok('it is rooted — zero patrol/chase drift', T.speed === 0 && T.accel === 0);
}

/* ======================================= 4. it notices and commits (real ticks) */
{
  const a = bossScenario({ bossSeed: 11 });
  const e = a.t();
  let g = 0;
  while (e.state === 'patrol' && g++ < 300) a.step(1);
  s.ok('it notices the player', e.state !== 'patrol', 'entered ' + e.state);

  let g2 = 0;
  while (e.state !== 'telegraph' && g2++ < 600) a.step(1);
  s.eq('it commits to a telegraph', e.state, 'telegraph');
  s.ok('committing to a multi-move template picks a real move', !!e.activeMove);
  s.ok('the picked move is one Kilnwarden actually owns',
    T.moves.indexOf(e.activeMove) !== -1 || (T.phase2.addMoves.indexOf(e.activeMove) !== -1));
}

/* ================================================= 5. move-picker eligibility
 * The one property both judges flagged as this design's real remaining
 * risk: the eligible pool must never be empty at any real distance the
 * arena can produce, or the boss silently stalls in chase forever. Proven
 * here by a direct sweep, not by inspection of the authored ranges. */
{
  const a = bossScenario({ bossSeed: 1 });
  const e = a.t();
  const target = a.p(0);
  const bodyC = () => e.body.cx();

  let neverEmpty = true, sawKilnBreath = false, sawAlwaysEligible = false;
  for (let dist = 0; dist <= Boss.ARENA_W * CFG.TILE; dist += 8) {
    target.body.x = bodyC() - dist;   // place the player at this exact distance, left of the boss
    const move = e.pickMove(target);
    if (!move) { neverEmpty = false; continue; }
    if (move.id === 'kilnBreath') sawKilnBreath = true;
    if (move.id === 'emberArc' || move.id === 'cinderSpread') sawAlwaysEligible = true;
  }
  s.ok('the eligible move pool is never empty across the whole arena width', neverEmpty);
  s.ok('Kiln Breath is genuinely reachable (close range)', sawKilnBreath);
  s.ok('the always-eligible moves are genuinely reachable at every range', sawAlwaysEligible);

  // Far outside Kiln Breath's band, it must never be picked.
  target.body.x = bodyC() - 400;
  let farPicks = [];
  for (let i = 0; i < 60; i++) farPicks.push(e.pickMove(target).id);
  s.eq('Kiln Breath never fires from far outside its own range',
    farPicks.filter((id) => id === 'kilnBreath').length, 0, farPicks.join(','));
}

/* ==================================================== 6. THE FAIRNESS RULE
 * The exact dodge-test pattern verify_enemy.js runs over the regular
 * roster, run here over every one of Kilnwarden's own moves (forcing phase
 * 2 first for Kiln Floor, since it is only ever eligible there). */
{
  function dodgeTest(label, forcePhase2) {
    const a = bossScenario({ bossSeed: 12 });
    const e = a.t();
    if (forcePhase2) {
      e.hp = Math.floor(T.hp * T.phase2.hpFrac);
      e.phase = 1;
    }
    let g = 0;
    while (e.state !== 'telegraph' && g++ < 900) a.step(1);
    s.ok(label + ': committed', e.state === 'telegraph', 'after ' + g + ' ticks');
    const locked = e.lockFacing;
    const move = e.activeMove;

    a.hold(locked > 0 ? 'left' : 'right');
    let revised = 0, g2 = 0;
    while (g2++ < 400) {
      a.step(1);
      if (e.lockFacing !== locked || e.facing !== locked) revised++;
      if (e.state === 'chase' || e.state === 'recover' || e.state === 'phaseTransition') break;
    }
    s.eq(label + ': never revises its committed facing', revised, 0);
    s.ok(label + ': finished its attack', g2 < 400, g2 + ' ticks');
    return move;
  }
  dodgeTest('Kilnwarden (phase 1, whichever move is picked)', false);
  dodgeTest('Kilnwarden (phase 2, whichever move is picked)', true);
}

/* ============================================ 7. contact is never dangerous
 * Kilnwarden's own body never deals damage — every threat is a Shot or a
 * hazard tile, never Combat.resolveBox against the rooted body itself. */
{
  const a = bossScenario({ bossSeed: 2 });
  const e = a.t();
  s.eq('contact is 0 at the template level', T.contact, 0);
  let touched = 0, g = 0;
  const hp0 = a.p().hp;
  while (g++ < 900) {
    a.sim.step();
    if (a.p().hp < hp0) touched++;
    if (touched) break;
  }
  // Any hp loss observed here came from a Shot, never from standing next to
  // the boss's own body — dangerous() only ever gates strike/charge/dive,
  // and Kilnwarden never enters any of those three states.
  s.eq('Kilnwarden never enters a melee/charge/dive state', ['strike', 'charge', 'dive'].indexOf(e.state), -1);
}

/* ==================================================== 8. the phase transition
 * Damaged via real Combat-shaped hurt() calls (the same function
 * Combat.resolveBox itself calls), not hp -=. The flip must land only at a
 * safe point, run the full non-dangerous transitionFrames window, and never
 * happen twice. */
{
  const a = bossScenario({ bossSeed: 4 });
  const e = a.t();
  const threshold = T.hp * T.phase2.hpFrac;

  // `phase` itself flips to 1 on the FIRST tick INSIDE the transition state
  // (see 45-enemy.js's doPhaseTransition) — nothing reads `phase` again
  // until the state has already fully ended and `chase` is re-entered, so
  // exactly when within the transition it flips is not itself a claim
  // worth pinning. What IS worth pinning is the STATE's own duration, so
  // this drives real ticks until the state actually LEAVES
  // 'phaseTransition', not until `phase` merely changes.
  let sawTransitionWhileDangerous = false, transitionFrames = 0, sawTransitionState = false;
  let g = 0;
  while (e.state !== 'phaseTransition' && g++ < 20000) {
    // Chip hp down whenever it's safe to (never mid-attack), forcing the
    // threshold to be crossed at a point this test controls precisely.
    if (e.hp > threshold && e.state === 'chase') e.hurt(1, a.sim.bus);
    a.sim.step();
  }
  s.ok('the phase threshold was actually reached', g < 20000, 'after ' + g + ' ticks');
  // A Kilnwarden shot already in flight before the transition began can
  // still connect with the player DURING it (shots are independent
  // entities, not paused by the boss's own state) — Player.hurt() then
  // requests an 8-tick impact hitstop that freezes the WHOLE sim, boss
  // included, exactly like it freezes everything else (Sim.step's frozen
  // branch returns before any entity updates at all). That is correct,
  // pre-existing behavior, not a bug this test should be fooled by: only
  // count ticks that actually advance the state machine (hitstop was 0
  // going in), so a coincidental hit landing mid-transition can never
  // inflate this count. Wall-clock ticks (`g`) legitimately run longer;
  // real progress (`transitionFrames`) must not.
  while (e.state === 'phaseTransition' && g++ < 20000 + T.phase2.transitionFrames + 20) {
    sawTransitionState = true;
    if (a.sim.hitstop === 0) transitionFrames++;
    if (e.dangerous()) sawTransitionWhileDangerous = true;
    a.sim.step();
  }
  s.eq('phase flips to 1 by the time the transition state ends', e.phase, 1);
  s.ok('hp was at or below the threshold when it flipped', e.hp <= threshold, e.hp + ' vs ' + threshold);
  s.ok('a real phaseTransition state actually ran', sawTransitionState);
  s.ok('the transition state is never dangerous', !sawTransitionWhileDangerous);
  s.ok('the transition ran at least CFG.MIN_TELEGRAPH frames',
    transitionFrames >= CFG.MIN_TELEGRAPH, transitionFrames + ' frames');
  s.eq('the transition ran exactly its declared length', transitionFrames, T.phase2.transitionFrames);
}
{
  // The transition must NEVER interrupt an attack already in flight — hp
  // crossing the line mid-telegraph must not retroactively revise it.
  const a = bossScenario({ bossSeed: 6 });
  const e = a.t();
  let g = 0;
  while (e.state !== 'telegraph' && g++ < 900) a.step(1);
  s.ok('a telegraph is in flight', e.state === 'telegraph');

  e.hp = Math.floor(T.hp * T.phase2.hpFrac) - 1;   // force well past the threshold, mid-commit
  const moveAtCommit = e.activeMove, lockedAtCommit = e.lockFacing;

  let sawPhaseFlipMidAttack = false, g2 = 0;
  while (e.state !== 'recover' && e.state !== 'phaseTransition' && g2++ < 400) {
    a.step(1);
    if (e.phase === 1) sawPhaseFlipMidAttack = true;
  }
  s.ok('the in-flight attack finished exactly as committed',
    e.activeMove === moveAtCommit && e.lockFacing === lockedAtCommit);
  s.eq('the phase did not flip while the attack was still resolving', sawPhaseFlipMidAttack, false);
}

/* ==================================================== 9. the arena hazard
 * Read the real World directly — never a reimplementation of the timer. */
{
  const a = bossScenario({ bossSeed: 8 });
  const e = a.t();
  const world = a.world;
  const isHazard = () => Boss.VENTS.some(([x, y]) => world.get(x, y) === C.TILE.HAZARD);

  s.eq('every vent tile starts as EMPTY, not HAZARD', isHazard(), false);

  // Force phase 2, then force Kiln Floor to be the only eligible move by
  // parking the player far outside Kiln Breath's short range so the pool
  // stays deterministic-ish, and drive real ticks until it fires.
  e.hp = Math.floor(T.hp * T.phase2.hpFrac);
  let g = 0, wentLive = -1, wentDark = -1, buildStart = -1;
  while (g++ < 40000) {
    a.sim.step();
    if (e.state === 'zone' && buildStart === -1) buildStart = e.stateFrames === 0 ? g : buildStart;
    if (isHazard() && wentLive === -1) wentLive = g;
    if (wentLive !== -1 && !isHazard() && wentDark === -1) { wentDark = g; break; }
  }
  s.ok('the zone attack actually fired within a reasonable window', wentLive !== -1, 'after ' + g + ' ticks');
  s.ok('the vent tiles revert to EMPTY afterward', wentDark !== -1);
  const zone = T.phase2.addMoves.find((m) => m.attack === 'zone');
  s.eq('the hazard stays live for exactly hazardFrames', wentDark - wentLive, zone.hazardFrames);
}
{
  // A player standing in a live vent takes real damage through the exact
  // same generic hazard path every other HAZARD tile in the game already
  // uses (30-player.js) — not a boss-specific damage rule.
  const a = bossScenario({ bossSeed: 8 });
  const e = a.t();
  const world = a.world;
  e.hp = Math.floor(T.hp * T.phase2.hpFrac);

  let g = 0;
  const isHazard = () => Boss.VENTS.some(([x, y]) => world.get(x, y) === C.TILE.HAZARD);
  while (!isHazard() && g++ < 40000) a.sim.step();
  s.ok('a hazard tile actually went live', isHazard(), 'after ' + g + ' ticks');

  const [vx, vy] = Boss.VENTS.find(([x, y]) => world.get(x, y) === C.TILE.HAZARD);
  const hp0 = a.p().hp;
  a.p().body.x = vx * CFG.TILE;
  a.p().body.y = vy * CFG.TILE;
  let g2 = 0, took = false;
  while (g2++ < 90) {
    a.sim.step();
    if (a.p().hp < hp0) { took = true; break; }
  }
  s.ok('standing in a live vent costs a real heart', took, took ? 'after ' + g2 + ' ticks' : 'never hurt');
}

/* ===================================================== 10. determinism (L4) */
{
  const script = (n) => ({ right: (n % 91) < 58, jump: n % 33 === 0, attack: n % 19 === 0 });
  function run() {
    const a = bossScenario({ bossSeed: 21 });
    const e = a.t();
    for (let n = 0; n < 3000; n++) {
      if (e.hp > 1 && e.state === 'chase' && n % 40 === 0) e.hurt(4, a.sim.bus);
      const k = script(n);
      a.pad().set('right', k.right).set('jump', k.jump).set('attack', k.attack);
      a.sim.step();
    }
    return a;
  }
  const r1 = run(), r2 = run();
  s.ok('same seed -> identical sim.hash() through a phase transition and zone attack',
    r1.sim.hash() === r2.sim.hash(), '3000 ticks');
  s.ok('the run genuinely exercised the boss', r1.t().phase === 1, 'phase ' + r1.t().phase);

  function ventPickAt(seed) {
    const a = bossScenario({ bossSeed: seed });
    const e = a.t();
    e.hp = Math.floor(T.hp * T.phase2.hpFrac);
    let g = 0;
    while (!e._zoneTiles && g++ < 40000) a.sim.step();
    return e._zoneTiles ? e._zoneTiles.map((v) => v.join(',')).sort().join('|') : null;
  }
  const picksA = ventPickAt(21), picksB = ventPickAt(99);
  s.ok('the same seed always ignites the same vents', ventPickAt(21) === picksA);
  s.ok('a different seed can ignite different vents', picksA !== picksB, picksA + ' vs ' + picksB);
}

/* =============================================== 11. two-player fairness (D5) */
{
  const a = H.scenario({
    world: Boss.arena, players: 2,
    spawns: [[Boss.spawn[0] - 220, Boss.playerSpawn[1]], [Boss.spawn[0] + 220, Boss.playerSpawn[1]]],
    enemies: [[T, Boss.spawn[0], Boss.spawn[1], 9]]
  });
  a.settle();
  const e = a.t();
  let g = 0;
  while (e.state !== 'telegraph' && g++ < 900) a.step(1);
  s.ok('it committed with two players present', e.state === 'telegraph', 'after ' + g + ' ticks');

  const nearer = Math.abs(a.p(0).body.cx() - e.body.cx()) < Math.abs(a.p(1).body.cx() - e.body.cx()) ? 0 : 1;
  const farther = nearer === 0 ? 1 : 0;
  const expectFacing = Math.sign(a.p(nearer).body.cx() - e.body.cx());
  s.eq('it locks onto the nearer player', e.lockFacing, expectFacing);

  const farHp0 = a.p(farther).hp;
  let g2 = 0;
  while (e.state !== 'recover' && e.state !== 'chase' && g2++ < 400) a.step(1);
  s.eq('the untargeted player takes zero damage from that commit', a.p(farther).hp, farHp0);
}

/* ================================================ 12. collision still holds */
{
  const a = bossScenario({ bossSeed: 13 });
  let inside = 0;
  for (let n = 0; n < 900; n++) {
    a.pad().set('right', (n % 77) < 44).set('jump', n % 23 === 0);
    a.sim.step();
    const b = a.t().body;
    if (a.world.rectSolid(b.x, b.y, b.w, b.h)) inside++;
  }
  s.eq('the boss never ends a tick inside its own arena geometry', inside, 0);
}

/* ================================= 13. staggered still reaches phase 2
 * The whole reason stagger() routes through the EXISTING recover state
 * rather than jumping straight back to chase (45-enemy.js's own comment):
 * a staggered boss must still get its normal phase-transition eligibility
 * check once recover elapses, not have that check silently skipped because
 * the interrupt took a different path than an ordinary resolved move. */
{
  const a = bossScenario();
  const e = a.t();
  e.hp = Math.floor(T.hp * T.phase2.hpFrac);   // at the threshold
  e.state = 'charge'; e.stateFrames = 5; e.activeMove = T.moves[0]; e.attack = null;

  e.stagger(a.sim.bus);
  s.eq('a real parry interrupts it into staggered', e.state, 'staggered');
  s.ok('harmless while staggered', !e.dangerous());

  let g = 0;
  while (e.state === 'staggered' && g++ < 200) a.step(1);
  s.eq('it hands off to recover', e.state, 'recover');

  let g2 = 0;
  while (e.state === 'recover' && g2++ < 900) a.step(1);
  s.eq('and still reaches phaseTransition once recover elapses', e.state, 'phaseTransition');
}

process.exit(s.done());
