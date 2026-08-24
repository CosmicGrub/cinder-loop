/* ===========================================================================
 * tests/verify_touch.js  —  zoneAt, the Stick hysteresis, and TouchControls
 * ---------------------------------------------------------------------------
 * Everything here runs against the REAL functions in a bare Node sandbox
 * (L8) — no DOM. TouchControls itself is DOM-facing, but nothing at
 * module-evaluation time touches window/document, so a fake canvas
 * (getBoundingClientRect + inert addEventListener) and fake TouchEvent-shaped
 * objects are enough to drive its real internals directly, the same way
 * verify_rig drives Rig.audit() directly rather than going through a UI.
 *
 * The two properties this suite exists to hold are the ones the judged
 * design panel specifically caught as bugs in the WINNING proposal's prose
 * before this was implemented:
 *   1. Ghost-promotion must never cross zones — only a touch whose OWN
 *      touchstart classified it as the movement zone may ever become the
 *      stick owner.
 *   2. Action-zone buttons are refcounted, not boolean — a second finger
 *      resting in the same band must not release the button when only one
 *      of the two lifts.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_touch');
const C = H.loadPlatform();
const T = C.TouchControls, Pad = C.Pad;

/* ==================================================================== zoneAt */
{
  const W = 800, Hh = 600;   // 'H' is used as a local var name below; avoid shadowing
  s.eq('top-left corner is dead', T.zoneAt(0, 0, W, Hh), 'dead');
  s.eq('top strip, middle, is dead', T.zoneAt(W / 2, 10, W, Hh), 'dead');
  s.eq('top-right corner is pause', T.zoneAt(W - 10, 10, W, Hh), 'pause');
  s.eq('just left of the pause corner is dead', T.zoneAt(W - T.PAUSE_SIZE - 2, 10, W, Hh), 'dead');
  // TOP_MARGIN and PAUSE_SIZE are both 48 by design (the pause target fills
  // the dead strip's own corner exactly) — so there is no separate "dead"
  // band below the pause corner specifically; y >= 48 is already past the
  // dead strip entirely and into the action column for the right half.
  s.eq('just below TOP_MARGIN, right side, is already the action column',
    T.zoneAt(W - 10, T.TOP_MARGIN + 2, W, Hh), 'jump');

  s.eq('left half below the margin is move', T.zoneAt(10, T.TOP_MARGIN + 5, W, Hh), 'move');
  s.eq('the margin boundary itself belongs to the zone below it',
    T.zoneAt(10, T.TOP_MARGIN, W, Hh), 'move');
  s.eq('right half, top of the action column, is jump', T.zoneAt(W - 10, T.TOP_MARGIN + 2, W, Hh), 'jump');

  const rH = Hh - T.TOP_MARGIN;
  const jumpRollBoundary = T.TOP_MARGIN + rH * 0.42;
  const rollParryBoundary = T.TOP_MARGIN + rH * 0.60;
  const parryAttackBoundary = T.TOP_MARGIN + rH * 0.80;
  s.eq('just above the jump/roll boundary is jump', T.zoneAt(W - 10, jumpRollBoundary - 1, W, Hh), 'jump');
  s.eq('at the jump/roll boundary is roll', T.zoneAt(W - 10, jumpRollBoundary, W, Hh), 'roll');
  s.eq('just above the roll/parry boundary is roll', T.zoneAt(W - 10, rollParryBoundary - 1, W, Hh), 'roll');
  s.eq('at the roll/parry boundary is parry', T.zoneAt(W - 10, rollParryBoundary, W, Hh), 'parry');
  s.eq('just above the parry/attack boundary is parry', T.zoneAt(W - 10, parryAttackBoundary - 1, W, Hh), 'parry');
  s.eq('at the parry/attack boundary is attack', T.zoneAt(W - 10, parryAttackBoundary, W, Hh), 'attack');
  s.eq('the very bottom is attack', T.zoneAt(W - 10, Hh - 1, W, Hh), 'attack');

  s.eq('exactly on the x midline belongs to the right half', T.zoneAt(W / 2, T.TOP_MARGIN + 5, W, Hh), 'jump');

  // Degenerate/extreme viewports must never throw and must return SOME zone.
  const extremes = [[320, T.TOP_MARGIN + 1], [2000, 240], [240, 2000], [1, 1], [50, 50]];
  let threw = false, allValid = true;
  const KNOWN = ['pause', 'dead', 'move', 'jump', 'roll', 'parry', 'attack'];
  for (const [ew, eh] of extremes) {
    for (const [x, y] of [[0, 0], [ew, eh], [ew / 2, eh / 2], [ew - 1, 1]]) {
      try {
        const z = T.zoneAt(x, y, ew, eh);
        if (KNOWN.indexOf(z) === -1) allValid = false;
      } catch (e) { threw = true; }
    }
  }
  s.ok('zoneAt never throws on extreme viewports', !threw);
  s.ok('and always returns a known zone', allValid);
}

