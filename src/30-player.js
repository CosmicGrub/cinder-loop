/* ===========================================================================
 * 30-player.js  —  movement state machine
 * ---------------------------------------------------------------------------
 * SIM layer. Run, jump, double jump, wall slide, wall jump, roll, crouch,
 * drop-through, slam, hazards, death and respawn.
 *
 * Ordering inside update() is not arbitrary. Input is consumed and acted on
 * BEFORE the body moves, which is the whole reason a press costs zero frames
 * of latency: the key goes down and the same tick's move() already carries
 * the new velocity. Any refactor that samples input after the move quietly
 * adds a frame, and verify_move will catch it.
 *
 * Owned by: Player team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, TILE = C.TILE, Body = C.Body, approach = C.approach, sign = C.sign, abs = C.abs;

// Is the body resting on a one-way platform right now? Only needed to decide
// whether crouch+jump means "drop through" or "jump", so it probes a 1px
// sliver directly under the feet rather than re-running the resolver.
function standingOnOneWay(world, b) {
  var s = world.span(b.x, b.y + b.h, b.w, 1), tx;
  for (tx = s.x0; tx <= s.x1; tx++) {
    if (world.isOneWay(tx, s.y0)) return true;
  }
  return false;
}

/* Real spatial reasoning about the tilemap: does the wall the body is
 * touching run out, within reach, into a stand-on-able ledge? Searches a
 * window of rows near the body's own current position (one tile above the
 * head down to the feet) rather than a single fixed offset — at terminal
 * fall speed the body can cover most of a tile in one tick, so a fixed
 * offset can step clean over the one row that actually matters. The
 * TOPMOST valid row wins: the highest ledge already within reach, not a
 * lower one further down the same wall. `dir` is `body.onWall`. Returns
 * `{wallTx, row}` (row = the empty row directly above the ledge's solid
 * surface) or null. Verified against constructed test worlds — a clean
 * ledge, a tall wall with none, a ledge with no headroom to climb into —
 * before this was ever wired into update() below. */
function detectLedge(world, b, dir) {
  var wallTx = dir > 0 ? world.tileX(b.x + b.w) : world.tileX(b.x) - 1;
  var topRow = world.tileY(b.y) - 1;
  var botRow = world.tileY(b.y + b.h - 0.0001);
  var standRows = Math.ceil(CFG.PLAYER_H / CFG.TILE);
  var row, k, clear;
  for (row = topRow; row <= botRow; row++) {
    if (world.get(wallTx, row) !== TILE.EMPTY) continue;
    if (world.get(wallTx, row + 1) !== TILE.SOLID) continue;
    clear = true;
    for (k = 0; k < standRows; k++) {
      if (world.get(wallTx, row - k) !== TILE.EMPTY) { clear = false; break; }
    }
    if (!clear) continue;
    return { wallTx: wallTx, row: row };
  }
  return null;
}

var STAT_COLOURS = ['ember', 'umbral', 'verdant'];

/* D2: "dual choices are weighted toward the two lowest stats." 50-gen.js's
 * own pickups are single points, not spatial pairs a player physically
 * chooses between (that would mean changing an already-shipped,
 * fairness-audited generator to place deliberate pairs — a real, separate
 * piece of scope, not taken on here) — so the "choice" is read as a soft
 * weighting applied at the moment of collection instead: whichever colour
 * is currently the SOLE highest gets the least weight, the other two (or
 * all three, if tied) split the rest roughly evenly. A genuine
 * simplification of the literal mechanic, stated as one rather than
 * dressed up as the full thing. Takes the sim's own seeded `rng` (L4),
 * never Math.random — decided lazily, at collection, so it reacts to
 * whatever this run's stats actually are AT THAT MOMENT, not a snapshot
 * from before the level was ever played. */
function pickStatColour(stats, rng) {
  var maxV = Math.max(stats.ember, stats.umbral, stats.verdant);
  var weights = [], total = 0, i;
  for (i = 0; i < STAT_COLOURS.length; i++) {
    var w = maxV - stats[STAT_COLOURS[i]] + 1;
    weights.push(w);
    total += w;
  }
  var roll = rng.range(0, total), acc = 0;
  for (i = 0; i < STAT_COLOURS.length; i++) {
    acc += weights[i];
    if (roll < acc) return STAT_COLOURS[i];
  }
  return STAT_COLOURS[STAT_COLOURS.length - 1];
}

function Player(id, x, y) {
  this.id = id | 0;
  this.spawnX = x;
  this.spawnY = y;
  this.body = new Body(x, y, CFG.PLAYER_W, CFG.PLAYER_H);
  this.resetTransient();
}

/* L10: the one authoritative reset. Every field that can carry a value from
 * one run — or one test — into the next is cleared HERE and only here. Sim
 * calls it; scenario() calls Sim's. Nothing else may hand-clear a field, or
 * the two paths drift and a suite starts passing for the wrong reason. */
