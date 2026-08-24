/* ===========================================================================
 * 35-rig.js  —  skeletal poses + hitbox bake (L9)
 * ---------------------------------------------------------------------------
 * SIM layer. The MOVES table below contains poses and nothing else. There is
 * not one hitbox in it and there must never be (L9) — every box in the game is
 * COMPUTED from where the blade actually is, at boot, by bake().
 *
 * Why this file exists at all: IRON CIRCUIT v1.3 shipped 56 moves and all 56
 * of them had hitboxes reaching further than the weapon they were drawn from.
 * A player noticed before any test did. Hand-authored boxes drift toward
 * generous every single time, because a box that is slightly too big feels
 * good to the person holding the controller and terrible to the person being
 * hit by it. Deriving them removes the option.
 *
 * A frame is active when the blade TIP is travelling faster than
 * RIG_ACTIVE_SPEED. That is the whole rule. A weapon being carried has no
 * hitbox; a weapon being swung does. Startup, active and recovery windows are
 * consequences of the animation rather than numbers anyone types.
 *
 * Owned by: Rig team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG;
var DEG = Math.PI / 180;

/* ---------------------------------------------------------------- MOVES
 * Data (D7). Each frame is [shoulderDeg, elbowDeg, lunge].
 *   shoulderDeg  upper-arm angle; 0 is right, -90 is straight up
 *   elbowDeg     forearm angle RELATIVE to the upper arm; the blade continues
 *                along the forearm
 *   lunge        px the shoulder shifts forward this frame
 *
 * Windup frames may legally take the blade behind the character. They carry
 * no hitbox, because they are slow — which is exactly why the active-window
 * rule is expressed as speed rather than as a hand-typed frame range.
 * ------------------------------------------------------------------ */
