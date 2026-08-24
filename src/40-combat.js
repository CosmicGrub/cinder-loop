/* ===========================================================================
 * 40-combat.js  —  damage resolver, hit windows, hitstop policy, i-frames
 * ---------------------------------------------------------------------------
 * SIM layer. Combat orchestrates; entities own their own state. This file
 * decides WHETHER a hit lands — hitbox overlap, i-frames, one-hit-per-target,
 * cancels — and then calls the target's own hurt(). It never reaches in and
 * edits somebody's hp directly, because the moment two files can subtract
 * from hp, neither of them is the damage rule any more.
 *
 * The dependency order is why the attack state machine lives here rather than
 * in 30-player.js: an attack needs the rig, and 30 sits below 35. The player
 * exposes `attack` and `actionLock` and reads them as its own fields; it never
 * learns what a move is.
 *
 * Hitstop: Sim owns the counter because Sim owns the tick. This file owns the
 * POLICY — how many frames a given hit is worth. Requests go through
 * player.hitstopRequest and Sim takes the largest.
 *
 * Owned by: Combat team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, DATA = C.DATA, aabb = C.aabb, approach = C.approach, Body = C.Body;

var Combat = {};

/* Pose space is the STANDING body box, authored facing right. Two conversions
 * matter and both are easy to get wrong:
 *
 *   Facing — mirror x about the body's own width, not about the box.
 *   Crouching — anchor to the FEET, not the top. The body shrinks upward when
 *   it crouches, so anchoring to b.y would drag every hitbox 10px down with it
 *   and a crouching swing would hit the floor instead of the enemy. */
/* `poseW`/`poseH` are the box an entity's poses were AUTHORED in — the
 * player's standing 10x22, an Ashwalker's 12x24. Mirroring reflects about the
 * authored width and the feet anchor subtracts the authored height, so an
 * entity of any size gets its own geometry rather than borrowing the
 * player's. Falling back to the player constants would silently offset every
 * enemy hitbox by the difference. */
Combat.pointToWorld = function (e, x, y) {
  var b = e.body;
  var pw = e.poseW === undefined ? CFG.PLAYER_W : e.poseW;
  var ph = e.poseH === undefined ? CFG.PLAYER_H : e.poseH;
  return {
    x: e.facing >= 0 ? b.x + x : b.x + (pw - x),
    y: (b.y + b.h) - (ph - y)
  };
};

/* Expressed through pointToWorld rather than repeating the arithmetic, so the
 * blade the presenter DRAWS and the box the sim TESTS can never disagree.
 * Mirroring swaps which corner is leftmost, hence the min/abs. */
Combat.toWorld = function (e, box) {
  var a = Combat.pointToWorld(e, box.x0, box.y0);
  var c = Combat.pointToWorld(e, box.x1, box.y1);
  return {
    x: Math.min(a.x, c.x),
    y: Math.min(a.y, c.y),
    w: Math.abs(c.x - a.x),
    h: Math.abs(c.y - a.y)
  };
};

// The hitbox for this tick, or null. Presenter-safe: it reads, never writes.
Combat.activeBox = function (player, rig) {
  var a = player.attack;
  if (!a) return null;
  var m = rig.move(a.id);
  var box = m.boxes[a.frame];
  return box ? Combat.toWorld(player, box) : null;
};

/* Consume a buffered attack press. Runs BEFORE the player moves, so a swing
 * costs zero frames of latency exactly like a jump does. */
Combat.begin = function (player, pad, rig, bus) {
  if (!player.alive()) return;
  if (!pad.buffered('attack')) return;

  var cur = player.attack;
  if (cur) {
    // Mid-move: the only legal continuation is the declared chain, and only
    // once the swing being chained from has actually happened. An early press
    // is left in the buffer rather than eaten, so it fires the moment the
    // window opens.
    var m = rig.move(cur.id);
    if (!m.data.chain || cur.frame < m.chainFrom) return;
    pad.consume('attack');
    Combat.start(player, m.data.chain, rig, bus);
    return;
  }

  if (player.state === 'roll' || player.state === 'dash') return; // a commitment
  pad.consume('attack');
  // Weapons as data (D7, D10 — Weapons team): a weapon names two entry
  // points into the rig's own MOVES table and nothing else. Chaining
  // onward (slashA -> slashB, daggerA -> daggerB -> daggerC) is still
  // decided entirely by the RIG move's own `chain` field above, unaware a
  // second weapon exists at all — only where the FIRST press of a fresh
  // swing starts is weapon-specific.
  var w = (DATA.WEAPONS && DATA.WEAPONS[player.weapon]) || DATA.WEAPONS.blade;
  Combat.start(player, pad.down('down') ? w.heavy : w.light, rig, bus);
};