Player.prototype.resetTransient = function () {
  var b = this.body;
  b.x = this.spawnX; b.y = this.spawnY;
  b.w = CFG.PLAYER_W; b.h = CFG.PLAYER_H;
  b.vx = 0; b.vy = 0;
  b.onGround = false; b.onCeiling = false; b.onWall = 0; b.dropThrough = 0;
  // D17: same "movement/action state, not run-scoped" category as the
  // fields just above — a stale wall-leniency exemption carried into
  // fresh geometry (a respawn, or a teleport into a new room) makes no
  // more sense than a stale onWall/dropThrough would.
  b.wallLeniency = false; b.leaveRow = -1;

  this.state = 'fall';
  this.stateFrames = 0;
  this.facing = 1;
  // D2's three-colour stat contract. Each stat starts at STAT_START every
  // run; `maxHp` is the per-run figure a dominant-stat pickup grows (see
  // gainStat below) — CFG.MAX_HP is only ever the STARTING value. Reset
  // here on the same "one run boundary" resetTransient() already is (L10)
  // — 60-run.js does not exist yet to define a run more precisely than
  // that, stated as an interim reading rather than left implicit.
  this.stats = { ember: CFG.STAT_START, umbral: CFG.STAT_START, verdant: CFG.STAT_START };
  this.maxHp = CFG.MAX_HP;
  this.hp = this.maxHp;
  this.airJumps = 1;
  this.coyote = 0;
  this.rollFrames = 0;
  this.rollCd = 0;
  this.rollFrom = 0;
  // Ember Dash: same three-field shape as roll's own (owned entirely by
  // whichever state is active — see rollFrom's own comment for the pattern).
  this.dashFrames = 0;
  this.dashCd = 0;
  this.dashFrom = 0;
  // Dash Extra Charge's own resource (abilities spec §4) — a SEPARATE
  // bonus charge from dashCd's ordinary cooldown, refreshed on ground
  // contact only (not wall/ledge, unlike airJumps — a deliberate choice,
  // see the refresh site below), so it stays 0 forever for a player who
  // never owns the enhancement (dashExtraCharge stays false, below, and
  // nothing else ever sets this above 0).
  this.dashCharges = 0;
  // Parry: a lightweight timed flag, not a state (see CFG's own comment) —
  // owned entirely by these two fields, never by this.state.
  this.parryWindow = 0;
  this.parryCd = 0;
  // Ability enhancement ownership (abilities spec §4) — set to a safe
  // false here, then immediately overwritten by whichever real call site
  // applies the CURRENT permanent value on top (Sim.prototype
  // ._applyMetaToPlayer, the same "reset to baseline, then layer the
  // permanent bonus" two-step maxHp/maxHpBonus already use above). Plain
  // per-player mirrors of this.meta's own four flags — 30-player.js still
  // never references Meta directly, the same one-way dependency 65-meta.js
  // itself already holds itself to.
  this.dashExtraCharge = false;
  this.dashExtIframes = false;
  this.parryRiposte = false;
  this.parryReflect = false;
  this.iframes = 0;
  this.cutArmed = false;
  this.crouching = false;
  this.slamHang = 0;
  // One-tick signal, owned and consumed entirely by 40-combat.js's
  // Combat.resolveSlam — set the instant a slam lands (finish(), below),
  // read once and cleared the same tick, so it never needs hash() coverage
  // (nothing outside that single tick could ever observe it true).
  this.slamLanded = false;
  this.deadFrames = 0;
  this.stepTimer = 0;
  this.wallJumpLock = 0;
  // Ledge grab: ledgeRow/ledgeDir are only meaningful while state ===
  // 'ledgeGrab' (the same "owned by whichever state is active" shape
  // rollFrom/rollFrames already have for roll), ledgeHang counts the
  // current hang's own duration toward LEDGE_GRAB_MAX_HANG, ledgeGrabLock
  // is a short cooldown after climbing or dropping so the same ledge can't
  // be re-grabbed the instant it's released.
  this.ledgeRow = 0;
  this.ledgeWallTx = 0;
  this.ledgeDir = 0;
  this.ledgeHang = 0;
  this.ledgeGrabLock = 0;
  this.hitstopRequest = 0;
  // Owned by 40-combat.js, which sits above this file and may write them.
  // The player only ever READS them, and never learns what a move is.
  this.attack = null;
  this.actionLock = 0;
  // Which WEAPONS (10-data.js) entry Combat.begin starts a swing from.
  // Fixed at 'blade' for now — nothing currently changes it at runtime;
  // equipping/switching depends on D4's pickup/blueprint system, a
  // separate piece from the weapon DATA (all four rows, D9) existing at
  // all. D2's own stat pickups are unrelated — they're real and collectible
  // now, they just never touch this field.
  this.weapon = 'blade';
  // D4/65-meta.js: a carried, not-yet-handed-in blueprint (a weapon id, or
  // null). Owned by 70-sim.js, which sits above this file and may write it
  // on a real kill's blueprint-drop roll — the player only ever carries it.
  // Reset HERE, on the same "one run boundary" resetTransient() already is,
  // is what makes "lost on death" true for free: a death already calls this
  // exact method (Player.prototype.update()'s own 'dead' branch), so losing
  // a carried blueprint needs no separate code path, the same way D2's
  // stats already reset here rather than needing their own death handler.
  // Deliberately NOT cleared by teleport() (below) — a live level->boss
  // transition is not a death, and D4 says a blueprint survives all the way
  // to "a transition" (hand-in), not merely to the next room.
  this.carriedBlueprint = null;
  // The box this character's poses were authored in. Combat mirrors and
  // feet-anchors against it, so entities of different sizes each get their own.
  this.poseW = CFG.PLAYER_W;
  this.poseH = CFG.PLAYER_H;
  return this;
};