var MOVES = {
  slashA: {
    damage: 6,
    knock: [2.4, -1.0],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: 'slashB',
    frames: [
      [-150, -20, 0],
      [-138, -18, 0],
      [-118, -16, 0],
      [ -92, -12, 1],
      [ -35,  -6, 2],
      [  20,   0, 3],
      [  55,   6, 3],
      [  66,  12, 2],
      [  70,  16, 1],
      [  72,  18, 0]
    ]
  },

  slashB: {
    damage: 7,
    knock: [3.0, -1.6],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: null,
    frames: [
      [  72,  16, 0],
      [  62,  12, 1],
      [  40,   6, 2],
      [ -18,  -4, 3],
      [ -70, -12, 3],
      [-100, -18, 2],
      [-112, -20, 1],
      [-118, -20, 0]
    ]
  },

  heavy: {
    damage: 14,
    knock: [4.2, -2.4],
    hitstop: CFG.HITSTOP_HEAVY,
    chain: null,
    frames: [
      [ -60, -14, 0],
      [ -85, -20, 0],
      [-108, -25, 0],
      [-128, -28, 0],
      [-140, -30, 0],
      [-143, -30, 0],
      [-133, -28, 0],
      [-115, -25, 1],
      [ -92, -20, 2],
      [ -35, -10, 3],
      [  22,   0, 4],
      [  58,   8, 4],
      [  70,  14, 3],
      [  74,  18, 2],
      [  76,  20, 1],
      [  77,  20, 0]
    ]
  },

  /* Twin Daggers — the second WEAPON (D7: content is data), proving the
   * blade was never structurally the only one possible. Own `geom` with a
   * shorter `blade` (6 vs the default 11) is the whole difference: same
   * shoulder/arm proportions as the player's default reach (it is still
   * their own arm), just a shorter weapon, so a genuinely different feel
   * (fast, short, three-hit) falls out of geometry and frame timing alone —
   * no new engine capability, exactly the D7 promise. Baked and audited
   * through the same generic pipeline as everything else; a first draft's
   * active windows and audit result were checked directly before this was
   * ever written into the shipped table, the same discipline as any other
   * measured number in this project. */
  daggerA: {
    damage: 4,
    knock: [1.6, -0.6],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: 'daggerB',
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 6 },
    frames: [
      [-120, -15, 0],
      [ -95, -12, 0],
      [ -40,  -5, 1],
      [  30,   3, 2],
      [  65,  10, 2],
      [  72,  14, 1],
      [  74,  16, 0]
    ]
  },

  daggerB: {
    damage: 4,
    knock: [1.6, -0.8],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: 'daggerC',
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 6 },
    frames: [
      [ 74,  16, 0],
      [ 60,  12, 0],
      [ 10,   4, 1],
      [-50,  -8, 2],
      [-85, -13, 1],
      [-95, -15, 0]
    ]
  },

  daggerC: {
    damage: 5,
    knock: [2.2, -1.2],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: null,
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 6 },
    frames: [
      [-95, -15, 0],
      [-70, -12, 0],
      [-20,  -6, 1],
      [ 40,   4, 2],
      [ 75,  10, 2],
      [ 80,  14, 1],
      [ 82,  16, 0]
    ]
  },

  daggerHeavy: {
    damage: 10,
    knock: [3.0, -1.8],
    hitstop: CFG.HITSTOP_HEAVY,
    chain: null,
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 6 },
    frames: [
      [ -40, -10, 0],
      [ -70, -16, 0],
      [ -95, -20, 0],
      [-110, -22, 0],
      [-112, -22, 0],
      [ -90, -18, 1],
      [ -40,  -8, 2],
      [  20,   2, 3],
      [  60,  10, 3],
      [  75,  14, 2],
      [  80,  16, 1],
      [  82,  18, 0]
    ]
  },

  /* Warmaul — weapon #3 (D9: the roster is locked at four; this and Thornspear
   * below fill it). Chosen by a judged 3-pitch design panel (2 judges, split
   * 42/37 vs 39/42 vs 36/46 across the three — genuinely close, not a clean
   * sweep like the boss's own panel) reading this exact file live before
   * scoring. One light move, `chain: null` on itself — no combo at all, the
   * SAME field slashB/daggerC already use to end a chain, just used on frame
   * one instead of the last frame, so "no follow-up" costs zero new engine
   * behaviour. Reuses HITSTOP_HEAVY on its light move too, matching the
   * panel's own stated gimmick: the light button still freezes the frame
   * like a heavy hit, because weight is this weapon's whole identity.
   *
   * geom overrides ONLY `blade` (18 vs the default 11) — same precedent
   * Twin Daggers set the other direction (6). The windup is deliberately
   * SHALLOWER than 'heavy' despite being a bigger hit: 'heavy' can wind back
   * to -143° and stay under RIG_ACTIVE_SPEED because its blade is short, but
   * the same angle on an 18px lever is already moving fast — while still
   * behind the body. First draft copied 'heavy's own angles wholesale and
   * failed the audit's 'behind' rule on exactly that reasoning, on both
   * moves, caught by baking against the real Rig.bakeMove()/audit() before
   * this was ever written here, the same discipline as Twin Daggers. */
  maulA: {
    damage: 13,
    knock: [5.5, -3.0],
    hitstop: CFG.HITSTOP_HEAVY,
    chain: null,
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 18 },
    frames: [
      [ -48, -10, 0],
      [ -60, -13, 0],
      [ -71, -16, 0],
      [ -80, -18, 0],
      [ -86, -19, 0],
      [ -88, -19, 0],
      [ -88, -19, 1],
      [ -35,  -6, 3],
      [  22,   2, 5],
      [  55,  10, 4],
      [  70,  16, 3],
      [  76,  19, 2],
      [  78,  20, 0]
    ]
  },

  maulHeavy: {
    damage: 20,
    knock: [6.5, -3.5],
    hitstop: CFG.HITSTOP_HEAVY,
    chain: null,
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 18 },
    frames: [
      [ -45,  -9, 0],
      [ -58, -12, 0],
      [ -70, -15, 0],
      [ -79, -17, 0],
      [ -86, -19, 0],
      [ -89, -19, 0],
      [ -89, -19, 0],
      [ -89, -19, 1],
      [ -25,  -4, 3],
      [  30,   4, 6],
      [  58,  12, 5],
      [  72,  18, 3],
      [  77,  20, 1],
      [  79,  20, 0]
    ]
  },

  /* Thornspear — weapon #4. Four shallow thrusts (the roster's longest light
   * chain) off the single longest blade in the game, mirroring Warmaul's own
   * gimmick in reverse: HITSTOP_LIGHT reused on its HEAVY move, so even the
   * strong button stays quick — reach buys safety, a heavy (9) that
   * undercuts even Twin Daggers' (10) is the tax for it. blade started at 22
   * in the panel's own pitch; measured directly against the real merged
   * envelope (every move in the game baked together, the same construction
   * `C.RIG = new Rig(MOVES)` does at boot) it pushed the game's overall reach
   * to 40.5px — just past verify_rig's own long-standing "about two tiles,
   * not ten" ceiling (20-40px), an invariant that predates this weapon and
   * was not loosened to fit it. Pulled back to 20, the longest reach in the
   * roster that still leaves real headroom (measured envelope 38.65px). */
  spearA: {
    damage: 3,
    knock: [0.8, -0.3],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: 'spearB',
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 20 },
    frames: [
      [ -55, -10, 0],
      [ -70, -12, 0],
      [ -78, -13, 0],
      [ -80, -13, 1],
      [ -20,  -3, 3],
      [  45,   5, 2],
      [  68,  11, 1],
      [  74,  13, 0]
    ]
  },

  spearB: {
    damage: 3,
    knock: [0.8, -0.3],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: 'spearC',
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 20 },
    frames: [
      [  74,  13, 0],
      [  70,  12, 0],
      [  60,  10, 0],
      [ -10,  -2, 1],
      [ -65, -11, 3],
      [ -78, -13, 2],
      [ -80, -13, 0]
    ]
  },

  spearC: {
    damage: 3,
    knock: [0.8, -0.3],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: 'spearD',
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 20 },
    frames: [
      [ -80, -13, 0],
      [ -76, -13, 0],
      [ -66, -11, 0],
      [   0,  -1, 1],
      [  55,   8, 3],
      [  72,  12, 2],
      [  76,  13, 0]
    ]
  },

  spearD: {
    damage: 4,
    knock: [1.2, -0.5],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: null,
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 20 },
    frames: [
      [  76,  13, 0],
      [  72,  12, 0],
      [  62,  10, 0],
      [ -15,  -3, 1],
      [ -70, -12, 3],
      [ -82, -14, 2],
      [ -84, -14, 0]
    ]
  },

  spearHeavy: {
    damage: 9,
    knock: [1.6, -0.6],
    hitstop: CFG.HITSTOP_LIGHT,
    chain: null,
    geom: { shoulderX: 6, shoulderY: 8, armUpper: 6, armLower: 5, blade: 20 },
    frames: [
      [ -68, -11, 0],
      [ -80, -13, 0],
      [ -87, -14, 0],
      [ -88, -14, 0],
      [ -88, -14, 1],
      [ -20,  -3, 4],
      [  50,   7, 3],
      [  72,  13, 1],
      [  78,  15, 0]
    ]
  },

  /* Ashwalker's swipe. An ENEMY move, baked and audited exactly like the
   * player's — L9 is not a rule about the protagonist. Its own proportions:
   * a longer, heavier arm on a 12x24 frame with a short claw instead of a
   * blade, so the audit bounds it against ITS reach, not the player's. */
  clawA: {
    damage: 1,
    knock: [2.6, -1.6],
    hitstop: CFG.ENEMY_HITSTOP,
    chain: null,
    geom: { shoulderX: 7, shoulderY: 9, armUpper: 7, armLower: 6, blade: 7 },
    frames: [
      [ -70, -20, 0],
      [ -95, -26, 0],
      [-115, -30, 0],
      [-125, -32, 0],
      [-100, -26, 1],
      [ -60, -18, 2],
      [   0,  -6, 3],
      [  40,   4, 3],
      [  55,  10, 2],
      [  62,  14, 1],
      [  65,  16, 0]
    ]
  }
};