/* =================================================================== Stick */
function stick() { return new T.Stick(); }

{
  const st = stick();
  st.begin(100, 100);
  s.ok('a fresh stick reports no direction', !st.left && !st.right && !st.up && !st.down);

  st.move(114, 100);                    // dx=14, at ENTER exactly
  s.ok('dx at exactly ENTER latches right', st.right && !st.left);
  st.move(110, 100);                    // dx=10: below ENTER, still >= EXIT(8)
  s.ok('dropping partway but still above EXIT holds the latch', st.right);
  st.move(105, 100);                    // dx=5: below EXIT(8)
  s.ok('dropping below EXIT releases it', !st.right);
}
{
  const st = stick();
  st.begin(100, 100);
  st.move(120, 100);
  s.ok('right latched', st.right);
  st.move(80, 100);
  s.ok('a direct reversal past -ENTER flips straight to left', st.left && !st.right);
}
{
  // Independent axes: a diagonal drag sets both without one masking the other.
  const st = stick();
  st.begin(0, 0);
  st.move(20, 20);
  s.ok('diagonal sets right', st.right);
  s.ok('and down, independently', st.down);
  s.ok('and never sets the opposite pair', !st.left && !st.up);
}
{
  const st = stick();
  st.begin(0, 0);
  st.move(20, 20);
  st.end();
  s.ok('end() clears every direction regardless of prior state',
    !st.left && !st.right && !st.up && !st.down);
}
{
  // up is negative-y (screen space), matching the sign convention Pad's own
  // gamepad axis reading already uses (ay < -DEAD is up) — verified to agree
  // rather than assumed.
  const st = stick();
  st.begin(50, 50);
  st.move(50, 30);
  s.eq('moving toward smaller y latches up, not down', st.up && !st.down, true);
}

/* ============================================================ TouchControls
 * A fake canvas (a fixed rect, inert listener registration) and hand-built
 * touch-event-shaped objects are enough — nothing here needs a browser. */
function fakeCanvas(w, h) {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    addEventListener: () => {}, removeEventListener: () => {}
  };
}
function touchEvent(touches) {
  return { changedTouches: touches, preventDefault: () => {} };
}
function tp(id, x, y) { return { identifier: id, clientX: x, clientY: y }; }

function harness(w, h, ctrl) {
  const canvas = fakeCanvas(w, h);
  const pad = new Pad();
  const controller = Object.assign({
    isPaused: () => false, openPause: () => {}, closePause: () => {},
    menuMove: () => {}, menuConfirm: () => {}, menuCancel: () => {}
  }, ctrl || {});
  const tc = new T(canvas, pad, controller);
  return { tc, pad, controller, w, h };
}

/* ------------------------------------------------- movement + hysteresis */
{
  const { tc, pad, w, h } = harness(800, 600);
  const moveY = T.TOP_MARGIN + 10;
  tc._onStart(touchEvent([tp(1, 50, moveY)]));
  s.eq('a touch in the movement zone claims the stick', tc.stickOwner, 1);
  tc._onMove(touchEvent([tp(1, 70, moveY)]));
  s.eq('dragging right sets pad.right', pad.next.right, true);
  s.eq('and not left', pad.next.left, false);
  tc._onEnd(touchEvent([tp(1, 70, moveY)]));
  s.eq('releasing clears the stick owner', tc.stickOwner, null);
  s.eq('and releases the pad direction', pad.next.right, false);
}