/* --- run loop (60-run.js) --------------------------------------------
 * Two distinct kinds of relocation, not one: a death's own visible move
 * is already owned entirely by resetTransient() above, fired on
 * whatever schedule this.deadFrames already runs on — setSpawn() only
 * ever changes WHERE that future call will land, never moves the body
 * itself. teleport() is the opposite: an immediate, visible move for a
 * live transition (walking through the boss door) that is not a death
 * at all and must not be treated as one. */

// Retargets a FUTURE resetTransient() call (this tick's or a later one)
// without moving the live body at all. Sim calls this on every death (so
// the next respawn lands in the run's current level) and, defensively, on
// any player still mid-death-countdown when a level actually commits (so
// their own upcoming resetTransient() lands correctly without Sim ever
// touching their 'dead' state directly).
Player.prototype.setSpawn = function (x, y) {
  this.spawnX = x;
  this.spawnY = y;
  return this;
};

// An immediate, visible relocation — for walking into a new room while
// still alive, never for a death. Deliberately NOT resetTransient(): hp,
// stats, and iframes all carry through untouched (D2 — stats are a
// whole-run resource, not a per-level one; a free heal at a room's
// threshold would be a real, silent balance hole an earlier draft of this
// exact feature had before a design panel building it caught the mistake).
// Movement/action state IS cleared — the same fields resetTransient()
// itself would clear, minus the run-scoped ones — because carrying a
// mid-roll or mid-ledge-grab state into geometry that no longer has
// anything under it makes no physical sense once the room has completely
// changed underneath it.
Player.prototype.teleport = function (x, y) {
  this.spawnX = x; this.spawnY = y;
  var b = this.body;
  b.x = x; b.y = y;
  b.w = CFG.PLAYER_W; b.h = CFG.PLAYER_H;
  b.vx = 0; b.vy = 0;
  b.onGround = false; b.onCeiling = false; b.onWall = 0; b.dropThrough = 0;
  // D17: same "movement/action state, not run-scoped" category as the
  // fields just above — a stale wall-leniency exemption carried into
  // fresh geometry (a respawn, or a teleport into a new room) makes no
  // more sense than a stale onWall/dropThrough would.
  b.wallLeniency = false; b.leaveRow = -1;

  this.state = 'fall';
  this.stateFrames = 0;
  this.airJumps = 1;
  this.coyote = 0;
  this.rollFrames = 0; this.rollCd = 0; this.rollFrom = 0;
  this.dashFrames = 0; this.dashCd = 0; this.dashFrom = 0; this.dashCharges = 0;
  this.parryWindow = 0; this.parryCd = 0;
  // dashExtraCharge/dashExtIframes/parryRiposte/parryReflect are
  // deliberately NOT reset here — the same "a live transition is not a
  // death" reasoning carriedBlueprint's own comment already states.
  // Ownership survives; dashCharges (the momentary RESOURCE, above) still
  // clears, refilling naturally on the next ground contact.
  this.cutArmed = false;
  this.crouching = false;
  this.slamHang = 0; this.slamLanded = false;
  this.wallJumpLock = 0;
  this.ledgeRow = 0; this.ledgeWallTx = 0; this.ledgeDir = 0;
  this.ledgeHang = 0; this.ledgeGrabLock = 0;
  this.hitstopRequest = 0;
  this.attack = null; this.actionLock = 0;
  return this;
};

// I-frames from being hit, plus the whole roll or dash. "I-frames throughout"
// in the masterfile means throughout — frame 1 and the last frame included,
// for both.
Player.prototype.invulnerable = function () {
  return this.iframes > 0 || this.state === 'roll' || this.state === 'dash';
};
Player.prototype.alive = function () { return this.state !== 'dead'; };
// D15 (weapon equip & switch): Combat.step re-reads player.weapon every
// tick an attack resolves (Combat.weaponScale, 40-combat.js:302-313) to
// scale its damage — switching mid-swing would silently reweight an
// in-flight move's damage using the NEW weapon's stat-colour pair, not
// the one the move actually belongs to. Gating on "no active attack" is
// necessary and sufficient: player.weapon is read nowhere else outside
// that one path (design spec §1) — no additional check against roll/
// dash/ledge state is needed.
Player.prototype.canSwitchWeapon = function () { return !this.attack; };