/* ------------------------------------------------------ forward kinematics
 * `geom` lets a move declare its own limb lengths. The player's are the
 * default; an enemy with a longer arm gets its strike baked from ITS
 * proportions rather than borrowing the player's, so the overreach audit
 * still means something for it. */
var GEOM = {
  shoulderX: CFG.RIG_SHOULDER_X,
  shoulderY: CFG.RIG_SHOULDER_Y,
  armUpper: CFG.RIG_ARM_UPPER,
  armLower: CFG.RIG_ARM_LOWER,
  blade: CFG.RIG_BLADE
};

function poseAt(frames, i, geom) {
  var g = geom || GEOM;
  var f = frames[i];
  var sx = g.shoulderX + f[2], sy = g.shoulderY;
  var upper = f[0] * DEG, fore = (f[0] + f[1]) * DEG;
  var cu = Math.cos(upper), su = Math.sin(upper);
  var cf = Math.cos(fore), sf = Math.sin(fore);

  var ex = sx + g.armUpper * cu;
  var ey = sy + g.armUpper * su;
  var hx = ex + g.armLower * cf;
  var hy = ey + g.armLower * sf;
  var tx = hx + g.blade * cf;
  var ty = hy + g.blade * sf;

  return { shoulder: [sx, sy], elbow: [ex, ey], hand: [hx, hy], tip: [tx, ty] };
}

