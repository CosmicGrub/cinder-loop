/* ===========================================================================
 * 94-touch.js  —  touch input ("Gesture Surface", locked 2026-07-26)
 * ---------------------------------------------------------------------------
 * PRESENTER layer. Decided by a judged design panel comparing three schemes
 * against this game's actual measured mechanics (0-frame latency, 5-frame
 * jump buffer, roll as a discrete press not a hold, the down+attack heavy
 * combo) — full rationale in CINDER_LOOP_MASTERFILE.md. Gesture Surface won
 * on the two criteria the brief treats as hardest: the heavy-attack solve
 * needs no combined-gesture recognition at all (two independently tracked
 * fingers are sufficient, because Combat.begin already reads pad.down('down')
 * at the moment it consumes the buffered attack press), and it is the only
 * scheme that does not permanently occupy play-area pixels — no opaque
 * button art, ever, just faint glyph outlines that fade further with use.
 *
 * Two claims in the winning proposal were checked against the live source by
 * two independent judges and found FALSE before this was implemented:
 *   1. "Pause-menu navigation already routes through Pad" — it does not.
 *      Pad.update() only runs from Sim.step(), which is never called while
 *      app.paused (see 95-app.js). This file adds real menu-routing glue,
 *      the same way keyboard and gamepad each needed their own.
 *   2. "isTouch detection" — the proposal described a boot-time
 *      `'ontouchstart' in window` snapshot. That is a known false-positive
 *      trap (measured directly: a plain headless launch with ZERO touch
 *      emulation reported touch support through it). This file has nothing
 *      to do with detecting touch capability at all — that already lives in
 *      95-app.js as a live `matchMedia('(pointer: coarse)')` check, fixed
 *      independently before the panel's synthesis was read, which is why the
 *      panel's own correction matched what was already on disk.
 *
 * Split like Settings/Menu: a pure, storage- and DOM-free core (zoneAt, the
 * Stick hysteresis state machine) that a bare Node sandbox can test directly
 * against the exact multi-touch correctness properties the judges scrutinized
 * — ghost-promotion tagged by origin zone, refcounted action zones — plus a
 * thin DOM-facing shell that wires that core to real touch events.
 *
 * Owned by: App team.
 * ======================================================================== */
