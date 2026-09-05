/* ===========================================================================
 * 45-enemy.js  —  enemy entities + per-instance-seeded brains
 * ---------------------------------------------------------------------------
 * SIM layer. The engine knows five primitives — walk+melee, walk+charge,
 * walk+shoot, fly+dive, and walk+summon (D16 — an elite that calls in
 * one of the regular roster mid-fight, 56-caller.js). A template in
 * 10-data.js picks one and supplies numbers. Adding a sixth archetype
 * costs exactly one primitive; adding a fifth regular ENEMY costs a row
 * (D7) — the Caller is kept OUT of that roster the same way Kilnwarden is.
 *
 * THE FAIRNESS RULE, and it is the whole design:
 *
 *   Facing locks the moment an attack is committed.
 *
 * An enemy decides where it is going to hit at the START of its telegraph and
 * cannot revise. That single rule is what makes every attack dodgeable, turns
 * the telegraph frames into real information rather than decoration, and gives
 * the roll something to be good against. An enemy that tracks you through its
 * windup is not harder, it is unreadable — and verify_enemy fails the build
 * over it.
 *
 * Every enemy carries its OWN seeded RNG (L4). Two Ashwalkers spawned from the
 * same template wander differently and must never share a stream.
 *
 * Owned by: Enemy team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, DATA = C.DATA, RNG = C.RNG, Body = C.Body, Combat = C.Combat,
    approach = C.approach, sign = C.sign, abs = C.abs;

/* ------------------------------------------------------------------ Shot
 * A lobbed ember. Dies on terrain, on a player, or on its own timer — never
 * lives forever, because an off-screen projectile that outlives its room is
 * how a run desyncs from what the player can see.
 *
 * `owner` (abilities spec §4, Parry Reflect): a direct reference to the
 * Enemy that fired it, added specifically so a successful Reflect has
 * someone concrete to hurt back — before this it was reachable only by
 * decoding `id` (this.id * 1000 + ...), which fire() already builds it
 * from; a real reference is simpler and does not depend on that encoding
 * staying stable. Optional (defaults to null) so this constructor's
 * existing call shape still works for anything that never needs it. */
function Shot(id, x, y, vx, vy, spec, damage, knock, ownerFacing, owner) {
  this.id = id;
  this.spec = spec;
  this.damage = damage;
  this.knock = knock;
  this.facing = ownerFacing;
  this.owner = owner || null;
  this.body = new Body(x, y, spec.w, spec.h);
  this.body.vx = vx;
  this.body.vy = vy;
  this.life = spec.life;
  this.done = false;
}

Shot.prototype.update = function (world, players, bus) {
  if (this.done) return this;
  var b = this.body;
  b.vy += this.spec.gravity;
  b.x += b.vx;
  b.y += b.vy;

  if (--this.life <= 0) { this.done = true; return this; }

  if (world.rectSolid(b.x, b.y, b.w, b.h)) {
    this.done = true;
    bus.emit('shotBurst', { x: b.x + b.w * 0.5, y: b.y + b.h * 0.5 });
    return this;
  }

  var landed = Combat.resolveBox(this, { x: b.x, y: b.y, w: b.w, h: b.h }, players, {
    damage: this.damage, knock: this.knock, facing: sign(b.vx) || this.facing
  }, bus);
  if (landed) {
    this.done = true;
    bus.emit('shotBurst', { x: b.x + b.w * 0.5, y: b.y + b.h * 0.5 });
  }
  return this;
};

/* ----------------------------------------------------------------- Enemy
 * `templateId` is normally a string looked up in DATA.ENEMIES (unchanged
 * behavior). It may also BE the template object directly — the boss (D9,
 * 55-boss.js) is deliberately kept OUT of DATA.ENEMIES/ENEMY_IDS (that
 * table and its length are hard-pinned to exactly 4 by verify_enemy.js),
 * so 55-boss.js constructs its Enemy by passing its own template object
 * straight through rather than registering a 5th roster entry. */
function Enemy(id, templateId, x, y, seed) {
  var t = typeof templateId === 'object' ? templateId : DATA.ENEMIES[templateId];
  if (!t) throw new Error('Enemy: unknown template "' + templateId + '"');
  this.id = id;
  this.tid = typeof templateId === 'object' ? (t.id || 'boss') : templateId;
  this.t = t;
  this.spawnX = x;
  this.spawnY = y;
  this.seed = (seed === undefined ? id * 2654435761 : seed) >>> 0;
  this.body = new Body(x, y, t.w, t.h);
  this.resetTransient();
}

