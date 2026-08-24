/* ===========================================================================
 * tests/verify_combat.js  —  hits land, once, where the blade actually is
 * ---------------------------------------------------------------------------
 * Geometry every test shares: floor surface y = 608, player rests at y = 586
 * spawned at x = 80 (body 80..90), dummies are 12x20 and rest at y = 588.
 *
 * As in verify_move, nothing here recomputes a hitbox to compare against. The
 * suite puts a dummy somewhere, swings, and reads what happened to it.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_combat');
const C = H.loadSim();
const CFG = C.CFG;

const DUMMY_Y = 588;

function fresh(spec) {
  const a = H.scenario(spec);
  a.settle();
  return a;
}
// A dummy squarely in the path of a right-facing slash.
const inFront = (hp) => [[96, DUMMY_Y, hp === undefined ? 30 : hp]];

// Swing once and let the whole move (plus any hitstop) play out.
function swing(a, ticks) {
  a.hold('attack').step(1).release('attack');
  a.step(ticks === undefined ? 40 : ticks);
  return a;
}

/* ============================================================ the machine */
{
  const a = fresh({ dummies: inFront() });
  a.clearLog();
  a.hold('attack').step(1);
  s.ok('an attack starts on the tick the button goes down', !!a.p().attack);
  s.eq('attackStart is emitted', a.count('attackStart'), 1);
  s.eq('the opening move is the light slash', a.p().attack.id, 'slashA');
  s.eq('the move begins on frame 1', a.p().attack.frame, 1);
  s.ok('the player is action-locked', a.p().actionLock > 0, a.p().actionLock + ' frames');

  a.release('attack');
  let guard = 0;
  while (a.p().attack && guard++ < 200) a.step(1);
  s.eq('the move ends on its own', a.p().attack, null);
  s.eq('attackEnd is emitted', a.count('attackEnd'), 1);
  s.eq('the lock is released with it', a.p().actionLock, 0);
}
{
  // Startup carries no hitbox; the swing does. Read through the same accessor
  // the presenter uses, so a broken accessor fails here too.
  const a = fresh({ dummies: [[400, DUMMY_Y, 30]] });
  a.hold('attack').step(1).release('attack');
  const seen = [];
  for (let i = 0; i < 12; i++) {
    seen.push(C.Combat.activeBox(a.p(), a.sim.rig) ? 1 : 0);
    a.step(1);
  }
  // Sampling begins after the opening tick, so seen[i] is move frame i+1 and
  // the three startup frames are the first three samples.
  s.eq('the hitbox is live for exactly three ticks', seen.reduce((x, y) => x + y, 0), 3);
  s.eq('and not during startup', seen.slice(0, 3).join(''), '000');
}

/* ================================================================== hits */
{
  const a = fresh({ dummies: inFront() });
  const hp0 = a.t().hp;
  a.clearLog();
  swing(a);
  s.eq('a dummy in range is hit', a.count('hit'), 1);
  s.eq('exactly once per move', a.t().hp, hp0 - 6);
  s.eq('light slash damage', hp0 - a.t().hp, 6);
  s.ok('the hit grants the target i-frames', a.t().iframes >= 0);
}
{
  const a = fresh({ dummies: [[300, DUMMY_Y, 30]] });
  const hp0 = a.t().hp;
  a.clearLog();
  swing(a);
  s.eq('a dummy out of range is not hit', a.count('hit'), 0);
  s.eq('and takes no damage', a.t().hp, hp0);
}
{
  // Facing mirrors the box. A dummy behind must not be hit by a forward swing,
  // and the same dummy must be hit once the player turns around.
  // Turn with a ONE-tick tap. Holding the key for six frames walks the player
  // 15px out of position, which moves the swing rather than testing it.
  const behind = () => fresh({ dummies: [[62, DUMMY_Y, 30]] });

  const facingAway = behind();
  facingAway.hold('right').step(1).release('right').step(1);
  facingAway.clearLog();
  swing(facingAway);
  s.eq('a forward swing misses what is behind you', facingAway.count('hit'), 0);

  const turned = behind();
  turned.hold('left').step(1).release('left').step(1);
  s.eq('the player turned', turned.p().facing, -1);
  s.ok('without walking out of position', Math.abs(turned.b().x - 80) < 2,
    'x ' + turned.b().x.toFixed(2));
  turned.clearLog();
  swing(turned);
  s.eq('turning around connects', turned.count('hit'), 1);
}
{
  /* I-frames gate the second hit. Driven off the target's own i-frame counter
   * rather than a tick budget: hitstop freezes that counter along with
   * everything else, so any hand-counted "swing again in N ticks" is wrong the
   * moment a hitstop value changes. */
  const a = fresh({ dummies: inFront() });
  a.clearLog();
  a.hold('attack').step(1).release('attack');
  let g = 0;
  while (a.count('hit') === 0 && g++ < 60) a.step(1);
  s.eq('the first swing connected', a.count('hit'), 1);
  s.ok('the target is invulnerable immediately after', a.t().invulnerable(),
    a.t().iframes + ' frames');

  let g2 = 0;
  while (a.t().iframes > 0 && g2++ < 300) {
    a.release('attack').step(1);
    a.hold('attack').step(1);
  }
  s.eq('nothing lands while i-frames hold', a.count('hit'), 1);

  a.release('attack').step(2);
  a.clearLog();
  swing(a);
  s.eq('once i-frames lapse it connects again', a.count('hit'), 1);
}