;(function (C) {
'use strict';

/* ------------------------------------------------------------ zone layout
 * All fractions of the LOGICAL (CSS-pixel) viewport, matching everywhere
 * else in the presenter that already measures in view.cssW/cssH rather than
 * the DPR-scaled backing store. TOP_MARGIN is a dead strip the full width of
 * the screen — a thumb resting near the top edge (where a phone's status bar
 * or a notch lives) does nothing — except its top-right corner, which is the
 * pause target, sized to match a comfortable minimum touch target. */
var TOP_MARGIN = 48;
var PAUSE_SIZE = 48;
var JUMP_FRAC = 0.42;   // ry band boundaries, as a fraction of the action column
var ROLL_FRAC = 0.60;
// Parry (abilities spec §2b, Manual touch mode) — a real, named exception to
// this file's own otherwise-locked layout (2026-07-26), added specifically
// for a new input the locked scheme had no button for. Splits what was
// ATTACK's own remaining 0.60-1.0 share evenly in two rather than
// re-deriving new boundaries for all four bands — PARRY_FRAC sits between
// ROLL and ATTACK, a judgment call (not a measured ergonomic result) on the
// same "no capture plate exists" footing this project's other UI-placement
// decisions already stand on.
var PARRY_FRAC = 0.80;

var ZONE = { PAUSE: 'pause', DEAD: 'dead', MOVE: 'move', JUMP: 'jump', ROLL: 'roll', PARRY: 'parry', ATTACK: 'attack' };

/* Pure. No DOM, no instance state — the same (x, y, cssW, cssH) always
 * classifies the same way, which is what makes "role decided once at
 * touchstart, never re-evaluated on touchmove" both the spec and something a
 * test can hold it to directly. Defensive against a degenerate viewport
 * (cssH at or below TOP_MARGIN) even though fit() floors cssH at 240 in
 * practice — this function does not get to assume its caller's floor. */
function zoneAt(x, y, cssW, cssH) {
  if (y < TOP_MARGIN) {
    if (x >= cssW - PAUSE_SIZE && y < PAUSE_SIZE) return ZONE.PAUSE;
    return ZONE.DEAD;
  }
  if (x < cssW * 0.5) return ZONE.MOVE;

  var rH = Math.max(1, cssH - TOP_MARGIN);
  var ry = (y - TOP_MARGIN) / rH;      // 0..1 down the action column
  if (ry < JUMP_FRAC) return ZONE.JUMP;
  if (ry < ROLL_FRAC) return ZONE.ROLL;
  if (ry < PARRY_FRAC) return ZONE.PARRY;
  return ZONE.ATTACK;
}

/* --------------------------------------------------------------- Stick
 * Per-axis hysteresis (a Schmitt trigger, independently on x and y): a
 * direction latches at |delta| >= ENTER and releases only once |delta| drops
 * back below EXIT. Independent axes, not angle-bucketed, is deliberate —
 * it is what makes down+left/right diagonals fall out for free, the same way
 * two simultaneously held keys already do on keyboard.
 *
 * A direct reversal (dragging hard from +14 straight past -14 in one
 * touchmove sample, which real fast drags do) flips immediately rather than
 * requiring an intermediate frame back through the dead zone — real touchmove
 * events do not sample continuously, so requiring that intermediate frame
 * would silently drop input on a fast flick. */
var ENTER = 14, EXIT = 8;

function Stick() {
  this.ax = 0; this.ay = 0;         // anchor, set at begin()
  this.xDir = 0; this.yDir = 0;     // -1 / 0 / 1, latched
  this.left = false; this.right = false; this.up = false; this.down = false;
}
Stick.prototype.begin = function (x, y) {
  this.ax = x; this.ay = y;
  this.xDir = 0; this.yDir = 0;
  this._sync();
  return this;
};
Stick.prototype.move = function (x, y) {
  var dx = x - this.ax, dy = y - this.ay;
  this.xDir = latch(this.xDir, dx);
  this.yDir = latch(this.yDir, dy);
  this._sync();
  return this;
};
Stick.prototype.end = function () {
  this.xDir = 0; this.yDir = 0;
  this._sync();
  return this;
};
Stick.prototype._sync = function () {
  this.left = this.xDir === -1; this.right = this.xDir === 1;
  this.up = this.yDir === -1; this.down = this.yDir === 1;
};
function latch(dir, delta) {
  if (dir === 0) {
    if (delta >= ENTER) return 1;
    if (delta <= -ENTER) return -1;
    return 0;
  }
  if (dir === 1) {
    if (delta <= -ENTER) return -1;          // direct reversal
    if (delta < EXIT) return 0;
    return 1;
  }
  // dir === -1
  if (delta >= ENTER) return 1;
  if (delta > -EXIT) return 0;
  return -1;
}

/* ---------------------------------------------------------- TouchControls
 * The DOM-facing shell. `controller` decouples this from `app`'s exact shape
 * — 95-app.js supplies { isPaused, openPause, closePause, menuMove,
 * menuConfirm, menuCancel } — the same "here is a pad, here is a menu-ish
 * interface" pattern pollMenuGamepad already uses inline; this is the touch
 * equivalent, just large enough to want its own file.
 *
 * pad.set() calls happen UNCONDITIONALLY on every real touch transition,
 * regardless of pause state. This is safe, not careless: Pad.set() only ever
 * writes to `.next`, which Pad.update() — sim-clocked, never invoked while
 * paused — is the sole reader of. A touch that starts before a pause and
 * lifts during it still correctly clears `.next`, so resuming reflects
 * whatever is ACTUALLY held at that moment, exactly like the keyboard's
 * `next`/`cur` split already behaves. Layered on top, and ONLY while paused,
 * the same zone transitions additionally drive the menu — not a replacement
 * branch, an addition, which is what keeps this file from needing two
 * divergent copies of "what does this zone mean." */
function TouchControls(canvas, pad, controller) {
  this.canvas = canvas;
  this.pad = pad;
  this.controller = controller;
  this.touches = Object.create(null);     // identifier -> record
  this.stick = new Stick();
  this.stickOwner = null;                 // identifier, or null
  this.zoneCount = { jump: 0, roll: 0, parry: 0, attack: 0 };
  // Touch Assist (abilities spec §2b): true exactly while a roll-zone
  // touch's own Assist arm is the reason 'parry' is being held — see
  // _onStart/_release's own comments for why this needs to be real,
  // tracked state rather than inferred from zoneCount.roll at release time.
  this._assistArmed = false;
  this.everTouched = false;
  this.touchCount = 0;                    // for the familiarity fade
  this._bound = null;
}

TouchControls.zoneAt = zoneAt;
TouchControls.Stick = Stick;
TouchControls.ZONE = ZONE;
TouchControls.TOP_MARGIN = TOP_MARGIN;
TouchControls.PAUSE_SIZE = PAUSE_SIZE;

TouchControls.prototype._cssSize = function () {
  var r = this.canvas.getBoundingClientRect();
  return [r.width, r.height];
};

TouchControls.prototype.attach = function () {
  if (this._bound) return this;
  var self = this;
  var opts = { passive: false };
  function handler(fn) { return function (e) { fn.call(self, e); }; }
  this._bound = {
    start: handler(this._onStart), move: handler(this._onMove),
    end: handler(this._onEnd), cancel: handler(this._onCancel)
  };
  this.canvas.addEventListener('touchstart', this._bound.start, opts);
  this.canvas.addEventListener('touchmove', this._bound.move, opts);
  this.canvas.addEventListener('touchend', this._bound.end, opts);
  this.canvas.addEventListener('touchcancel', this._bound.cancel, opts);
  return this;
};

// Point of truth for "should the overlay draw." touch-action:none on #game
// already stops the page itself from scrolling/zooming under a touch, so
// preventDefault below is belt-and-suspenders for browsers that need it
// asked explicitly, not the only thing keeping the page still.
TouchControls.prototype._point = function (touch) {
  var r = this.canvas.getBoundingClientRect();
  return [touch.clientX - r.left, touch.clientY - r.top];
};

TouchControls.prototype._onStart = function (e) {
  e.preventDefault();
  this.everTouched = true;
  var w = this._cssSize(), cssW = w[0], cssH = w[1], i, t, p, zone;
  for (i = 0; i < e.changedTouches.length; i++) {
    t = e.changedTouches[i];
    p = this._point(t);
    zone = zoneAt(p[0], p[1], cssW, cssH);
    // `id` is stored alongside the record, typed exactly as the browser gave
    // it (a number, per the Touch Events spec) — never re-derived from a
    // for-in key. for...in over a plain object always yields STRING keys
    // regardless of what type the original property name was, so promoting
    // a ghost via that loop's own key would silently turn stickOwner into a
    // string; every subsequent touchmove's strict `t.identifier ===
    // this.stickOwner` check would then permanently fail (2 !== "2"),
    // freezing movement the instant a promotion happened. Measured directly
    // by a test that actually exercised movement AFTER a promotion, not just
    // checked that some promotion occurred.
    this.touches[t.identifier] = { id: t.identifier, zone: zone, x: p[0], y: p[1] };
    this.touchCount++;

    if (zone === ZONE.PAUSE) {
      if (this.controller.isPaused()) this.controller.closePause();
      else this.controller.openPause();
      continue;
    }
    if (zone === ZONE.MOVE) {
      // First-claim-wins; a second finger in the movement half is a ghost,
      // and BY CONSTRUCTION only a touch classified MOVE at its own
      // touchstart is ever stored with zone==='move' — a ghost can only ever
      // be promoted from among these, never from a touch that started
      // somewhere else. That is the whole fix for the cross-zone promotion
      // bug the judges found: there is no code path that promotes from any
      // collection wider than "touches whose own zone is move."
      if (this.stickOwner === null) {
        this.stickOwner = t.identifier;
        this.stick.begin(p[0], p[1]);
        this._applyStick();
      }
      // else: recorded above as a move-zone touch, otherwise inert until
      // promoted on the owner's release.
      continue;
    }
    if (zone === ZONE.JUMP || zone === ZONE.ROLL || zone === ZONE.PARRY || zone === ZONE.ATTACK) {
      this.zoneCount[zone]++;
      if (this.zoneCount[zone] === 1) {
        this.pad.set(zone, true);
        if (this.controller.isPaused()) {
          if (zone === ZONE.JUMP) this.controller.menuConfirm();
          else if (zone === ZONE.ROLL) this.controller.menuCancel();
          // PARRY and ATTACK have no menu meaning; simply not wired, not an
          // omission.
        } else if (zone === ZONE.ROLL && this.controller.parryAssistEnabled &&
                   this.controller.parryAssistEnabled() && this.controller.recentTelegraph()) {
          /* Touch Assist (abilities spec §2b): additive to the existing
           * Roll-zone behavior, not a divergent second copy of what a zone
           * means — the SAME roll-zone touch that already sets 'roll' also
           * arms 'parry', decided once at this same touchstart moment
           * (mirroring "role decided once, never re-evaluated" everywhere
           * else in this file), gated on a real recent telegraph so this
           * never fires as a free, unconditional parry-on-every-roll.
           * Released alongside roll's own full release, below — never
           * simply left held for the whole roll-zone touch's duration
           * unmanaged, since the sim's own parryWindow/parryCd mechanism
           * is edge-triggered (only the rising edge matters), so exactly
           * WHEN it releases doesn't change what the read itself does. */
          this.pad.set('parry', true);
          this._assistArmed = true;
        }
      }
    }
    // ZONE.DEAD: recorded (so its later touchend is a no-op lookup, not a
    // missing-key error) but drives nothing.
  }
};

TouchControls.prototype._onMove = function (e) {
  e.preventDefault();
  var i, t, rec, p;
  for (i = 0; i < e.changedTouches.length; i++) {
    t = e.changedTouches[i];
    rec = this.touches[t.identifier];
    if (!rec) continue;
    p = this._point(t);
    rec.x = p[0]; rec.y = p[1];
    if (t.identifier === this.stickOwner) {
      this.stick.move(p[0], p[1]);
      this._applyStick();
    }
    // Non-owner move-zone ghosts and action-zone touches: zone was decided
    // once at touchstart and is never re-evaluated here, exactly per spec —
    // dragging a finger from ATTACK into ROLL mid-press does not relabel it.
  }
};

TouchControls.prototype._applyStick = function () {
  var s = this.stick;
  this.pad.set('left', s.left); this.pad.set('right', s.right);
  this.pad.set('up', s.up); this.pad.set('down', s.down);
  if (this.controller.isPaused()) {
    // Menu nav reads the stick as discrete steps, not a held direction — a
    // held drag must not repeat move() every frame. moveDir tracks the last
    // direction ACTED on so a returning finger to (0,0) and back re-arms it.
    var dir = s.up ? -1 : (s.down ? 1 : 0);
    if (dir !== this._lastMenuDir && dir !== 0) this.controller.menuMove(dir);
    this._lastMenuDir = dir;
  }
};

TouchControls.prototype._release = function (identifier) {
  var rec = this.touches[identifier];
  if (!rec) return;
  delete this.touches[identifier];

  if (identifier === this.stickOwner) {
    this.stickOwner = null;
    this.stick.end();
    this._applyStick();
    this._lastMenuDir = 0;
    // Promote the oldest remaining move-zone ghost, if any. Iteration order
    // over string keys that are non-negative integers is ascending numeric
    // in every engine this project targets (V8/JSC/SpiderMonkey all special-
    // case that key shape), so "first remaining" is well-defined without a
    // separate ordered list.
    for (var key in this.touches) {
      if (this.touches[key].zone === ZONE.MOVE) {
        this.stickOwner = this.touches[key].id;   // the record's own typed id, not the for-in key
        this.stick.begin(this.touches[key].x, this.touches[key].y);
        this._applyStick();
        break;
      }
    }
    return;
  }

  if (rec.zone === ZONE.JUMP || rec.zone === ZONE.ROLL || rec.zone === ZONE.PARRY || rec.zone === ZONE.ATTACK) {
    this.zoneCount[rec.zone] = Math.max(0, this.zoneCount[rec.zone] - 1);
    if (this.zoneCount[rec.zone] === 0) {
      if (rec.zone === ZONE.PARRY) {
        /* A genuine parry-zone release. Symmetric with the roll-release
         * branch below — an adversarial review pass found the FIRST draft
         * only guarded that one direction (roll releasing checked whether
         * a real parry touch was still down, but a real parry touch
         * releasing never checked whether Assist was still holding the
         * button open via an active roll touch), so a real parry-zone
         * touch releasing BEFORE the roll touch that also armed Assist
         * could turn the button off one event early. this._assistArmed is
         * the one piece of state that makes both directions consistent
         * without needing to reason about zoneCount.roll directly (a roll
         * touch can be down without ever having armed Assist at all — no
         * recent telegraph, or Assist off at the moment it started). */
        if (!this._assistArmed) this.pad.set('parry', false);
      } else {
        this.pad.set(rec.zone, false);
        if (rec.zone === ZONE.ROLL) {
          // Touch Assist: the roll touch's own reason to hold parry open
          // ends here regardless of whether a real parry-zone touch is
          // ALSO currently down — but only actually WRITE false to the pad
          // if no such genuine touch is still holding it (zoneCount.parry
          // === 0), the cross-zone protection this file's own refcounting
          // exists to give every zone pairing, extended here rather than
          // assumed safe by construction.
          this._assistArmed = false;
          if (this.zoneCount.parry === 0) this.pad.set('parry', false);
        }
      }
    }
  }
};

TouchControls.prototype._onEnd = function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) this._release(e.changedTouches[i].identifier);
};
TouchControls.prototype._onCancel = function (e) {
  // Bound identically to touchend, per spec — a cancelled touch (an OS
  // gesture stealing it, e.g.) must release exactly as cleanly as a lifted
  // one, or a button can be left silently stuck held.
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) this._release(e.changedTouches[i].identifier);
};