Enemy.prototype.resetTransient = function () {
  var b = this.body, t = this.t;
  b.x = this.spawnX; b.y = this.spawnY;
  b.w = t.w; b.h = t.h;
  b.vx = 0; b.vy = 0;
  b.onGround = false; b.onCeiling = false; b.onWall = 0; b.dropThrough = 0;

  // Poses for this template are authored in its own box, not the player's.
  this.poseW = t.w;
  this.poseH = t.h;

  this.hp = t.hp;
  this.maxHp = t.hp;
  this.iframes = 0;
  this.facing = 1;
  this.state = 'patrol';
  this.stateFrames = 0;
  this.cooldown = 0;
  this.attack = null;         // the rig move, for melee templates
  this.hits = [];             // per-attack dedupe
  this.lockFacing = 1;        // committed at telegraph; never revised
  this.diveY = 0;
  this.homeX = this.spawnX;
  this.wander = 1;
  this.rng = new RNG(this.seed);
  // Optional multi-move / multi-phase support (55-boss.js). `activeMove` is
  // the move commit() picked for the attack in flight, read in preference
  // to `this.t` everywhere a template field is read — for the four regular
  // templates `t.moves` is never declared, so `activeMove` never leaves
  // null and every read falls through to `this.t` exactly as before this
  // ever existed (provably a no-op for the existing roster, see
  // verify_boss.js's regression-guard test, which reruns verify_enemy.js's
  // own fairness loop unmodified after this file changes). `phase` indexes
  // nothing about the existing four; it only ever moves for a template
  // that declares `t.phase2`.
  this.activeMove = null;
  this.phase = 0;
  this._zoneTiles = null;
  // Optional summon-primitive support (56-caller.js). Only 'summon'-verb
  // templates (the Caller) ever increment this; a LIFETIME cap across the
  // whole encounter, read by callIn() as `this.summonsUsed >= m.summonMax`.
  // Never leaves 0 for the regular roster or the boss — provably a no-op
  // for both, the same guarantee activeMove/phase already document above.
  this.summonsUsed = 0;
  return this;
};

Enemy.prototype.alive = function () { return this.hp > 0; };
Enemy.prototype.invulnerable = function () { return this.iframes > 0; };

// True exactly while this enemy's attack can hurt someone. Everything that
// asks "is it dangerous right now" asks here, so there is one answer. Not
// listing 'staggered' here is what makes a staggered enemy harmless for
// free — no separate check needed anywhere contact damage is gated.
Enemy.prototype.dangerous = function () {
  return this.state === 'strike' || this.state === 'charge' || this.state === 'dive';
};

/* A successful parry (40-combat.js's Combat.resolveBox) lands here. Guarded
 * idempotent because co-op means two players' own parry windows can land
 * against the SAME shared enemy hitbox inside the same resolveBox loop —
 * without this guard the second call would re-enter 'staggered' and reset
 * stateFrames, silently extending the punish window past its own fixed
 * duration. Clearing `this.attack` stops advanceMove() from being able to
 * independently re-enter 'strike' behaviour later this tick (advanceMove
 * already captured the move into its own local `m` before resolveBox ran,
 * so that local going stale is harmless — this is what stops the FIELD from
 * driving anything further, not what protects the local). */
Enemy.prototype.stagger = function (bus) {
  if (this.state === 'staggered' || this.state === 'dead') return;
  this.attack = null;
  this.enter('staggered');
  bus.emit('enemyStagger', { id: this.id, tid: this.tid, x: this.body.cx(), y: this.body.cy() });
};

Enemy.prototype.hurt = function (amount, bus, knock) {
  this.hp -= amount;
  if (this.hp < 0) this.hp = 0;
  this.iframes = CFG.HIT_IFRAMES;
  if (knock) {
    this.body.vx = knock[0] * 0.6;
    this.body.vy = knock[1] * 0.6;
  }
  if (this.hp === 0) {
    this.state = 'dead';
    this.stateFrames = 0;
    this.attack = null;
  }
  return this;
};

