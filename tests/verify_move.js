/* ===========================================================================
 * tests/verify_move.js  —  every movement mechanic MEASURED
 * ---------------------------------------------------------------------------
 * The rule for this file (L8): a number is obtained by driving the sim and
 * watching what happens, never by recomputing it from CFG. `CFG.RUN_SPEED *
 * 60 === measured` proves only that multiplication works. So the expected
 * values below are written as literals, and where a literal is not obvious
 * the comment shows the frame-by-frame arithmetic it came from.
 *
 * Geometry every test shares: floor surface at y = 608, so a 22px body rests
 * at y = 586, and the spawn is x = 80.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_move');
const CFG = H.loadSim().CFG;

const REST = 586;

function fresh(spec) {
  const a = H.scenario(spec);
  a.settle();
  return a;
}

/* ===================================================== horizontal motion */
{
  const a = fresh();
  a.hold('right').step(120);              // well past acceleration
  const x0 = a.b().x;
  a.step(60);                             // exactly one second
  s.near('run speed over 1s (px)', a.b().x - x0, 150, 0.001);
  s.near('run speed per frame (px)', (a.b().x - x0) / 60, 2.5, 0.001);
}
{
  const a = fresh();
  a.hold('right');
  let n = 0;
  while (n < 60) { a.step(1); n++; if (a.b().vx >= 2.5 - 1e-9) break; }
  s.eq('frames from rest to top speed', n, 5);

  a.release('right');
  let m = 0;
  while (m < 60) { a.step(1); m++; if (a.b().vx === 0) break; }
  s.eq('frames from top speed to stop', m, 5);
}
{
  const a = fresh();
  a.hold('right').step(3);
  s.eq('facing right', a.p().facing, 1);
  a.release('right').hold('left').step(3);
  s.eq('facing left', a.p().facing, -1);
  a.hold('right').step(3);
  s.eq('opposing input cancels', a.pad().axis(), 0);
  s.eq('facing holds through a cancel', a.p().facing, -1);
}

/* ================================================================ jumping
 * Gravity is applied on the same tick as the impulse, so the rise is
 * sum(5.55 - 0.3k) for k = 1..18  =  99.9 - 51.3  =  48.6 px over 18 frames.
 * The fall back to launch height is sum(0.15 + 0.3(m-1)) for m = 1..18,
 * which is also 48.6, so the body is off the ground for 36 frames.
 */
{
  const a = fresh();
  const y0 = a.b().y;
  s.eq('rests at the expected height', y0, REST);

  a.hold('jump');
  const top = a.apex();
  s.near('jump apex (px)', y0 - top, 48.6, 0.001);
  s.near('jump apex (tiles)', (y0 - top) / CFG.TILE, 3, 0.05);
}
{
  const a = fresh();
  a.hold('jump').step(1);
  let rise = 1;
  while (rise < 200 && a.b().vy < 0) { a.step(1); if (a.b().vy < 0) rise++; }
  s.eq('frames spent rising', rise, 18);
}
{
  const a = fresh();
  a.hold('jump').step(1);
  let air = 0;
  while (air < 400 && !a.b().onGround) { air++; a.step(1); }
  s.eq('full jump airtime (frames)', air, 36);
  s.between('airtime inside the documented band', air, 30, 48);
  s.near('lands back at launch height', a.b().y, REST, 0.001);
}
{
  // Variable height. Releasing on the first frame cuts the arc once.
  const full = fresh();
  const fy = full.b().y;
  full.hold('jump');
  const fullApex = fy - full.apex();

  const hop = fresh();
  const hy = hop.b().y;
  hop.pressFor('jump', 1);
  const hopApex = hy - hop.apex();

  s.ok('short hop is lower than a full jump', hopApex < fullApex,
    hopApex.toFixed(2) + ' < ' + fullApex.toFixed(2));
  s.between('short hop keeps a usable height', hopApex, 8, 24);

  // The cut fires once, not every frame it is held released; otherwise vy
  // would be pinned near zero and the hop would hang.
  const held = fresh();
  held.pressFor('jump', 1);
  held.step(3);
  s.ok('cut applies once, not continuously', held.b().vy > -3 && held.b().vy !== 0,
    'vy ' + held.b().vy.toFixed(3));
}

/* =========================================================== double jump */
{
  const a = fresh();
  a.tap('jump').step(6);
  a.clearLog();
  a.tap('jump');
  s.eq('double jump fires in the air', a.count('doubleJump'), 1);
  s.ok('double jump pushes upward', a.b().vy < 0, 'vy ' + a.b().vy.toFixed(2));

  a.step(4).clearLog();
  a.tap('jump');
  s.eq('there is no triple jump', a.count('doubleJump'), 0);

  // Landing restores it.
  while (!a.b().onGround) a.step(1);
  a.step(1).clearLog();
  a.tap('jump').step(4);
  a.clearLog();
  a.tap('jump');
  s.eq('landing restores the air jump', a.count('doubleJump'), 1);
}

