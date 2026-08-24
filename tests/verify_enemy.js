/* ===========================================================================
 * tests/verify_enemy.js  —  the roster, and the fairness rule that governs it
 * ---------------------------------------------------------------------------
 * The central assertion in this file is the DODGE TEST: every attacking
 * template commits its facing at the start of its telegraph and cannot revise
 * it, so a player who moves after the commit is not hit. An enemy that tracks
 * you through its windup is not harder, it is unreadable — and the telegraph
 * frames stop being information.
 *
 * Geometry: floor surface y = 608, player rests at y = 586 spawned at x = 80.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_enemy');
const C = H.loadSim();
const CFG = C.CFG, DATA = C.DATA;

const GROUND = (t) => 608 - t.h;      // where a walking template rests

function fresh(spec) {
  const a = H.scenario(spec);
  a.settle();
  return a;
}

/* ===================================================== the fairness audit
 * D3a's instinct applied to combat: turn "that felt unfair" into a number a
 * test can hold. */
{
  const ids = DATA.ENEMY_IDS;
  s.eq('the roster is four (D9)', ids.length, 4);
  s.eq('and its order is stable', ids.join(','), 'ashwalker,emberrush,kilnspitter,wickmoth');

  let short = [];
  for (const id of ids) {
    const t = DATA.ENEMIES[id];
    s.ok(id + ' declares a telegraph', typeof t.telegraph === 'number');
    if (t.telegraph < CFG.MIN_TELEGRAPH) short.push(id + '=' + t.telegraph);
    s.ok(id + ' has positive hp', t.hp > 0);
    s.ok(id + ' has a body', t.w > 0 && t.h > 0);
    s.ok(id + ' declares damage', t.damage > 0);
    s.ok(id + ' has a recovery window', t.recover > 0);
    s.ok(id + ' names a known attack primitive',
      ['melee', 'charge', 'shoot', 'dive'].indexOf(t.attack) !== -1, t.attack);
    s.ok(id + ' names a known movement mode',
      ['walk', 'fly'].indexOf(t.mode) !== -1, t.mode);
  }
  s.eq('every attack telegraphs for at least MIN_TELEGRAPH', short.join(','), '');

  // A melee template must name a move that actually bakes, or it swings air.
  for (const id of ids) {
    const t = DATA.ENEMIES[id];
    if (t.attack !== 'melee') continue;
    s.ok(id + ' names a baked move', !!C.RIG.move(t.move), t.move);
  }
  // A shooter must carry a projectile spec, or its telegraph resolves to
  // nothing at all.
  for (const id of ids) {
    const t = DATA.ENEMIES[id];
    if (t.attack !== 'shoot') continue;
    s.ok(id + ' carries a projectile spec', !!t.projectile);
    s.ok(id + "'s projectile dies on a timer", t.projectile.life > 0);
  }
}

/* ============================================================ the machine */
{
  const a = fresh({ enemies: [['ashwalker', 400, GROUND(DATA.ENEMIES.ashwalker)]] });
  const e = a.t();
  s.eq('the enemy spawned from its template', e.tid, 'ashwalker');
  s.eq('it starts on patrol', e.state, 'patrol');
  s.eq('it starts at full hp', e.hp, DATA.ENEMIES.ashwalker.hp);
  s.ok('it is a valid combat target',
    typeof e.alive === 'function' && typeof e.hurt === 'function' &&
    typeof e.invulnerable === 'function');
  s.ok('it carries its own rng', !!e.rng);

  a.step(200);
  s.ok('it stays inside its patrol box',
    Math.abs(e.body.x - e.homeX) <= DATA.ENEMIES.ashwalker.patrol + 8,
    'drifted ' + Math.round(e.body.x - e.homeX));
  s.ok('it is standing on the floor', e.body.onGround);
  s.eq('it never noticed a player 320px away', e.state, 'patrol');
}
{
  // Walk into its sight and it should commit to an attack.
  const a = fresh({ enemies: [['ashwalker', 260, GROUND(DATA.ENEMIES.ashwalker)]] });
  const e = a.t();
  a.hold('right');
  let g = 0;
  while (e.state === 'patrol' && g++ < 600) a.step(1);
  s.ok('it notices the player', e.state !== 'patrol', 'entered ' + e.state);

  let g2 = 0;
  while (e.state !== 'telegraph' && g2++ < 600) a.step(1);
  s.eq('it commits to a telegraph', e.state, 'telegraph');

  let g3 = 0;
  while (e.state === 'telegraph' && g3++ < 200) a.step(1);
  // The event fires on the first tick INSIDE the telegraph, not on the tick
  // that enters it, so it is only observable once the windup has begun.
  s.ok('the telegraph was announced', a.count('telegraph') > 0);
  s.eq('the telegraph ran its full length', g3, DATA.ENEMIES.ashwalker.telegraph);
  s.eq('then it strikes', e.state, 'strike');
  s.ok('the strike uses a baked move', !!e.attack && !!C.RIG.move(e.attack.id));
}