// Nearest living player inside sight. No line-of-sight test yet: there is no
// raycast in 20-world.js, so an enemy can currently notice you through a wall.
// Recorded rather than hidden; it wants fixing when the generator lands.
Enemy.prototype.acquire = function (players) {
  var best = null, bestD = Infinity, i, p, d;
  var cx = this.body.cx(), cy = this.body.cy();
  var range = this.t.sight * (this.state === 'patrol' ? 1 : CFG.AGGRO_DROP);
  for (i = 0; i < players.length; i++) {
    p = players[i];
    if (!p.alive()) continue;
    d = Math.abs(p.body.cx() - cx) + Math.abs(p.body.cy() - cy) * 0.6;
    if (d < bestD && d <= range) { bestD = d; best = p; }
  }
  this.dist = bestD;
  return best;
};

Enemy.prototype.enter = function (state) {
  this.state = state;
  this.stateFrames = 0;
  return this;
};

Enemy.prototype.update = function (world, players, bus, ctx) {
  var t = this.t, b = this.body;
  this.stateFrames++;
  if (this.iframes > 0) this.iframes--;
  if (this.cooldown > 0) this.cooldown--;

  if (this.state === 'dead') {
    b.vx = approach(b.vx, 0, CFG.ENEMY_FRICTION);
    if (t.mode === 'walk') { b.vy += CFG.GRAVITY; if (b.vy > CFG.MAX_FALL) b.vy = CFG.MAX_FALL; }
    b.move(world);
    return this;
  }

  var target = this.acquire(players);

  switch (this.state) {
    case 'patrol':   this.doPatrol(target); break;
    case 'chase':    this.doChase(target); break;
    case 'telegraph': this.doTelegraph(bus, ctx); break;
    case 'strike':   this.doStrike(); break;
    case 'charge':   this.doCharge(); break;
    case 'shoot':    this.doShoot(); break;
    case 'summon':   this.doSummon(); break;
    case 'dive':     this.doDive(); break;
    case 'zone':     this.doZone(world); break;
    case 'phaseTransition': this.doPhaseTransition(); break;
    case 'staggered': this.doStaggered(); break;
    case 'recover':  this.doRecover(); break;
  }

  // Gravity, unless it flies.
  if (t.mode === 'walk') {
    b.vy += CFG.GRAVITY;
    if (b.vy > CFG.MAX_FALL) b.vy = CFG.MAX_FALL;
  }
  b.move(world);

  /* Contact damage exists ONLY while the attack is live. Walking into a
   * charging Emberrush hurts; walking into one that is winding up, recovering
   * or patrolling does not. Without this an enemy is a damage field with legs
   * and the telegraph means nothing. Reads through activeMove-or-template so
   * a multi-move boss's contact/damage/knock come from whichever move is
   * actually in flight — a no-op for the regular roster, where activeMove is
   * always null and this reads straight off `t` exactly as before. */
  var activeSpec = this.activeMove || t;
  if (activeSpec.contact && this.dangerous()) {
    Combat.resolveBox(this, { x: b.x, y: b.y, w: b.w, h: b.h }, players, {
      damage: activeSpec.damage, knock: activeSpec.knock, facing: this.lockFacing, hits: this.hits
    }, bus);
  }

  // Melee templates swing a baked move; the hitbox comes from the rig, never
  // from this file (L9).
  if (this.attack && ctx && ctx.rig) this.advanceMove(players, bus, ctx.rig);

  return this;
};

/* ------------------------------------------------------------- behaviours */
Enemy.prototype.doPatrol = function (target) {
  var t = this.t, b = this.body;
  if (target && this.cooldown <= 0) { this.enter('chase'); return; }

  if (!t.patrol || !t.speed) { b.vx = approach(b.vx, 0, CFG.ENEMY_FRICTION); return; }

  // Turn at the edge of the patrol box, at a wall, or on a seeded whim.
  if (b.x < this.homeX - t.patrol) this.wander = 1;
  else if (b.x > this.homeX + t.patrol) this.wander = -1;
  else if (b.onWall !== 0) this.wander = -b.onWall;
  else if (this.rng.next() < 0.006) this.wander = -this.wander;

  this.facing = this.wander;
  b.vx = approach(b.vx, this.wander * t.speed * 0.6, t.accel);
};