/* ================================================================ hitstop */
{
  const a = fresh({ dummies: inFront() });
  a.clearLog();
  a.hold('attack').step(1).release('attack');
  let guard = 0;
  while (a.count('hit') === 0 && guard++ < 60) a.step(1);
  s.eq('the light hit lands', a.count('hit'), 1);
  s.eq('and freezes for the light duration', a.sim.hitstop, CFG.HITSTOP_LIGHT);
}
{
  // Heavy: crouch + attack. More damage, longer freeze.
  const a = fresh({ dummies: inFront(60) });
  a.hold('down').step(2);
  a.clearLog();
  a.hold('attack').step(1).release('attack');
  s.eq('crouch + attack is the heavy', a.p().attack.id, 'heavy');
  let guard = 0;
  while (a.count('hit') === 0 && guard++ < 90) a.step(1);
  s.eq('the heavy lands', a.count('hit'), 1);
  s.eq('heavy damage', a.count('hit') ? a.events('hit')[0].payload.damage : 0, 14);
  s.eq('and freezes for the heavy duration', a.sim.hitstop, CFG.HITSTOP_HEAVY);
  s.ok('the heavy hits harder than the light', 14 > 6);
}

/* ================================================================= combo */
{
  const a = fresh({ dummies: inFront(80) });
  a.clearLog();
  a.hold('attack').step(1).release('attack');
  const chainFrom = a.sim.rig.move('slashA').chainFrom;

  // Pressing during startup must not be swallowed — the buffer holds it and
  // it fires the moment the window opens.
  a.step(1);
  a.hold('attack').step(1).release('attack');
  s.eq('an early chain press does not restart the move', a.p().attack.id, 'slashA');

  let guard = 0;
  while (a.p().attack && a.p().attack.id === 'slashA' && guard++ < 60) a.step(1);
  s.eq('the buffered press chained into slashB', a.p().attack ? a.p().attack.id : null, 'slashB');
  s.ok('the chain opened no earlier than the window', chainFrom > 0);
  s.eq('two moves started in total', a.count('attackStart'), 2);
}
{
  // slashB ends the chain; a third press starts a fresh slashA instead.
  const a = fresh({ dummies: inFront(120) });
  a.clearLog();
  swing(a, 60);
  swing(a, 60);
  swing(a, 60);
  const starts = a.events('attackStart').map((e) => e.payload.move);
  s.eq('a fresh press after the chain restarts it', starts.join(','), 'slashA,slashA,slashA');
}