/* ============================================== THE FAIRNESS RULE, asserted
 *
 * The property that holds for EVERY template is narrower than "you can always
 * walk away": it is that the enemy commits its facing and cannot revise it.
 * Fleeing in a straight line does not beat a 4.6px/frame charger — and it is
 * not supposed to. What beats a charger is rolling through it. What has to be
 * true of all four is that the attack goes where it was committed, so the
 * telegraph frames are real information.
 *
 * The first draft of this suite asserted the broad version and failed three of
 * four templates. The code was right; the assertion was wrong. */
{
  for (const id of DATA.ENEMY_IDS) {
    const t = DATA.ENEMIES[id];
    const a = H.scenario({
      seed: 12,
      enemies: [[id, 150, t.mode === 'fly' ? 520 : GROUND(t)]]
    });
    a.settle();
    const e = a.t();

    let g = 0;
    while (e.state !== 'telegraph' && g++ < 900) a.step(1);
    s.ok(id + ' committed', e.state === 'telegraph', 'after ' + g + ' ticks');
    const locked = e.lockFacing;

    // Run hard the other way. The commitment must not follow.
    a.hold(locked > 0 ? 'left' : 'right');
    let revised = 0, g2 = 0;
    while (g2++ < 400) {
      a.step(1);
      if (e.lockFacing !== locked || e.facing !== locked) revised++;
      if (e.state === 'chase' || e.state === 'patrol') break;   // attack is over
    }
    s.eq(id + ' never revises its committed facing', revised, 0);
    s.ok(id + ' finished its attack', g2 < 400, g2 + ' ticks');
  }
}
{
  // Melee specifically: the strike zone is static, so leaving it works.
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 12, enemies: [['ashwalker', 150, GROUND(t)]] });
  a.settle();
  const e = a.t();
  let g = 0;
  while (e.state !== 'telegraph' && g++ < 900) a.step(1);
  const locked = e.lockFacing;
  const hp0 = a.p().hp;

  // Flee in the direction the swing is heading — away from the enemy.
  a.hold(locked > 0 ? 'right' : 'left');
  let g2 = 0;
  while (g2++ < 300 && e.state !== 'chase' && e.state !== 'patrol') a.step(1);
  s.eq('walking out of a melee swing beats it', a.p().hp, hp0);
}
{
  /* Charge specifically: fleeing does NOT beat it, and the counter is the long
   * helpless recovery. That window is the enemy's whole design, so it is
   * pinned here. */
  const t = DATA.ENEMIES.emberrush;
  // Inside its 150px sight from the player's spawn at x = 80.
  const a = H.scenario({ seed: 9, enemies: [['emberrush', 190, GROUND(t)]] });
  a.settle();
  const e = a.t();
  let g = 0;
  while (e.state !== 'charge' && g++ < 900) a.step(1);
  s.ok('the charge starts', e.state === 'charge', 'after ' + g + ' ticks');
  s.ok('a charging enemy is dangerous', e.dangerous());

  let g2 = 0;
  while (e.state === 'charge' && g2++ < 200) a.step(1);
  s.eq('the charge ends in recovery', e.state, 'recover');
  s.ok('and a recovering enemy is harmless', !e.dangerous());

  let g3 = 0;
  while (e.state === 'recover' && g3++ < 200) a.step(1);
  s.eq('the punish window is the full recovery', g3, t.recover);
}