/* ======================================================= wall interaction
 * onWall was already computed every tick by 25-body.js before this — this
 * is the first PLAYER mechanic to act on it. flatWorld's own left/right
 * bounding walls (x=0, x=w-1) are the wall used throughout; no custom world
 * needed. WALL_SLIDE_MAX/WALLJUMP_VEL_X/WALLJUMP_LOCKOUT are initial
 * values, not yet swept the way JUMP_VEL was — this section measures what
 * they actually produce, the same discipline as everywhere else in this
 * file, but does not yet claim they are TUNED, only that they are real. */
{
  // Walk into the left wall and stay grounded — a wall next to solid ground
  // is not a slide opportunity, it is just a wall. Confirms wall-jump does
  // NOT preempt an ordinary ground jump while still standing.
  const a = fresh();
  a.hold('left').step(60);
  s.eq('walked all the way to the wall', a.b().onWall, -1);
  s.ok('still grounded — a wall beside solid ground is not airborne', a.b().onGround);

  a.clearLog();
  a.tap('jump');
  s.eq('a grounded press next to a wall is an ordinary jump', a.count('jump'), 1);
  s.eq('not a wall jump', a.count('wallJump'), 0);
}
{
  // Airborne and holding INTO the wall: must slide, clamped, and refresh
  // the air jump the same way landing does.
  const a = fresh();
  a.hold('left').step(60);                 // pinned at the wall, grounded
  a.hold('jump').step(3).release('jump');  // airborne, still holding left
  a.step(5);
  s.eq('airborne and pressed into the wall', a.p().state, 'wallSlide');
  s.eq('the collision system agrees it is touching the wall', a.b().onWall, -1);

  let maxVy = -99, g = 0;
  while (g++ < 120 && a.p().state === 'wallSlide') { a.step(1); if (a.b().vy > maxVy) maxVy = a.b().vy; }
  s.eq('fall speed clamps to WALL_SLIDE_MAX, not MAX_FALL', maxVy, CFG.WALL_SLIDE_MAX);
  s.ok('the clamp is meaningfully slower than terminal velocity',
    CFG.WALL_SLIDE_MAX < CFG.MAX_FALL * 0.5, CFG.WALL_SLIDE_MAX + ' vs ' + CFG.MAX_FALL);
  s.eq('sliding refreshes the air jump', a.p().airJumps, 1);
}
{
  // The negative case: touching a wall while airborne but NOT holding into
  // it must fall normally. A wall you merely brush past should never snag
  // you — only pressing into one on purpose engages the slide.
  const a = fresh();
  a.hold('left').step(60);
  a.hold('jump').step(3).release('jump');
  a.release('left');                        // let go — drifting, not pressing in
  let sawSlide = false, g = 0;
  while (g++ < 120 && !a.b().onGround) { a.step(1); if (a.p().state === 'wallSlide') sawSlide = true; }
  s.eq('brushing a wall without holding into it never slides', sawSlide, false);
}
{
  // The wall jump itself: held through its own natural apex, same reason
  // every other jump measurement in this file is (a 1-tick tap would
  // trigger JUMP_CUT and understate the real arc).
  const a = fresh();
  a.hold('left').step(60);
  a.hold('jump').step(3).release('jump');
  a.step(5);
  s.eq('airborne and sliding, ready to wall-jump', a.p().state, 'wallSlide');

  const y0 = a.b().y, x0 = a.b().x;
  a.hold('jump');
  let apex = y0, g = 0;
  while (g++ < 200 && a.b().vy < 0) { a.step(1); if (a.b().y < apex) apex = a.b().y; }
  a.release('jump');
  s.eq('a wall jump is announced', a.count('wallJump'), 1);
  s.eq('not counted as an ordinary double jump', a.count('doubleJump'), 0);
  // Reuses JUMP_VEL for the vertical impulse on purpose (00-core.js) — a
  // wall jump's apex should be directly comparable to a normal jump's,
  // not a new number to separately justify.
  s.near('wall jump apex matches a normal jump (px)', y0 - apex, 48.6, 0.001);

  let maxDist = 0, landed = false, g2 = 0;
  while (!landed && g2++ < 300) {
    a.step(1);
    const d = Math.abs(a.b().x - x0);
    if (d > maxDist) maxDist = d;
    if (g2 > 3 && a.b().onGround) landed = true;
  }
  s.ok('pushed measurably away from the wall before landing', maxDist > 4, maxDist.toFixed(1) + 'px');
}
{
  // Ahead of the double jump on purpose (30-player.js): touching a wall
  // while airborne means the wall IS the intent, not a floaty jump in
  // place. Proved the strong way — spend the air jump FIRST, in open air,
  // well clear of any wall (wall jump outranks double jump in the trigger
  // chain, so the double jump can only ever be spent while genuinely away
  // from one), then arrive at the wall with zero air jumps left and confirm
  // a wall jump still fires. A "does this template have capacity left"
  // style check would wrongly fall through to nothing once airJumps hits
  // 0; a wall jump must never be gated behind that resource at all.
  //
  // Held toward the wall from the very first tick and NEVER reversed. A
  // version that walked away from the wall first and tried to turn back
  // mid-air never arrived: AIR_ACCEL is gentle by design (real, deliberate
  // control, not a snap-to), so reversing a held run's worth of momentum
  // needs far more airtime than a jump-plus-double-jump provides. Spawning
  // 50px out (rather than the file's usual 80) is the fix, measured
  // directly — 80px landed the character 8px short of the wall, still
  // airborne time to spare but not quite distance; 50px clears it with
  // margin, still comfortably past the ~5 frames air accel takes to reach
  // top speed, so the double jump is still spent in genuinely open air.
  const a = H.scenario({ spawns: [[50, REST]] });
  a.settle();
  a.hold('left');
  a.tap('jump');                            // ordinary ground jump, heading for the wall
  a.step(4);
  a.tap('jump');                            // spend the double jump, still far from the wall
  s.eq('the air jump is genuinely spent', a.p().airJumps, 0);
  s.eq('spent it in open air, not touching anything', a.b().onWall, 0);

  let g = 0;
  while (g++ < 200 && a.b().onWall === 0 && !a.b().onGround) a.step(1);
  s.ok('drifted back into the wall while still airborne, with zero air jumps left',
    a.b().onWall !== 0 && !a.b().onGround, 'onWall ' + a.b().onWall + ' onGround ' + a.b().onGround);

  a.clearLog();
  a.tap('jump');
  s.eq('a wall jump fires even with no air jump remaining', a.count('wallJump'), 1);
  s.eq('it is never mistaken for a double jump', a.count('doubleJump'), 0);
  s.eq('a wall jump refreshes the air jump too, the same as sliding does', a.p().airJumps, 1);
}

/* ========================================================== ledge grab
 * Real spatial reasoning about the tilemap, not a velocity clamp the way
 * wall slide/jump are — the wall the player is touching has to actually
 * run out, within reach, into a stand-on-able surface. Custom worlds
 * throughout (a short wall/pillar with open sky above it — its own top IS
 * the ledge — plus a platform at the same height to land on).
 *
 * Natural fall-from-far-above approaches turned out too fiddly to reliably
 * land on: horizontal drift (AIR_ACCEL, held the whole way down) and the
 * fall together cross the wall's x-range well before reaching the ledge's
 * height unless carefully timed, and a body whose CURRENT y-span does not
 * yet overlap the wall produces a Y-axis "landed on top" resolution
 * instead of an X-axis "touched the wall" one on the very tick it would
 * otherwise cross into range — found by tracing tick-by-tick, not assumed.
 * Every test below starts the body already positioned so its OWN y-span
 * overlaps the wall's solid rows before the deciding tick runs, the same
 * "hand-tune the approach, measure what it actually does" discipline the
 * double-jump-then-wall-jump test above already uses for its own reason.
 */