/* Defense in depth, wired alongside the existing blur handler's p1.reset()
 * in 95-app.js: force-clears every button this module could be holding,
 * regardless of what DOM events did or did not fire on the way out. */
TouchControls.prototype.reset = function () {
  this.touches = Object.create(null);
  this.stickOwner = null;
  this.stick.end();
  this.pad.set('left', false); this.pad.set('right', false);
  this.pad.set('up', false); this.pad.set('down', false);
  this.zoneCount.jump = 0; this.zoneCount.roll = 0; this.zoneCount.parry = 0; this.zoneCount.attack = 0;
  this.pad.set('jump', false); this.pad.set('roll', false); this.pad.set('parry', false); this.pad.set('attack', false);
  this._assistArmed = false;
  this._lastMenuDir = 0;
  return this;
};

/* -------------------------------------------------------------- render
 * No opaque button art, ever — a faint glyph outline per action zone, a
 * thin ring+nub for the stick only while it has an owner. Alpha starts
 * higher and settles to a quieter resting value after a handful of real
 * touches ("fades back after first-session familiarity"); nothing here
 * claims to know when a specific PLAYER has become familiar, it is a simple,
 * honest function of touch count, not a behavioural model. */
var GLYPH = {
  restLo: 0.09, restHi: 0.22, familiarAfter: 8,
  hold: '#ff9a5c', idle: '#e8d8b0'
};