/* =============================================================== weapons
 * D7: a weapon is two move IDs (10-data.js), nothing more. These tests
 * exist to prove that claim against the real Combat.begin/resolveBox path
 * — not to re-test chaining or hit resolution, which the sections above
 * already cover generically for whatever move is actually in flight. */
{
  const a = fresh({ dummies: inFront() });
  s.eq('the default weapon is the blade', a.p().weapon, 'blade');
  a.clearLog();
  a.hold('attack').step(1).release('attack');
  s.eq('the blade opens with slashA', a.p().attack.id, 'slashA');
}
{
  const a = fresh({ dummies: inFront() });
  a.p().weapon = 'daggers';
  a.clearLog();
  a.hold('attack').step(1).release('attack');
  s.eq('equipping daggers changes the opening move', a.p().attack.id, 'daggerA');

  let guard = 0;
  while (a.p().attack && guard++ < 400) a.step(1);
  s.eq('daggerA ends on its own like any other move', a.p().attack, null);
}
{
  // The heavy slot is weapon-specific too — crouch+attack must reach
  // daggerHeavy, not the blade's own 'heavy', once daggers are equipped.
  const a = fresh({ dummies: inFront() });
  a.p().weapon = 'daggers';
  a.clearLog();
  a.hold('down').hold('attack').step(1).release('attack');
  s.eq('crouch+attack with daggers equipped opens daggerHeavy', a.p().attack.id, 'daggerHeavy');
}
{
  // The dagger chain is three hits, not two — daggerA -> daggerB ->
  // daggerC — and daggerC ends the combo, same shape as slashA -> slashB
  // ending the blade's, just one hit longer. Proves the weapon change
  // didn't accidentally also change the (unrelated) chain machinery.
  //
  // swing()'s own long gap between presses is deliberately built to let
  // each move's chain window close before the next press (that's what the
  // blade's own "a fresh press after the chain restarts it" test above
  // relies on) — it cannot be used to prove chaining, only its absence.
  // Chaining needs the early-buffered-press technique instead: press again
  // well before the current move ends, and let the buffer hold it until
  // the window actually opens, the same technique the blade's own combo
  // test (above) uses for its one chain link, just carried one hit further.
  const a = fresh({ dummies: inFront(200) });
  a.p().weapon = 'daggers';
  a.clearLog();

  a.hold('attack').step(1).release('attack');
  s.eq('opens on daggerA', a.p().attack.id, 'daggerA');
  a.step(1);
  a.hold('attack').step(1).release('attack');       // buffered early, well before chainFrom
  let g1 = 0;
  while (a.p().attack && a.p().attack.id === 'daggerA' && g1++ < 40) a.step(1);
  s.eq('chains into daggerB', a.p().attack ? a.p().attack.id : null, 'daggerB');

  a.step(1);
  a.hold('attack').step(1).release('attack');
  let g2 = 0;
  while (a.p().attack && a.p().attack.id === 'daggerB' && g2++ < 40) a.step(1);
  s.eq('chains into daggerC', a.p().attack ? a.p().attack.id : null, 'daggerC');

  s.eq('three moves started, all real swings', a.count('attackStart'), 3);
  s.eq('daggerC declares no further chain — it ends the combo',
    C.RIG.move('daggerC').data.chain, null);
}
{
  // Real damage, through the unmodified Combat.resolveBox path — the
  // weapon change is only ever about which move starts a swing, never
  // about how a hit resolves once one is in flight.
  const a = fresh({ dummies: inFront(30) });
  a.p().weapon = 'daggers';
  const hp0 = a.t().hp;
  swing(a, 60);
  s.ok('a dagger swing lands real damage', a.t().hp < hp0, hp0 + ' -> ' + a.t().hp);
  s.eq('for exactly the move\'s own declared amount',
    hp0 - a.t().hp, C.RIG.move('daggerA').data.damage);
}
{
  // A second weapon existing does not perturb the first. Same scripted
  // fight as the blade's own determinism check, weapon field included, so
  // a future weapon-switching feature has hash coverage from day one.
  function run() {
    const a = H.scenario({ seed: 6, log: false, dummies: inFront(200) });
    a.settle();
    a.p().weapon = 'daggers';
    for (let n = 0; n < 400; n++) {
      a.pad().set('attack', n % 17 === 0).set('right', n % 53 < 30);
      a.sim.step();
    }
    return a;
  }
  const r1 = run(), r2 = run();
  s.ok('a dagger-equipped fight is deterministic (L4)', r1.sim.hash() === r2.sim.hash(), '400 ticks');
}