function mantleWorld(C, opts) {
  opts = opts || {};
  const w = new C.World(24, 20);
  for (let x = 0; x < 24; x++) w.set(x, 19, C.TILE.SOLID);   // deep floor, far below
  for (let y = 6; y <= 12; y++) w.set(8, y, C.TILE.SOLID);   // the wall/pillar itself
  for (let x = 9; x < 24; x++) w.set(x, 6, C.TILE.SOLID);    // ledge-top platform, same height
  if (opts.ceiling) w.set(8, 4, C.TILE.SOLID);               // blocks headroom above the grab row
  return w;
}
function tallWallWorld(C) {
  const w = new C.World(24, 20);
  for (let x = 0; x < 24; x++) w.set(x, 19, C.TILE.SOLID);
  for (let y = 0; y <= 17; y++) w.set(8, y, C.TILE.SOLID);   // solid well past any reachable height
  return w;
}
function ledgeApproach(spec) {
  const a = H.scenario(spec);
  a.settle();
  a.p().body.x = 118; a.p().body.y = 85;   // y-span 85..107 already overlaps the wall's own solid rows
  a.p().body.vx = 0; a.p().body.vy = 1;
  a.hold('right');
  return a;
}
{
  const a = ledgeApproach({ world: (C) => mantleWorld(C) });
  let g = 0;
  while (a.p().state !== 'ledgeGrab' && g++ < 20) a.step(1);
  s.eq('a falling body held into a real ledge catches it', a.p().state, 'ledgeGrab');
  s.eq('grabbed at the wall\'s own top row (row 5, 6*16=96)', a.b().y, 96);
  s.eq('flush against the wall face, same formula moveX itself uses', a.b().x, 118);
  s.eq('hanging pins vertical velocity to zero', a.b().vy, 0);
  s.eq('ledgeGrab is announced exactly once', a.count('ledgeGrab'), 1);
}
{
  // The negative case: NOT holding into the wall must never grab, same
  // "only pressing in on purpose engages it" rule wall slide already has.
  // Genuinely touches the wall FIRST (one tick held in, proven by onWall
  // becoming nonzero), THEN releases — an adversarial pass found the first
  // draft of this test never made real wall contact at all (vx stayed 0
  // the whole run, since nothing was ever held), so it only ever exercised
  // the outer "touching a wall" guard and never actually drove a body into
  // the "touching, but not pressing in" condition the rule itself is
  // about. Confirmed this version has real teeth: with the `axis ===
  // b.onWall` gate replaced by a bare `true` in a mutated copy of
  // 30-player.js, this exact scenario grabs; unmutated, it never does.
  const a = H.scenario({ world: (C) => mantleWorld(C) });
  a.settle();
  a.p().body.x = 118; a.p().body.y = 85;
  a.p().body.vx = 0; a.p().body.vy = 1;
  a.hold('right').step(1);
  s.eq('genuinely touching the wall first', a.b().onWall, 1);
  a.release('right');
  let g = 0, sawGrab = false;
  while (g++ < 40) { a.step(1); if (a.p().state === 'ledgeGrab') sawGrab = true; }
  s.eq('touching the wall but no longer pressing into it never grabs', sawGrab, false);
}
{
  // A genuinely solid wall face, well clear of its own (distant) top edge,
  // must wall-slide, never grab — the audit half of this mechanic.
  const a = ledgeApproach({ world: (C) => tallWallWorld(C) });
  let g = 0, sawGrab = false;
  while (g++ < 60) { a.step(1); if (a.p().state === 'ledgeGrab') sawGrab = true; }
  s.eq('a solid wall face with no opening nearby never grabs', sawGrab, false);
  s.eq('it wall-slides instead', a.p().state, 'wallSlide');
}
{
  // The same ledge geometry, but a low ceiling blocks the headroom the
  // player's own standing height needs — must not grab either, even though
  // the horizontal wall-ends-here condition is satisfied.
  const a = ledgeApproach({ world: (C) => mantleWorld(C, { ceiling: true }) });
  let g = 0, sawGrab = false;
  while (g++ < 60) { a.step(1); if (a.p().state === 'ledgeGrab') sawGrab = true; }
  s.eq('a ledge with no headroom to climb into is never grabbed', sawGrab, false);
}
{
  // Climbing: jump while hanging repositions onto the ledge and re-grounds
  // on the SAME tick, not one tick later — found and fixed the same way
  // roll's own start frame needed fixing (zero velocity means move()'s
  // Y-step never runs at all, leaving onGround stale for a tick despite
  // the body already standing in the exact right place).
  const a = ledgeApproach({ world: (C) => mantleWorld(C) });
  let g = 0;
  while (a.p().state !== 'ledgeGrab' && g++ < 20) a.step(1);
  a.release('right');
  a.clearLog();
  a.hold('jump').step(1);
  s.eq('climbing is announced exactly once', a.count('ledgeClimb'), 1);
  s.eq('climbing lands squarely inside the ledge\'s own column (col 8, 8*16=128)', a.b().x, 128);
  s.near('feet at the ledge\'s own surface (row 6 top, minus body height)', a.b().y, 96 - CFG.PLAYER_H, 0.001);
  s.eq('re-grounded on the SAME tick as the climb, not one tick later', a.b().onGround, true);
  s.eq('back to an ordinary standing state', a.p().state, 'idle');
  s.eq('the air jump is refreshed, the same generosity every other wall action gives', a.p().airJumps, 1);
}
{
  // Dropping: holding down while hanging releases the grab and resumes a
  // normal fall.
  const a = ledgeApproach({ world: (C) => mantleWorld(C) });
  let g = 0;
  while (a.p().state !== 'ledgeGrab' && g++ < 20) a.step(1);
  a.release('right');
  a.clearLog();
  a.hold('down').step(1);
  s.eq('dropping is announced exactly once', a.count('ledgeRelease'), 1);
  s.eq('back to a normal fall', a.p().state, 'fall');
}
{
  // The hang auto-drops if left alone long enough — a hard timeout, not an
  // indefinite park.
  const a = ledgeApproach({ world: (C) => mantleWorld(C) });
  let g = 0;
  while (a.p().state !== 'ledgeGrab' && g++ < 20) a.step(1);
  a.release('right');
  a.clearLog();
  let g2 = 0;
  while (a.p().state === 'ledgeGrab' && g2++ < CFG.LEDGE_GRAB_MAX_HANG + 10) a.step(1);
  s.eq('an unattended hang auto-drops within LEDGE_GRAB_MAX_HANG', a.p().state, 'fall');
  s.between('close to the declared timeout, not wildly off it',
    g2, CFG.LEDGE_GRAB_MAX_HANG - 2, CFG.LEDGE_GRAB_MAX_HANG + 2);
}
{
  // The same ledge cannot be instantly re-grabbed the moment it is
  // released — same shape as wall jump's own control lockout, here gating
  // the grab itself rather than steering. Measured directly (the same
  // "find the real boundary, don't just assert a rough bound" discipline
  // the coyote-time test above uses): dropped, held back into the wall
  // every tick after, and the FIRST tick a re-grab actually lands is the
  // window — LEDGE_GRAB_LOCKOUT counts down to 0 (inclusive), so the real
  // boundary is exactly that many ticks, not one more.
  //
  // This measurement is only as honest as the geometry it runs on: the body
  // stays parked against the wall the whole time (falling straight back onto
  // the same row detectLedge() already proved), so what stops the earlier
  // ticks is purely the counter, not the body drifting out of the scan
  // window. A much larger LEDGE_GRAB_LOCKOUT could in principle let the body
  // fall far enough that detectLedge() no longer finds THIS row before the
  // lockout itself expires, at which point this test would start measuring
  // fall geometry instead of the lockout — not a concern at the current
  // value, but worth naming rather than assuming away (an adversarial pass
  // flagged the gap).
  const a = ledgeApproach({ world: (C) => mantleWorld(C) });
  let g = 0;
  while (a.p().state !== 'ledgeGrab' && g++ < 20) a.step(1);
  a.hold('down').step(1);            // drop
  s.eq('dropped', a.p().state, 'fall');
  a.hold('right');                   // held back into the wall from the very next tick
  let g2 = 0;
  while (a.p().state !== 'ledgeGrab' && g2++ < CFG.LEDGE_GRAB_LOCKOUT + 5) a.step(1);
  s.eq('the same ledge becomes re-grabbable again after exactly LEDGE_GRAB_LOCKOUT ticks',
    g2, CFG.LEDGE_GRAB_LOCKOUT);
}
{
  // Determinism (L4): a full grab-hang-climb sequence, hashed, twice.
  function run() {
    const a = ledgeApproach({ world: (C) => mantleWorld(C), seed: 11 });
    let g = 0;
    while (a.p().state !== 'ledgeGrab' && g++ < 20) a.step(1);
    a.release('right').step(10);
    a.hold('jump').step(3).release('jump');
    a.step(20);
    return a;
  }
  const r1 = run(), r2 = run();
  s.ok('a grab-hang-climb sequence is deterministic (L4)', r1.sim.hash() === r2.sim.hash());
  s.ok('the determinism run actually climbed, not just hung', r1.count('ledgeClimb') === 1);
}