TouchControls.prototype.render = function (ctx, cssW, cssH) {
  if (!this.everTouched) return this;
  var rest = this.touchCount >= GLYPH.familiarAfter
    ? GLYPH.restLo
    : GLYPH.restHi - (GLYPH.restHi - GLYPH.restLo) * (this.touchCount / GLYPH.familiarAfter);

  var rH = Math.max(1, cssH - TOP_MARGIN);
  var bands = [
    ['jump', 0, JUMP_FRAC],
    ['roll', JUMP_FRAC, ROLL_FRAC],
    ['parry', ROLL_FRAC, PARRY_FRAC],
    ['attack', PARRY_FRAC, 1]
  ];
  ctx.save();
  ctx.lineWidth = 2;
  for (var i = 0; i < bands.length; i++) {
    var name = bands[i][0], y0 = TOP_MARGIN + rH * bands[i][1], y1 = TOP_MARGIN + rH * bands[i][2];
    var held = this.zoneCount[name] > 0;
    ctx.strokeStyle = held ? GLYPH.hold : GLYPH.idle;
    ctx.globalAlpha = held ? 0.6 : rest;
    drawGlyph(ctx, name, cssW * 0.75, (y0 + y1) / 2);
  }

  // Pause corner: a small quiet outline, always at the same quiet rest alpha
  // (there is no "held" concept for a tap-and-release target).
  ctx.strokeStyle = GLYPH.idle;
  ctx.globalAlpha = rest;
  ctx.strokeRect(cssW - PAUSE_SIZE + 14, 14, PAUSE_SIZE - 28, PAUSE_SIZE - 28);

  if (this.stickOwner !== null) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = GLYPH.hold;
    ctx.beginPath();
    ctx.arc(this.stick.ax, this.stick.ay, 26, 0, 6.2831853);
    ctx.stroke();
    var nx = this.stick.ax + (this.stick.right ? 14 : (this.stick.left ? -14 : 0));
    var ny = this.stick.ay + (this.stick.down ? 14 : (this.stick.up ? -14 : 0));
    ctx.beginPath();
    ctx.arc(nx, ny, 8, 0, 6.2831853);
    ctx.stroke();
  }
  ctx.restore();
  return this;
};

function drawGlyph(ctx, name, cx, cy) {
  ctx.beginPath();
  if (name === 'jump') {
    ctx.moveTo(cx - 10, cy + 6); ctx.lineTo(cx, cy - 8); ctx.lineTo(cx + 10, cy + 6);
  } else if (name === 'roll') {
    ctx.arc(cx, cy, 10, 0.6, 5.4);
  } else if (name === 'parry') {
    // A diamond/guard outline — distinct from jump's triangle, roll's arc,
    // and attack's cross, evoking a block rather than a swing or a dodge.
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx, cy + 10);
    ctx.lineTo(cx - 8, cy); ctx.closePath();
  } else {
    ctx.moveTo(cx - 9, cy - 9); ctx.lineTo(cx + 9, cy + 9);
    ctx.moveTo(cx + 9, cy - 9); ctx.lineTo(cx - 9, cy + 9);
  }
  ctx.stroke();
}

C.TouchControls = TouchControls;

})(CINDER);
