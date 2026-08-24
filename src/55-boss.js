/* ===========================================================================
 * 55-boss.js  —  Kilnwarden, a two-phase boss + its arena
 * ---------------------------------------------------------------------------
 * SIM layer. A rooted, ranged zone-control fight, chosen by a judged design
 * panel over two competing concepts (a melee/charge brute and a walk/fly
 * hybrid) — both judges independently found real, source-verified bugs in
 * the losing concepts (an undefined top-level `reach` that silently failed
 * a phase-2 attack gate closed; a plan to insert a 5th row into DATA.ENEMIES
 * that breaks verify_enemy.js's hard-pinned four-template roster, D9) that
 * Kilnwarden is structurally immune to or simply does not need. See
 * CINDER_LOOP_CHANGELOG.md's v0.2.7 entry for the full panel record.
 *
 * DELIBERATELY NOT in DATA.ENEMIES / DATA.ENEMY_IDS (10-data.js). That table
 * and its length are hard-pinned to exactly four by D9 and verify_enemy.js —
 * the boss is understood to be a separate thing, not a fifth roster entry.
 * 45-enemy.js's Enemy constructor accepts this template OBJECT directly
 * (`new C.Enemy(id, C.Boss.template, x, y, seed)`), never a string lookup.
 *
 * Every mechanism below reuses existing engine capability. The one genuinely
 * new attack verb, 'zone', costs zero new Bus events and zero new render
 * path: a live hazard tile is fully observable by reading the World
 * directly, the same way every other hazard tile already is (30-player.js's
 * generic hazard check; 80-view.js's generic tile paint). No file outside
 * 45-enemy.js (the generalized multi-move/phase engine) and this one needed
 * to change for Kilnwarden to exist.
 *
 * Owned by: Boss team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, TILE = C.TILE, World = C.World;

/* --------------------------------------------------------------- phase 1
 * Three shoot-primitive attacks, all `contact: 0` (dangerous() is never
 * true for 'shoot' — a Kilnwarden bolt threatens through Combat.resolveBox
 * exactly like Kilnspitter's own single shot, never through the boss's own
 * body). Two are always eligible; the third only ADDS to the pool at close
 * range, so the live pool can never be empty (verify_boss.js proves this
 * directly with a distance sweep, not by inspection of these ranges). */
var EMBER_ARC = {
  id: 'emberArc', attack: 'shoot',
  telegraph: 22, recover: 24, cooldown: 46,
  damage: 1, knock: [2.0, -2.2], contact: 0,
  projectile: { speed: 3.1, lift: -2.5, gravity: 0.11, w: 5, h: 5, life: 150 }
};

// volley: 3 lobbed together from one commit — a data-driven repeat of the
// same ctx.addShot() call Ember Arc already makes, not a new primitive.
// The longest phase-1 telegraph, because it is the most dangerous: standing
// still means at least one of the three lanes is heading for exactly where
// the player is.
var CINDER_SPREAD = {
  id: 'cinderSpread', attack: 'shoot',
  telegraph: 26, recover: 24, cooldown: 60,
  damage: 1, knock: [2.0, -2.2], contact: 0,
  volley: 3, lifts: [-3.6, -2.6, -1.6],
  projectile: { speed: 3.1, lift: -2.6, gravity: 0.11, w: 5, h: 5, life: 150 }
};

// Only ELIGIBLE inside 70px — a short, fast, cheap-telegraph punish for
// standing point-blank against a ranged boss, the same "don't get greedy"
// lesson a short reach earns elsewhere in the roster (Ashwalker's own
// reach: 26 is the shortest in the regular four for the same reason).
var KILN_BREATH = {
  id: 'kilnBreath', attack: 'shoot',
  telegraph: 18, recover: 20, cooldown: 34,
  damage: 1, knock: [2.4, -2.0], contact: 0,
  minRange: 0, maxRange: 70,
  projectile: { speed: 4.2, lift: -1.0, gravity: 0.14, w: 4, h: 4, life: 60 }
};

/* --------------------------------------------------------------- phase 2
 * Kiln Floor: the one genuinely new attack verb, 'zone' (45-enemy.js's
 * doZone). No direct hitbox — it lights `ventCount` of these four floor
 * tiles to HAZARD for `hazardFrames`, `buildFrames` after its own telegraph
 * ends (a SECOND warning window on top of the telegraph itself, not a
 * substitute for one), then reverts them. Damage comes from the ordinary
 * hazard-tile path every player already respects (30-player.js) — no new
 * damage path, no new Bus event, no new render path. The longest telegraph
 * in the whole fight: it is the newest, least familiar threat, with the
 * widest consequence (removes ground, not just a lane).
 *
 * Vent coordinates match the arena grid built by `arena()` below — row 15,
 * one row above the floor's own top surface (row 16), the same convention
 * 95-app.js's demoLevel() already uses for its static spike row. */