Enemy.prototype.doChase = function (target) {
  var t = this.t, b = this.body;
  if (!target) { this.enter('patrol'); return; }

  var dx = target.body.cx() - b.cx();
  var dy = target.body.cy() - b.cy();
  this.facing = sign(dx) || this.facing;

  if (t.mode === 'fly') {
    // Sit above the target and wait for the dive.
    b.vx = approach(b.vx, sign(dx) * t.speed, t.accel);
    var want = target.body.cy() - t.hover;
    b.vy = approach(b.vy, sign(want - b.cy()) * t.speed * 0.8, t.accel);
    if (abs(dx) < t.reach && dy > 0 && this.cooldown <= 0) this.commit(target);
    return;
  }

  if (abs(dx) > t.reach) {
    b.vx = approach(b.vx, sign(dx) * t.speed, t.accel);
  } else {
    b.vx = approach(b.vx, 0, CFG.ENEMY_FRICTION);
    if (this.cooldown <= 0) this.commit(target);
  }
};

/* THE commitment. Facing is fixed here and nothing after this point may
 * change it — see doTelegraph, which reads lockFacing rather than facing.
 * `target` is only ever consumed by pickMove() (multi-move templates); the
 * four regular templates pass it through unused. */
Enemy.prototype.commit = function (target) {
  this.lockFacing = this.facing;
  this.hits.length = 0;
  if (this.t.moves) this.activeMove = this.pickMove(target);
  this.enter('telegraph');
};

/* Range-gates the live move pool by each entry's own reach against a
 * FRESHLY computed horizontal distance, mirroring doChase's own `dx`
 * convention exactly — deliberately NOT acquire()'s `this.dist`, which is a
 * different, vertically-weighted metric meant for choosing WHICH player to
 * target, not for gating a specific attack's range against whichever
 * target was already chosen. Weight-picks among whatever is eligible via
 * this enemy's own seeded RNG (L4) — never Math.random. If somehow nothing
 * is eligible (should not happen by construction — see verify_boss.js's
 * dedicated sweep proving the pool is never empty at any real distance),
 * falls back to the whole pool rather than ever leaving activeMove unset. */
Enemy.prototype.pickMove = function (target) {
  var t = this.t, b = this.body, i;
  var pool = t.moves.slice();
  if (this.phase >= 1 && t.phase2) {
    if (t.phase2.addMoves) pool = pool.concat(t.phase2.addMoves);
    if (t.phase2.overrides) {
      for (i = 0; i < pool.length; i++) {
        var ov = t.phase2.overrides[pool[i].id];
        if (!ov) continue;
        var merged = {}, k;
        for (k in pool[i]) merged[k] = pool[i][k];
        for (k in ov) merged[k] = ov[k];
        pool[i] = merged;
      }
    }
  }
  var dx = target ? abs(target.body.cx() - b.cx()) : 0;
  var eligible = [];
  for (i = 0; i < pool.length; i++) {
    var m = pool[i];
    var minR = m.minRange || 0, maxR = m.maxRange === undefined ? Infinity : m.maxRange;
    if (dx >= minR && dx <= maxR) eligible.push(m);
  }
  if (!eligible.length) eligible = pool;
  return eligible[this.rng.int(eligible.length)];
};

/* Every read below goes through `m = this.activeMove || t` — for the four
 * regular templates activeMove is always null, so `m === t` and every read
 * resolves exactly as it did before multi-move support existed. Only a
 * template that declares `t.moves` (55-boss.js) ever sees `m !== t`. */
Enemy.prototype.doTelegraph = function (bus, ctx) {
  var t = this.t, b = this.body, m = this.activeMove || t;
  this.facing = this.lockFacing;          // locked. cannot track you.
  b.vx = approach(b.vx, 0, CFG.ENEMY_FRICTION * 1.6);

  if (this.stateFrames === 1) {
    bus.emit('telegraph', {
      id: this.id, tid: this.tid, frames: m.telegraph,
      x: b.cx(), y: b.y, facing: this.lockFacing
    });
  }
  if (this.stateFrames < m.telegraph) return;

  switch (m.attack) {
    case 'melee':
      this.attack = { id: m.move, frame: 0 };
      this.enter('strike');
      break;
    case 'charge':
      b.vx = this.lockFacing * m.chargeSpeed;
      this.enter('charge');
      break;
    case 'shoot':
      this.fire(ctx);
      this.enter('shoot');
      break;
    case 'summon':
      this.callIn(ctx);
      this.enter('summon');
      break;
    case 'dive':
      this.enter('dive');
      break;
    case 'zone':
      this.enter('zone');
      break;
  }
  bus.emit('enemyAttack', { id: this.id, tid: this.tid, kind: m.attack, x: b.cx(), y: b.cy() });
};