/* ---------------------------------------------------- weapons #3 and #4
 * D9's roster is now complete. Same generic scrutiny as daggers above — the
 * point of D7 is that a third and fourth weapon cost nothing here beyond
 * proving they slot into the exact same machinery, not new combat code. */
{
  const a = fresh({ dummies: inFront() });
  a.p().weapon = 'warmaul';
  a.clearLog();
  a.hold('attack').step(1).release('attack');
  s.eq('equipping warmaul changes the opening move', a.p().attack.id, 'maulA');
}
{
  // The heavy slot is weapon-specific too, same as daggers above.
  const a = fresh({ dummies: inFront() });
  a.p().weapon = 'warmaul';
  a.clearLog();
  a.hold('down').hold('attack').step(1).release('attack');
  s.eq('crouch+attack with warmaul equipped opens maulHeavy', a.p().attack.id, 'maulHeavy');
}
{
  // Warmaul's light move declares chain: null — no combo at all. Three
  // separate swings, each spaced past the previous one's own end (the same
  // shape as the blade's "a fresh press after the chain restarts it" test),
  // must all open on maulA again. There is no second move to chain into, so
  // this is really checking that "no chain" behaves as a clean, repeatable
  // single hit rather than silently eating the second and third presses.
  //
  // This alone does NOT drive a press into Combat.begin's MID-MOVE branch
  // (the one that actually reads m.data.chain/m.chainFrom) — swing()'s own
  // long gap means player.attack is already null again by the next press,
  // so every press here takes the fresh-swing path instead. The next block
  // covers the branch this one cannot reach.
  const a = fresh({ dummies: inFront() });
  a.p().weapon = 'warmaul';
  a.clearLog();
  swing(a, 60);
  swing(a, 60);
  swing(a, 60);
  const starts = a.events('attackStart').map((e) => e.payload.move);
  s.eq('every warmaul swing is a fresh maulA — never a chain', starts.join(','), 'maulA,maulA,maulA');
}
{
  // The branch the test above cannot reach: a press buffered WHILE maulA is
  // still active, squarely inside Combat.begin's mid-move branch
  // (`if (!m.data.chain || cur.frame < m.chainFrom) return;`). Since
  // maulA.chain is null, that branch must return without ever consuming the
  // buffered press — proven here by watching every id seen for the rest of
  // the swing (must stay 'maulA', never a phantom continuation) and that
  // exactly one attackStart fires despite two presses. The buffer's own
  // PENDING_FRAMES window (8) is shorter than maulA's own length (13), so
  // by the time this second press would otherwise matter the move has
  // already ended on its own — matching how a real player experiences it: a
  // hopeful early re-press just does nothing extra, it does not queue a
  // free second hit. A later, genuinely fresh press after the swing is well
  // and truly over still opens a normal new maulA, proving the mid-move
  // refusal above didn't also break the ordinary open-a-swing path.
  const a = fresh({ dummies: inFront() });
  a.p().weapon = 'warmaul';
  a.clearLog();
  a.hold('attack').step(1).release('attack');
  s.eq('opens on maulA', a.p().attack.id, 'maulA');

  a.step(2);
  a.hold('attack').step(1).release('attack');   // buffered mid-swing, well inside PENDING_FRAMES
  const seenIds = new Set();
  let guard = 0;
  while (a.p().attack && guard++ < 40) { seenIds.add(a.p().attack.id); a.step(1); }
  s.eq('a mid-swing buffered press never chains into anything else',
    [...seenIds].join(','), 'maulA');
  s.eq('exactly one swing started — the buffered press did not sneak in a second',
    a.count('attackStart'), 1);

  a.hold('attack').step(1).release('attack');
  s.eq('a later, genuinely fresh press still opens a normal new maulA',
    a.p().attack ? a.p().attack.id : null, 'maulA');
  s.eq('two real swings total', a.count('attackStart'), 2);
}
{
  // Thornspear's chain is FOUR hits, one longer than the daggers' three —
  // same buffered-early-press technique, carried one hit further again.
  const a = fresh({ dummies: inFront(200) });
  a.p().weapon = 'thornspear';
  a.clearLog();

  a.hold('attack').step(1).release('attack');
  s.eq('opens on spearA', a.p().attack.id, 'spearA');
  a.step(1);
  a.hold('attack').step(1).release('attack');
  let g1 = 0;
  while (a.p().attack && a.p().attack.id === 'spearA' && g1++ < 40) a.step(1);
  s.eq('chains into spearB', a.p().attack ? a.p().attack.id : null, 'spearB');

  a.step(1);
  a.hold('attack').step(1).release('attack');
  let g2 = 0;
  while (a.p().attack && a.p().attack.id === 'spearB' && g2++ < 40) a.step(1);
  s.eq('chains into spearC', a.p().attack ? a.p().attack.id : null, 'spearC');

  a.step(1);
  a.hold('attack').step(1).release('attack');
  let g3 = 0;
  while (a.p().attack && a.p().attack.id === 'spearC' && g3++ < 40) a.step(1);
  s.eq('chains into spearD', a.p().attack ? a.p().attack.id : null, 'spearD');

  s.eq('four moves started, all real swings', a.count('attackStart'), 4);
  s.eq('spearD declares no further chain — it ends the combo',
    C.RIG.move('spearD').data.chain, null);
}
{
  // Real damage through the unmodified resolver again, this time for
  // maulA (13) — the single biggest LIGHT-classed hit in the whole game
  // (blade's slashA is 6, daggerA is 4, spearA is 3) — proving the
  // weapon-scale/damage path holds for an extreme value, not just the
  // small numbers blade/daggers use.
  const a = fresh({ dummies: inFront(30) });
  a.p().weapon = 'warmaul';
  const hp0 = a.t().hp;
  swing(a, 60);
  s.ok('a warmaul swing lands real damage', a.t().hp < hp0, hp0 + ' -> ' + a.t().hp);
  s.eq('for exactly the move\'s own declared amount',
    hp0 - a.t().hp, C.RIG.move('maulA').data.damage);
  s.eq('maulA is the biggest hit among any LIGHT-classed move in the game',
    C.RIG.move('maulA').data.damage, Math.max(
      C.RIG.move('slashA').data.damage, C.RIG.move('daggerA').data.damage,
      C.RIG.move('spearA').data.damage, C.RIG.move('maulA').data.damage));
}
{
  // maulHeavy — crouch+attack with warmaul equipped — is the actual single
  // biggest hit in the WHOLE game, heavies included (20, above blade's own
  // heavy at 14). Same resolver, same rounding, no separate code path.
  const a = fresh({ dummies: inFront(30) });
  a.p().weapon = 'warmaul';
  const hp0 = a.t().hp;
  a.hold('down').hold('attack').step(1).release('attack').release('down');
  s.eq('crouch+attack opens maulHeavy', a.p().attack.id, 'maulHeavy');
  a.step(60);
  s.ok('a maulHeavy swing lands real damage', a.t().hp < hp0, hp0 + ' -> ' + a.t().hp);
  s.eq('for exactly the move\'s own declared amount',
    hp0 - a.t().hp, C.RIG.move('maulHeavy').data.damage);
  s.eq('maulHeavy really is the single biggest hit in the whole game',
    C.RIG.move('maulHeavy').data.damage, Math.max(
      C.RIG.move('heavy').data.damage, C.RIG.move('daggerHeavy').data.damage,
      C.RIG.move('spearHeavy').data.damage, C.RIG.move('maulHeavy').data.damage));
}
{
  // A third and fourth weapon existing does not perturb determinism either.
  function run(weapon) {
    const a = H.scenario({ seed: 7, log: false, dummies: inFront(200) });
    a.settle();
    a.p().weapon = weapon;
    for (let n = 0; n < 400; n++) {
      a.pad().set('attack', n % 17 === 0).set('right', n % 53 < 30).set('down', n % 41 < 5);
      a.sim.step();
    }
    return a;
  }
  const m1 = run('warmaul'), m2 = run('warmaul');
  s.ok('a warmaul-equipped fight is deterministic (L4)', m1.sim.hash() === m2.sim.hash(), '400 ticks');
  const t1 = run('thornspear'), t2 = run('thornspear');
  s.ok('a thornspear-equipped fight is deterministic (L4)', t1.sim.hash() === t2.sim.hash(), '400 ticks');
}