/* --------------------------------------------- THE ghost-promotion fix */
{
  const { tc, pad } = harness(800, 600);
  const moveY = T.TOP_MARGIN + 10;
  // Touch A claims the stick; touch B, also in the movement zone, is a
  // legitimate ghost (same origin zone).
  tc._onStart(touchEvent([tp(1, 50, moveY)]));
  tc._onStart(touchEvent([tp(2, 60, moveY)]));
  s.eq('the first movement touch owns the stick', tc.stickOwner, 1);
  s.ok('the second is recorded but does not steal ownership', tc.touches[2] && tc.stickOwner === 1);

  tc._onEnd(touchEvent([tp(1, 50, moveY)]));
  s.eq('releasing the owner promotes the legitimate ghost', tc.stickOwner, 2);

  /* The actual bug this whole test exists to catch: for...in over a plain
   * object always yields STRING keys, so a naive promotion sets stickOwner
   * to "2" (string) rather than 2 (number). Every subsequent touchmove's
   * `t.identifier === this.stickOwner` check uses REAL numeric identifiers
   * (per the Touch Events spec) and is a strict ===, so 2 === "2" is false
   * — movement would silently stop responding the instant a promotion
   * happened. Checking `stickOwner` equals 2 above is not enough by itself;
   * this drives an actual touchmove through the promoted ghost and checks
   * the pad ACTUALLY responds, which is what would have failed before the
   * for-in fix even though the assertion above already passed. */
  tc._onMove(touchEvent([tp(2, 90, moveY)]));   // dragged well past ENTER
  s.eq('the promoted ghost still actually drives movement afterward', pad.next.right, true);
}
{
  // THE bug both judges caught in the proposal, verified fixed: a touch that
  // started in a DIFFERENT zone must never be promotable, even if it is the
  // only other touch active when the stick owner releases.
  const { tc, pad } = harness(800, 600);
  const moveY = T.TOP_MARGIN + 10;
  const jumpY = T.TOP_MARGIN + 5;   // inside the jump band
  tc._onStart(touchEvent([tp(1, 50, moveY)]));         // stick owner
  tc._onStart(touchEvent([tp(2, 700, jumpY)]));         // unrelated jump touch, still held
  s.eq('the jump touch does not affect stick ownership', tc.stickOwner, 1);

  tc._onEnd(touchEvent([tp(1, 50, moveY)]));
  s.eq('a same-still-held JUMP touch is never promoted to stick owner', tc.stickOwner, null);
  s.ok('the jump button is still correctly held from its own touch', pad.next.jump);
}

/* --------------------------------------------------- refcounted zones */
{
  const { tc, pad } = harness(800, 600);
  const jumpY = T.TOP_MARGIN + 5;
  tc._onStart(touchEvent([tp(1, 700, jumpY)]));
  s.eq('first finger in the jump band sets jump', pad.next.jump, true);
  tc._onStart(touchEvent([tp(2, 720, jumpY)]));
  s.eq('a second finger in the same band changes nothing observable', pad.next.jump, true);

  tc._onEnd(touchEvent([tp(1, 700, jumpY)]));
  s.eq('one of two lifting does NOT release the button', pad.next.jump, true);
  tc._onEnd(touchEvent([tp(2, 720, jumpY)]));
  s.eq('the second lifting does release it', pad.next.jump, false);
}
{
  // touchcancel must behave exactly like touchend, not leave a phantom hold.
  const { tc, pad } = harness(800, 600);
  const attackY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.85;
  tc._onStart(touchEvent([tp(1, 700, attackY)]));
  s.eq('attack claimed', pad.next.attack, true);
  tc._onCancel(touchEvent([tp(1, 700, attackY)]));
  s.eq('a cancelled touch releases exactly like a lifted one', pad.next.attack, false);
}
{
  // Parry (abilities spec §2b, Manual touch mode) — the same refcounted-
  // zone and touchcancel properties every other action zone already gets,
  // proven for the new one rather than assumed to follow from the shared
  // code path.
  const { tc, pad } = harness(800, 600);
  const parryY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.7;   // inside the parry band
  s.eq('the sample point actually classifies as parry', T.zoneAt(700, parryY, 800, 600), 'parry');

  tc._onStart(touchEvent([tp(1, 700, parryY)]));
  s.eq('first finger in the parry band sets parry', pad.next.parry, true);
  tc._onStart(touchEvent([tp(2, 720, parryY)]));
  s.eq('a second finger in the same band changes nothing observable', pad.next.parry, true);
  tc._onEnd(touchEvent([tp(1, 700, parryY)]));
  s.eq('one of two lifting does NOT release it', pad.next.parry, true);
  tc._onEnd(touchEvent([tp(2, 720, parryY)]));
  s.eq('the second lifting does release it', pad.next.parry, false);

  tc._onStart(touchEvent([tp(3, 700, parryY)]));
  tc._onCancel(touchEvent([tp(3, 700, parryY)]));
  s.eq('a cancelled parry touch releases exactly like a lifted one', pad.next.parry, false);
}