/* ================================================================ coyote
 * Walk off a ledge, wait k frames, press jump. The largest k that still
 * produces a GROUND jump (not a double jump, which would mask it) is the
 * window. */
{
  let firstFailure = -1;
  for (let k = 0; k <= 10; k++) {
    const a = H.scenario({ world: (C) => H.ledgeWorld(C, 20) });
    a.settle();
    a.hold('right');
    let guard = 0;
    while (a.b().onGround && guard++ < 500) a.step(1);   // run off the edge
    a.step(k);
    a.clearLog();
    a.tap('jump');
    if (a.count('jump') === 0) { firstFailure = k; break; }
  }
  s.eq('coyote grace (frames)', firstFailure, 5);

  // And confirm the frame past the window really becomes a double jump
  // rather than nothing at all.
  const b = H.scenario({ world: (C) => H.ledgeWorld(C, 20) });
  b.settle();
  b.hold('right');
  let guard = 0;
  while (b.b().onGround && guard++ < 500) b.step(1);
  b.step(5).clearLog();
  b.tap('jump');
  s.eq('past the window it is an air jump', b.count('doubleJump'), 1);
}

/* ============================================== buffered / pending input
 * Sweep the tick on which the button is pressed, relative to the first tick
 * the action could possibly succeed. The number of distinct ticks on which
 * a press still fires IS the window. */
function spentInAir() {
  const a = H.scenario();
  a.settle();
  a.tap('jump');
  a.step(5);
  a.tap('jump');          // both jumps gone; falling
  return a;
}

// Same, but with Ember Dash already spent (on cooldown) — isolates the
// roll button's OWN pending-input buffering from dash's higher-priority
// claim on the same button while airborne (below): with dash available, an
// early airborne press fires an immediate dashStart instead of ever
// reaching this buffer at all.
function spentInAirDashSpent() {
  const a = spentInAir();
  a.p().dashCd = 999;
  return a;
}

function windowFor(button, event, make) {
  const probe = make();
  let toGround = 0;
  while (toGround < 400 && !probe.b().onGround) { probe.step(1); toGround++; }
  const G = toGround + 1;      // earliest tick the action can succeed

  let maxEarly = -1;
  for (let k = 0; k <= 14; k++) {
    if (G - k - 1 < 0) break;
    const a = make();
    a.step(G - k - 1);
    a.clearLog();
    a.tap(button);
    a.step(10);
    if (a.count(event) > 0) maxEarly = k;
  }
  return maxEarly + 1;
}

{
  s.eq('jump buffer (frames)', windowFor('jump', 'jump', spentInAir), 5);
  // Scoped to dash-unavailable (see spentInAirDashSpent's own comment) —
  // with dash available, the same early press fires an immediate dash
  // instead of ever landing in this buffer; that race gets its own direct
  // test in the ember dash section below.
  s.eq('pending input hold (frames)', windowFor('roll', 'rollStart', spentInAirDashSpent), 8);

  // Expiry, asserted directly: one frame past the window and nothing fires.
  const probe = spentInAir();
  let toGround = 0;
  while (toGround < 400 && !probe.b().onGround) { probe.step(1); toGround++; }
  const G = toGround + 1;

  const late = spentInAir();
  late.step(Math.max(0, G - 6));
  late.clearLog();
  late.tap('jump');
  late.step(10);
  s.eq('a press one frame too early expires', late.count('jump'), 0);

  // Dash-unavailable again, for the same reason as the buffer measurement
  // above — otherwise this "too early" press would fire an immediate dash
  // and the assertion below would pass for the wrong reason.
  const lateRoll = spentInAirDashSpent();
  lateRoll.step(Math.max(0, G - 9));
  lateRoll.clearLog();
  lateRoll.tap('roll');
  lateRoll.step(12);
  s.eq('a roll one frame too early expires', lateRoll.count('rollStart'), 0);

  // And the buffer counter itself drains rather than sticking.
  const drain = spentInAir();
  drain.hold('jump').step(1).release('jump');
  const armed = drain.pad().pend.jump;
  drain.step(armed);
  s.eq('buffer drains to zero', drain.pad().pend.jump, 0);
}

/* ========================================================= input latency */
{
  const a = fresh();
  const y0 = a.b().y;
  a.hold('jump').step(1);
  s.ok('jump moves the body on the same tick', a.b().y < y0,
    (y0 - a.b().y).toFixed(2) + 'px on tick 1');

  const r = fresh();
  const x0 = r.b().x;
  r.hold('right').step(1);
  s.ok('run moves the body on the same tick', r.b().x > x0);

  const rl = fresh();
  rl.hold('roll').step(1);
  s.eq('roll starts on the same tick', rl.p().state, 'roll');
}

/* ================================================================== roll */
{
  const a = fresh();
  a.hold('right').step(10).release('right');
  const x0 = a.b().x;
  a.clearLog();
  a.hold('roll').step(1).release('roll');

  s.eq('roll begins immediately', a.p().state, 'roll');
  s.ok('i-frames on the first roll frame', a.p().invulnerable());

  let midChecked = false, guard = 0;
  while (a.count('rollEnd') === 0 && guard++ < 60) {
    a.step(1);
    if (guard === 8) midChecked = a.p().invulnerable();
  }

  // Duration measured between the two events, so there is no question about
  // whether the final tick "counts".
  s.eq('roll duration (frames)', a.at('rollEnd') - a.at('rollStart') + 1, 18);
  s.ok('i-frames in the middle of the roll', midChecked);
  s.near('roll distance (px)', a.b().x - x0, 85.5, 0.001);

  const ends = a.events('rollEnd');
  s.eq('rollEnd is emitted once', ends.length, 1);
  s.near('rollEnd reports the distance it covered', ends[0].payload.dist, 85.5, 0.001);
  s.eq('roll shrinks the body', 12, CFG.PLAYER_CROUCH_H);
}
{
  /* "I-frames throughout" asserted the way a player would find out: roll
   * straight through a bed of spikes and come out the other side unhurt.
   * Polling invulnerable() would only re-read the flag the code already set;
   * this measures the consequence. The control run walks the same ground and
   * must bleed, or the test proves nothing. */
  const strip = (C) => {
    const W = H.flatWorld(C, 120, 40);
    for (let x = 7; x <= 9; x++) W.set(x, 37, C.TILE.HAZARD);
    return W;
  };

  const rolled = fresh({ world: strip });
  rolled.hold('roll').step(1).release('roll');
  let g = 0;
  while (rolled.count('rollEnd') === 0 && g++ < 60) rolled.step(1);
  s.ok('the roll crossed the spikes', rolled.b().x > 9 * 16, 'x ' + Math.round(rolled.b().x));
  s.eq('i-frames throughout the roll', rolled.count('hurt'), 0);
  s.eq('and the roll cost no hp', rolled.p().hp, CFG.MAX_HP);

  const walked = fresh({ world: strip });
  walked.hold('right').step(60);
  s.ok('the control run walked the same ground', walked.b().x > 9 * 16);
  s.ok('walking those spikes hurts', walked.count('hurt') > 0, walked.count('hurt') + ' hits');
}
{
  // Cooldown, measured between the rollEnd tick and the next rollStart tick.
  const a = fresh();
  a.clearLog();
  a.hold('roll').step(1).release('roll');
  let g = 0;
  while (a.count('rollEnd') === 0 && g++ < 60) a.step(1);
  const endTick = a.at('rollEnd');

  /* The buffer arms on a press EDGE, so re-pressing needs a released tick in
   * between — holding the button down through the cooldown deliberately does
   * not re-roll. Alternate release/press until one is accepted, then read the
   * tick off the event. */
  let guard2 = 0;
  while (a.count('rollStart') < 2 && guard2++ < 80) {
    a.release('roll').step(1);
    a.hold('roll').step(1);
  }
  s.eq('roll cooldown (frames)', a.at('rollStart', 1) - endTick, 24);

  const b = fresh();
  b.clearLog();
  b.hold('roll').step(1).release('roll');
  let g2 = 0;
  while (b.count('rollEnd') === 0 && g2++ < 60) b.step(1);
  b.step(22);                       // one tick short of the cooldown
  b.clearLog();
  b.tap('roll');
  s.eq('a roll one frame early is refused', b.count('rollStart'), 0);
}