Combat.start = function (player, id, rig, bus) {
  var m = rig.move(id);
  player.attack = { id: id, frame: 0, hits: [] };
  player.actionLock = m.frames;
  bus.emit('attackStart', { id: player.id, move: id, x: player.body.x, y: player.body.y });
};

Combat.cancel = function (player, bus) {
  if (!player.attack) return;
  var id = player.attack.id;
  player.attack = null;
  player.actionLock = 0;
  bus.emit('attackCancel', { id: player.id, move: id });
};

/* THE damage rule. One function, used in both directions — the player's blade
 * and an enemy's claw resolve through exactly this code. The moment there are
 * two places that subtract from hp, neither of them is the rule.
 *
 * `spec.hits` is an optional dedupe list: pass a per-move array and a target
 * can only be struck once by that move. `spec.announce` emits the attacker-side
 * 'hit' event; enemies leave it off, because the player's own 'hurt' already
 * carries the screen flash and firing both would double the effect. */
Combat.resolveBox = function (source, hb, targets, spec, bus) {
  var landed = 0, i, t;
  for (i = 0; i < targets.length; i++) {
    t = targets[i];
    if (t === source) continue;
    if (t.alive && !t.alive()) continue;
    if (spec.hits && spec.hits.indexOf(t) !== -1) continue;
    if (!aabb(hb.x, hb.y, hb.w, hb.h, t.body.x, t.body.y, t.body.w, t.body.h)) continue;

    /* Parry (abilities spec §2b): checked against a REAL overlapping hit —
     * never merely "armed while something is happening" — timing against
     * an actual incoming attack is the whole mechanic, which is why this
     * sits AFTER the aabb test above, not before it.
     *
     * Checked AHEAD of invulnerable() below — deliberately, and re-fixed
     * here after an adversarial review pass caught the first draft doing
     * it the other way round. invulnerable() also covers ordinary post-hit
     * iframes (60 frames, CFG.HURT_IFRAMES) and roll/dash's own i-frames,
     * none of which gate the PARRY input trigger itself — so a player hit
     * once and then reading a follow-up attack correctly within the next
     * second would arm parryWindow, get a real parryStart, and then have
     * the invulnerable() check silently eat the target before the parry
     * branch ever ran, losing the stagger (parry's actual payoff, not
     * merely redundant with the damage immunity iframes already gives) for
     * a reason that had nothing to do with the read itself. A successful
     * parry now registers — and still staggers the attacker — regardless
     * of whether the target ALSO happens to be invulnerable for an
     * unrelated reason; a correct read earns its reward independent of
     * why the hit would or wouldn't otherwise have landed.
     *
     * `typeof source.stagger === 'function'` is true only for a real
     * Enemy (45-enemy.js) — false for Player, Combat.Dummy, and Shot by
     * construction — so every OTHER caller of this exact function
     * (player-attacks-enemy, a Shot's own hit) is completely untouched by
     * this branch with no added guard needed at those call sites. A
     * projectile (Shot) has no .stagger either, so a base parry does not
     * negate ranged damage — that is Reflect's own job (§4, deferred), not
     * this one.
     *
     * One press consumes the whole window (t.parryWindow = 0) so a still-
     * armed window cannot double-resolve against a second hitbox the same
     * enemy might resolve later in the very same tick. Riposte's bonus
     * counter-hit (§4, deferred) hooks in right here once it exists —
     * nothing about this shape needs to change to add it, only a new
     * conditional branch.
     *
     * NOT retroactive across OTHER targets sharing this same call: if this
     * hitbox also overlaps a second, non-parrying target, that target
     * still takes the hit even though the source is about to be staggered
     * by the target processed here — each target's own parry protects only
     * themselves, not a same-tick ally standing in the same hitbox (see
     * the co-op regression test this reasoning is pinned by). */
    if (t.parryWindow > 0 && typeof source.stagger === 'function') {
      t.parryWindow = 0;
      /* Captured BEFORE stagger() runs — an adversarial review pass found
       * a real bug here: co-op means a SECOND target sharing this exact
       * loop (same shared hitbox, e.g. a wide charge/contact box) can also
       * have parryWindow armed and reach this branch in the same call.
       * stagger() itself already no-ops on a second call (its own
       * idempotency guard), but the Riposte bonus damage below is a
       * SEPARATE call that guard does nothing to protect — without this,
       * two simultaneous parries dealt Riposte damage TWICE to one enemy
       * and could emit targetDown twice for one kill. `source.alive &&
       * !source.alive()` also catches the source having already been
       * killed by an EARLIER target's Riposte in this same loop — the
       * analogous "already down" check resolveBox already gives every
       * ordinary TARGET (t.alive() above), extended here to the SOURCE. */
      var enemyAlreadyDown = (source.alive && !source.alive()) || source.state === 'staggered';
      source.stagger(bus);
      bus.emit('parry', { id: t.id, source: source.id, x: hb.x + hb.w * 0.5, y: hb.y + hb.h * 0.5 });
      /* Riposte (§4): a flat bonus hit landed directly on the source, not
       * routed back through resolveBox itself — going through the generic
       * per-target gate a second time would let the enemy's OWN, entirely
       * unrelated iframes (say, from a co-op partner's swing moments
       * earlier) silently swallow a reward that is supposed to be
       * unconditional once the read has already happened, and would
       * require synthesizing a hitbox against source.body that has no
       * real geometric meaning here. Mirrors resolveBox's own targetDown
       * emission by hand so a Riposte kill still counts for currency/kill
       * tracking (70-sim.js's own targetDown listener) exactly like an
       * ordinary kill does. */
      if (t.parryRiposte && !enemyAlreadyDown) {
        source.hurt(CFG.PARRY_RIPOSTE_DAMAGE, bus);
        if (source.alive && !source.alive()) {
          bus.emit('targetDown', { id: source.id, x: source.body.x, y: source.body.y });
        }
      }
      continue;
    }

    /* Reflect (§4): parry timed against a PROJECTILE specifically — a
     * Shot never has .stagger (checked above), so it falls through to
     * here instead. `source.owner` is a structural check exactly like
     * `typeof source.stagger === 'function'` above (a field only
     * 45-enemy.js's Shot ever carries) rather than an instanceof test —
     * this file stays decoupled from importing that concrete class, the
     * same reasoning behind every other duck-typed check in this
     * function. Sends the SAME damage the shot would have dealt back at
     * whoever fired it, directly (not a second live projectile flying
     * back through the world — Shot.update() always resolves against
     * `players` only, with no existing notion of an enemy-facing target
     * set to route a truly reflected shot through; "sends it back at the
     * attacker" is satisfied exactly either way, and this avoids a much
     * larger, riskier change to how shots pick their own targets).
     * `source.done = true` consumes it explicitly — resolveBox's return
     * value (`landed`) stays 0 here same as the negate-only branches
     * above, and Shot.prototype.update() only marks itself done when
     * THAT count is nonzero, so a reflected shot left unconsumed would
     * otherwise keep flying on and could still hit the same player again
     * next tick. */
    if (t.parryWindow > 0 && t.parryReflect && source.owner) {
      t.parryWindow = 0;
      /* Two guards an adversarial review pass found missing:
       *
       * `alreadyReflected` — the exact same co-op double-hit shape as
       * Riposte's enemyAlreadyDown above: a shot small enough to overlap
       * two stacked co-op targets in one resolveBox call could otherwise
       * have BOTH targets independently hurt the same owner for the
       * shot's full damage. Captured before source.done is set, since
       * that flag IS the "already consumed" signal — the first target to
       * reach here wins, same as Combat.cancel's own "nothing to cancel"
       * no-op shape elsewhere in this file.
       *
       * `ownerAlive` — a real bug: source.owner is set once at Shot
       * construction and the shot is never pruned early if its owner
       * dies first (only a level transition clears both together), so an
       * orphaned shot from an enemy already killed by other means could
       * still be Reflect-parried later in its life. Without this guard,
       * Enemy.prototype.hurt() ran harmlessly on the already-dead owner
       * but its OWN alive() check still read true-since-death, emitting a
       * SECOND targetDown for one kill — 70-sim.js's own targetDown
       * listener has no dedupe against a repeat id, so this double-
       * counted real, banked run.kills/currency for a single enemy death,
       * not just a cosmetic duplicate event. */
      var alreadyReflected = source.done;
      source.done = true;
      var ownerAlive = !source.owner.alive || source.owner.alive();
      if (!alreadyReflected && ownerAlive && source.owner.hurt) {
        source.owner.hurt(source.damage, bus);
        if (source.owner.alive && !source.owner.alive()) {
          bus.emit('targetDown', { id: source.owner.id, x: source.owner.body.x, y: source.owner.body.y });
        }
      }
      bus.emit('parry', { id: t.id, source: source.id, x: hb.x + hb.w * 0.5, y: hb.y + hb.h * 0.5 });
      continue;
    }

    if (t.invulnerable && t.invulnerable()) continue;

    if (spec.hits) spec.hits.push(t);
    t.hurt(spec.damage, bus, [spec.knock[0] * spec.facing, spec.knock[1]]);
    landed++;

    if (spec.announce) {
      bus.emit('hit', {
        id: source.id, move: spec.move, damage: spec.damage,
        x: hb.x + hb.w * 0.5, y: hb.y + hb.h * 0.5, facing: spec.facing
      });
    }
    if (t.alive && !t.alive()) {
      bus.emit('targetDown', { id: t.id, x: t.body.x, y: t.body.y });
    }
  }
  return landed;
};