Player.prototype.update = function (pad, world, bus) {
  var b = this.body;

  this.stateFrames++;
  this.hitstopRequest = 0;
  if (this.iframes > 0) this.iframes--;
  if (this.rollCd > 0) this.rollCd--;
  if (this.dashCd > 0) this.dashCd--;
  if (this.parryCd > 0) this.parryCd--;
  // A successful parry (40-combat.js's Combat.resolveBox) zeroes
  // parryWindow directly and does NOT set parryCd — a well-timed read
  // earns the right to try again immediately. Only a NATURAL expiry (the
  // window counted itself down to 0 with nothing landed) costs a cooldown;
  // by the time a success has already zeroed it elsewhere, this block sees
  // parryWindow already at 0 and the guard below never fires for it.
  if (this.parryWindow > 0) {
    this.parryWindow--;
    if (this.parryWindow <= 0) this.parryCd = CFG.PARRY_COOLDOWN_FRAMES;
  }
  if (this.wallJumpLock > 0) this.wallJumpLock--;
  if (this.ledgeGrabLock > 0) this.ledgeGrabLock--;

  /* ---------------------------------------------------------- dead */
  if (this.state === 'dead') {
    this.deadFrames--;
    if (this.deadFrames <= 0) {
      this.resetTransient();
      bus.emit('respawn', { id: this.id, x: b.x, y: b.y });
    }
    return this;
  }

  // Contact flags describe the END of last tick's move, which is exactly the
  // ground truth this tick's decisions need.
  var grounded = b.onGround;
  var wasGrounded = grounded;

  if (grounded) this.airJumps = 1;
  if (grounded) this.coyote = CFG.COYOTE_FRAMES;
  // Dash Extra Charge's own refresh — ground contact ONLY, deliberately
  // not mirroring airJumps' own wall/ledge generosity above: a wall you
  // can cling to is already treated as a form of ground for the double
  // jump, but letting a wall-slide ALSO re-arm a bonus dash charge would
  // undercut dash's own "limited air resource" tension in a way airJumps'
  // own design doesn't have to worry about (airJumps has no cooldown of
  // its own to protect). Gated on ownership so this is a true no-op for a
  // player who never bought the enhancement.
  if (grounded && this.dashExtraCharge) this.dashCharges = 1;

  var axis = pad.axis();

  /* ---------------------------------------------------------- roll */
  if (this.state === 'roll') {
    b.vx = this.facing * CFG.ROLL_SPEED;
    b.vy += CFG.GRAVITY;                    // a roll off a ledge still falls
    this.rollFrames--;
    var ending = this.rollFrames <= 0;
    // Move FIRST, end after. The final tick of a roll still travels at roll
    // speed, so ending it before the move would both mislabel that tick and
    // make rollEnd report a distance one frame short of the one the body
    // actually covered.
    this.finish(world, bus, wasGrounded, axis);
    if (ending) this.endRoll(world, bus);
    return this;
  }

  /* ---------------------------------------------------------- dash
   * Ember Dash — same committed-burst shape as roll above, just airborne
   * (triggered below by !grounded rather than grounded). Still falls, same
   * as a roll off a ledge; never crouches, since there is no ground to
   * crouch against mid-air. */
  if (this.state === 'dash') {
    b.vx = this.facing * CFG.DASH_SPEED;
    b.vy += CFG.GRAVITY;
    this.dashFrames--;
    var dashEnding = this.dashFrames <= 0;
    // Move first, end after — same reasoning as roll's own comment: the
    // final tick still travels at dash speed, so ending before the move
    // would both mislabel that tick and undercount dashEnd's own distance.
    this.finish(world, bus, wasGrounded, axis);
    if (dashEnding) this.endDash(world, bus);
    return this;
  }

  /* ---------------------------------------------------------- ledge grab
   * A hang, not a move: velocity pinned to zero every tick regardless of
   * gravity or held direction — the wall the player caught IS the support,
   * the same way a ground tile is. Jump climbs (up and onto the ledge,
   * genre-standard, not a new "up" input this project doesn't otherwise
   * use anywhere); down or the timeout drops. */
  if (this.state === 'ledgeGrab') {
    b.vx = 0; b.vy = 0;
    this.ledgeHang++;
    if (pad.buffered('jump')) {
      pad.consume('jump');
      // A body that entered the hang while still crouched (rolled or
      // crouch-walked into the wall) must stand up here, unconditionally —
      // unlike the ordinary ground jump's own crouch-cancel a few lines
      // below (which gates on a real b.canStand() check, since standing up
      // in PLACE might hit a real ceiling), detectLedge() already proved
      // PLAYER_H's worth of clearance at the LANDING spot specifically
      // (its own standRows headroom check), so there is nothing left to
      // ask permission for. Missing this the first time around left b.h at
      // the crouched 12px while b.y was computed for the standing 22px —
      // feet ~10px above the real surface, onGround false, and finish()'s
      // own state-classifier silently overwrote the intended 'idle' back
      // to 'fall' that same tick, self-healing only once the ordinary
      // in-air auto-uncrouch caught up several ticks later. Found by an
      // adversarial pass building a real crouched approach, not assumed.
      this.crouching = false;
      b.h = CFG.PLAYER_H;
      b.y = (this.ledgeRow + 1) * CFG.TILE - CFG.PLAYER_H;
      // Anchored to the ledge's own tile boundary, not "hang position plus
      // a guessed nudge" — the first draft nudged by a fixed px amount that
      // left the body straddling the hang-side column and the ledge's own
      // column instead of standing fully on it (PLAYER_W=10 into a 16px
      // tile leaves only 6px of real margin; the nudge didn't match that).
      // Flush against the FAR edge of the ledge's own column instead: the
      // whole body lands inside the column already proven to have headroom
      // above (detectLedge's own check), with the leftover TILE-PLAYER_W
      // slack automatically on the outer side.
      b.x = this.ledgeDir > 0 ? this.ledgeWallTx * CFG.TILE
                               : (this.ledgeWallTx + 1) * CFG.TILE - CFG.PLAYER_W;
      // A touch of real gravity on the transition tick, the same fix roll's
      // own start frame already needed: with vy left at exactly 0, move()'s
      // Y-step never runs at all (steps = ceil(0/MAX_STEP) still loops once,
      // but sx===0/sy===0 skip both moveX/moveY), so onGround stays at its
      // reset-to-false value for one whole tick despite the body already
      // standing in the exact right place — found by checking the real
      // transition tick directly, not assumed fine from the position alone.
      b.vy += CFG.GRAVITY;
      this.state = 'idle';
      this.ledgeGrabLock = CFG.LEDGE_GRAB_LOCKOUT;
      this.airJumps = 1;
      this.cutArmed = false;
      bus.emit('ledgeClimb', { id: this.id, x: b.x, y: b.y });
      return this.finish(world, bus, wasGrounded, axis);
    }
    if (pad.down('down') || this.ledgeHang > CFG.LEDGE_GRAB_MAX_HANG) {
      this.state = 'fall';
      this.ledgeGrabLock = CFG.LEDGE_GRAB_LOCKOUT;
      bus.emit('ledgeRelease', { id: this.id, x: b.x, y: b.y });
      return this.finish(world, bus, wasGrounded, axis);
    }
    // Still hanging: no gravity, no horizontal drift, the body stays
    // exactly where it was placed on grab. finish() still runs so hazards/
    // landing bookkeeping stay consistent, even though move() this tick is
    // a no-op (zero velocity).
    return this.finish(world, bus, wasGrounded, axis);
  }

  /* ------------------------------------------------------- facing */
  if (axis !== 0) this.facing = axis;

  /* ------------------------------------------------------- crouch */
  var wantCrouch = pad.down('down') && grounded;
  if (wantCrouch && !this.crouching) {
    this.crouching = true;
    b.setHeight(CFG.PLAYER_CROUCH_H);
    bus.emit('crouch', { id: this.id });
  } else if (!wantCrouch && this.crouching) {
    if (b.canStand(world, CFG.PLAYER_H)) {
      this.crouching = false;
      b.setHeight(CFG.PLAYER_H);
      bus.emit('uncrouch', { id: this.id });
    }
  }

  /* --------------------------------------------------- horizontal */
  var top = CFG.RUN_SPEED * (this.crouching ? 0.5 : 1);
  // Swinging roots you most of the way. Not completely: a swing that freezes
  // the character reads as a stutter, and a swing you can walk out of has no
  // weight. The drift is the difference. A fresh wall jump gets the same
  // partial-control treatment for the same reason: full control would let
  // holding back-into-the-wall cancel the push-off before it ever carries
  // you anywhere, and zero control reads as being launched, not jumping.
  if (this.actionLock > 0) top *= CFG.ATTACK_DRIFT;
  if (this.wallJumpLock > 0) top *= CFG.ATTACK_DRIFT;
  if (this.state === 'slam') {
    // Committed. A slam is a decision, not a steerable dive.
    b.vx = 0;
  } else if (axis !== 0) {
    b.vx = approach(b.vx, axis * top, grounded ? CFG.RUN_ACCEL : CFG.AIR_ACCEL);
  } else {
    b.vx = approach(b.vx, 0, grounded ? CFG.RUN_FRICTION : CFG.AIR_FRICTION);
  }

  /* ------------------------------------------------------ actions */
  if (this.state !== 'slam') {
    // Drop-through outranks jump: crouching on a one-way and pressing jump
    // means down, never up.
    if (pad.buffered('jump') && this.crouching && grounded && standingOnOneWay(world, b)) {
      pad.consume('jump');
      b.dropThrough = 6;
      b.y += 1;                              // unstick from the surface
      this.coyote = 0;
      bus.emit('dropThrough', { id: this.id });
    } else if (pad.buffered('jump') && (grounded || this.coyote > 0)) {
      pad.consume('jump');
      b.vy = CFG.JUMP_VEL;
      this.coyote = 0;
      this.cutArmed = true;
      if (this.crouching && b.canStand(world, CFG.PLAYER_H)) {
        this.crouching = false;
        b.setHeight(CFG.PLAYER_H);
      }
      bus.emit('jump', { id: this.id, x: b.x, y: b.y });
    } else if (pad.buffered('jump') && !grounded && b.onWall !== 0) {
      // Ahead of the double jump on purpose: touching a wall while airborne
      // means the wall IS the intent, not a floaty jump in place. Reuses
      // JUMP_VEL for the vertical impulse (one fewer number to justify, and
      // it keeps a wall jump's apex directly comparable to a normal one) and
      // always refreshes the air jump — a wall is itself a form of ground,
      // the same generosity coyote time already extends to a real ledge.
      pad.consume('jump');
      b.vx = -b.onWall * CFG.WALLJUMP_VEL_X;
      b.vy = CFG.JUMP_VEL;
      this.wallJumpLock = CFG.WALLJUMP_LOCKOUT;
      this.airJumps = 1;
      this.cutArmed = true;
      bus.emit('wallJump', { id: this.id, x: b.x, y: b.y, dir: -b.onWall });
    } else if (pad.buffered('jump') && this.airJumps > 0) {
      pad.consume('jump');
      b.vy = CFG.DOUBLE_JUMP_VEL;
      this.airJumps--;
      this.cutArmed = true;
      bus.emit('doubleJump', { id: this.id, x: b.x, y: b.y });
    }

    // Variable height: releasing while still rising cuts the arc once. Once,
    // not every frame — repeating it would pin vy at zero.
    if (this.cutArmed && !pad.down('jump') && b.vy < 0) {
      b.vy *= CFG.JUMP_CUT;
      this.cutArmed = false;
    }

    if (pad.buffered('roll') && grounded && this.rollCd <= 0) {
      pad.consume('roll');
      this.state = 'roll';
      this.stateFrames = 0;
      // This tick IS roll frame 1 — it sets roll velocity and moves. Counting
      // it makes the roll exactly ROLL_FRAMES long and exactly
      // ROLL_FRAMES * ROLL_SPEED across; without the decrement the start
      // frame is a free nineteenth frame and the distance overshoots.
      this.rollFrames = CFG.ROLL_FRAMES - 1;
      this.rollFrom = b.x;
      // D17: arm the moveX wall-leniency (25-body.js) on the exact row
      // this roll is departing from, while the body is still flush
      // grounded — see that file's own comment for the mechanism. Cleared
      // in endRoll(), below, so the exemption can never outlive this roll.
      b.leaveRow = world.tileY(b.bottom());
      b.wallLeniency = true;
      if (!this.crouching) { this.crouching = true; b.setHeight(CFG.PLAYER_CROUCH_H); }
      b.vx = this.facing * CFG.ROLL_SPEED;
      // Gravity on the start frame too. Without it vy is 0, moveY never runs,
      // and the body loses onGround for exactly one tick — which reads as a
      // takeoff and a landing to everything downstream.
      b.vy += CFG.GRAVITY;
      // y included alongside x — a real bug found while wiring dash's own
      // VFX (below): 80-view.js's rollStart handler has always read e.y
      // (self.particles.burst(..., e.y + CFG.PLAYER_H, ...)) but this
      // payload never carried one, so every roll's own start-burst has
      // been spawning at y === NaN — silently invisible (canvas fillRect
      // no-ops on a NaN coordinate rather than throwing) since the effect
      // shipped, with nothing to catch it since no test reads a particle's
      // actual x/y, only that some effect fired at all. Fixed here rather
      // than left in place while dashStart's own payload, right below,
      // gets it correctly from the start.
      bus.emit('rollStart', { id: this.id, x: b.x, y: b.y, facing: this.facing });
      return this.finish(world, bus, wasGrounded, axis);
    } else if (pad.buffered('roll') && !grounded && (this.dashCd <= 0 || this.dashCharges > 0)) {
      // Same button, context-sensitive: grounded rolls, airborne dashes
      // (abilities spec §2a) — zero new input plumbing needed. A roll press
      // buffered while airborne that isn't consumed until AFTER landing
      // fires an ordinary ground roll, not a stale dash: context is
      // evaluated at consumption time here, matching every other buffered
      // input in this file.
      pad.consume('roll');
      // Dash Extra Charge (§4): the bonus charge is only ever the REASON
      // this fired when the ordinary cooldown was still active — if the
      // cooldown had already cleared on its own, this dash is the normal
      // one and the banked charge stays untouched for later. Either way
      // endDash() below re-arms dashCd normally, so a chained bonus dash
      // still costs a fresh cooldown — it just doesn't have to WAIT for
      // one first.
      if (this.dashCd > 0) this.dashCharges--;
      this.state = 'dash';
      this.stateFrames = 0;
      // This tick IS dash frame 1 — see the matching roll-start comment
      // above for why the count is off by one.
      this.dashFrames = CFG.DASH_FRAMES - 1;
      this.dashFrom = b.x;
      b.vx = this.facing * CFG.DASH_SPEED;
      b.vy += CFG.GRAVITY;
      bus.emit('dashStart', { id: this.id, x: b.x, y: b.y, facing: this.facing });
      return this.finish(world, bus, wasGrounded, axis);
    }

    /* ---------------------------------------------------------- parry
     * Arms parryWindow; never sets this.state (see CFG's own comment on
     * why parry is a flag, not a state). Negation itself lives in
     * 40-combat.js's Combat.resolveBox, which checks parryWindow directly
     * — this trigger only ever arms the window and reacts to the PRESS.
     *
     * Roll/dash get "cancel my own in-flight swing" for free from
     * Combat.step's own per-tick state check; parry has no state for that
     * check to see, so it cancels explicitly here instead, at the one
     * point that actually knows a parry press just landed. Combat.cancel
     * already no-ops when there is nothing to cancel.
     *
     * this.parryWindow <= 0 is a REAL, load-bearing part of this guard,
     * not a redundant belt-and-suspenders check: parryCd only ever gets
     * set on a WHIFFED (naturally expired) window, so without this second
     * clause a player holding/mashing the button could re-press every
     * tick the window is still counting down and re-arm it to the full
     * PARRY_WINDOW_FRAMES indefinitely — cooldown never once triggers,
     * since the window never actually expires unused. Found by an
     * adversarial review pass, not assumed safe. */
    if (pad.buffered('parry') && this.parryCd <= 0 && this.parryWindow <= 0) {
      pad.consume('parry');
      C.Combat.cancel(this, bus);
      this.parryWindow = CFG.PARRY_WINDOW_FRAMES;
      bus.emit('parryStart', { id: this.id, x: b.x, y: b.y });
    }

    if (pad.pressed('down') && !grounded) {
      this.state = 'slam';
      this.stateFrames = 0;
      this.slamHang = CFG.SLAM_HANG_FRAMES;
      b.vx = 0; b.vy = 0;
      bus.emit('slamStart', { id: this.id, x: b.x, y: b.y });
    }
  }

  /* ------------------------------------------------------ gravity */
  if (this.state === 'slam') {
    if (this.slamHang > 0) { this.slamHang--; b.vy = 0; }
    else b.vy = CFG.SLAM_VEL;
  } else {
    b.vy += CFG.GRAVITY;
    if (b.vy > CFG.MAX_FALL) b.vy = CFG.MAX_FALL;

    // Ledge grab, checked BEFORE wall slide clamps speed — a genuine ledge
    // takes priority over merely sliding past the same wall. Same "must be
    // actively holding INTO the wall" gate wall slide uses; vy >= 0 so a
    // wall jump taken this very tick (already rising) can't be swallowed
    // into a grab before it goes anywhere; the short lockout stops the
    // ledge just climbed off from instantly re-catching on the way up.
    if (!grounded && b.onWall !== 0 && axis === b.onWall && b.vy >= 0 && this.ledgeGrabLock <= 0) {
      var ledge = detectLedge(world, b, b.onWall);
      if (ledge) {
        this.state = 'ledgeGrab';
        this.stateFrames = 0;
        this.ledgeRow = ledge.row;
        this.ledgeWallTx = ledge.wallTx;
        this.ledgeDir = b.onWall;
        this.ledgeHang = 0;
        b.vx = 0; b.vy = 0;
        // Flush against the wall face (same formula moveX's own collision
        // resolution uses), hanging DOWN from the ledge's top boundary —
        // the body's own lower portion legally overlaps the wall's solid
        // column in Y because it never overlaps it in X.
        b.x = b.onWall > 0 ? ledge.wallTx * CFG.TILE - CFG.PLAYER_W : (ledge.wallTx + 1) * CFG.TILE;
        b.y = (ledge.row + 1) * CFG.TILE;
        bus.emit('ledgeGrab', { id: this.id, x: b.x, y: b.y });
        return this.finish(world, bus, wasGrounded, axis);
      }
    }

    // Wall slide: only while actually holding INTO the wall you are touching
    // (axis matches onWall's own sign), never merely brushing past one — a
    // wall you are not pressing into should let you fall straight past it,
    // not snag you. Refreshes the air jump for the same reason a wall jump
    // does: a wall you can cling to is a resource, not a hazard.
    if (!grounded && b.onWall !== 0 && axis === b.onWall && b.vy > CFG.WALL_SLIDE_MAX) {
      b.vy = CFG.WALL_SLIDE_MAX;
      this.airJumps = 1;
    }
  }

  return this.finish(world, bus, wasGrounded, axis);
};