/* ============================================================ ember dash
 * Airborne reuse of the Roll button (abilities spec §2a) — same
 * measured-not-recomputed discipline as roll above (L8).
 */
{
  // Grounded press still rolls — dash never intercepts on the ground,
  // regardless of sharing the same button.
  const a = fresh();
  a.hold('roll').step(1).release('roll');
  s.eq('a grounded press still rolls', a.p().state, 'roll');
}
{
  const a = fresh();
  a.hold('jump').step(1).release('jump');
  let g0 = 0;
  while (a.b().onGround && g0++ < 30) a.step(1);   // leave the ground first
  a.clearLog();
  const x0 = a.b().x;
  a.tap('roll');

  s.eq('an airborne press dashes, not rolls', a.p().state, 'dash');
  s.ok('i-frames on the first dash frame', a.p().invulnerable());

  let midChecked = false, guard = 0;
  while (a.count('dashEnd') === 0 && guard++ < 60) {
    a.step(1);
    if (guard === 6) midChecked = a.p().invulnerable();
  }

  s.eq('dash duration (frames)', a.at('dashEnd') - a.at('dashStart') + 1, 14);
  s.ok('i-frames in the middle of the dash', midChecked);
  s.near('dash distance (px)', a.b().x - x0, 77, 0.001);

  const ends = a.events('dashEnd');
  s.eq('dashEnd is emitted once', ends.length, 1);
  s.near('dashEnd reports the distance it covered', ends[0].payload.dist, 77, 0.001);
}
{
  // Cooldown: a second airborne press right after the first dash ends (and
  // while still airborne, so it could only ever be a dash, never a
  // buffered ground roll) is refused until DASH_COOLDOWN_FRAMES has passed.
  const a = fresh();
  a.hold('jump').step(1).release('jump');
  let g = 0;
  while (a.b().onGround && g++ < 30) a.step(1);
  a.tap('roll');
  let g2 = 0;
  while (a.count('dashEnd') === 0 && g2++ < 60) a.step(1);
  s.ok('still airborne once the dash ends', !a.b().onGround);
  a.clearLog();
  a.tap('roll');
  s.eq('a second dash on cooldown is refused', a.count('dashStart'), 0);
  s.eq('state falls back to fall, not dash', a.p().state, 'fall');
}
{
  /* "I-frames throughout" proved the way a player would find out, same
   * spirit as the roll spike-strip test above: dash STRAIGHT THROUGH a
   * hazard and come out unhurt, with a walking control run over the same
   * geometry that must bleed or the test proves nothing.
   *
   * Roll's own strip embeds hazard tiles in a walkable floor row; dash only
   * ever triggers airborne, so this instead opens a real gap in the floor
   * (both floor rows cleared) with a hazard tile floating at the top of
   * that gap — a body walking off the ledge into it falls through and is
   * hurt, while a body DASHING across the gap at the same height crosses
   * the exact same tile invulnerable. Geometry confirmed by tracing the
   * real per-tick x/y against the hazard's own bounds before this was
   * written, not assumed to line up. */
  const pit = (C) => {
    const W = H.flatWorld(C, 160, 40);
    for (let x = 20; x <= 30; x++) { W.set(x, 38, C.TILE.EMPTY); W.set(x, 39, C.TILE.EMPTY); }
    for (let x = 23; x <= 25; x++) W.set(x, 38, C.TILE.HAZARD);
    return W;
  };

  const dashed = fresh({ world: pit });
  dashed.hold('right');
  let g = 0;
  while (dashed.b().onGround && g++ < 400) dashed.step(1);   // run off the ledge
  dashed.tap('roll');
  let g2 = 0;
  while (dashed.count('dashEnd') === 0 && g2++ < 60) dashed.step(1);
  // The fixed-length dash (77px) ends inside the hazard's own x-range
  // (368-416), not past the far side of the whole 176px-wide pit — that is
  // exactly the point: the overlap is real and mid-flight, not a lucky
  // clean jump over it. 23*16 = 368 is the hazard's own left edge.
  s.ok('the dash reached into the hazard', dashed.b().x > 23 * 16, 'x ' + Math.round(dashed.b().x));
  s.eq('i-frames throughout the dash', dashed.count('hurt'), 0);
  s.eq('and the dash cost no hp', dashed.p().hp, CFG.MAX_HP);

  const walked = fresh({ world: pit });
  walked.hold('right').step(200);
  s.ok('the control run crossed the same gap', walked.b().x > 26 * 16);
  s.ok('walking that hazard hurts', walked.count('hurt') > 0, walked.count('hurt') + ' hits');
}
{
  /* Hitstop is Sim-wide (70-sim.js: the max hitstopRequest across every
   * player), and Sim.step() returns before player.update() runs at all on
   * a frozen tick — so a dash's own timer is hitstop-safe automatically,
   * with no special-casing needed, exactly like every other per-tick timer
   * in this file. Proven directly: a SECOND player lands a real hit on a
   * dummy while the FIRST is mid-dash, so the freeze comes from something
   * entirely outside the dashing player's own state. */
  const a = H.scenario({
    players: 2,
    spawns: [[80, REST], [160, REST]],
    dummies: [[176, REST + 2, 30]]
  });
  a.settle();
  a.hold('jump', 0).step(1).release('jump', 0);
  let g = 0;
  while (a.b(0).onGround && g++ < 30) a.step(1);
  a.tap('roll', 0);
  s.eq('player 0 is dashing', a.p(0).state, 'dash');

  a.hold('attack', 1).step(1).release('attack', 1);

  let sawFrozen = false, drifted = false, h = 0;
  while (h++ < 30) {
    const frozen = a.sim.hitstop > 0;
    const before = a.p(0).dashFrames;
    a.step(1);
    if (frozen) {
      sawFrozen = true;
      if (a.p(0).dashFrames !== before) drifted = true;
    }
  }
  s.ok('a frozen tick actually happened', sawFrozen);
  s.ok('dashFrames does not move on a frozen tick', !drifted);
}
{
  // The buffered-roll-lands-as-ground-roll race: a roll pressed a few
  // frames before landing, with dash unavailable, is NOT lost — it still
  // fires an ordinary ground roll the instant the player lands, via the
  // same general pending-input buffer jump/roll already share.
  const a = spentInAirDashSpent();
  let toGround = 0;
  while (toGround < 400 && !a.b().onGround) { a.step(1); toGround++; }
  const G = toGround + 1;

  const race = spentInAirDashSpent();
  race.step(Math.max(0, G - 6));
  race.clearLog();
  race.tap('roll');
  race.step(10);
  s.eq('a buffered roll still lands as a ground roll', race.count('rollStart'), 1);
  s.eq('never as a dash', race.count('dashStart'), 0);
}