/* ============================================================ slam impact
 * The slam has always had landing FX (hitstop, screen shake) — this proves
 * it now actually deals damage too, through the same Combat.resolveBox
 * every other hit in the game uses, never a second hp-subtraction path.
 * Rest body at spawn: x 80..90, y 586..608 (measured, not assumed). The AOE
 * is two boxes flanking the body: left 58..80, right 90..112, both
 * y 594..608 (14px up from the feet). */
function slam(a) {
  a.tap('jump').step(5);
  a.tap('down');
  let g = 0;
  while (!a.b().onGround && g++ < 200) a.step(1);
  return a;
}
{
  // The positive case first (L8-adjacent discipline this project has hit
  // before, verify_stats v0.2.9): prove a slam CAN deal damage before
  // trusting any test that asserts it did not.
  const a = fresh({ dummies: [[95, DUMMY_Y, 30]] });   // inside the right box
  const hp0 = a.t().hp;
  a.clearLog();
  slam(a);
  s.ok('a landed slam damaged a target actually in range', a.t().hp < hp0,
    hp0 + ' -> ' + a.t().hp);
  s.eq('for exactly SLAM_DAMAGE (fresh stats, scale 1x)', hp0 - a.t().hp, C.CFG.SLAM_DAMAGE);
  s.eq('the hit event names the slam, not a rig move id', a.events('hit')[0].payload.move, 'slam');
}
{
  // The LEFT box, proven independently — not just the mirror of the right
  // one assumed to work the same way.
  const a = fresh({ dummies: [[65, DUMMY_Y, 30]] });   // inside the left box
  const hp0 = a.t().hp;
  slam(a);
  s.ok('the left-side box also lands real damage', a.t().hp < hp0, hp0 + ' -> ' + a.t().hp);
}
{
  // A target just past the right box's outer edge (112) — genuinely out of
  // range, not merely "far away", so the boundary itself is what's tested.
  const a = fresh({ dummies: [[113, DUMMY_Y, 30]] });
  const hp0 = a.t().hp;
  slam(a);
  s.eq('a target just outside the right box takes no damage', a.t().hp, hp0);
}
{
  // The VERTICAL boundary (SLAM_HIT_H), never actually exercised above: a
  // grounded dummy's own 20px body already spans nearly the whole plausible
  // AOE height once anchored to the feet, so the tests above pass unchanged
  // for any SLAM_HIT_H from 1 to 1000 — a real, adversarially-found gap.
  // Dummies fall under gravity like everything else (confirmed directly:
  // one placed 560px up is already resting on the floor by the time a slam
  // lands, ~14 ticks later), so a genuinely elevated target has to be
  // pinned in place each tick — representing a real case (an enemy mid-jump,
  // or standing on a raised platform) rather than a synthetic probe.
  function pinnedSlam(a, y) {
    a.tap('jump').step(5);
    a.tap('down');
    let g = 0;
    while (!a.b().onGround && g++ < 200) {
      a.sim.targets[0].body.y = y;
      a.sim.targets[0].body.vy = 0;
      a.step(1);
    }
    return a;
  }
  const above = fresh({ dummies: [[95, 560, 30]] });
  const hp0a = above.t().hp;
  pinnedSlam(above, 560);   // spans 560..580 — clear of the 594..608 AOE band
  s.eq('a target pinned well above the AOE band takes no damage', above.t().hp, hp0a);

  const withinReach = fresh({ dummies: [[95, 560, 30]] });
  const hp0b = withinReach.t().hp;
  pinnedSlam(withinReach, 585);   // spans 585..605 — genuinely overlaps 594..605
  s.ok('a target pinned within the AOE\'s real vertical reach takes damage',
    withinReach.t().hp < hp0b, hp0b + ' -> ' + withinReach.t().hp);
}
{
  // Same boundary, left side.
  const a = fresh({ dummies: [[44, DUMMY_Y, 30]] });
  const hp0 = a.t().hp;
  slam(a);
  s.eq('a target just outside the left box takes no damage', a.t().hp, hp0);
}
{
  // Knockback pushes AWAY FROM the landing point, not in one shared
  // direction the way a directional swing's single `facing` would — the
  // entire reason this is two resolveBox calls instead of one.
  const a = fresh({ dummies: [[95, DUMMY_Y, 30], [65, DUMMY_Y, 30]] });
  const rightX0 = a.sim.targets[0].body.x, leftX0 = a.sim.targets[1].body.x;
  slam(a);
  // A connecting slam requests CFG.HITSTOP_HEAVY, which freezes the whole
  // sim (targets included) for that many ticks — knock is applied as
  // VELOCITY the instant the hit lands, but only becomes a real position
  // change once a target actually gets to update() again, same as every
  // other hit in the game. Step past the freeze before reading position.
  a.step(C.CFG.HITSTOP_HEAVY + 3);
  s.ok('the right-side target is pushed further right',
    a.sim.targets[0].body.x > rightX0,
    rightX0 + ' -> ' + a.sim.targets[0].body.x);
  s.ok('the left-side target is pushed further left',
    a.sim.targets[1].body.x < leftX0,
    leftX0 + ' -> ' + a.sim.targets[1].body.x);
}
{
  // A slam landing on nothing still requests only the base landing hitstop
  // (6, already covered by verify_move) — a slam that actually CONNECTS
  // requests the bigger CFG.HITSTOP_HEAVY instead, the same "biggest hits
  // get the biggest freeze" rule every weapon's own heavy already follows.
  const empty = fresh();
  slam(empty);
  s.eq('a whiffed slam requests only the base landing hitstop', empty.sim.hitstop, 6);

  const hit = fresh({ dummies: [[95, DUMMY_Y, 30]] });
  slam(hit);
  s.eq('a connecting slam requests the bigger heavy hitstop instead',
    hit.sim.hitstop, C.CFG.HITSTOP_HEAVY);
}
{
  // Weapon scaling (D2) applies to the slam too — it is not a second,
  // unscaled damage source sitting outside the stat contract.
  const a = fresh({ dummies: [[95, DUMMY_Y, 30]] });
  a.p().stats.verdant = 4;   // blade's own colours include verdant; dominant
  const scale = C.Combat.weaponScale(a.p());
  s.ok('a raised stat really does change this player\'s weapon scale', scale > 1, scale);
  const hp0 = a.t().hp;
  slam(a);
  s.eq('slam damage is rounded, scaled SLAM_DAMAGE — not the flat base',
    hp0 - a.t().hp, Math.round(C.CFG.SLAM_DAMAGE * scale));
}
{
  // The flag Combat.resolveSlam owns (player.slamLanded) must not re-fire on
  // a later, unrelated tick — exactly one hit per landing, not one per tick
  // spent standing on the ground afterward.
  const a = fresh({ dummies: [[95, DUMMY_Y, 30]] });
  slam(a);
  const hpAfterLanding = a.t().hp;
  a.clearLog();
  a.step(60);   // plenty of ticks standing on the floor, doing nothing
  s.eq('no further damage after the landing tick', a.t().hp, hpAfterLanding);
  s.eq('no further hit events either', a.count('hit'), 0);
}
{
  // I-frames are respected — Combat.resolveBox's own check, exercised
  // through this new call path rather than assumed to still apply.
  const a = fresh({ dummies: [[95, DUMMY_Y, 30]] });
  a.t().iframes = 999;
  const hp0 = a.t().hp;
  slam(a);
  s.eq('an invulnerable target takes no slam damage', a.t().hp, hp0);
}
{
  // Determinism (L4): a slam landing on a real target is part of the same
  // scripted-fight guarantee every other damage source already gets.
  function run() {
    const a = H.scenario({ seed: 9, log: false, dummies: [[95, DUMMY_Y, 200]] });
    a.settle();
    for (let n = 0; n < 200; n++) {
      a.pad().set('jump', n === 5).set('down', n === 12).set('right', n % 40 < 10);
      a.sim.step();
    }
    return a;
  }
  const r1 = run(), r2 = run();
  s.ok('a slam-landing fight is deterministic (L4)', r1.sim.hash() === r2.sim.hash(), '200 ticks');
  s.ok('the determinism run actually landed a slam on someone',
    r1.sim.targets[0].hp < 200, r1.sim.targets[0].hp + ' hp');
}