/* Everything that must happen no matter which branch ran: move, then read
 * the consequences of having moved. Landing, hazards and the presenter-facing
 * state name are all consequences, so they live on the far side of move(). */
Player.prototype.finish = function (world, bus, wasGrounded, axis) {
  var b = this.body;

  b.move(world);

  // Landing
  if (!wasGrounded && b.onGround) {
    if (this.state === 'slam') {
      bus.emit('slamLand', { id: this.id, x: b.x, y: b.y });
      this.hitstopRequest = 6;
      // Combat.resolveSlam (40-combat.js) reads and clears this later the
      // same tick, once targets have had their own chance to move — the
      // same reason regular swings resolve after movement, not during it.
      this.slamLanded = true;
      this.state = 'idle';
    }
    this.cutArmed = false;
    bus.emit('land', { id: this.id, x: b.x, y: b.y, vy: b.vy });
  }
  if (b.onWall !== 0) bus.emit('wallTouch', { id: this.id, dir: b.onWall });

  // Coyote burns only while airborne, only after this tick has had its chance
  // to use it, and NOT on the tick the ground disappears from under you —
  // that tick was decided while still standing. Charging it costs one frame
  // of the five and makes the window measure 4.
  if (!wasGrounded && !b.onGround && this.coyote > 0) this.coyote--;

  // Hazards
  if (!this.invulnerable() && world.rectHazard(b.x, b.y, b.w, b.h)) {
    this.hurt(CFG.HAZARD_DAMAGE, bus);
  }

  if (this.state !== 'roll' && this.state !== 'dash' && this.state !== 'slam' &&
      this.state !== 'dead' && this.state !== 'ledgeGrab') {
    if (!b.onGround && b.onWall !== 0 && axis === b.onWall) this.state = 'wallSlide';
    else if (!b.onGround) this.state = b.vy < 0 ? 'jump' : 'fall';
    else if (this.crouching) this.state = 'crouch';
    else if (abs(b.vx) > 0.1) this.state = 'run';
    else this.state = 'idle';
  }

  // Footsteps are a sim fact (a foot hit the floor), not a presenter guess.
  if (this.state === 'run') {
    // A second instance of the exact rollStart NaN bug documented above
    // (this.emit('rollStart', ...)) — 80-view.js's 'step' handler has
    // always read e.y (self.particles.burst(..., e.y + CFG.PLAYER_H, ...))
    // but this payload never carried one either, so every footstep-dust
    // burst has been spawning at y === NaN since 'step' first shipped,
    // silently invisible the same way, and for the same reason nothing
    // caught it before: no test read a particle's actual x/y, only that an
    // effect fired. Found by the same dash-VFX finite-position regression
    // sweep, which happens to catch whatever 'dust'-kind particles are
    // still alive at that instant, not only the dash's own.
    if (--this.stepTimer <= 0) { this.stepTimer = 12; bus.emit('step', { id: this.id, x: b.x, y: b.y }); }
  } else {
    this.stepTimer = 0;
  }

  return this;
};