/* ==================================================== dash enhancements
 * Abilities spec §4. Ownership fields are set directly rather than routed
 * through a real purchase — Sim.prototype.buyDashExtraCharge/buyDashExtIframes
 * are proven in verify_meta.js; this file's own job is proving what OWNING
 * one actually changes about the movement itself (L8), the same division
 * of labor buyMaxHp/verify_meta already has with this file's own hp tests.
 */
{
  // Dash Extra Charge: a genuinely SECOND dash, usable even while the
  // ordinary cooldown from the first is still counting down — not merely
  // a shorter cooldown. The bonus charge is what's consumed here, not
  // dashCd (still mid-countdown throughout), and it re-arms dashCd again
  // afterward, so a THIRD dash still needs to wait or land.
  const a = fresh();
  a.p().dashExtraCharge = true;
  a.p().dashCharges = 1;
  a.hold('jump').step(1).release('jump');
  let g = 0;
  while (a.b().onGround && g++ < 30) a.step(1);

  a.tap('roll');
  s.eq('the first dash fires normally', a.p().state, 'dash');
  s.eq('and does not touch the bonus charge', a.p().dashCharges, 1);
  let g2 = 0;
  while (a.count('dashEnd') === 0 && g2++ < 60) a.step(1);
  s.ok('still on cooldown once the first dash ends', a.p().dashCd > 0);

  a.clearLog();
  a.tap('roll');
  s.eq('a second dash fires anyway, off the banked charge', a.p().state, 'dash');
  s.eq('the charge is now spent', a.p().dashCharges, 0);
  let g3 = 0;
  while (a.count('dashEnd') === 0 && g3++ < 60) a.step(1);
  s.ok('the cooldown re-arms after the bonus dash too', a.p().dashCd > 0);

  a.clearLog();
  a.tap('roll');
  s.eq('a third dash, with neither cooldown nor charge, is refused', a.count('dashStart'), 0);

  // Without the enhancement, the exact same sequence only ever gets one.
  const b = fresh();
  b.hold('jump').step(1).release('jump');
  let h = 0;
  while (b.b().onGround && h++ < 30) b.step(1);
  b.tap('roll');
  let h2 = 0;
  while (b.count('dashEnd') === 0 && h2++ < 60) b.step(1);
  b.clearLog();
  b.tap('roll');
  s.eq('without owning it, a second immediate dash is refused', b.count('dashStart'), 0);
}
{
  // Dash Extra Charge's own refresh: ground contact only, not wall/ledge —
  // a deliberate divergence from airJumps' own generosity (00-core.js's
  // own comment on the refresh site).
  const a = fresh();
  a.p().dashExtraCharge = true;
  a.p().dashCharges = 0;
  s.eq('starts unrefilled', a.p().dashCharges, 0);
  a.step(1);
  s.eq('grounded (already settled) refills it on the very next tick', a.p().dashCharges, 1);
}
{
  // Same wall-contact fixture the wall-jump test above already builds
  // (spawn 50px out, run+jump+double-jump to drift into the wall with
  // zero air jumps left, still airborne) — reused rather than a fresh
  // geometry, to isolate exactly one new question: does TOUCHING that
  // wall also refill dashCharges the way it refills airJumps? It must not.
  const a = H.scenario({ spawns: [[50, REST]] });
  a.settle();
  a.p().dashExtraCharge = true;
  a.hold('left');
  a.tap('jump');
  a.step(4);
  a.tap('jump');
  s.eq('genuinely airborne before the charge is zeroed', a.b().onGround, false);
  // Zeroed only once truly airborne — grounded still reads true for one
  // more tick immediately after settle()/before the jump impulse actually
  // leaves the ground (the same reason airJumps refreshes every GROUNDED
  // tick, not once), so zeroing any earlier would just be re-filled right
  // back before the wall is ever reached.
  a.p().dashCharges = 0;
  let g = 0;
  while (g++ < 200 && a.b().onWall === 0 && !a.b().onGround) a.step(1);
  s.ok('drifted into the wall while still airborne', a.b().onWall !== 0 && !a.b().onGround);
  s.eq('touching the wall does NOT refill the bonus charge', a.p().dashCharges, 0);
}
{
  // Dash Extended I-Frames: not a longer dash — a residual invulnerability
  // window immediately AFTER the dash ends, layered on the SAME iframes
  // counter ordinary hurt-invulnerability already uses.
  const a = fresh();
  a.p().dashExtIframes = true;
  a.hold('jump').step(1).release('jump');
  let g = 0;
  while (a.b().onGround && g++ < 30) a.step(1);
  a.tap('roll');
  let g2 = 0;
  while (a.count('dashEnd') === 0 && g2++ < 60) a.step(1);
  s.eq('a residual window opens the instant the dash ends', a.p().iframes, CFG.DASH_EXT_IFRAMES_BONUS);
  s.ok('and state has already left dash (this IS the "extended" part)', a.p().state !== 'dash');
  s.ok('invulnerable() reads it correctly, through the ordinary iframes path', a.p().invulnerable());

  // Without the enhancement, the same dash ends with no residual window.
  const b = fresh();
  b.hold('jump').step(1).release('jump');
  let h = 0;
  while (b.b().onGround && h++ < 30) b.step(1);
  b.tap('roll');
  let h2 = 0;
  while (b.count('dashEnd') === 0 && h2++ < 60) b.step(1);
  s.eq('without owning it, no residual window opens', b.p().iframes, 0);
}
{
  // Never clobbers a LARGER, unrelated iframes value already running —
  // the Math.max-style guard in endDash() exists specifically for this.
  const a = fresh();
  a.p().dashExtIframes = true;
  a.hold('jump').step(1).release('jump');
  let g = 0;
  while (a.b().onGround && g++ < 30) a.step(1);
  a.tap('roll');
  a.p().iframes = CFG.HURT_IFRAMES;   // a much larger window from something else
  let g2 = 0;
  while (a.count('dashEnd') === 0 && g2++ < 60) a.step(1);
  // Decrements exactly one per tick like any other iframes countdown — if
  // endDash() had clobbered it down to DASH_EXT_IFRAMES_BONUS this would
  // read far lower than a plain tick-for-tick countdown from 60 allows.
  s.eq('a larger existing iframes value is never shortened', a.p().iframes, CFG.HURT_IFRAMES - g2);
}