/* ------------------------------------------------------- touch assist
 * Abilities spec §2b — the same "the controller decouples this from app's
 * exact shape" convention every other controller call already uses
 * (isPaused/menuMove/etc.), extended here with fake parryAssistEnabled/
 * recentTelegraph stubs rather than a real 95-app.js Sim/Bus. */
{
  const { tc, pad } = harness(800, 600, { parryAssistEnabled: () => true, recentTelegraph: () => true });
  const rollY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.5;
  tc._onStart(touchEvent([tp(1, 700, rollY)]));
  s.eq('roll itself still fires normally', pad.next.roll, true);
  s.eq('assist ALSO arms parry off the same touch', pad.next.parry, true);

  tc._onEnd(touchEvent([tp(1, 700, rollY)]));
  s.eq('releasing the roll touch releases the assist-armed parry too', pad.next.parry, false);
}
{
  // No recent telegraph: assist must not fire unconditionally on every roll.
  const { tc, pad } = harness(800, 600, { parryAssistEnabled: () => true, recentTelegraph: () => false });
  const rollY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.5;
  tc._onStart(touchEvent([tp(1, 700, rollY)]));
  s.eq('roll still fires', pad.next.roll, true);
  s.eq('but parry does not, with no recent telegraph', pad.next.parry, false);
}
{
  // Assist disabled entirely: no arming even with a real recent telegraph.
  const { tc, pad } = harness(800, 600, { parryAssistEnabled: () => false, recentTelegraph: () => true });
  const rollY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.5;
  tc._onStart(touchEvent([tp(1, 700, rollY)]));
  s.eq('roll still fires', pad.next.roll, true);
  s.eq('but parry does not, with assist off', pad.next.parry, false);
}
{
  // Real, named cross-zone protection: a genuine Manual parry-zone touch
  // held independently must survive an assist-armed roll touch releasing —
  // the exact interaction this file's own zoneCount.parry === 0 guard
  // exists to prevent from being silently stomped.
  const { tc, pad } = harness(800, 600, { parryAssistEnabled: () => true, recentTelegraph: () => true });
  const rollY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.5;
  const parryY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.7;
  tc._onStart(touchEvent([tp(1, 700, rollY)]));       // assist arms parry
  tc._onStart(touchEvent([tp(2, 700, parryY)]));       // a REAL, independent parry-zone touch
  s.eq('parry is held (by either source)', pad.next.parry, true);

  tc._onEnd(touchEvent([tp(1, 700, rollY)]));          // the assist-arming roll touch releases
  s.eq('the genuine parry-zone touch keeps it held, not stomped', pad.next.parry, true);

  tc._onEnd(touchEvent([tp(2, 700, parryY)]));
  s.eq('and it releases once that real touch actually lifts', pad.next.parry, false);
}
{
  /* Regression for a real asymmetry an adversarial review pass caught: the
   * first draft's cross-zone guard only protected ONE direction (a roll
   * touch releasing checked whether a real parry touch was still down),
   * never the reverse (a real parry touch releasing never checked whether
   * Assist was still holding the button open via an active roll touch) —
   * so releasing the genuine parry-zone touch FIRST, before the assist-
   * arming roll touch, turned the button off one event early. Same two
   * touches as the test above, released in the OPPOSITE order. */
  const { tc, pad } = harness(800, 600, { parryAssistEnabled: () => true, recentTelegraph: () => true });
  const rollY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.5;
  const parryY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.7;
  tc._onStart(touchEvent([tp(1, 700, rollY)]));       // assist arms parry
  tc._onStart(touchEvent([tp(2, 700, parryY)]));       // a REAL, independent parry-zone touch
  s.eq('parry is held', pad.next.parry, true);

  tc._onEnd(touchEvent([tp(2, 700, parryY)]));         // the REAL parry touch releases FIRST
  s.eq('assist keeps it held — the roll touch is still down', pad.next.parry, true);

  tc._onEnd(touchEvent([tp(1, 700, rollY)]));          // now the roll touch releases too
  s.eq('and only now does it actually release', pad.next.parry, false);
}
{
  // Only the FIRST claim on the roll zone checks the assist condition
  // (mirroring how pad.set(zone,true) itself only fires on first claim) —
  // a second simultaneous roll touch must not re-evaluate or disturb it.
  const { tc, pad } = harness(800, 600, { parryAssistEnabled: () => true, recentTelegraph: () => true });
  const rollY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.5;
  tc._onStart(touchEvent([tp(1, 700, rollY)]));
  s.eq('the first roll touch arms parry', pad.next.parry, true);
  tc._onStart(touchEvent([tp(2, 720, rollY)]));
  s.eq('a second simultaneous roll touch changes nothing observable', pad.next.parry, true);

  tc._onEnd(touchEvent([tp(1, 700, rollY)]));
  s.eq('one of two roll touches lifting does not release roll', pad.next.roll, true);
  s.eq('nor parry — the zone is still claimed', pad.next.parry, true);
  tc._onEnd(touchEvent([tp(2, 720, rollY)]));
  s.eq('the last one lifting releases both', pad.next.roll === false && pad.next.parry === false, true);
}
{
  // Assist must not fire while paused — it is a gameplay mechanic, not a
  // menu-nav shortcut (roll's own menuCancel() routing already handles the
  // paused case separately, unaffected by this).
  const { tc, pad } = harness(800, 600, {
    isPaused: () => true, parryAssistEnabled: () => true, recentTelegraph: () => true
  });
  const rollY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.5;
  tc._onStart(touchEvent([tp(1, 700, rollY)]));
  s.eq('roll bookkeeping still updates while paused', pad.next.roll, true);
  s.eq('but assist does not arm parry while paused', pad.next.parry, false);
}