Player.prototype.endRoll = function (world, bus) {
  var b = this.body;
  this.rollCd = CFG.ROLL_COOLDOWN_FRAMES;
  // D17: disarm the wall-leniency the instant the roll that armed it ends
  // — the exemption must never outlive its own roll (30-player.js's own
  // roll-entry block is the only place this is ever set true).
  b.wallLeniency = false;
  b.leaveRow = -1;
  // Stand back up if there is room; a low ceiling keeps you crouched rather
  // than teleporting you into it.
  if (b.canStand(world, CFG.PLAYER_H)) {
    b.setHeight(CFG.PLAYER_H);
    this.crouching = false;
  } else {
    this.crouching = true;
  }
  this.state = b.onGround ? 'idle' : 'fall';
  bus.emit('rollEnd', { id: this.id, x: b.x, dist: abs(b.x - this.rollFrom) });
  return this;
};

Player.prototype.endDash = function (world, bus) {
  var b = this.body;
  this.dashCd = CFG.DASH_COOLDOWN_FRAMES;
  // Dash Extended I-Frames (§4): the dash's own i-frames already cover its
  // full committed duration (invulnerable()'s state === 'dash' check) —
  // "extended" means a residual window immediately AFTER it ends, not a
  // longer dash, so this reuses the existing iframes counter rather than
  // inventing a second one. Math.max, not a plain set: never CLOBBER a
  // larger iframes value already running from something else entirely
  // unrelated to this dash.
  if (this.dashExtIframes && this.iframes < CFG.DASH_EXT_IFRAMES_BONUS) {
    this.iframes = CFG.DASH_EXT_IFRAMES_BONUS;
  }
  this.state = b.onGround ? 'idle' : 'fall';
  bus.emit('dashEnd', { id: this.id, x: b.x, dist: abs(b.x - this.dashFrom) });
  return this;
};