// `volley` (default 1) fires that many Shots off one commit, each with its
// own `lifts[i]` if the move declares one — a data-driven repeat of a call
// that already exists (Kilnspitter's own single shot), not a new primitive.
Enemy.prototype.fire = function (ctx) {
  var m = this.activeMove || this.t, b = this.body, p = m.projectile;
  if (!p || !ctx || !ctx.addShot) return;
  var volley = m.volley || 1;
  for (var i = 0; i < volley; i++) {
    var lift = m.lifts ? m.lifts[i] : p.lift;
    ctx.addShot(new Shot(
      this.id * 1000 + this.stateFrames * 10 + i,
      b.cx() + this.lockFacing * (b.w * 0.5), b.y + b.h * 0.3,
      this.lockFacing * p.speed, lift,
      p, m.damage, m.knock, this.lockFacing, this
    ));
  }
};

// D16 (summon primitive): places up to m.summonCount real, independent
// Enemy instances via ctx.addEnemy — a two-line mirror of ctx.addShot
// above, delegating to the already-existing Sim.prototype.addEnemy.
// this.summonsUsed is a LIFETIME cap across the whole encounter, not a
// per-cast budget — a Caller that has already used up m.summonMax calls
// telegraphs for nothing further; the >= guard at entry makes a repeat
// call a safe, cheap no-op rather than re-summoning past the cap. No
// parent/child link to what gets spawned — killing this Caller does not
// despawn its own summoned adds (this engine has no such lifecycle
// mechanism anywhere, and building one isn't warranted for v1).
//
// Adversarially found: "no terrain-probing needed, gravity resolves it"
// (the original design reasoning) is false when the offset spawn point
// lands INSIDE a multi-row-solid mass rather than open air or a shallow
// floor overlap — Body.prototype.moveY only snaps out of the TOPMOST
// solid row it currently overlaps, so a deeply-embedded body re-triggers
// that same snap every tick and climbs upward through the rock instead of
// falling. Real generated rooms really do have such walls (50-gen.js's
// own boundary-column stamp, spanning a room's full height), and
// lockFacing can point straight at one. Checked directly against the
// summoned template's own real footprint (not a 1x1 guess) and falls
// back to the Caller's own already-valid position when embedded — the
// same defensive-fallback shape pickMove() already uses when its own
// eligible pool is empty.
Enemy.prototype.callIn = function (ctx) {
  var m = this.activeMove || this.t, b = this.body;
  if (!ctx || !ctx.addEnemy || this.summonsUsed >= m.summonMax) return;
  var count = m.summonCount || 1;
  var summonT = DATA.ENEMIES[m.summonId];
  var sw = summonT ? summonT.w : 1, sh = summonT ? summonT.h : 1;
  for (var i = 0; i < count; i++) {
    if (this.summonsUsed >= m.summonMax) break;
    // this.lockFacing scales BOTH terms — the base offset and the
    // per-index fan-out — so successive spawns fan out AWAY from the
    // Caller symmetrically regardless of which way it's facing. An
    // earlier version only scaled the base offset, folding later spawns
    // back toward (and eventually past) the Caller when facing left —
    // dead in v1 (summonCount is 1) but a real formula bug waiting for
    // the first template that ever raises it.
    var spawnX = b.x + this.lockFacing * (m.summonOffset || 24) + this.lockFacing * i * 12;
    var spawnY = b.y;
    if (ctx.rectSolid && ctx.rectSolid(spawnX, spawnY, sw, sh)) {
      spawnX = b.x; spawnY = b.y;
    }
    ctx.addEnemy(m.summonId, spawnX, spawnY);
    this.summonsUsed++;
  }
};