/* ================================================================= parry
 * A lightweight timed flag (abilities spec §2b), not a state — see CFG's
 * own comment for why. Negation itself (the actual damage check) lives in
 * 40-combat.js's Combat.resolveBox and is proven in verify_combat.js
 * alongside the stagger it triggers; this section proves everything that
 * is entirely this file's own: the window/cooldown timing, that it never
 * touches invulnerable(), and that pressing it cancels an in-flight swing.
 */
{
  const a = fresh();
  a.clearLog();
  a.tap('parry');
  s.eq('parryStart is emitted', a.count('parryStart'), 1);
  s.eq('the window arms to PARRY_WINDOW_FRAMES', a.p().parryWindow, CFG.PARRY_WINDOW_FRAMES);

  let g = 0;
  while (a.p().parryWindow > 0 && g++ < 60) a.step(1);
  s.eq('parry window (frames)', g, 12);
  s.eq('a whiffed window sets the cooldown', a.p().parryCd, CFG.PARRY_COOLDOWN_FRAMES);

  a.clearLog();
  a.tap('parry');
  s.eq('a second press on cooldown is refused', a.count('parryStart'), 0);
  s.eq('the window stays unarmed', a.p().parryWindow, 0);

  let g2 = 0;
  while (a.p().parryCd > 0 && g2++ < 60) a.step(1);
  a.clearLog();
  a.tap('parry');
  s.eq('once the cooldown clears a fresh press succeeds', a.count('parryStart'), 1);
  s.eq('rearming the full window', a.p().parryWindow, CFG.PARRY_WINDOW_FRAMES);
}
{
  /* Regression for a real bug an adversarial review pass caught: the
   * trigger's original guard only checked parryCd <= 0, never whether a
   * window was ALREADY armed — since parryCd stays 0 for a window's whole
   * natural countdown (it is only ever set on a WHIFF), mashing the button
   * every tick re-armed the window to full every single time and the
   * cooldown never once triggered, trivializing the whole timing risk.
   * Pressed on every consecutive edge (release+press each tick, so every
   * press is a genuine fresh edge, not swallowed by `pressed()`'s own
   * edge-only semantics) for the window's own full duration and past it. */
  const a = fresh();
  a.hold('parry').step(1);
  s.eq('the first press arms it', a.p().parryWindow, CFG.PARRY_WINDOW_FRAMES);

  let spammed = 0;
  while (a.p().parryWindow > 0 && spammed++ < 60) {
    a.release('parry').step(1);
    a.hold('parry').step(1);
  }
  s.eq('mashing it never re-arms the window early', a.count('parryStart'), 1);
  s.eq('the window still expired on schedule', spammed, 6);   // 12 frames / 2 ticks-per-mash
  s.eq('and the whiff cooldown still applied', a.p().parryCd, CFG.PARRY_COOLDOWN_FRAMES);

  // Keep mashing through the cooldown too — refused on every edge until it
  // genuinely clears, at which point the very next press legitimately
  // succeeds (this loop's own condition stops the instant that happens,
  // so exactly one more arm — never an early one, never a runaway extra).
  let g = 0;
  while (a.p().parryCd > 0 && g++ < 60) {
    a.release('parry').step(1);
    a.hold('parry').step(1);
  }
  s.eq('mashing through the cooldown adds exactly one legitimate arm once it clears', a.count('parryStart'), 2);
}
{
  // The BUTTONS/WINDOW two-map trap this feature specifically named: a
  // regression that fails loudly (not silently) if parry's WINDOW entry
  // is ever dropped. Read straight off Pad, not through the player.
  const Pad = H.loadSim().Pad;
  s.ok('Pad.WINDOW.parry is a real positive number', Pad.WINDOW.parry > 0, Pad.WINDOW.parry);

  const pad = new Pad();
  pad.set('parry', true); pad.update(false);
  s.ok('a fresh press is buffered', pad.buffered('parry'));
  s.ok('and actually consumable', pad.consume('parry'));
  s.ok('consuming clears it', !pad.buffered('parry'));
}
{
  /* Parry deliberately stays OUT of invulnerable() (the whole reason it is
   * a flag and not a state, folded into Roll's shape, would have been) —
   * proven the way a player would find out: pin the window armed EVERY
   * tick (bypassing input, so there is no question of it lapsing between
   * presses) and walk through the exact same hazard strip roll's own test
   * uses. It still bleeds. */
  const strip = (C) => {
    const W = H.flatWorld(C, 120, 40);
    for (let x = 7; x <= 9; x++) W.set(x, 37, C.TILE.HAZARD);
    return W;
  };
  const a = fresh({ world: strip });
  a.hold('right');
  let g = 0;
  while (a.b().x < 9 * 16 + 4 && g++ < 200) {
    a.p().parryWindow = CFG.PARRY_WINDOW_FRAMES;
    a.step(1);
  }
  s.eq('a hazard still damages a player with an armed parry window', a.count('hurt'), 1);
  s.eq('and it cost hp', a.p().hp, CFG.MAX_HP - 1);
}
{
  // Roll/dash cancel an in-flight swing for free, from Combat.step's own
  // per-tick state check. Parry has no state for that check to see, so
  // this proves its own explicit cancel actually fires.
  const a = fresh({ dummies: [[300, 588, 30]] });
  a.hold('attack').step(1).release('attack');
  s.ok('mid-swing before the press', !!a.p().attack);
  a.clearLog();
  a.tap('parry');
  s.eq('parry cancels the in-flight swing', a.p().attack, null);
  s.eq('attackCancel is emitted', a.count('attackCancel'), 1);
  s.eq('and still arms the window the same tick', a.p().parryWindow, CFG.PARRY_WINDOW_FRAMES);
}

/* =============================================================== crouch */
{
  const a = fresh();
  s.eq('stands at full height', a.b().h, 22);
  a.hold('down').step(1);
  s.eq('crouch shrinks the body', a.b().h, 12);
  s.eq('crouch state reported', a.p().state, 'crouch');
  s.near('crouch keeps the feet planted', a.b().y + a.b().h, 608, 0.001);

  a.hold('right').step(120);
  const x0 = a.b().x;
  a.step(60);
  s.near('crouch speed over 1s (px)', a.b().x - x0, 75, 0.001);

  a.release('down').step(2);
  s.eq('stands back up when clear', a.b().h, 22);
}
{
  // A 16px gap: the 12px crouch box fits, the 22px standing box does not.
  const tunnel = (C) => {
    const W = H.flatWorld(C, 120, 40);
    for (let x = 10; x <= 20; x++) W.set(x, 36, C.TILE.SOLID);
    return W;
  };
  const a = fresh({ world: tunnel });
  a.hold('down').step(2);
  s.eq('crouched before the tunnel', a.b().h, 12);
  a.hold('right').step(120);
  s.ok('crouch-walked into the tunnel', a.b().x > 170, 'x ' + Math.round(a.b().x));
  a.release('down').step(3);
  s.eq('cannot stand under a low ceiling', a.b().h, 12);
  a.release('right').hold('left').step(200);
  a.release('left').step(3);
  s.eq('stands again once clear of it', a.b().h, 22);
}