/* `knock` is optional [x, y]. A hazard has no opinion about which way you
 * should fly, so it falls back to "away from the way you are facing"; an
 * attacker does have one, and passes it. */
Player.prototype.hurt = function (amount, bus, knock) {
  var b = this.body;
  this.hp -= amount;
  this.iframes = CFG.HURT_IFRAMES;
  b.vx = knock ? knock[0] : -this.facing * CFG.HURT_KNOCK_X;
  b.vy = knock ? knock[1] : CFG.HURT_KNOCK_Y;
  // A hang is not exempt from being hurt — but its own per-tick "pin
  // velocity to zero" behaviour would otherwise swallow this exact
  // knockback the instant the ledgeGrab block runs again next tick, before
  // move() ever got to apply it, leaving a player caught by a hazard while
  // hanging permanently unable to be knocked free (found by an adversarial
  // pass, not assumed safe). Getting hurt lets go, the same way every other
  // interruption in this game already takes priority over holding still.
  if (this.state === 'ledgeGrab') {
    this.state = 'fall';
    this.ledgeGrabLock = CFG.LEDGE_GRAB_LOCKOUT;
    bus.emit('ledgeRelease', { id: this.id, x: b.x, y: b.y });
  }
  bus.emit('hurt', { id: this.id, hp: this.hp, x: b.x, y: b.y });
  this.hitstopRequest = 8;
  if (this.hp <= 0) {
    this.hp = 0;
    this.state = 'dead';
    this.stateFrames = 0;
    this.deadFrames = CFG.RESPAWN_FRAMES;
    b.vx = 0; b.vy = 0;
    bus.emit('death', { id: this.id, x: b.x, y: b.y });
  }
  return this;
};

/* D2: "+1 to a chosen stat and +HP only if that stat is dominant." Dominant
 * means STRICTLY the highest of the three after the gain — a tie does not
 * count, so the very first pickup of any run (1,1,1 -> 2,1,1) is always
 * dominant by construction: the anti-death-spiral property this exists for
 * only needs to matter once stats have actually diverged, and the first
 * pickup can't have diverged from anything yet. `colour` is caller-decided
 * (95-app.js's pickup collision, weighted toward the two lowest stats) —
 * this function only ever applies a gain already chosen, it never picks. */
Player.prototype.gainStat = function (colour, bus) {
  this.stats[colour]++;
  var v = this.stats[colour], dominant = true, k;
  for (k in this.stats) { if (k !== colour && this.stats[k] >= v) dominant = false; }
  if (dominant) {
    this.maxHp += CFG.STAT_HP_GAIN;
    this.hp += CFG.STAT_HP_GAIN;
  }
  bus.emit('statGain', { id: this.id, colour: colour, value: v, dominant: dominant, maxHp: this.maxHp });
  return this;
};

C.Player = Player;
C.pickStatColour = pickStatColour;
C.STAT_COLOURS = STAT_COLOURS;

})(CINDER);