/* D2: "weapons list two colours and scale off the larger; colourless gear
 * scales off the highest." A weapon's own move damage (m.data.damage,
 * already baked and audited, L9) is always the BASE — this only ever
 * multiplies it, never replaces it, so a fresh run (every stat at
 * STAT_START) swings at exactly the documented base damage, multiplier 1.
 * Design judgment, not a measurement — see CFG.STAT_SCALE_PER_POINT's own
 * comment in 00-core.js for why 0.15/point, the same "named as a judgment,
 * not dressed up as derived" discipline as GEN_MIN_FIGHT_TILES. */
Combat.weaponScale = function (player) {
  if (!player.stats) return 1;
  var w = (DATA.WEAPONS && player.weapon && DATA.WEAPONS[player.weapon]) || null;
  var v;
  if (w && w.colours && w.colours.length === 2) {
    v = Math.max(player.stats[w.colours[0]], player.stats[w.colours[1]]);
  } else {
    // No weapon, or a colourless one: scales off the highest of all three.
    v = Math.max(player.stats.ember, player.stats.umbral, player.stats.verdant);
  }
  return 1 + (v - CFG.STAT_START) * CFG.STAT_SCALE_PER_POINT;
};

/* Advance the move and resolve hits. Runs AFTER everything has moved, so the
 * overlap test uses this tick's real positions rather than last tick's. */