/* ------------------------------------------------------- heavy attack
 * The whole point of the winning scheme: no combined-gesture recognition,
 * just two independently tracked fingers whose pad state overlaps in time. */
{
  const { tc, pad } = harness(800, 600);
  const moveY = T.TOP_MARGIN + 10;
  // 0.9, not 0.8 (the old ATTACK band's own former start): since the new
  // PARRY zone split ATTACK's old 0.60-1.0 range at PARRY_FRAC=0.80, 0.8
  // is now the exact PARRY/ATTACK boundary itself — still correctly
  // ATTACK (boundary ties go to the zone below), but with zero margin,
  // fragile against any future PARRY_FRAC nudge. 0.9 sits safely inside
  // the ATTACK band with real margin either side.
  const attackY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.9;
  tc._onStart(touchEvent([tp(1, 50, moveY)]));
  tc._onMove(touchEvent([tp(1, 50, moveY + 20)]));      // drag down past ENTER
  s.eq('the stick delivers a held down signal', pad.next.down, true);
  tc._onStart(touchEvent([tp(2, 700, attackY)]));
  s.eq('and attack from the other thumb, at the same time', pad.next.attack, true);
  s.ok('both are true simultaneously — no combined gesture needed',
    pad.next.down && pad.next.attack);
}

/* --------------------------------------------------------- pause routing */
{
  const calls = [];
  const { tc, pad } = harness(800, 600, {
    isPaused: () => true,
    menuConfirm: () => calls.push('confirm'),
    menuCancel: () => calls.push('cancel')
  });
  const jumpY = T.TOP_MARGIN + 5;
  const rollY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.5;
  tc._onStart(touchEvent([tp(1, 700, jumpY)]));
  s.eq('a jump-band tap confirms while paused', calls.join(','), 'confirm');
  s.eq('pad bookkeeping still updates (harmless while paused)', pad.next.jump, true);

  tc._onStart(touchEvent([tp(2, 700, rollY)]));
  s.eq('a roll-band tap cancels while paused', calls.join(','), 'confirm,cancel');

  // Parry has no menu meaning, same precedent as attack.
  const parryY = T.TOP_MARGIN + (600 - T.TOP_MARGIN) * 0.7;
  tc._onStart(touchEvent([tp(3, 700, parryY)]));
  s.eq('a parry-band tap calls neither confirm nor cancel', calls.join(','), 'confirm,cancel');
  s.eq('but pad bookkeeping still updates (harmless while paused)', pad.next.parry, true);
}
{
  const opened = [];
  const { tc } = harness(800, 600, {
    isPaused: () => false,
    openPause: () => opened.push('open')
  });
  tc._onStart(touchEvent([tp(1, 790, 10)]));   // pause corner
  s.eq('tapping the pause corner opens the menu', opened.join(','), 'open');
}
{
  const closed = [];
  const { tc } = harness(800, 600, {
    isPaused: () => true,
    closePause: () => closed.push('close')
  });
  tc._onStart(touchEvent([tp(1, 790, 10)]));
  s.eq('tapping it again while already paused closes it', closed.join(','), 'close');
}
{
  // Stick-driven menu navigation is edge-triggered, not repeated every frame
  // a drag is held — a held drag must not spam menu.move().
  const moves = [];
  const { tc } = harness(800, 600, { isPaused: () => true, menuMove: (d) => moves.push(d) });
  const moveY = T.TOP_MARGIN + 10;
  tc._onStart(touchEvent([tp(1, 50, moveY)]));
  tc._onMove(touchEvent([tp(1, 50, moveY + 20)]));
  tc._onMove(touchEvent([tp(1, 51, moveY + 21)]));   // still past threshold, same direction
  tc._onMove(touchEvent([tp(1, 52, moveY + 22)]));
  s.eq('a held drag fires menu.move() once, not per frame', moves.join(','), '1');
}