// Bounding box of a list of points, as {x0,y0,x1,y1}.
function bounds(points) {
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i, p;
  for (i = 0; i < points.length; i++) {
    p = points[i];
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

/* The swept blade between two frames: both blade segments, hulled. Using the
 * sweep rather than the single frame's segment is what stops a fast swing from
 * skipping over a thin target between one tick and the next. */
function sweptPoints(prev, cur) {
  return [prev.hand, prev.tip, cur.hand, cur.tip];
}

/* -------------------------------------------------------------------- bake */
function bakeMove(id, data) {
  var frames = data.frames;
  var poses = [], boxes = [], speeds = [], active = [], i, prev, cur, dx, dy, sp;

  for (i = 0; i < frames.length; i++) poses.push(poseAt(frames, i, data.geom));

  for (i = 0; i < poses.length; i++) {
    if (i === 0) { boxes.push(null); speeds.push(0); continue; }
    prev = poses[i - 1];
    cur = poses[i];
    dx = cur.tip[0] - prev.tip[0];
    dy = cur.tip[1] - prev.tip[1];
    sp = Math.sqrt(dx * dx + dy * dy);
    speeds.push(sp);
    if (sp < CFG.RIG_ACTIVE_SPEED) { boxes.push(null); continue; }
    boxes.push(Object.freeze(bounds(sweptPoints(prev, cur))));
    active.push(i);
  }

  return Object.freeze({
    id: id,
    data: data,
    frames: frames.length,
    poses: poses,
    boxes: boxes,
    speeds: speeds,
    active: active,
    // The earliest frame a follow-up may be buffered into: one past the last
    // active frame, so a combo flows out of recovery but cannot skip the
    // swing it is chaining from.
    chainFrom: active.length ? active[active.length - 1] + 1 : frames.length
  });
}

/* ------------------------------------------------------------------- audit
 * D6, in the gate from commit one. Returns a list of violations; the gate
 * asserts it is empty for the real moves, and non-empty for deliberately
 * poisoned ones, so the audit cannot quietly become a no-op.
 *
 * Takes the baked moves as an argument rather than reading the module's own
 * table, so a suite can hand it a corrupted bake.
 * ------------------------------------------------------------------ */
function audit(baked) {
  var out = [], id, m, i, box, want, skin = CFG.RIG_SKIN;

  for (id in baked) {
    if (!Object.prototype.hasOwnProperty.call(baked, id)) continue;
    m = baked[id];

    // L9: a move may not carry an authored box. Frames are three numbers and
    // nothing else, and the move itself declares no box-shaped field.
    for (i = 0; i < m.data.frames.length; i++) {
      var f = m.data.frames[i];
      if (!Array.isArray(f) || f.length !== 3 || !f.every(Number.isFinite)) {
        out.push({ move: id, frame: i, rule: 'authored', detail: 'frame is not [shoulder, elbow, lunge]' });
      }
    }
    for (var k in m.data) {
      if (/^(box|hitbox|hurtbox|reach)$/i.test(k)) {
        out.push({ move: id, frame: -1, rule: 'authored', detail: 'move declares "' + k + '"' });
      }
    }

    if (m.active.length === 0) {
      out.push({ move: id, frame: -1, rule: 'inert', detail: 'no frame can hit anything' });
    }

    for (i = 0; i < m.boxes.length; i++) {
      box = m.boxes[i];
      if (!box) continue;

      // A box may only exist on a frame where the blade is genuinely swinging.
      // Catches a hitbox lingering through recovery.
      if (m.speeds[i] < CFG.RIG_ACTIVE_SPEED) {
        out.push({ move: id, frame: i, rule: 'phantom',
          detail: 'box on a frame moving ' + m.speeds[i].toFixed(1) + 'px' });
      }

      // OVERREACH: the box may not exceed the blade it was drawn from.
      want = bounds(sweptPoints(m.poses[i - 1], m.poses[i]));
      if (box.x0 < want.x0 - skin || box.y0 < want.y0 - skin ||
          box.x1 > want.x1 + skin || box.y1 > want.y1 + skin) {
        out.push({ move: id, frame: i, rule: 'overreach',
          detail: 'box ' + fmt(box) + ' exceeds blade ' + fmt(want) });
      }

      // A forward swing may not hit someone standing behind you.
      if (box.x0 < -CFG.RIG_BEHIND_SLACK) {
        out.push({ move: id, frame: i, rule: 'behind',
          detail: 'box reaches to x ' + box.x0.toFixed(1) });
      }
    }
  }
  return out;
}

function fmt(b) {
  return '[' + b.x0.toFixed(1) + ',' + b.y0.toFixed(1) + ' .. ' + b.x1.toFixed(1) + ',' + b.y1.toFixed(1) + ']';
}

/* ====================================================================
 * THE FIGURE
 * --------------------------------------------------------------------
 * A full skeleton for the character, posed per state. This lives beside the
 * weapon poses on purpose: both must agree about where the shoulder is, and
 * the fastest way to guarantee that is to have one file own both. FIG.SHOULDER
 * IS CFG.RIG_SHOULDER — the blade arm in a swing and the arm drawn on the body
 * are the same arm.
 *
 * Local space is the STANDING body box: 10 wide, 22 tall, origin top-left,
 * feet at y = 22, authored facing right. Crouched and rolling poses still
 * report feet at 22; Combat.pointToWorld anchors them to the real feet, so a
 * shrinking body box never drags the drawing out of alignment.
 *
 * figure() is a pure function of player state plus a tick for idle breathing.
 * Nothing in the sim calls it — it exists so the presenter has something
 * honest to draw. Poses are data; drawing them is 80-view.js's job.
 * ==================================================================== */
var TAU = Math.PI * 2;

var FIG = {
  MID_X: 5.2,
  HIP_Y: 14,
  CHEST_Y: 8,
  NECK_Y: 5,
  HEAD_Y: 2.8,
  // Head radius against a 22px figure. 3.1 read as a lollipop; the hood ring
  // adds 0.6 on top of this, so 2.2 puts the whole head at ~25% of height —
  // stylised, but short of chibi.
  HEAD_R: 2.2,
  HIP_SPREAD: 1.25,       // px each hip sits either side of the midline
  SHOULDER_SPREAD: 1.5,
  THIGH: 4,
  SHIN: 4,                // 14 + 4 + 4 = 22: a straight leg lands exactly on the feet
  STRIDE: 60              // px of travel per full two-step gait cycle
};

function joint(ox, oy, deg, len) {
  return [ox + len * Math.cos(deg * DEG), oy + len * Math.sin(deg * DEG)];
}

// Two-bone limb. `a` is absolute, `b` is relative to `a`, both in degrees,
// 90 being straight down.
function limb(ox, oy, a, len1, b, len2) {
  var mid = joint(ox, oy, a, len1);
  var end = joint(mid[0], mid[1], a + b, len2);
  return [mid, end];
}

/* Per-state pose parameters. Angles are degrees with 90 straight down; knee
 * and elbow values are relative bends. Everything a state needs to look
 * different lives in this table rather than in a branch.
 *
 * Two constraints every entry has to respect, both learned by drawing them
 * wrong first:
 *
 *   FEET ON 22. A state that moves the hips must move them somewhere the legs
 *   can still reach the ground line, or the character floats. Crouch drops the
 *   hips to 18 and folds the legs hard to cover the remaining 4px.
 *
 *   BLADE ABOVE 22. The carried sword is 11px past the hand. An elbow value
 *   that points the forearm downward puts the tip through the floor, which is
 *   what a straight-down `elbF: 14` did in the first draft. The rest pose
 *   angles the forearm up so the blade is carried forward-low.
 */
var STANCE = {
  idle:   { lean: 0,  thighF: 96,  kneeF: 8,   thighB: 84,  kneeB: 10,
            armF: 118, elbF: -98,  armB: 88,  elbB: 22,  bob: 0.35 },

  // The forearm swings through armF + elb. At elb -80 the back of the swing
  // reached a 48-degree forearm and buried 25px of blade in the floor; -105
  // keeps the forearm inside [-41, 23] across the whole cycle.
  run:    { lean: 8,  swing: 34,   knee: 30,   armSwing: 32, elb: -105, bob: 0.55 },

  jump:   { lean: 6,  thighF: 56,  kneeF: 64,  thighB: 106, kneeB: 24,
            armF: 78,  elbF: -55,  armB: 40,  elbB: 30,  bob: 0 },

  fall:   { lean: -4, thighF: 104, kneeF: 22,  thighB: 74,  kneeB: 34,
            armF: 122, elbF: -100, armB: 140, elbB: -30, bob: 0 },

  // Braced against the wall: legs bent and planted flat rather than
  // reaching for a floor, arms out for balance rather than carried low —
  // the same arm-angle family 'jump' already uses (both clear of BLADE
  // ABOVE 22 for the same reason: neither points the forearm down). No
  // hipY override, so the legs still reach the ground line like every
  // other non-crouching stance; the wall itself, not the pose, is what's
  // holding the character up.
  wallSlide: { lean: 6,  thighF: 70,  kneeF: 90,  thighB: 60,  kneeB: 70,
               armF: 85,  elbF: -60,  armB: 100, elbB: -20, bob: 0 },

  // Ember Dash: a hard forward lean into the burst — front leg driving,
  // back leg trailing straight, arms swept back — not a designed VFX pass
  // (abilities spec §6 defers the actual dash flare/trail), just a real,
  // distinct pose so the state does not silently freeze mid-burst the way
  // an unlisted state would (this table's own "every state has a stance"
  // rule, enforced directly by verify_rig). elbF/elbB both sit inside the
  // same [-100, -55] range 'jump'/'fall' already clear for BLADE ABOVE 22.
  dash: { lean: 16, thighF: 58,  kneeF: 44,  thighB: 128, kneeB: -18,
          armF: 60,  elbF: -70,  armB: 150, elbB: -60, bob: 0 },

  // Hanging from a caught ledge: arms raised to grip it (near straight up,
  // 90 = down in this table's own convention, so an angle in the -70s is
  // most of the way there), legs hanging loose below rather than reaching
  // for a ground line that genuinely is not under them — the one stance in
  // this table that deliberately does NOT follow every other non-crouching
  // stance's "feet on 22" convention, because nothing is under the feet to
  // plant on. verify_rig's own 1500-tick floor-contact sweep runs against
  // flatWorld, which has no wall that ever ends into a ledge — 'ledgeGrab'
  // is structurally unreachable there, so that generic sweep can never see
  // this pose at all (an adversarial pass found an earlier draft of this
  // comment overclaiming that it did). A dedicated test drives a real
  // ledgeGrab on a real constructed world and poses it directly instead.
  ledgeGrab: { lean: 2,  thighF: 100, kneeF: 15,  thighB: 92,  kneeB: 10,
               armF: -75, elbF: -30,  armB: -65, elbB: -40, bob: 0 },

  crouch: { lean: 12, hipY: 18, chestY: 13.4, neckY: 11.2, headY: 9.6,
            thighF: 35, kneeF: 110, thighB: 145, kneeB: -110,
            armF: 100, elbF: -110, armB: 120, elbB: -40, bob: 0 },

  slam:   { lean: 0,  thighF: 55,  kneeF: 80,  thighB: 125, kneeB: -80,
            armF: 40,  elbF: -70,  armB: 140, elbB: 70,  bob: 0 },

  dead:   { lean: 0,  hipY: 19, chestY: 19, neckY: 19, headY: 18.6,
            thighF: 15, kneeF: 25, thighB: 5, kneeB: 20,
            armF: 175, elbF: 5,   armB: 178, elbB: 3,   bob: 0 }
};

Rig.prototype.figure = function (player, t) {
  var b = player.body;
  var st = player.state;
  var s = STANCE[st] || STANCE.idle;
  var out = { state: st, curl: 0, ember: 1 };

  // Gait phase is driven by DISTANCE TRAVELLED, not a timer, so the feet
  // cannot slide: stop moving and the cycle stops with you. Multiplying by
  // facing keeps the cycle running forward when the figure is mirrored.
  var phase = (b.x * player.facing / FIG.STRIDE) * TAU;

  var thighF, kneeF, thighB, kneeB, armF, elbF, armB, elbB, lean, bob;

  if (st === 'run') {
    var sw = Math.sin(phase), swB = Math.sin(phase + Math.PI);
    thighF = 90 + s.swing * sw;
    thighB = 90 + s.swing * swB;
    // The knee folds on the forward swing and straightens to plant.
    kneeF = 14 + s.knee * Math.max(0, Math.sin(phase + 1.15));
    kneeB = 14 + s.knee * Math.max(0, Math.sin(phase + Math.PI + 1.15));
    armF = 96 - s.armSwing * sw;
    armB = 96 - s.armSwing * swB;
    elbF = s.elb; elbB = 20;
    lean = s.lean;
    bob = Math.abs(Math.sin(phase)) * s.bob;
  } else {
    thighF = s.thighF; kneeF = s.kneeF;
    thighB = s.thighB; kneeB = s.kneeB;
    armF = s.armF; elbF = s.elbF;
    armB = s.armB; elbB = s.elbB;
    lean = s.lean;
    bob = s.bob ? Math.sin(t / 26) * s.bob : 0;
  }

  // A roll is drawn as a tucked ball rotating through its own travel; the
  // limb angles below still feed it, they just get spun about the centre.
  if (st === 'roll') {
    out.curl = 1;
    // Spun by distance, like the gait, so the ball cannot skid.
    out.spin = (b.x * player.facing / 26) * TAU;
    thighF = 40; kneeF = 110; thighB = 30; kneeB = 120;
    armF = 150; elbF = 40; armB = 160; elbB = 40;
    lean = 0; bob = 0;
  }

  // A state may drop the whole torso (crouch, death). The legs still have to
  // reach y = 22 from wherever the hips end up.
  var pick = function (v, dflt) { return v === undefined ? dflt : v; };
  var hipY = pick(s.hipY, FIG.HIP_Y) + bob;
  var chestY = pick(s.chestY, FIG.CHEST_Y) + bob;
  var neckY = pick(s.neckY, FIG.NECK_Y) + bob;
  var headY = pick(s.headY, FIG.HEAD_Y) + bob;
  var leanX = lean * 0.06;

  out.hip = [FIG.MID_X + leanX * 0.3, hipY];
  out.chest = [FIG.MID_X + leanX, chestY];
  out.neck = [FIG.MID_X + leanX * 1.3, neckY];
  out.head = [FIG.MID_X + leanX * 1.6, headY];
  out.headR = FIG.HEAD_R;

  var hipFx = out.hip[0] + FIG.HIP_SPREAD, hipBx = out.hip[0] - FIG.HIP_SPREAD;
  var legF = limb(hipFx, hipY, thighF, FIG.THIGH, kneeF, FIG.SHIN);
  var legB = limb(hipBx, hipY, thighB, FIG.THIGH, kneeB, FIG.SHIN);
  out.hipF = [hipFx, hipY]; out.kneeF = legF[0]; out.footF = legF[1];
  out.hipB = [hipBx, hipY]; out.kneeB = legB[0]; out.footB = legB[1];

  // The BACK arm is always posed from the stance. The FRONT arm is the weapon
  // arm: mid-swing it comes straight out of the baked move pose, so the drawn
  // arm and the tested hitbox are the same geometry.
  var shBx = out.chest[0] - FIG.SHOULDER_SPREAD;
  var armBj = limb(shBx, chestY, armB, CFG.RIG_ARM_UPPER, elbB, CFG.RIG_ARM_LOWER);
  out.shoulderB = [shBx, chestY]; out.elbowB = armBj[0]; out.handB = armBj[1];

  var a = player.attack;
  if (a && !out.curl) {
    var mv = this.moves[a.id];
    var idx = a.frame < mv.poses.length ? a.frame : mv.poses.length - 1;
    var p = mv.poses[idx];
    out.shoulderF = p.shoulder;
    out.elbowF = p.elbow;
    out.handF = p.hand;
    out.tipF = p.tip;
    out.swinging = !!mv.boxes[idx];
  } else {
    var shFx = CFG.RIG_SHOULDER_X + leanX;
    var armFj = limb(shFx, chestY, armF, CFG.RIG_ARM_UPPER, elbF, CFG.RIG_ARM_LOWER);
    out.shoulderF = [shFx, chestY];
    out.elbowF = armFj[0];
    out.handF = armFj[1];
    // The blade is carried along the forearm when it is not being swung.
    out.tipF = joint(armFj[1][0], armFj[1][1], armF + elbF, CFG.RIG_BLADE);
    out.swinging = false;
  }

  /* The cloak hem trails the direction of travel. Purely presentational, but
   * it is what makes a 22px figure read as moving rather than sliding. */
  var drag = C.clamp(-b.vx * 0.85, -5.5, 5.5);
  var rise = C.clamp(-b.vy * 0.35, -3, 3.5);
  var hem = Math.min(hipY + 7.6, 21.4);      // never past the ground line
  out.cloak = [
    [out.neck[0] - 0.6, out.neck[1] + 0.4],
    [shBx - 2.0, chestY - 0.6],
    [hipBx - 2.2 + drag, hipY + 4.4 - rise],
    [out.hip[0] + 0.4 + drag * 0.8, hem - rise * 0.6],
    [out.hip[0] + 2.1, hipY + 1.8]
  ];

  return out;
};

Rig.FIG = FIG;
Rig.STANCE = STANCE;

/* --------------------------------------------------------------------- Rig */
function bakeAll(table) {
  var out = {}, id;
  for (id in table) {
    if (!Object.prototype.hasOwnProperty.call(table, id)) continue;
    out[id] = bakeMove(id, table[id]);
  }
  return out;
}

function Rig(table) {
  this.table = table || MOVES;
  this.moves = bakeAll(this.table);
  // The envelope every box in the game lives inside, derived from the poses.
  var pts = [], id, m, i;
  for (id in this.moves) {
    m = this.moves[id];
    for (i = 0; i < m.poses.length; i++) { pts.push(m.poses[i].hand, m.poses[i].tip); }
  }
  this.envelope = Object.freeze(bounds(pts));
}
Rig.prototype.move = function (id) { return this.moves[id]; };
Rig.prototype.ids = function () { return Object.keys(this.moves); };
Rig.prototype.audit = function () { return audit(this.moves); };

Rig.MOVES = MOVES;
Rig.bakeMove = bakeMove;
Rig.bakeAll = bakeAll;
Rig.audit = audit;
Rig.poseAt = poseAt;
Rig.bounds = bounds;

// Baked once, at load — "at boot" (L9). The result is frozen, so nothing
// downstream can widen a box at runtime and call it a balance change.
C.RIG = new Rig(MOVES);
C.Rig = Rig;

})(CINDER);