Combat.step = function (player, targets, rig, bus) {
  var a = player.attack;
  if (!a) return;

  if (!player.alive()) { Combat.cancel(player, bus); return; }
  if (player.state === 'roll' || player.state === 'dash') { Combat.cancel(player, bus); return; }

  var m = rig.move(a.id);
  var box = m.boxes[a.frame];

  if (box) {
    // One hit per target per move (a.hits). Without it a 3-frame active
    // window is a 3-hit move and every damage number in the game is a lie.
    // Rounded here, not inside weaponScale itself — that stays a pure
    // multiplier (reusable, testable on its own), while every damage number
    // actually applied to an hp total in this game is a clean integer, the
    // same as every hand-authored move's own damage field already is.
    var landed = Combat.resolveBox(player, Combat.toWorld(player, box), targets, {
      damage: Math.round(m.data.damage * Combat.weaponScale(player)),
      knock: m.data.knock,
      facing: player.facing,
      hits: a.hits,
      move: a.id,
      announce: true
    }, bus);
    if (landed && m.data.hitstop > player.hitstopRequest) {
      player.hitstopRequest = m.data.hitstop;
    }
  }

  a.frame++;
  if (player.actionLock > 0) player.actionLock--;
  if (a.frame >= m.frames) {
    player.attack = null;
    player.actionLock = 0;
    bus.emit('attackEnd', { id: player.id, move: m.id });
  }
};