/* ================================================================ cancels */
{
  const a = fresh({ dummies: inFront() });
  a.hold('attack').step(2).release('attack');
  s.ok('mid-swing', !!a.p().attack);
  a.clearLog();
  a.hold('roll').step(1).release('roll');
  s.eq('rolling cancels the attack', a.p().attack, null);
  s.eq('attackCancel is emitted', a.count('attackCancel'), 1);
  s.eq('and the roll actually started', a.p().state, 'roll');
}
{
  const spikes = (Cx) => {
    const W = H.flatWorld(Cx, 120, 40);
    for (let x = 3; x <= 40; x++) W.set(x, 37, Cx.TILE.HAZARD);
    return W;
  };
  const a = fresh({ world: spikes, dummies: inFront() });
  let guard = 0;
  while (a.p().alive() && guard++ < 2000) {
    a.pad().set('attack', guard % 30 === 0);
    a.sim.step();
  }
  s.eq('dying ends the run', a.p().state, 'dead');
  s.eq('and cancels any swing', a.p().attack, null);
}

/* ============================================================ crouch anchor */
{
  // The body shrinks upward when crouching. Anchoring hitboxes to the feet is
  // what keeps a crouched swing at the same height above the ground; anchoring
  // to the body top would drop every box 10px into the floor.
  const a = fresh({ dummies: inFront(60) });
  a.hold('down').step(3);
  s.eq('crouched', a.b().h, CFG.PLAYER_CROUCH_H);
  const box = a.sim.rig.move('heavy').boxes[9];
  const world = C.Combat.toWorld(a.p(), box);
  const feet = a.b().y + a.b().h;
  s.near('the crouched hitbox stays anchored to the feet',
    feet - (world.y + world.h), CFG.PLAYER_H - box.y1, 0.001);

  a.release('down').step(3);
  const standing = C.Combat.toWorld(a.p(), box);
  s.near('and matches the standing anchor', standing.y, a.b().y + box.y0, 0.001);
}