/* ==================================================== one-way platforms */
{
  // Surface at row 36 => y 576. The jump apex puts the body's feet at 559.4,
  // above the platform, so the rise passes through and the fall lands on it.
  const oneWay = (C) => {
    const W = H.flatWorld(C, 120, 40);
    for (let x = 3; x <= 12; x++) W.set(x, 36, C.TILE.ONEWAY);
    return W;
  };

  const a = fresh({ world: oneWay });
  s.eq('starts on the floor, not the platform', a.b().y, REST);
  a.hold('jump').step(1);           // the jump must actually fire first
  s.ok('left the ground', !a.b().onGround);
  let up = 0;
  while (!a.b().onGround && up++ < 200) a.step(1);
  s.near('lands on top of the one-way', a.b().y, 576 - 22, 0.001);
  s.ok('and is grounded there', a.b().onGround);

  // Drop through: crouch, then jump.
  a.release('jump').step(1);
  a.hold('down').step(2);
  a.clearLog();
  a.tap('jump');
  s.eq('crouch + jump drops through', a.count('dropThrough'), 1);
  s.eq('and it is not a jump', a.count('jump'), 0);
  a.release('down');
  let g = 0;
  while (!a.b().onGround && g++ < 120) a.step(1);
  s.near('falls to the floor below', a.b().y, REST, 0.001);

  // A one-way is a floor, never a wall.
  const b = fresh({ world: oneWay });
  const x0 = b.b().x;
  b.hold('right').step(200);
  s.ok('one-way never blocks horizontal motion', b.b().x > x0 + 250,
    'travelled ' + Math.round(b.b().x - x0) + 'px');
}

/* ================================================================= slam */
{
  const a = fresh();
  a.tap('jump').step(5);
  a.clearLog();
  a.tap('down');
  s.eq('slam starts in the air', a.count('slamStart'), 1);
  s.eq('slam state entered', a.p().state, 'slam');
  s.eq('slam hangs before it drops', a.b().vy, 0);

  let hang = 1;
  while (a.b().vy === 0 && hang < 30) { a.step(1); if (a.b().vy === 0) hang++; }
  s.eq('slam hang (frames)', hang, 4);
  s.eq('slam drop speed', a.b().vy, 11);

  a.clearLog();
  let g = 0;
  while (!a.b().onGround && g++ < 200) a.step(1);
  s.eq('slamLand is emitted', a.count('slamLand'), 1);
  s.ok('slam landing requests hitstop', a.sim.hitstop > 0, a.sim.hitstop + ' frames');
  s.near('slam ends flush on the floor', a.b().y, REST, 0.001);
}

/* ========================================================= terminal fall */
{
  const a = H.scenario({ spawns: [[80, 40]] });
  let peak = 0;
  for (let i = 0; i < 200 && !a.b().onGround; i++) { a.sim.step(); if (a.b().vy > peak) peak = a.b().vy; }
  s.eq('fall speed is capped', peak, 9);
  s.ok('the long fall actually landed', a.b().onGround);
  s.near('and landed flush', a.b().y, REST, 0.001);
}

/* =============================================================== hazards */
{
  // A LONG strip. A short one lets the player run clear of it before the
  // i-frames expire, which makes "no repeat damage" pass for the wrong
  // reason — the first version of this test did exactly that.
  const strip = (C) => {
    const W = H.flatWorld(C, 120, 40);
    for (let x = 10; x <= 40; x++) W.set(x, 37, C.TILE.HAZARD);
    return W;
  };

  const a = fresh({ world: strip });
  const hp0 = a.p().hp;
  a.hold('right');
  let g = 0;
  while (a.p().hp === hp0 && g++ < 400) a.step(1);
  s.eq('hazard costs one heart', a.p().hp, hp0 - 1);
  s.eq('hurt is emitted', a.count('hurt'), 1);
  s.ok('hurt grants i-frames', a.p().iframes > 0, a.p().iframes + ' frames');
  s.ok('hurt knocks the player back', a.b().vy < 0);

  a.clearLog();
  a.step(30);
  s.ok('still standing in the spikes', a.world.rectHazard(a.b().x, a.b().y, a.b().w, a.b().h),
    'x ' + Math.round(a.b().x));
  s.eq('i-frames stop repeat damage', a.count('hurt'), 0);

  // And once they lapse, the spikes bite again.
  let h = 0;
  while (a.count('hurt') === 0 && h++ < 200) a.step(1);
  s.ok('damage resumes when i-frames lapse', a.count('hurt') > 0, h + ' frames later');
}
{
  // Spikes under the spawn, so the player cannot simply walk out of them.
  const bed = (C) => {
    const W = H.flatWorld(C, 120, 40);
    for (let x = 3; x <= 40; x++) W.set(x, 37, C.TILE.HAZARD);
    return W;
  };
  const a = fresh({ world: bed });
  let g = 0;
  while (a.p().alive() && g++ < 2000) a.step(1);
  s.eq('hazards eventually kill', a.p().hp, 0);
  s.eq('it took MAX_HP hits', a.count('hurt'), CFG.MAX_HP);
  s.eq('death is emitted once', a.count('death'), 1);
  s.eq('dead state entered', a.p().state, 'dead');

  /* Dying triggers hitstop, and hitstop freezes the respawn timer along with
   * everything else — so the wall-clock wait is the freeze PLUS the timer.
   * Both halves are pinned here: an accidental change to either one moves a
   * number a player would feel as "death takes too long". */
  a.clearLog();
  let r = 0, unfrozen = 0;
  while (a.count('respawn') === 0 && r++ < 200) {
    const frozen = a.sim.hitstop > 0;
    a.step(1);
    if (!frozen) unfrozen++;
  }
  s.eq('respawn waits the configured frames', unfrozen, 30);
  s.eq('death hitstop delays it on top', r - unfrozen, 8);
  s.eq('respawn restores hp', a.p().hp, CFG.MAX_HP);
  s.eq('respawn returns to spawn x', a.b().x, 80);
  s.eq('respawn clears i-frames', a.p().iframes, 0);
}

/* ============================================ collision never leaks (L?) */
{
  // 1200 ticks of noisy input across a world with every tile kind. The body
  // may never end a tick overlapping a solid tile. Sub-stepping is what makes
  // this hold at slam speed, where one unsplit step crosses most of a tile.
  const nasty = (C) => {
    const W = H.flatWorld(C, 120, 40);
    for (let x = 10; x <= 20; x++) W.set(x, 36, C.TILE.SOLID);
    for (let x = 24; x <= 32; x++) W.set(x, 33, C.TILE.ONEWAY);
    for (let x = 40; x <= 44; x++) W.set(x, 37, C.TILE.HAZARD);
    for (let x = 50; x <= 58; x++) W.set(x, 30, C.TILE.SOLID);
    for (let y = 30; y <= 37; y++) W.set(64, y, C.TILE.SOLID);
    return W;
  };
  const a = fresh({ world: nasty, seed: 77 });
  let overlaps = 0, moved = 0;
  const x0 = a.b().x;
  for (let t = 0; t < 1200; t++) {
    a.pad()
      .set('right', (t % 111) < 70)
      .set('left', (t % 111) >= 70 && (t % 111) < 84)
      .set('jump', t % 19 === 0)
      .set('roll', t % 43 === 0)
      .set('down', (t % 67) > 58);
    a.sim.step();
    const b = a.b();
    if (a.world.rectSolid(b.x, b.y, b.w, b.h)) overlaps++;
    if (Math.abs(b.x - x0) > 20) moved = 1;
  }
  s.eq('body never overlaps a solid tile', overlaps, 0);
  s.eq('the stress run actually moved', moved, 1);
  s.ok('the stress run exercised the sim', a.log.length > 100, a.log.length + ' events');
}

process.exit(s.done());
