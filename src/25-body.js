/* ===========================================================================
 * 25-body.js  —  AABB + axis-separated, sub-stepped tilemap collision
 * ---------------------------------------------------------------------------
 * SIM layer. Two rules make this boring in the good way:
 *
 *   1. Axes are resolved separately. X moves and resolves completely, then Y
 *      moves and resolves completely. Resolving both at once is where corner
 *      snagging and the "I clipped into the floor while running" class of bug
 *      comes from.
 *
 *   2. No single step exceeds CFG.MAX_STEP pixels. At slam speed a body
 *      travels 11px per frame, which is most of a 16px tile; one unsplit step
 *      can start on one side of a wall and end on the other with nothing
 *      overlapping in between. Sub-stepping is what makes tunnelling
 *      impossible rather than unlikely.
 *
 * Owned by: Physics team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, TILE = C.TILE, sign = C.sign, abs = C.abs;

function Body(x, y, w, h) {
  this.x = x; this.y = y;
  this.w = w; this.h = h;
  this.vx = 0; this.vy = 0;
  this.onGround = false;
  this.onCeiling = false;
  this.onWall = 0;          // -1 touching a wall to the left, +1 to the right
  this.dropThrough = 0;     // frames remaining of ignoring one-way platforms
  // D17: a bounded moveX exemption for a body that just left solid ground
  // horizontally with no upward velocity (a grounded Roll) — see moveX's
  // own comment below for the mechanism, and 30-player.js's roll-entry/
  // endRoll for the only place that ever arms/disarms these. Inert for
  // every other body (enemies, the player in any other state): nothing
  // else in the codebase ever sets wallLeniency true.
  this.wallLeniency = false;
  this.leaveRow = -1;       // the tile row wallLeniency is scoped to, or -1
}

Body.prototype.bottom = function () { return this.y + this.h; };
Body.prototype.right = function () { return this.x + this.w; };
Body.prototype.cx = function () { return this.x + this.w * 0.5; };
Body.prototype.cy = function () { return this.y + this.h * 0.5; };

/* Resize about the feet. Crouching shortens the box; standing back up grows
 * it upward into space that may be occupied, so the caller must ask
 * canStand() first — this function does not refuse. */
Body.prototype.setHeight = function (h) {
  this.y += this.h - h;
  this.h = h;
  return this;
};

Body.prototype.canStand = function (world, h) {
  return !world.rectSolid(this.x, this.y + this.h - h, this.w, h);
};

/* ---------------------------------------------------------------- X axis */
function moveX(body, world, dx) {
  body.x += dx;
  var s = world.span(body.x, body.y, body.w, body.h), tx, ty;
  for (ty = s.y0; ty <= s.y1; ty++) {
    for (tx = s.x0; tx <= s.x1; tx++) {
      // One-way platforms are floors, never walls. Blocking X on them turns
      // every ledge into a shelf you get stuck against.
      if (world.get(tx, ty) !== TILE.SOLID) continue;
      // D17: a body mid-roll gets a bounded exemption on the exact row it
      // just left. Without this, ordinary axis-separated resolution (X
      // fully, then Y) blocks a flat-rise roll on the far platform's own
      // wall before Y ever gets a chance to land it — a roll starts with
      // zero vertical velocity flush against the ground, so gravity sinks
      // its own hitbox into this row within 1-2 ticks, long before it can
      // have crossed a real gap horizontally. Scoped to ONE row only (a
      // multi-row-tall wall's other rows still block normally) and to
      // however long wallLeniency stays armed (roll's own duration) — see
      // 30-player.js's roll-entry/endRoll, the only place that ever sets
      // this true/false.
      if (body.wallLeniency && ty === body.leaveRow) continue;
      if (dx > 0) {
        body.x = tx * CFG.TILE - body.w;
      } else if (dx < 0) {
        body.x = (tx + 1) * CFG.TILE;
      } else {
        continue;
      }
      body.vx = 0;
      body.onWall = sign(dx);
      return true;
    }
  }
  return false;
}

/* ---------------------------------------------------------------- Y axis */
function moveY(body, world, dy) {
  var prevBottom = body.y + body.h;
  body.y += dy;
  var s = world.span(body.x, body.y, body.w, body.h), tx, ty, kind, top;
  for (ty = s.y0; ty <= s.y1; ty++) {
    for (tx = s.x0; tx <= s.x1; tx++) {
      kind = world.get(tx, ty);

      if (kind === TILE.SOLID) {
        if (dy > 0) {
          body.y = ty * CFG.TILE - body.h;
          body.onGround = true;
        } else if (dy < 0) {
          body.y = (ty + 1) * CFG.TILE;
          body.onCeiling = true;
        } else {
          continue;
        }
        body.vy = 0;
        return true;
      }

      if (kind === TILE.ONEWAY) {
        // Three conditions, all required: falling, not currently dropping
        // through, and the feet were above the platform surface before this
        // step. The third is what lets a body rise through a platform and
        // still land on it on the way back down.
        if (dy <= 0 || body.dropThrough > 0) continue;
        top = ty * CFG.TILE;
        if (prevBottom > top) continue;
        if (body.y + body.h <= top) continue;
        body.y = top - body.h;
        body.vy = 0;
        body.onGround = true;
        return true;
      }
    }
  }
  return false;
}

/* Advance one tick. Clears the contact flags first: they describe THIS
 * frame's contacts, and a stale onGround is how a double jump becomes
 * infinite. */
Body.prototype.move = function (world) {
  this.onGround = false;
  this.onCeiling = false;
  this.onWall = 0;

  var dx = this.vx, dy = this.vy;
  var steps = Math.ceil(Math.max(abs(dx), abs(dy)) / CFG.MAX_STEP) || 1;
  var sx = dx / steps, sy = dy / steps, i;

  for (i = 0; i < steps; i++) {
    if (sx !== 0 && moveX(this, world, sx)) sx = 0;
    if (sy !== 0 && moveY(this, world, sy)) sy = 0;
    if (sx === 0 && sy === 0) break;
  }

  if (this.dropThrough > 0) this.dropThrough--;
  return this;
};

// Grounded includes "standing on a one-way platform", which moveY already
// folded into onGround. A separate probe one pixel down would disagree with
// the resolver on the frame you step off a ledge; this cannot.
Body.prototype.grounded = function () { return this.onGround; };

C.Body = Body;

})(CINDER);