Enemy.prototype.doStrike = function () {
  // The rig move drives the timing; advanceMove ends it.
  this.body.vx = approach(this.body.vx, 0, CFG.ENEMY_FRICTION);
};

Enemy.prototype.doCharge = function () {
  var m = this.activeMove || this.t, b = this.body;
  b.vx = this.lockFacing * m.chargeSpeed;
  // Hitting a wall ends it early, and hurts — that is the punish window.
  if (b.onWall !== 0 || this.stateFrames >= m.active) this.enter('recover');
};

Enemy.prototype.doShoot = function () {
  var m = this.activeMove || this.t;
  this.body.vx = approach(this.body.vx, 0, CFG.ENEMY_FRICTION);
  if (this.stateFrames >= m.recover) this.enter('recover');
};

// D16: a near-copy of doShoot()'s own body, deliberately — every other
// primitive gives the player a real post-commit punish window (m.recover
// frames standing still before falling into the shared cooldown logic in
// doRecover()); skipping straight to 'recover' after the call fires (the
// original pitch's own proposed shape) would have made a Caller uniquely
// safe the instant its telegraph ends, unlike every other enemy in the
// game.
Enemy.prototype.doSummon = function () {
  var m = this.activeMove || this.t;
  this.body.vx = approach(this.body.vx, 0, CFG.ENEMY_FRICTION);
  if (this.stateFrames >= m.recover) this.enter('recover');
};

Enemy.prototype.doDive = function () {
  var t = this.t, b = this.body, m = this.activeMove || t;
  b.vx = approach(b.vx, this.lockFacing * t.speed * 1.4, t.accel * 2);
  b.vy = m.diveSpeed;
  if (b.onGround || this.stateFrames >= m.active) this.enter('recover');
};

/* The zone attack (55-boss.js's Kiln Floor): no movement, no direct
 * hitbox — it mutates the WORLD into a timed hazard, read generically by
 * every standing body through the exact same World.rectHazard path
 * (30-player.js) every other hazard tile already uses. `buildFrames` is a
 * SECOND warning window, after the telegraph ends and before the tiles
 * actually go live — genuine additional fairness margin, not a substitute
 * for the telegraph. Deliberately NO new Bus event and NO new render path:
 * a live HAZARD tile is fully observable by reading the World directly
 * (exactly how verify_boss.js proves it, and exactly how 80-view.js's tile
 * paint already reads live World state every frame — the same "state IS
 * the signal, no event needed" pattern drawTargets already uses for its
 * own telegraph flash, which reads t.state/t.stateFrames directly rather
 * than listening for an event). Adding a Bus event here would touch
 * 00-core.js, owned by the Core team alone — exactly the undisclosed
 * integration cost the judged design panel marked against the two losing
 * boss concepts; Kilnwarden's own winning claim was needing none. */
Enemy.prototype.doZone = function (world) {
  var m = this.activeMove || this.t;
  if (this.stateFrames === m.buildFrames) {
    this._zoneTiles = this.pickVents(m);
    for (var i = 0; i < this._zoneTiles.length; i++) {
      world.set(this._zoneTiles[i][0], this._zoneTiles[i][1], C.TILE.HAZARD);
    }
  }
  if (this.stateFrames === m.buildFrames + m.hazardFrames && this._zoneTiles) {
    for (var j = 0; j < this._zoneTiles.length; j++) {
      world.set(this._zoneTiles[j][0], this._zoneTiles[j][1], C.TILE.EMPTY);
    }
    this._zoneTiles = null;
  }
  if (this.stateFrames >= m.buildFrames + m.hazardFrames) this.enter('recover');
};