/* ================================================================== drift */
{
  const free = fresh({ dummies: [[400, DUMMY_Y, 30]] });
  free.hold('right').step(90);
  const x0 = free.b().x;
  free.step(30);
  const freeDist = free.b().x - x0;

  const swinging = fresh({ dummies: [[400, DUMMY_Y, 30]] });
  swinging.hold('right').step(90);
  swinging.hold('attack').step(1).release('attack');
  const x1 = swinging.b().x;
  swinging.step(30);
  const swingDist = swinging.b().x - x1;

  s.ok('swinging slows you down', swingDist < freeDist,
    swingDist.toFixed(1) + 'px vs ' + freeDist.toFixed(1) + 'px');
  s.ok('but does not root you', swingDist > 0, swingDist.toFixed(1) + 'px');
}

/* ================================================================= death */
{
  const a = fresh({ dummies: inFront(6) });     // one light slash kills it
  a.clearLog();
  swing(a);
  s.eq('a dummy can be killed', a.t().hp, 0);
  s.eq('targetDown is emitted', a.count('targetDown'), 1);
  s.ok('a dead dummy is not alive', !a.t().alive());

  a.step(CFG.HIT_IFRAMES + 20);
  a.clearLog();
  swing(a);
  s.eq('and cannot be hit again', a.count('hit'), 0);
}