var KILN_FLOOR = {
  id: 'kilnFloor', attack: 'zone',
  telegraph: 28, recover: 30, cooldown: 90,
  buildFrames: 16, hazardFrames: 60, ventCount: 2,
  vents: [[9, 15], [18, 15], [26, 15], [35, 15]]
};

/* ----------------------------------------------------------- the template
 * Rooted (speed 0, accel 0, patrol 0) — the same "stationary caster"
 * pattern Kilnspitter already establishes, at boss scale. `reach` is set
 * explicitly, generously, to cover the whole arena's interior width —
 * deliberately NOT left undefined: doChase's existing `abs(dx) > t.reach`
 * gate needs a real value to make "always eligible to attempt an attack,
 * cooldown permitting" a stated design choice rather than an accident of
 * `abs(dx) > undefined` always evaluating false. `sight` is generous for
 * the same reason — acquire() must never lose track of a player anywhere
 * in this specific room. */
var KILNWARDEN = {
  id: 'kilnwarden',
  name: 'Kilnwarden',
  hp: 90,
  w: 28, h: 36,
  mode: 'walk',
  speed: 0, accel: 0,
  sight: 500, reach: 500,
  patrol: 0,
  contact: 0,
  tint: '#c23b2a', tintDark: '#3a1410',
  scale: 1.6,
  moves: [EMBER_ARC, CINDER_SPREAD, KILN_BREATH],
  // Trigger at 50% hp — one hard threshold rather than several soft ones,
  // readable off an ordinary hp bar at a glance, checked only at the one
  // seam in the state machine where nothing dangerous is ever in flight
  // (doRecover, never mid-attack — see 45-enemy.js's doRecover). Cooldowns
  // compress (~0.7x); telegraphs never do — the honest "harder" lever.
  phase2: {
    hpFrac: 0.5,
    transitionFrames: 20,
    addMoves: [KILN_FLOOR],
    overrides: { cinderSpread: { volley: 4 } },
    cooldownScale: 0.7
  }
};

/* ------------------------------------------------------------- the arena
 * 44x20 tiles, sealed on all four sides — a fight pit, not a traversal
 * level, built explicit-tile-by-tile the same way 95-app.js's demoLevel()
 * is (this project's established convention for hand-authored rooms; there
 * is no procedural arena generator and building one is out of scope here).
 *
 * Floor: rows 16-19, solid, cols 1-42. Two ONEWAY respite platforms at row
 * 12 (cols 9-14 and 29-34, roughly symmetric about the room's centerline)
 * give lateral repositioning without denying Kilnwarden's own reach — its
 * projectiles arc, so a platform changes WHICH of Cinder Spread's three
 * lanes catches a player, never which fight they're in. Deliberately no
 * interior SOLID geometry: a pillar would let a player permanently hide
 * from a purely-arcing, non-homing kit, exactly the "cheap wall-clip
 * safety" the original design brief ruled out. The four vent tiles (row
 * 15) are ordinary EMPTY at rest; Enemy.doZone (45-enemy.js) is the only
 * thing that ever calls world.set() on them. */
function arena() {
  var W = 44, H = 20, world = new World(W, H);
  var S = TILE.SOLID, O = TILE.ONEWAY, x, y;

  for (x = 0; x < W; x++) world.set(x, 0, S);                       // ceiling
  for (y = 0; y < H; y++) { world.set(0, y, S); world.set(W - 1, y, S); }  // side walls
  for (y = 16; y < H; y++) for (x = 1; x < W - 1; x++) world.set(x, y, S); // floor

  for (x = 9; x <= 14; x++) world.set(x, 12, O);
  for (x = 29; x <= 34; x++) world.set(x, 12, O);

  return world;
}

// CFG.TILE is the tile SIZE in px (16); TILE (= C.TILE) is the tile-KIND
// enum ({EMPTY,SOLID,ONEWAY,HAZARD}). Pixel-coordinate math needs the
// former — this exact mix-up produced NaN spawn coordinates once already
// in this project's history (95-app.js's own boot() carries the scar as a
// comment); this file uses `PX` as a deliberately unambiguous local name so
// it can never happen here by a stray keystroke.
var PX = CFG.TILE;

C.Boss = {
  template: KILNWARDEN,
  arena: arena,
  ARENA_W: 44, ARENA_H: 20,
  VENTS: KILN_FLOOR.vents,
  // Centered on the floor. h=36 means feet at row 16 (y=256) puts the body
  // top at 256-36=220.
  spawn: [16 * PX - 14, 16 * PX - KILNWARDEN.h],
  // Near the left wall, standing on the floor — far enough from Kilnwarden
  // to open the fight at range rather than inside Kiln Breath's 70px band.
  playerSpawn: [3 * PX, 16 * PX - CFG.PLAYER_H]
};

})(CINDER);