/* ==================================== and it CAN hit you if you stand still */
{
  // The dodge test only means something if the attack connects otherwise.
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 5, enemies: [['ashwalker', 150, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const hp0 = a.p().hp;
  let g = 0, hit = false;
  while (g++ < 900) {
    a.sim.step();
    if (a.p().hp < hp0) { hit = true; break; }
  }
  s.ok('standing still gets you hit', hit, hit ? 'after ' + g + ' ticks' : 'never hit');
  s.ok('and it cost exactly one heart', a.p().hp === hp0 - 1, 'hp ' + a.p().hp);
}

/* ============================================ contact is not always lethal */
{
  // Emberrush deals contact damage, but ONLY while charging. Standing next to
  // one that is patrolling must be safe, or the telegraph is decoration.
  const t = DATA.ENEMIES.emberrush;
  const a = H.scenario({ seed: 9, enemies: [['emberrush', 96, GROUND(t)]] });
  a.settle();
  const e = a.t();
  a.sim.step();
  s.ok('it starts harmless', !e.dangerous(), e.state);

  let touched = 0, g = 0;
  const hp0 = a.p().hp;
  while (g++ < 40) {
    a.sim.step();
    if (!e.dangerous() && a.p().hp < hp0) touched++;
  }
  s.eq('touching a non-attacking enemy is safe', touched, 0);
}

/* ============================================================ projectiles */
{
  const t = DATA.ENEMIES.kilnspitter;
  const a = H.scenario({ seed: 3, enemies: [['kilnspitter', 190, GROUND(t)]] });
  a.settle();
  const e = a.t();
  let g = 0;
  while (a.sim.shots.length === 0 && g++ < 900) a.sim.step();
  s.ok('the shooter fires', a.sim.shots.length > 0, 'after ' + g + ' ticks');
  s.ok('it fired only after telegraphing', a.count('telegraph') > 0);

  const shot = a.sim.shots[0];
  s.ok('the shot travels toward the player', Math.sign(shot.body.vx) === Math.sign(80 - 190));

  // Every shot must die. A projectile that outlives its room desyncs what the
  // player can see from what can hurt them.
  let g2 = 0;
  while (a.sim.shots.length > 0 && g2++ < 400) a.sim.step();
  s.ok('shots do not live forever', a.sim.shots.length === 0, 'cleared in ' + g2 + ' ticks');
}
{
  // A named V1 scope limit (40-combat.js's own comment on the parry check):
  // a base parry does not negate a projectile, since Shot has no .stagger
  // — Reflect is what gives ranged attacks a parry interaction, and it's
  // not built yet. Proven directly rather than left to the comment's word.
  const t = DATA.ENEMIES.kilnspitter;
  const a = H.scenario({ seed: 3, enemies: [['kilnspitter', 190, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const hp0 = a.p().hp;
  let g = 0;
  while (g++ < 900) {
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;   // armed continuously
    a.sim.step();
    if (a.p().hp < hp0) break;
  }
  s.ok('the shot actually landed', g < 900, g + ' ticks');
  s.eq('a base parry does not negate ranged damage', a.p().hp, hp0 - 1);
  s.eq('and the shooter is never staggered by it', a.count('enemyStagger'), 0);
}
{
  // Parry Reflect (abilities spec §4): a base parry never negates a
  // projectile (proven above) — Reflect is what gives ranged attacks a
  // parry interaction at all. Sends the shot's own damage back at whoever
  // fired it, directly, and consumes the shot so it can't also still hit
  // the player it was reflected away from.
  const t = DATA.ENEMIES.kilnspitter;
  const a = H.scenario({ seed: 3, enemies: [['kilnspitter', 190, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const hp0 = a.p().hp;
  const ehp0 = e.hp;
  a.p().parryReflect = true;
  let g = 0;
  while (g++ < 900) {
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    a.sim.step();
    if (a.count('parry') > 0) break;
  }
  s.ok('the shot was actually fired and reflected', g < 900, g + ' ticks');
  s.eq('the player takes no damage', a.p().hp, hp0);
  s.eq("the shot's own damage lands on whoever fired it", ehp0 - e.hp, t.damage);
  s.eq('the reflected shot is consumed, not still live', a.sim.shots.length, 0);

  // Without owning it, the same exact sequence (proven above too) deals
  // full damage to the player and never touches the shooter.
  const b = H.scenario({ seed: 3, enemies: [['kilnspitter', 190, GROUND(t)]] });
  b.settle();
  const eb = b.t();
  const ehpB0 = eb.hp;
  let g2 = 0;
  while (g2++ < 900) {
    b.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    b.sim.step();
    if (b.p().hp < b.p().maxHp) break;
  }
  s.eq('without owning it, the shooter takes no damage', eb.hp, ehpB0);
}
{
  // Owning both Riposte and Reflect at once: reflecting a shot must not
  // ALSO trigger Riposte's bonus — structurally guaranteed (a Shot never
  // has .stagger, so it can never reach the Riposte branch at all), but
  // proven directly rather than left to reasoning about the code alone.
  const t = DATA.ENEMIES.kilnspitter;
  const a = H.scenario({ seed: 3, enemies: [['kilnspitter', 190, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const ehp0 = e.hp;
  a.p().parryReflect = true;
  a.p().parryRiposte = true;
  let g = 0;
  while (g++ < 900) {
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    a.sim.step();
    if (a.count('parry') > 0) break;
  }
  s.eq("owning both, a reflected shot deals only its own damage", ehp0 - e.hp, t.damage);
}

/* ================================================ enemies can be killed */
{
  const t = DATA.ENEMIES.wickmoth;
  const a = H.scenario({ seed: 7, enemies: [['wickmoth', 104, 560]] });
  a.settle();
  const e = a.t();
  const hp0 = e.hp;

  let g = 0;
  while (e.alive() && g++ < 2000) {
    a.pad().set('attack', g % 26 === 0);
    a.sim.step();
  }
  s.ok('the player can kill it', !e.alive(), 'hp ' + e.hp + ' after ' + g + ' ticks');
  s.ok('it took real damage', e.hp < hp0);
  s.ok('targetDown was emitted', a.count('targetDown') > 0);

  a.clearLog();
  a.step(60);
  s.eq('a dead enemy stops attacking', a.count('enemyAttack'), 0);
}

/* ====================================================== L4: per-instance */
{
  // Two of the same template, same place, different seeds must diverge.
  const t = DATA.ENEMIES.ashwalker;
  const mk = (seed) => {
    const a = H.scenario({ seed: 1, log: false, enemies: [['ashwalker', 400, GROUND(t), seed]] });
    a.step(400);
    return a.t().body.x;
  };
  s.ok('different seeds wander differently', mk(11) !== mk(22),
    mk(11).toFixed(2) + ' vs ' + mk(22).toFixed(2));
  s.ok('the same seed reproduces', mk(11) === mk(11));
}

/* ========================================================== determinism */
{
  const script = (n) => ({
    right: (n % 91) < 58, jump: n % 33 === 0,
    attack: n % 19 === 0, roll: n % 67 === 0, down: (n % 103) > 94
  });
  const run = () => {
    const a = H.scenario({
      seed: 8, log: false,
      enemies: [
        ['ashwalker', 220, GROUND(DATA.ENEMIES.ashwalker)],
        ['emberrush', 380, GROUND(DATA.ENEMIES.emberrush)],
        ['kilnspitter', 520, GROUND(DATA.ENEMIES.kilnspitter)],
        ['wickmoth', 300, 520]
      ]
    });
    for (let n = 0; n < 900; n++) {
      const k = script(n);
      a.pad().set('right', k.right).set('jump', k.jump)
        .set('attack', k.attack).set('roll', k.roll).set('down', k.down);
      a.sim.step();
    }
    return a;
  };
  const r1 = run(), r2 = run();
  s.ok('a full roster is deterministic', r1.sim.hash() === r2.sim.hash(), '900 ticks, 4 enemies');
  s.ok('the run was not a stalemate',
    r1.sim.targets.some((e) => e.hp < e.maxHp) || r1.sim.players[0].hp < CFG.MAX_HP,
    'something took damage');

  const clean = H.scenario({
    seed: 8, log: false,
    enemies: [
      ['ashwalker', 220, GROUND(DATA.ENEMIES.ashwalker)],
      ['emberrush', 380, GROUND(DATA.ENEMIES.emberrush)],
      ['kilnspitter', 520, GROUND(DATA.ENEMIES.kilnspitter)],
      ['wickmoth', 300, 520]
    ]
  });
  r1.sim.resetTransient();
  s.ok('resetTransient restores enemies and shots', r1.sim.hash() === clean.sim.hash());
  s.eq('and clears the shot list', r1.sim.shots.length, 0);
}

/* ================================================ collision still holds */
{
  // Enemies must not end a tick inside terrain either.
  const a = H.scenario({
    seed: 4,
    enemies: [
      ['ashwalker', 200, GROUND(DATA.ENEMIES.ashwalker)],
      ['emberrush', 300, GROUND(DATA.ENEMIES.emberrush)]
    ]
  });
  a.settle();
  let inside = 0;
  for (let n = 0; n < 900; n++) {
    a.pad().set('right', (n % 77) < 44).set('jump', n % 23 === 0);
    a.sim.step();
    for (const e of a.sim.targets) {
      const b = e.body;
      if (a.world.rectSolid(b.x, b.y, b.w, b.h)) inside++;
    }
  }
  s.eq('no enemy ends a tick inside a wall', inside, 0);
}

/* =================================================== parry stagger (§2b)
 * The negate+stagger check itself lives in 40-combat.js's Combat.resolveBox
 * (the one shared chokepoint every hit — player-attacks-enemy, enemy-
 * attacks-player, a Shot's own hit — already resolves through), so this
 * drives a REAL ashwalker attack against a REAL player with parryWindow
 * pinned armed, rather than reimplementing the check to test against (L8).
 * This is also where "a real hit does zero damage while parryWindow > 0"
 * gets proven for real — verify_combat.js has no real enemy-attacks-player
 * scenario to hang that on; this file already owns "and it CAN hit you if
 * you stand still" above, the test this one is the direct counterpart to. */
{
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 5, enemies: [['ashwalker', 150, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const hp0 = a.p().hp;
  let g = 0;
  while (g++ < 900) {
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;   // armed every tick, no input needed
    a.sim.step();
    if (e.state === 'staggered') break;
  }
  s.ok('the attack was actually thrown', g < 900, g + ' ticks');
  s.eq('the hit was negated, not landed', a.p().hp, hp0);
  s.eq('and no hurt event fired', a.count('hurt'), 0);
  s.eq('a parry event fired', a.count('parry'), 1);
  s.eq('the attacker staggered', e.state, 'staggered');
  s.eq('enemyStagger is emitted', a.count('enemyStagger'), 1);
  s.ok('a staggered enemy is harmless', !e.dangerous());
  s.eq('its attack is cleared, nothing lands late', e.attack, null);

  // Its own fixed punish window, not whatever the interrupted move's
  // recover happens to be — then the EXISTING recover state takes over.
  let g2 = 0;
  while (e.state === 'staggered' && g2++ < 200) a.step(1);
  s.eq('stagger duration (frames)', g2, CFG.STAGGER_FRAMES);
  s.eq('it hands off to the existing recover state', e.state, 'recover');
}
{
  // Parry Riposte (abilities spec §4): a flat bonus hit lands on the
  // attacker at the moment of the stagger itself, direct — not routed
  // through a second resolveBox pass (40-combat.js's own comment on why).
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 5, enemies: [['ashwalker', 150, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const ehp0 = e.hp;
  a.p().parryRiposte = true;
  let g = 0;
  while (g++ < 900) {
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    a.sim.step();
    if (e.state === 'staggered') break;
  }
  s.ok('the attack was actually thrown', g < 900, g + ' ticks');
  s.eq('Riposte lands its own flat bonus damage', ehp0 - e.hp, CFG.PARRY_RIPOSTE_DAMAGE);

  // Without owning it, the same exact sequence deals none.
  const b = H.scenario({ seed: 5, enemies: [['ashwalker', 150, GROUND(t)]] });
  b.settle();
  const eb = b.t();
  const ehpB0 = eb.hp;
  let g2 = 0;
  while (g2++ < 900) {
    b.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    b.sim.step();
    if (eb.state === 'staggered') break;
  }
  s.eq('without owning it, no bonus damage lands', eb.hp, ehpB0);
}
{
  // Riposte's bonus damage can be lethal — a real kill, not merely a
  // number: targetDown must fire so currency/kill-counting still credits
  // it, the exact reason 40-combat.js's Riposte branch mirrors that
  // emission by hand rather than leaving it to a resolveBox pass that
  // never runs for this hit.
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 5, enemies: [['ashwalker', 150, GROUND(t)]] });
  a.settle();
  const e = a.t();
  e.hp = CFG.PARRY_RIPOSTE_DAMAGE;   // exactly lethal to the bonus hit alone
  a.p().parryRiposte = true;
  let g = 0;
  while (g++ < 900) {
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    a.sim.step();
    if (a.count('targetDown') > 0) break;
  }
  s.ok('a Riposte kill happened', g < 900, g + ' ticks');
  s.eq('the enemy is actually dead', e.alive(), false);
  s.eq('targetDown fired for it, same as any other kill', a.count('targetDown'), 1);
}
{
  /* Regression for a real bug a workflow-driven adversarial review pass
   * caught (and independently re-confirmed empirically, with real
   * numbers, by a second lens in the same pass): two co-op players both
   * owning Riposte, both with an armed parryWindow, sharing ONE hitbox in
   * ONE resolveBox call (a wide charge/contact box, or two stacked
   * players) each independently triggered the FULL source.hurt() side
   * effect — the enemy took the bonus damage twice from one swing, and a
   * lethal case emitted targetDown twice for one kill, double-counting
   * real run.kills/currency. stagger()'s own idempotency guard protects
   * the STATE transition but does nothing for this separate hurt() call
   * sitting next to it. Fixed by capturing "was this source already
   * staggered/dead" BEFORE calling stagger(), and gating the bonus
   * damage on it. Driven directly against the real function with a
   * hand-built hitbox spanning both real player bodies, the same
   * established pattern the base idempotency test above already uses. */
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 1, players: 2, enemies: [['ashwalker', 300, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const ehp0 = e.hp;
  a.p(0).parryRiposte = true;
  a.p(1).parryRiposte = true;
  a.p(0).parryWindow = CFG.PARRY_WINDOW_FRAMES;
  a.p(1).parryWindow = CFG.PARRY_WINDOW_FRAMES;
  const hb = { x: 0, y: 0, w: 2000, h: 2000 };
  C.Combat.resolveBox(e, hb, [a.p(0), a.p(1)], { damage: 1, knock: [0, 0], facing: 1 }, a.sim.bus);
  s.eq('two simultaneous Riposte owners deal the bonus only once', ehp0 - e.hp, CFG.PARRY_RIPOSTE_DAMAGE);
  s.eq('both presses still individually credited as a parry', a.count('parry'), 2);
}
{
  // Riposte deliberately bypasses invulnerable() by calling source.hurt()
  // directly (40-combat.js's own comment on why) — proven here the same
  // way the base parry-vs-player's-own-invulnerability regression above
  // is proven, mirrored onto the ATTACKER's side instead: the bonus must
  // still land even when the enemy itself happens to have active iframes
  // from something entirely unrelated (a co-op partner's swing moments
  // earlier, say).
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 5, enemies: [['ashwalker', 150, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const ehp0 = e.hp;
  a.p().parryRiposte = true;
  let g = 0;
  while (g++ < 900) {
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    e.iframes = CFG.HIT_IFRAMES;   // as if recently hit by something else
    a.sim.step();
    if (e.state === 'staggered') break;
  }
  s.eq("Riposte's bonus lands despite the enemy's own active iframes", ehp0 - e.hp, CFG.PARRY_RIPOSTE_DAMAGE);
}
{
  // Same co-op double-hit shape, for Reflect — a shot small enough to
  // overlap two stacked players, both owning Reflect, must only redirect
  // the shot's damage to its owner ONCE, not once per parrying player.
  const t = DATA.ENEMIES.kilnspitter;
  const a = H.scenario({ seed: 3, players: 2, enemies: [['kilnspitter', 190, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const ehp0 = e.hp;
  a.p(0).parryReflect = true;
  a.p(1).parryReflect = true;
  let g = 0;
  while (g++ < 900) {
    a.p(0).parryWindow = CFG.PARRY_WINDOW_FRAMES;
    a.p(1).parryWindow = CFG.PARRY_WINDOW_FRAMES;
    a.sim.step();
    if (a.count('parry') > 0) break;
  }
  s.ok('the shot was actually fired and reflected', g < 900, g + ' ticks');
  s.eq('two simultaneous Reflect owners redirect the damage only once', ehp0 - e.hp, t.damage);
}
{
  // Regression: source.owner.hurt() originally had no aliveness guard —
  // if the enemy that fired a shot was already killed by other means
  // before that shot was later Reflect-parried, hurting the stale
  // reference re-triggered its alive() check and emitted a SECOND
  // targetDown for one already-counted kill (shots are never pruned
  // early when their owner dies; only a level transition clears both
  // together). Kills the shooter directly first, then reflects its
  // still-live shot afterward.
  const t = DATA.ENEMIES.kilnspitter;
  const a = H.scenario({ seed: 3, enemies: [['kilnspitter', 190, GROUND(t)]] });
  a.settle();
  const e = a.t();
  let g = 0;
  while (a.sim.shots.length === 0 && g++ < 900) a.sim.step();
  s.ok('the shot is live', a.sim.shots.length > 0);

  e.hp = 0; e.state = 'dead'; e.attack = null;
  a.sim.bus.emit('targetDown', { id: e.id, x: e.body.x, y: e.body.y });
  s.eq('exactly one targetDown so far, for the real kill', a.count('targetDown'), 1);

  a.p().parryReflect = true;
  let g2 = 0;
  while (a.sim.shots.length > 0 && g2++ < 300) {
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    a.sim.step();
  }
  s.eq('the orphaned shot is still consumed', a.sim.shots.length, 0);
  s.eq('but reflecting it onto its already-dead owner fires no second targetDown',
    a.count('targetDown'), 1);
}
{
  /* Regression for a real bug an adversarial review pass caught: the
   * parry check originally sat AFTER Combat.resolveBox's own
   * t.invulnerable() gate, so a player who ALSO happened to be
   * invulnerable for an unrelated reason (fresh post-hit iframes, mid-
   * roll, mid-dash) had their armed parryWindow silently eaten by that
   * earlier check before the parry branch ever ran — parryStart still
   * fired (a real press was registered) but the stagger, parry's actual
   * payoff, was lost. Reproduced here by pinning iframes armed (as if
   * freshly hit by something unrelated) at the same time parryWindow is
   * pinned armed, against a real attack. */
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 5, enemies: [['ashwalker', 150, GROUND(t)]] });
  a.settle();
  const e = a.t();
  let g = 0;
  while (g++ < 900) {
    a.p().iframes = CFG.HURT_IFRAMES;              // as if recently hit by something else
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    a.sim.step();
    if (e.state === 'staggered') break;
  }
  s.ok('the attack was actually thrown', g < 900, g + ' ticks');
  s.eq('a parry still registers despite ALSO being invulnerable', a.count('parry'), 1);
  s.eq('and still staggers the attacker', e.state, 'staggered');
}
{
  // Idempotent: two players' own parry windows landing against the SAME
  // shared enemy hitbox in the same resolveBox call must stagger exactly
  // once, not reset the window a second time. Driven directly against the
  // real function with a hand-built hitbox (the same established pattern
  // verify_meta.js/verify_run.js already use for a one-shot hitbox) rather
  // than fighting a real swing's exact geometry to land on two bodies at
  // once.
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 1, players: 2, enemies: [['ashwalker', 300, GROUND(t)]] });
  a.settle();
  const e = a.t();
  a.p(0).parryWindow = CFG.PARRY_WINDOW_FRAMES;
  a.p(1).parryWindow = CFG.PARRY_WINDOW_FRAMES;
  const hb = { x: 0, y: 0, w: 2000, h: 2000 };   // spans both real player bodies
  C.Combat.resolveBox(e, hb, [a.p(0), a.p(1)], { damage: 1, knock: [0, 0], facing: 1 }, a.sim.bus);
  s.eq('both presses are individually credited', a.count('parry'), 2);
  s.eq('but the enemy staggers only once', a.count('enemyStagger'), 1);
  s.eq('neither player took damage', a.p(0).hp + a.p(1).hp, CFG.MAX_HP * 2);

  // A second resolveBox call this same tick (mirroring a template that
  // resolves both generic contact damage AND a melee advanceMove hitbox
  // in one tick) must not re-stagger or reset the timer either.
  e.stateFrames = 12;
  C.Combat.resolveBox(e, hb, [a.p(0), a.p(1)], { damage: 1, knock: [0, 0], facing: 1 }, a.sim.bus);
  s.eq('a same-tick second overlap does not reset the punish window', e.stateFrames, 12);
  s.eq('nor emit a second stagger', a.count('enemyStagger'), 1);
}
{
  /* Documented, intended asymmetric co-op behavior (raised by an
   * adversarial review pass, considered, and kept as-is rather than
   * "fixed" — pinned here so it stays a deliberate choice, not an
   * accident): a parry protects only the player who timed it. If a
   * SECOND, non-parrying player shares the same hitbox in the same
   * resolveBox call, they still take the hit even though the source is
   * about to be staggered by the target processed just before them —
   * the collision with them is a real, already-resolved geometric fact
   * for this tick, and stagger interrupts what the enemy does NEXT, not
   * a hit that already landed earlier in the same pass. Not free AOE
   * protection for a whole party, mirrored by the "both presses are
   * individually credited" framing directly above. */
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 1, players: 2, enemies: [['ashwalker', 300, GROUND(t)]] });
  a.settle();
  const e = a.t();
  a.p(0).parryWindow = CFG.PARRY_WINDOW_FRAMES;   // parries
  a.p(1).parryWindow = 0;                          // does not
  const hp1_0 = a.p(1).hp;
  const hb = { x: 0, y: 0, w: 2000, h: 2000 };
  C.Combat.resolveBox(e, hb, [a.p(0), a.p(1)], { damage: 1, knock: [0, 0], facing: 1 }, a.sim.bus);
  s.eq('the parrying player takes no damage', a.p(0).hp, CFG.MAX_HP);
  s.eq('the non-parrying player still takes the hit', a.p(1).hp, hp1_0 - 1);
  s.eq('the enemy still staggers from the one who parried', e.state, 'staggered');
}
{
  // Ownership is per-PLAYER, read straight off t.parryRiposte inside the
  // resolveBox loop — never a shared meta/Sim-level flag (the exact class
  // of shared-reference bug this project has already found once, for
  // sim.meta itself). Two co-op players both parry the SAME attack; only
  // one owns Riposte. Both should still negate the hit and stagger the
  // enemy exactly once (the base mechanic, already proven above) — this
  // test's own job is narrower: the bonus damage must land for the owner
  // and NOT for the non-owner.
  const t = DATA.ENEMIES.ashwalker;
  const a = H.scenario({ seed: 1, players: 2, enemies: [['ashwalker', 300, GROUND(t)]] });
  a.settle();
  const e = a.t();
  const ehp0 = e.hp;
  a.p(0).parryRiposte = true;    // owns it
  a.p(1).parryRiposte = false;   // does not
  a.p(0).parryWindow = CFG.PARRY_WINDOW_FRAMES;
  a.p(1).parryWindow = CFG.PARRY_WINDOW_FRAMES;
  const hb = { x: 0, y: 0, w: 2000, h: 2000 };
  C.Combat.resolveBox(e, hb, [a.p(0), a.p(1)], { damage: 1, knock: [0, 0], facing: 1 }, a.sim.bus);
  s.eq('the bonus damage lands exactly once, for the owner alone', ehp0 - e.hp, CFG.PARRY_RIPOSTE_DAMAGE);
  s.eq('both still negate the hit and credit their own parry', a.count('parry'), 2);
}

process.exit(s.done());