/* =========================================================== determinism */
{
  const script = (t) => ({
    right: (t % 83) < 50,
    jump: t % 31 === 0,
    attack: t % 17 === 0,
    roll: t % 71 === 0,
    down: (t % 97) > 88
  });
  // Two dummies parked near spawn used to be enough — but Ember Dash means
  // this SAME scripted input (jump and roll pulses can now coincide while
  // airborne) launches the player a real, deterministic 77px on its very
  // first tick rather than leaving that early roll press inert, so the
  // scripted run's trajectory legitimately goes further right than it used
  // to. A wide spread the player's own continuous rightward drift is bound
  // to cross survives that shift (and any future one) instead of depending
  // on an exact hand-tuned stopping point.
  const dummies = [];
  for (let x = 96; x <= 1700; x += 60) dummies.push([x, DUMMY_Y, 200]);

  function run() {
    const a = H.scenario({ seed: 4, log: false, w: 2000, dummies });
    for (let t = 0; t < 700; t++) {
      const k = script(t);
      a.pad().set('right', k.right).set('jump', k.jump)
        .set('attack', k.attack).set('roll', k.roll).set('down', k.down);
      a.sim.step();
    }
    return a;
  }
  const r1 = run(), r2 = run();
  s.ok('combat is deterministic', r1.sim.hash() === r2.sim.hash(), '700 ticks');
  const damaged = r1.sim.targets.filter((t) => t.hp < 200).length;
  s.ok('the determinism run actually fought', damaged > 0,
    damaged + ' of ' + r1.sim.targets.length + ' dummies damaged');

  const fresh2 = H.scenario({ seed: 4, log: false, w: 2000, dummies });
  r1.sim.resetTransient();
  s.ok('resetTransient restores targets too', r1.sim.hash() === fresh2.sim.hash());
}

process.exit(s.done());