/* --------------------------------------------------------------- reset() */
{
  const { tc, pad } = harness(800, 600);
  const moveY = T.TOP_MARGIN + 10, jumpY = T.TOP_MARGIN + 5;
  tc._onStart(touchEvent([tp(1, 50, moveY)]));
  tc._onMove(touchEvent([tp(1, 80, moveY)]));
  tc._onStart(touchEvent([tp(2, 700, jumpY)]));
  s.ok('some state is actually held before reset', pad.next.right || pad.next.jump);

  tc.reset();
  s.eq('reset clears the stick owner', tc.stickOwner, null);
  s.eq('reset clears tracked touches', Object.keys(tc.touches).length, 0);
  s.ok('reset releases every direction', !pad.next.left && !pad.next.right && !pad.next.up && !pad.next.down);
  s.ok('reset releases every action button', !pad.next.jump && !pad.next.roll && !pad.next.parry && !pad.next.attack);
  s.eq('reset zeroes every zone count',
    tc.zoneCount.jump + tc.zoneCount.roll + tc.zoneCount.parry + tc.zoneCount.attack, 0);
}

/* ---------------------------------------------------------- dead zone */
{
  const { tc, pad } = harness(800, 600);
  tc._onStart(touchEvent([tp(1, 400, 10)]));    // top dead strip
  s.ok('a touch in the dead strip claims no zone effect',
    !pad.next.left && !pad.next.right && !pad.next.jump && !pad.next.roll && !pad.next.parry && !pad.next.attack);
  s.eq('and does not claim the stick', tc.stickOwner, null);
  let threw = false;
  try { tc._onEnd(touchEvent([tp(1, 400, 10)])); } catch (e) { threw = true; }
  s.ok('releasing a dead-zone touch is a harmless no-op, not a crash', !threw);
}

process.exit(s.done());
