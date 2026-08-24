/* ===========================================================================
 * 20-world.js  —  tilemap + queries
 * ---------------------------------------------------------------------------
 * SIM layer. Four tile kinds and nothing else; anything richer belongs in
 * 10-data.js when that exists.
 *
 * Out-of-bounds rule, stated once so no caller has to guess:
 *   ty < 0        -> EMPTY   (open sky; jumping off the top of the map is legal)
 *   anywhere else -> SOLID   (the map is a sealed box on the sides and floor)
 * A level that wants a pit puts HAZARD tiles at the bottom, it does not rely
 * on falling out of the world.
 *
 * Owned by: World team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG;

var TILE = { EMPTY: 0, SOLID: 1, ONEWAY: 2, HAZARD: 3 };

// The character used by fromRows/toRows for each tile kind. The round trip is
// asserted by verify_core, which is what makes hand-written test levels safe.
var GLYPH = ['.', '#', '-', '^'];

function World(w, h, fill) {
  this.w = w | 0;
  this.h = h | 0;
  this.tiles = new Uint8Array(this.w * this.h);
  if (fill) this.tiles.fill(fill);
}
World.TILE = TILE;
World.GLYPH = GLYPH;

World.prototype.inBounds = function (tx, ty) {
  return tx >= 0 && tx < this.w && ty >= 0 && ty < this.h;
};

World.prototype.get = function (tx, ty) {
  if (ty < 0) return TILE.EMPTY;
  if (!this.inBounds(tx, ty)) return TILE.SOLID;
  return this.tiles[ty * this.w + tx];
};

World.prototype.set = function (tx, ty, v) {
  if (!this.inBounds(tx, ty)) return this;
  this.tiles[ty * this.w + tx] = v;
  return this;
};

World.prototype.isSolid = function (tx, ty) { return this.get(tx, ty) === TILE.SOLID; };
World.prototype.isOneWay = function (tx, ty) { return this.get(tx, ty) === TILE.ONEWAY; };
World.prototype.isHazard = function (tx, ty) { return this.get(tx, ty) === TILE.HAZARD; };

// World pixels -> tile coords. Math.floor, not |0: |0 truncates toward zero
// and would fold x = -3 onto tile 0 instead of tile -1.
World.prototype.tileX = function (px) { return Math.floor(px / CFG.TILE); };
World.prototype.tileY = function (py) { return Math.floor(py / CFG.TILE); };
World.prototype.tileAt = function (px, py) { return this.get(this.tileX(px), this.tileY(py)); };

/* The half-open tile span an AABB covers. `- 1` on the far edge is the whole
 * point: a body exactly 16px wide sitting flush at x = 16 covers tile 1 only,
 * not tiles 1 and 2, and without this every wall grabs a neighbour it should
 * not touch. */
World.prototype.span = function (x, y, w, h) {
  return {
    x0: this.tileX(x),
    x1: this.tileX(x + w - 0.0001),
    y0: this.tileY(y),
    y1: this.tileY(y + h - 0.0001)
  };
};

// Does this AABB touch any tile of kind `kind`?
World.prototype.rectTouches = function (x, y, w, h, kind) {
  var s = this.span(x, y, w, h), tx, ty;
  for (ty = s.y0; ty <= s.y1; ty++) {
    for (tx = s.x0; tx <= s.x1; tx++) {
      if (this.get(tx, ty) === kind) return true;
    }
  }
  return false;
};

World.prototype.rectSolid = function (x, y, w, h) {
  return this.rectTouches(x, y, w, h, TILE.SOLID);
};
World.prototype.rectHazard = function (x, y, w, h) {
  return this.rectTouches(x, y, w, h, TILE.HAZARD);
};

/* ------------------------------------------------------- text round trip */
World.fromRows = function (rows) {
  var h = rows.length, w = 0, i, j, g;
  for (i = 0; i < h; i++) if (rows[i].length > w) w = rows[i].length;
  var world = new World(w, h);
  for (i = 0; i < h; i++) {
    for (j = 0; j < rows[i].length; j++) {
      g = GLYPH.indexOf(rows[i].charAt(j));
      world.set(j, i, g === -1 ? TILE.EMPTY : g);
    }
  }
  return world;
};

World.prototype.toRows = function () {
  var rows = [], y, x, line;
  for (y = 0; y < this.h; y++) {
    line = '';
    for (x = 0; x < this.w; x++) line += GLYPH[this.get(x, y)];
    rows.push(line);
  }
  return rows;
};

C.World = World;
C.TILE = TILE;

})(CINDER);