// Picks m.ventCount (default: every listed vent) tiles from the move's own
// full m.vents list, via this enemy's own seeded RNG (L4) — never
// Math.random, so the same seed always ignites the same tiles.
Enemy.prototype.pickVents = function (m) {
  var pool = m.vents.slice(), picked = [];
  var n = Math.min(m.ventCount || pool.length, pool.length);
  for (var i = 0; i < n; i++) {
    var idx = this.rng.int(pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
};

/* A fixed, non-dangerous beat between phases — long enough to clear
 * CFG.MIN_TELEGRAPH like every other fair warning in this game (checked by
 * verify_boss.js, not just asserted here), giving the arena time to visibly
 * announce a change before phase 2's escalated pool can ever be chosen. Not
 * in dangerous() (only strike/charge/dive are), so contact damage cannot
 * fire during it even if a future template declared `contact` — safe by
 * construction, not by convention alone. No new Bus event, same reasoning
 * as doZone above: `this.phase` and `this.state === 'phaseTransition'` are
 * both plain, directly-readable fields — a presenter cue can watch
 * `state === 'phaseTransition' && stateFrames === 1` the exact way
 * drawTargets already watches `state === 'telegraph'` for its own flash,
 * with no event and no 00-core.js edit needed. */
Enemy.prototype.doPhaseTransition = function () {
  var t = this.t;
  if (this.stateFrames === 1) this.phase = 1;
  if (this.stateFrames >= t.phase2.transitionFrames) this.enter('chase');
};

// Phase-2 tempo compression — cooldowns shrink, telegraphs never do (every
// move keeps its own authored telegraph regardless of phase, read fresh
// every commit through pickMove/activeMove). "Harder" buys less rest
// between fair warnings, never less warning per attack.
Enemy.prototype.phaseCooldown = function (base) {
  var t = this.t;
  return (this.phase >= 1 && t.phase2 && t.phase2.cooldownScale)
    ? Math.round(base * t.phase2.cooldownScale) : base;
};

/* A successful parry's own punish window (stagger(), above) — friction to a
 * stop and sit out a FIXED duration (CFG.STAGGER_FRAMES), deliberately not
 * whatever recover window the interrupted move happened to have (a fast
 * move's own tiny recovery would otherwise undercut the whole point of a
 * reliable, tunable punish window — Riposte's own bonus hit, §4, lands
 * synchronously inside Combat.resolveBox regardless, but the OPEN window a
 * player gets to follow up with an ordinary swing is this one). Once it
 * elapses, hands off to the EXISTING recover -> chase/phaseTransition
 * branching below exactly like every other resolved move already does —
 * a staggered boss still gets its own phase-transition eligibility check
 * this way, rather than skipping straight back to chase. */
Enemy.prototype.doStaggered = function () {
  var b = this.body;
  b.vx = approach(b.vx, 0, CFG.ENEMY_FRICTION);
  if (this.stateFrames >= CFG.STAGGER_FRAMES) this.enter('recover');
};

/* The transition itself is requested here — the one seam in the whole
 * state machine where nothing dangerous is ever in flight (doRecover is
 * reached only after strike/charge/shoot/summon/dive/zone have each fully
 * resolved) — rather than checked eagerly every tick from update(), so an
 * hp threshold crossed mid-attack can never retroactively revise an attack
 * already telegraphed. Same discipline as the fairness rule itself: a
 * commitment, once made, is never revised out from under the player. */
Enemy.prototype.doRecover = function () {
  var t = this.t, b = this.body, m = this.activeMove || t;
  b.vx = approach(b.vx, 0, CFG.ENEMY_FRICTION);
  if (t.mode === 'fly') b.vy = approach(b.vy, -t.speed * 0.4, t.accel);
  if (this.stateFrames >= m.recover) {
    this.cooldown = this.phaseCooldown(m.cooldown);
    this.hits.length = 0;
    this.activeMove = null;
    if (t.phase2 && this.phase === 0 && this.hp <= this.maxHp * t.phase2.hpFrac) {
      this.enter('phaseTransition');
    } else {
      this.enter('chase');
    }
  }
};

/* The melee swing. Identical machinery to the player's: a baked move, one hit
 * per target, the hitbox read out of the rig. */
Enemy.prototype.advanceMove = function (players, bus, rig) {
  var a = this.attack, m = rig.move(a.id);
  if (!m) { this.attack = null; return; }

  var box = m.boxes[a.frame];
  if (box) {
    Combat.resolveBox(this, Combat.toWorld(this, box), players, {
      damage: m.data.damage, knock: m.data.knock,
      facing: this.lockFacing, hits: this.hits
    }, bus);
  }

  a.frame++;
  if (a.frame >= m.frames) {
    this.attack = null;
    if (this.state === 'strike') this.enter('recover');
  }
};

Enemy.spawn = function (id, tid, x, y, seed) { return new Enemy(id, tid, x, y, seed); };

C.Enemy = Enemy;
C.Shot = Shot;

})(CINDER);