/* Slam impact. `player.slamLanded` is a one-tick signal 30-player.js's
 * finish() sets the instant a slam lands, owned and consumed entirely here
 * (the same pattern Combat.step already uses for player.attack) — nobody
 * else reads or clears it. Called from Sim.step in the same phase as
 * Combat.step, against this tick's real (post-move, post-target-update)
 * positions, for the same reason regular swings are.
 *
 * Two boxes, not one, is the whole design: a slam has no `facing` — it is a
 * shockwave centred on the landing point — but Combat.resolveBox always
 * pushes every target in ONE shared direction (spec.facing). Rather than
 * teach resolveBox a second knockback model (the exact "two places that
 * subtract from hp" failure this project's own rule warns against), the AOE
 * is built as a LEFT box (facing -1) and a RIGHT box (facing +1) around the
 * body, sharing one dedupe list so nothing in the gap gets hit twice — the
 * ONE shared resolver still resolves every hit, just called twice. */
Combat.resolveSlam = function (player, targets, bus) {
  if (!player.slamLanded) return;
  player.slamLanded = false;

  var b = player.body;
  var y0 = (b.y + b.h) - CFG.SLAM_HIT_H, h = CFG.SLAM_HIT_H;
  // One shared dedupe list, no ES2015+ merge helper (this codebase makes no
  // ES2015+ runtime assumptions anywhere — see 92-menu.js's own withField
  // comment — a Wear OS WebView is a real target). Two full literal specs,
  // identical but for facing, same as Combat.step already writes one inline.
  var hits = [];
  var damage = Math.round(CFG.SLAM_DAMAGE * Combat.weaponScale(player));

  var leftLanded = Combat.resolveBox(player,
    { x: b.x - CFG.SLAM_HIT_W, y: y0, w: CFG.SLAM_HIT_W, h: h },
    targets, { damage: damage, knock: CFG.SLAM_KNOCK, facing: -1, hits: hits, move: 'slam', announce: true }, bus);
  var rightLanded = Combat.resolveBox(player,
    { x: b.x + b.w, y: y0, w: CFG.SLAM_HIT_W, h: h },
    targets, { damage: damage, knock: CFG.SLAM_KNOCK, facing: 1, hits: hits, move: 'slam', announce: true }, bus);

  if ((leftLanded + rightLanded) && CFG.HITSTOP_HEAVY > player.hitstopRequest) {
    player.hitstopRequest = CFG.HITSTOP_HEAVY;
  }
};

/* ------------------------------------------------------------------ Dummy
 * A training dummy: the minimum thing an attack can land on. It exists so
 * combat is testable and the debug room has something to hit before
 * 45-enemy.js lands. It has no brain and never will — when real enemies
 * arrive they satisfy the same shape (body, alive, invulnerable, hurt,
 * update, resetTransient) and this stays as a target-practice prop.
 * ------------------------------------------------------------------ */
function Dummy(id, x, y, hp) {
  this.id = id;
  this.spawnX = x;
  this.spawnY = y;
  this.maxHp = hp === undefined ? 30 : hp;
  this.body = new Body(x, y, 12, 20);
  this.resetTransient();
}

Dummy.prototype.resetTransient = function () {
  var b = this.body;
  b.x = this.spawnX; b.y = this.spawnY;
  b.vx = 0; b.vy = 0;
  b.onGround = false; b.onCeiling = false; b.onWall = 0; b.dropThrough = 0;
  this.hp = this.maxHp;
  this.iframes = 0;
  return this;
};

Dummy.prototype.alive = function () { return this.hp > 0; };
Dummy.prototype.invulnerable = function () { return this.iframes > 0; };

// Deliberately silent. The attacker's 'hit' event is the one the presenter
// draws; routing dummies through the player's 'hurt' channel would make the
// screen flash red every time YOU landed a blow.
Dummy.prototype.hurt = function (amount, bus, knock) {
  this.hp -= amount;
  if (this.hp < 0) this.hp = 0;
  this.iframes = CFG.HIT_IFRAMES;
  if (knock) {
    this.body.vx = knock[0] * 0.5;
    this.body.vy = knock[1] * 0.5;
  }
  return this;
};

Dummy.prototype.update = function (world) {
  if (this.iframes > 0) this.iframes--;
  var b = this.body;
  b.vy += CFG.GRAVITY;
  if (b.vy > CFG.MAX_FALL) b.vy = CFG.MAX_FALL;
  b.vx = approach(b.vx, 0, 0.25);
  b.move(world);
  return this;
};

Combat.Dummy = Dummy;
C.Combat = Combat;

})(CINDER);
