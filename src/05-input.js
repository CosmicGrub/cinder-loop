/* ===========================================================================
 * 05-input.js  —  Pad / Pads
 * ---------------------------------------------------------------------------
 * SIM layer. Knows nothing about keyboards or gamepads; 95-app.js translates
 * hardware into set() calls. That split is what lets the suites drive the sim
 * with scripted input and get the same result a human gets.
 *
 * N-player from the first commit (D5): Pads is an array, never a singleton.
 *
 * Owned by: Input team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG;

var BUTTONS = ['left', 'right', 'up', 'down', 'jump', 'roll', 'attack', 'parry'];

/* Per-button grace window. Jump gets the tighter buffer because it is the
 * one players spam at the edge of a landing; everything else gets the longer
 * pending hold used when a state has the player locked out (mid-roll, hurt).
 * Both are measured by verify_move rather than read from here (L8).
 *
 * BUTTONS and WINDOW are two separate tables on purpose — the per-tick
 * cur/prev/pend bookkeeping only needs to know a button EXISTS (BUTTONS),
 * while WINDOW is a per-button policy choice. But that also means adding a
 * button to BUTTONS alone is a real, silent trap: WINDOW[name] stays
 * undefined, `undefined > 0` is false, and Pad.prototype.update's own
 * arming line never sets pend[name] above 0 — buffered() then always
 * reads false and the button silently never fires, no error anywhere.
 * parry's own entry below exists specifically to not repeat that. */
var WINDOW = {
  left: 0, right: 0, up: 0, down: 0,
  jump: CFG.JUMP_BUFFER_FRAMES,
  roll: CFG.PENDING_FRAMES,
  attack: CFG.PENDING_FRAMES,
  parry: CFG.PENDING_FRAMES
};

function Pad() {
  this.cur = {};
  this.prev = {};
  this.next = {};
  this.pend = {};
  this.reset();
}
Pad.BUTTONS = BUTTONS;
Pad.WINDOW = WINDOW;

Pad.prototype.reset = function () {
  for (var i = 0; i < BUTTONS.length; i++) {
    var b = BUTTONS[i];
    this.cur[b] = false;
    this.prev[b] = false;
    this.next[b] = false;
    this.pend[b] = 0;
  }
};

// Hardware (or a test) writes here. Nothing reads `next` except update().
Pad.prototype.set = function (name, down) {
  if (BUTTONS.indexOf(name) === -1) throw new Error('Pad.set: unknown button "' + name + '"');
  this.next[name] = !!down;
  return this;
};

/* One sample per tick.
 *
 * First-press-safe: a fresh Pad has every button false in both cur and prev,
 * so a button already held when the pad comes alive still reads as a press on
 * its first update. The buffer is never swallowed by construction order.
 *
 * `frozen` is passed during hitstop. Edges are still computed and pending
 * windows are still ARMED, but they do not decay — hitstop must never eat a
 * player's input (asserted by verify_arch). */
Pad.prototype.update = function (frozen) {
  var i, b;
  for (i = 0; i < BUTTONS.length; i++) {
    b = BUTTONS[i];
    this.prev[b] = this.cur[b];
    this.cur[b] = this.next[b];
  }
  // Decay BEFORE arming, so a press landing this tick gets its whole window.
  if (!frozen) {
    for (i = 0; i < BUTTONS.length; i++) {
      b = BUTTONS[i];
      if (this.pend[b] > 0) this.pend[b]--;
    }
  }
  for (i = 0; i < BUTTONS.length; i++) {
    b = BUTTONS[i];
    if (this.cur[b] && !this.prev[b] && WINDOW[b] > 0) this.pend[b] = WINDOW[b];
  }
};

Pad.prototype.down = function (b) { return this.cur[b] === true; };
Pad.prototype.pressed = function (b) { return this.cur[b] === true && this.prev[b] === false; };
Pad.prototype.released = function (b) { return this.cur[b] === false && this.prev[b] === true; };
Pad.prototype.buffered = function (b) { return this.pend[b] > 0; };

// Take the buffered press if there is one. Consuming is destructive on
// purpose: one press must never fire two actions.
Pad.prototype.consume = function (b) {
  if (this.pend[b] > 0) { this.pend[b] = 0; return true; }
  return false;
};

// -1 left, +1 right, 0 neutral. Opposing keys cancel rather than favouring
// one side, which is the only behaviour that feels the same on a keyboard
// and on a stick.
Pad.prototype.axis = function () {
  return (this.cur.right ? 1 : 0) - (this.cur.left ? 1 : 0);
};

/* ---------------------------------------------------------------- Pads */
function Pads(n) {
  this.list = [];
  for (var i = 0; i < (n || 1); i++) this.list.push(new Pad());
}
Pads.prototype.get = function (i) { return this.list[i]; };
Pads.prototype.count = function () { return this.list.length; };
Pads.prototype.update = function (frozen) {
  for (var i = 0; i < this.list.length; i++) this.list[i].update(frozen);
};
Pads.prototype.reset = function () {
  for (var i = 0; i < this.list.length; i++) this.list[i].reset();
};
// Grow to N pads without disturbing the pads already in play — a second
// player joining mid-run must not reset player one's buffers.
Pads.prototype.ensure = function (n) {
  while (this.list.length < n) this.list.push(new Pad());
  return this;
};

C.Pad = Pad;
C.Pads = Pads;

})(CINDER);
