/* ===========================================================================
 * 80-view.js  —  PRESENTER. The only place an event becomes an effect (L5).
 * ---------------------------------------------------------------------------
 * Everything above this line is the sim. This file may READ sim state and
 * SUBSCRIBE to the bus. It may never write to sim state — not a position, not
 * a velocity, not a flag. verify_arch enforces that two ways: a source scan
 * for writes through a sim handle, and a 900-tick determinism run comparing a
 * sim with a presenter attached against one without.
 *
 * Camera is the D5a staging: shared pull-back first. Every player is a target,
 * the rig frames all of them, and it zooms out when they separate. Split and
 * merge with hysteresis layers on top of this later — if that work stalls,
 * what is here is still working co-op rather than a broken camera.
 *
 * Owned by: View team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, TILE = C.TILE, clamp = C.clamp, Combat = C.Combat, Rig = C.Rig;

// Parry's own hood-glow duration (abilities spec §6) — a presenter-only
// judgment call, the same "no capture plate for how long a flash should
// read" discipline this.flash's own 8/14-frame durations already stand on.
var PARRY_GLOW_FRAMES = 10;

var COLOR = {
  bg: '#0d0b10',
  solid: '#39323f',
  solidTop: '#554b5e',
  oneway: '#6b5a3e',
  hazard: '#8f2f3a',
  hazardTip: '#d1495b',
  player: ['#e8d8b0', '#8fc0d0'],
  playerHurt: '#d1495b',
  eye: '#1a1620',
  // The figure. Ash-cloth over a banked ember: pale wrap, dark hollow hood,
  // and one hot point at the chest that is the only saturated thing on the
  // character, so the eye finds the player instantly in a crowded frame.
  // Four steps of value, widely separated. At 22px the figure only reads if
  // cloth, near limb and far limb are obviously different tones — the first
  // draft had them within a few percent and the legs vanished into the torso.
  cloth: ['#e8d8b0', '#9fd0e0'],
  clothDark: ['#7d6d52', '#4d6f7d'],
  limbNear: ['#b09775', '#6e97a6'],
  limbFar: ['#6a5c47', '#3f5c66'],
  hood: '#221c29',
  ember: '#d1495b',
  emberHot: '#ff9a5c',
  blade: '#cfd8e0',
  bladeHot: '#fff4d6',
  target: '#6f5f7a',
  targetHurt: '#d1495b',
  // The telegraph pulse. This is the fairness rule made visible — if a player
  // cannot see the windup, the windup may as well not exist.
  warn: '#ffd166',
  warnDim: '#8a6a2c',
  danger: '#ff6b4a',
  targetHp: '#8fc0d0',
  box: 'rgba(209,73,91,0.34)',
  boxEdge: '#d1495b',
  dust: 'rgba(200,190,170,',
  spark: 'rgba(209,73,91,'
};

/* ---------------------------------------------------------------- Camera */
function Camera(vw, vh) {
  this.vw = vw; this.vh = vh;
  this.x = 0; this.y = 0;
  this.zoom = 2;
  this.targetZoom = 2;
  this.shake = 0;
  this.shakeSeed = 1;
  this.MIN_ZOOM = 1;
  this.MAX_ZOOM = 3;
  this.MARGIN = 96;       // px of slack around the outermost players
  // Screen shake is the classic vestibular-disorder trigger, so this damps it
  // hard rather than to a lesser degree the way particle DENSITY is damped
  // below — a near-silent kick still confirms "that landed" without the
  // motion. Off by default; 95-app.js wires it to Settings.reducedMotion.
  this.reducedMotion = false;
}

Camera.prototype.resize = function (vw, vh) { this.vw = vw; this.vh = vh; return this; };

/* Frame every target. With one player this is a plain follow; with two it is
 * the co-op pull-back. Same code path either way, which is the point of
 * writing the rig N-target from the first commit. */
Camera.prototype.update = function (players) {
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, i, b;
  for (i = 0; i < players.length; i++) {
    b = players[i].body;
    if (b.cx() < minX) minX = b.cx();
    if (b.cx() > maxX) maxX = b.cx();
    if (b.cy() < minY) minY = b.cy();
    if (b.cy() > maxY) maxY = b.cy();
  }
  if (minX === Infinity) return this;

  var spanX = (maxX - minX) + this.MARGIN;
  var spanY = (maxY - minY) + this.MARGIN;
  this.targetZoom = clamp(Math.min(this.vw / spanX, this.vh / spanY), this.MIN_ZOOM, this.MAX_ZOOM);
  this.zoom += (this.targetZoom - this.zoom) * 0.08;

  var cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5;
  this.x += (cx - this.x) * 0.14;
  this.y += (cy - this.y) * 0.14;

  if (this.shake > 0) this.shake *= 0.86;
  if (this.shake < 0.05) this.shake = 0;
  return this;
};

// Deterministic wobble. The presenter is allowed its own generator — it is
// not sim state and never feeds back — but a shared Math.random would make
// screenshots impossible to compare, so it gets its own integer stream.
Camera.prototype.offset = function () {
  if (this.shake <= 0) return { x: 0, y: 0 };
  this.shakeSeed = (this.shakeSeed * 1664525 + 1013904223) >>> 0;
  var a = ((this.shakeSeed >>> 16) & 255) / 255 * 6.2831853;
  return { x: Math.cos(a) * this.shake, y: Math.sin(a) * this.shake };
};

Camera.prototype.kick = function (amount) {
  if (this.reducedMotion) amount *= 0.15;
  if (amount > this.shake) this.shake = amount;
  return this;
};

/* -------------------------------------------------------------- Particles */
function Particles(cap) {
  this.cap = cap || 256;
  this.list = [];
  this.seed = 12345;
  // Density, not presence: particles are visual noise rather than a
  // vestibular trigger, so reduced motion thins the count (also a cheap win
  // for the lower-power phone/watch targets) instead of removing the
  // feedback entirely.
  this.reducedMotion = false;
}
Particles.prototype.rand = function () {
  this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
  return (this.seed >>> 8) / 16777216;
};
Particles.prototype.burst = function (x, y, n, spread, life, kind) {
  if (this.reducedMotion) n = Math.max(1, Math.ceil(n * 0.35));
  for (var i = 0; i < n && this.list.length < this.cap; i++) {
    var a = this.rand() * 6.2831853, s = this.rand() * spread;
    this.list.push({
      x: x, y: y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - spread * 0.3,
      life: life, max: life, kind: kind || 'dust'
    });
  }
  return this;
};
Particles.prototype.update = function () {
  for (var i = this.list.length - 1; i >= 0; i--) {
    var p = this.list[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12; p.vx *= 0.94;
    if (--p.life <= 0) this.list.splice(i, 1);
  }
  return this;
};
Particles.prototype.clear = function () { this.list.length = 0; return this; };

/* ------------------------------------------------------------------ View */
function View(canvas, sim) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.sim = sim;
  // Logical (CSS-pixel) viewport size and the device-pixel-ratio scale
  // between it and the canvas's actual backing store. Placeholder values
  // here; the app's first fit()/resize() call sets them for real before the
  // first render() runs, exactly as canvas.width/height used to start at the
  // element's default 300x150 before that same first call.
  this.cssW = canvas.width;
  this.cssH = canvas.height;
  this.dpr = 1;
  this.camera = new Camera(canvas.width, canvas.height);
  this.particles = new Particles(300);
  this.flash = 0;
  // Parry's own hood-glow (abilities spec §6) — id -> frames remaining.
  // Keyed per-player, unlike flash's single scalar, because a successful
  // parry is a per-player moment (co-op: one player's read should never
  // light up a teammate's hood) — decremented once per frame in render(),
  // the identical shape flash already has, just per-id instead of scalar.
  this.parryGlow = {};
  this.effects = 0;          // lifetime effects produced; the gate reads this
  // Debug overlay (F4). Draws the live hitbox exactly as the sim tests it —
  // the fastest way to see a blade and its box disagreeing.
  this.showBoxes = false;
  this.subscribe(sim.bus);

  // Snap the camera to the party on the first frame instead of easing in
  // from the origin.
  var b = sim.players[0].body;
  this.camera.x = b.cx();
  this.camera.y = b.cy();
}

/* The whole of L5 lives in this function. Every sim fact that has a visible
 * or audible consequence gets its consequence here, and nowhere else in the
 * codebase does an event turn into a particle, a shake or a flash. */
View.prototype.subscribe = function (bus) {
  var self = this;
  function fx(fn) { return function (e) { self.effects++; fn(e); }; }

  bus.on('jump', fx(function (e) {
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y + CFG.PLAYER_H, 4, 0.9, 16);
  }));
  bus.on('doubleJump', fx(function (e) {
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y + CFG.PLAYER_H / 2, 10, 1.6, 20);
  }));
  bus.on('land', fx(function (e) {
    var hard = e.vy > 6;
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y + CFG.PLAYER_H, hard ? 10 : 4, hard ? 1.7 : 0.8, 18);
    if (hard) self.camera.kick(2.5);
  }));
  bus.on('step', fx(function (e) {
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y + CFG.PLAYER_H, 1, 0.4, 10);
  }));
  bus.on('rollStart', fx(function (e) {
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y + CFG.PLAYER_H, 6, 1.1, 16);
  }));
  bus.on('rollEnd', fx(function () { /* recorded; no visual yet */ }));
  // Ember Dash (abilities spec §6): the same single-discrete-event burst
  // shape every other Bus-triggered effect here already uses — 'spark'
  // (the same rgba this file's own COLOR.ember already is) so the flare
  // reads as the SAME ember the chest glow and hood rim-light already use,
  // not a new color. Centered on body middle, not the feet — a dash is a
  // mid-air horizontal burst, not a ground-level event the way jump/roll/
  // land all are; doubleJump's own handler already anchors the identical
  // way for the identical reason, so this is an established pattern here,
  // not a new one. NAMED SCOPE LIMIT: this is a single burst at the START
  // of the dash, not a continuous trail across its whole travel — every
  // particle effect in this file fires off one discrete Bus event, never a
  // live per-render-frame emission; a true continuous ember trail needs
  // that new pattern and is a real, separate follow-up, not built here.
  bus.on('dashStart', fx(function (e) {
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y + CFG.PLAYER_H / 2, 10, 1.8, 20, 'spark');
  }));
  bus.on('dashEnd', fx(function () { /* recorded; no visual yet — same as rollEnd */ }));
  bus.on('crouch', fx(function () {}));
  bus.on('uncrouch', fx(function () {}));
  bus.on('dropThrough', fx(function (e) { self.camera.kick(0.6); }));
  bus.on('slamStart', fx(function (e) {
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y, 6, 1.2, 14);
  }));
  bus.on('slamLand', fx(function (e) {
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y + CFG.PLAYER_H, 22, 2.8, 26);
    self.camera.kick(7);
  }));
  bus.on('hurt', fx(function (e) {
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y + CFG.PLAYER_H / 2, 16, 2.2, 22, 'spark');
    self.camera.kick(5);
    self.flash = 8;
  }));
  bus.on('death', fx(function (e) {
    self.particles.burst(e.x + CFG.PLAYER_W / 2, e.y + CFG.PLAYER_H / 2, 40, 3.4, 34, 'spark');
    self.camera.kick(10);
    self.flash = 14;
  }));
  bus.on('respawn', fx(function (e) {
    self.particles.clear(); self.flash = 0;
    // A stale parry-glow from before this death should not carry into a
    // fresh spawn — the same "one authoritative reset" spirit flash/
    // particles already get here, just per-id instead of scalar/global.
    self.parryGlow[e.id] = 0;
  }));
  bus.on('wallTouch', fx(function () {}));

  bus.on('attackStart', fx(function () {}));
  bus.on('attackEnd', fx(function () {}));
  bus.on('attackCancel', fx(function () {}));
  bus.on('hit', fx(function (e) {
    // Sparks fly away from the blade, so the direction reads even at 16px.
    self.particles.burst(e.x, e.y, 12 + Math.min(e.damage, 14), 2.4, 20, 'spark');
    self.camera.kick(2 + Math.min(e.damage, 14) * 0.25);
  }));
  bus.on('targetDown', fx(function (e) {
    self.particles.burst(e.x + 6, e.y + 10, 30, 3.0, 30, 'spark');
    self.camera.kick(6);
  }));
  // Parry (abilities spec §6): a burst at the point of impact, same
  // "something flashes at the moment of impact" precedent an ordinary hit
  // already uses, PLUS the hood-glow timer drawFigure() reads — "the whole
  // hood-hollow lights up" rather than just the usual dim rim-light. `e.id`
  // is the PARRYING player (Combat.resolveBox's own payload shape), not
  // the staggered enemy — the glow belongs to whoever made the read.
  bus.on('parry', fx(function (e) {
    self.particles.burst(e.x, e.y, 14, 2.0, 18, 'spark');
    self.parryGlow[e.id] = PARRY_GLOW_FRAMES;
  }));

  // A small upward puff at the moment of commitment. Deliberately quiet — the
  // tint pulse does the loud work, and a shake here would punish the player
  // for information they are supposed to be given calmly.
  bus.on('telegraph', fx(function (e) {
    self.particles.burst(e.x, e.y, 5, 0.7, 16);
  }));
  bus.on('enemyAttack', fx(function (e) {
    self.particles.burst(e.x, e.y, 8, 1.5, 14);
  }));
  bus.on('shotBurst', fx(function (e) {
    self.particles.burst(e.x, e.y, 12, 1.9, 18, 'spark');
    self.camera.kick(1.2);
  }));
  // A successful parry's own consequence on the ATTACKER's side (abilities
  // spec §6 doesn't detail this one specifically, but every other
  // combat-adjacent event in this function gets at least a minimal
  // acknowledgment — telegraph/enemyAttack/shotBurst/hit/targetDown all
  // do). Sized between telegraph's own quiet puff and a real hit — real
  // enough to read as "that attack just got interrupted," not as loud as
  // a kill.
  bus.on('enemyStagger', fx(function (e) {
    self.particles.burst(e.x, e.y, 10, 1.6, 18, 'spark');
    self.camera.kick(2);
  }));
  return this;
};

/* `cssW`/`cssH` are the LOGICAL size — CSS pixels, what the camera and every
 * world-space calculation in this file has always operated in. `dpr` is the
 * device-pixel-ratio scale to the actual backing store, so text and edges
 * stay crisp on a scaled desktop display or a high-density phone/watch panel
 * instead of the browser stretching a lower-res buffer to fit.
 *
 * canvas.width/height below are the backing-store RESOLUTION only. On-screen
 * LAYOUT size is fully owned by the stylesheet's `#game{width:100%;
 * height:100%}` rule, which is standard canvas behaviour: an explicit CSS box
 * size always wins over a canvas's intrinsic (attribute-driven) size, so the
 * higher-resolution buffer stretches to fit the same box the 100% rule always
 * produced, with no extra step needed.
 *
 * A first version of this ALSO wrote canvas.style.width/height to a fixed px
 * value here, on the theory that something needed to pin the CSS box down.
 * Nothing did — and doing it was actively wrong: an inline pixel style
 * outranks the percentage rule, so after the first resize() call the canvas's
 * own clientWidth stopped reflecting its container at all and started only
 * echoing back whatever this function had last written. fit()'s per-frame
 * resize detection reads clientWidth precisely to notice the container
 * changing size, so that one line silently froze the game at its boot-time
 * size for the rest of the session — a real regression, caught only because
 * a resize-hardening test measured clientWidth before and after a real
 * viewport change and found it had not moved. */
View.prototype.resize = function (cssW, cssH, dpr) {
  dpr = dpr || 1;
  this.cssW = cssW;
  this.cssH = cssH;
  this.dpr = dpr;
  this.canvas.width = Math.round(cssW * dpr);
  this.canvas.height = Math.round(cssH * dpr);
  this.camera.resize(cssW, cssH);
  return this;
};

View.prototype.render = function () {
  var ctx = this.ctx, sim = this.sim, cam = this.camera;
  var w = this.cssW, h = this.cssH;

  // Set once per frame, outside any save/restore scope, so every save()
  // inside this function (and every draw call 95-app.js makes on this same
  // context AFTER render() returns, e.g. the frame meter) inherits a baseline
  // that is already in logical CSS-pixel space. Nothing past this line needs
  // to know dpr exists.
  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

  cam.update(sim.players);
  this.particles.update();
  if (this.flash > 0) this.flash--;
  var pg;
  for (pg in this.parryGlow) {
    if (this.parryGlow[pg] > 0) this.parryGlow[pg]--;
  }

  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, w, h);

  var off = cam.offset();
  ctx.save();
  ctx.translate(Math.round(w / 2), Math.round(h / 2));
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(Math.round(-cam.x + off.x), Math.round(-cam.y + off.y));

  this.drawWorld(ctx, cam, w, h);
  this.drawTargets(ctx, sim);
  this.drawShots(ctx, sim);
  this.drawParticles(ctx);
  this.drawPlayers(ctx, sim);
  if (this.showBoxes) this.drawBoxes(ctx, sim);

  ctx.restore();

  if (this.flash > 0) {
    ctx.fillStyle = 'rgba(209,73,91,' + (this.flash / 28).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
  }
  this.drawHud(ctx, sim, w, h);
  return this;
};

// Only the tiles the camera can actually see. A 40x24 room does not need
// culling; a generated biome will, and adding it later means touching the
// draw call at the worst possible time.
View.prototype.drawWorld = function (ctx, cam, w, h) {
  var world = this.sim.world, T = CFG.TILE;
  var halfW = (w / 2) / cam.zoom, halfH = (h / 2) / cam.zoom;
  var x0 = Math.max(0, Math.floor((cam.x - halfW) / T) - 1);
  var x1 = Math.min(world.w - 1, Math.ceil((cam.x + halfW) / T) + 1);
  var y0 = Math.max(0, Math.floor((cam.y - halfH) / T) - 1);
  var y1 = Math.min(world.h - 1, Math.ceil((cam.y + halfH) / T) + 1);
  var tx, ty, kind, px, py;

  for (ty = y0; ty <= y1; ty++) {
    for (tx = x0; tx <= x1; tx++) {
      kind = world.get(tx, ty);
      if (kind === TILE.EMPTY) continue;
      px = tx * T; py = ty * T;
      if (kind === TILE.SOLID) {
        ctx.fillStyle = COLOR.solid;
        ctx.fillRect(px, py, T, T);
        if (world.get(tx, ty - 1) === TILE.EMPTY) {
          ctx.fillStyle = COLOR.solidTop;
          ctx.fillRect(px, py, T, 3);
        }
      } else if (kind === TILE.ONEWAY) {
        ctx.fillStyle = COLOR.oneway;
        ctx.fillRect(px, py, T, 4);
      } else if (kind === TILE.HAZARD) {
        ctx.fillStyle = COLOR.hazard;
        ctx.fillRect(px, py + T - 6, T, 6);
        ctx.fillStyle = COLOR.hazardTip;
        for (var s = 0; s < 3; s++) {
          ctx.beginPath();
          ctx.moveTo(px + s * 5 + 1, py + T);
          ctx.lineTo(px + s * 5 + 3.5, py + T - 9);
          ctx.lineTo(px + s * 5 + 6, py + T);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
  return this;
};

View.prototype.drawParticles = function (ctx) {
  var list = this.particles.list, i, p, a;
  for (i = 0; i < list.length; i++) {
    p = list[i];
    a = (p.life / p.max) * 0.85;
    ctx.fillStyle = (p.kind === 'spark' ? COLOR.spark : COLOR.dust) + a.toFixed(3) + ')';
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  return this;
};

View.prototype.drawTargets = function (ctx, sim) {
  for (var i = 0; i < sim.targets.length; i++) {
    var t = sim.targets[i], b = t.body;
    if (!t.alive()) continue;

    var tpl = t.t;                                  // enemies carry a template
    var body = tpl ? tpl.tint : COLOR.target;
    var edge = tpl ? tpl.tintDark : '#241f2b';

    /* Three states a player must be able to read at a glance and from across
     * the room: winding up, actively dangerous, and recently hit. Everything
     * else is the resting tint. */
    if (t.state === 'telegraph') {
      body = ((t.stateFrames >> 1) % 2 === 0) ? COLOR.warn : COLOR.warnDim;
    } else if (t.dangerous && t.dangerous()) {
      body = COLOR.danger;
    } else if (t.iframes > 0) {
      body = COLOR.targetHurt;
    }

    ctx.fillStyle = edge;
    ctx.fillRect(Math.round(b.x), Math.round(b.y), b.w, b.h);
    ctx.fillStyle = body;
    ctx.fillRect(Math.round(b.x) + 1, Math.round(b.y) + 1, b.w - 2, b.h - 2);

    // Which way it committed. During a telegraph this pip is the single most
    // useful pixel on screen.
    if (t.facing) {
      ctx.fillStyle = COLOR.hood;
      var ex = t.facing > 0 ? b.x + b.w - 4 : b.x + 1;
      ctx.fillRect(Math.round(ex), Math.round(b.y + 3), 3, 3);
    }

    // The claw, drawn from the same baked pose its hitbox came from.
    if (t.attack) {
      var m = sim.rig.move(t.attack.id);
      if (m) {
        var idx = t.attack.frame < m.poses.length ? t.attack.frame : m.poses.length - 1;
        var pose = m.poses[idx];
        var hand = Combat.pointToWorld(t, pose.hand[0], pose.hand[1]);
        var tip = Combat.pointToWorld(t, pose.tip[0], pose.tip[1]);
        var elbow = Combat.pointToWorld(t, pose.elbow[0], pose.elbow[1]);
        bone(ctx, elbow, hand, 2.4, edge);
        bone(ctx, hand, tip, m.boxes[idx] ? 3 : 2, m.boxes[idx] ? COLOR.danger : edge);
      }
    }

    // "Did that do anything" is the first question a player asks of a weapon.
    var frac = t.hp / t.maxHp;
    ctx.fillStyle = '#241f2b';
    ctx.fillRect(Math.round(b.x), Math.round(b.y) - 5, b.w, 3);
    ctx.fillStyle = COLOR.targetHp;
    ctx.fillRect(Math.round(b.x), Math.round(b.y) - 5, Math.max(0, Math.round(b.w * frac)), 3);
  }
  return this;
};

View.prototype.drawShots = function (ctx, sim) {
  for (var i = 0; i < sim.shots.length; i++) {
    var b = sim.shots[i].body;
    ctx.fillStyle = COLOR.emberHot;
    ctx.fillRect(Math.round(b.x), Math.round(b.y), b.w, b.h);
    ctx.fillStyle = COLOR.warn;
    ctx.fillRect(Math.round(b.x) + 1, Math.round(b.y) + 1, b.w - 2, b.h - 2);
  }
  return this;
};

/* One bone. Round caps are what make a 2px limb read as a limb rather than a
 * stick at this scale, and they cost nothing. */
function bone(ctx, a, b, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function spun(p, cx, cy, ang) {
  var dx = p[0] - cx, dy = p[1] - cy;
  var c = Math.cos(ang), s = Math.sin(ang);
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

/* The character, posed by 35-rig.js and drawn here.
 *
 * Every point goes through Combat.pointToWorld — the SAME transform the sim
 * tests hitboxes with. The figure, the blade in its hand and the box that
 * blade swings therefore cannot drift apart, which is the whole reason the
 * body skeleton lives next to the weapon poses instead of in this file. */
View.prototype.drawFigure = function (ctx, player, t) {
  var fig = this.sim.rig.figure(player, t);
  var k = player.id % COLOR.cloth.length;
  var cx = Rig.FIG.MID_X, cy = Rig.FIG.HIP_Y;
  var hurt = player.iframes > 0;
  var i, c;

  function W(p) {
    var q = fig.curl ? spun(p, cx, cy, fig.spin) : p;
    return Combat.pointToWorld(player, q[0], q[1]);
  }

  var cloth = hurt ? COLOR.playerHurt : COLOR.cloth[k];
  var clothDark = hurt ? COLOR.playerHurt : COLOR.clothDark[k];
  var near = hurt ? COLOR.playerHurt : COLOR.limbNear[k];
  var far = hurt ? COLOR.playerHurt : COLOR.limbFar[k];

  // 1. the cloak, behind everything
  ctx.fillStyle = clothDark;
  ctx.beginPath();
  for (i = 0; i < fig.cloak.length; i++) {
    c = W(fig.cloak[i]);
    if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
  }
  ctx.closePath();
  ctx.fill();

  // 2. far limbs, in a duller tone so the figure has depth at 22px
  bone(ctx, W(fig.hipB), W(fig.kneeB), 2.6, far);
  bone(ctx, W(fig.kneeB), W(fig.footB), 2.2, far);
  bone(ctx, W(fig.shoulderB), W(fig.elbowB), 2.3, far);
  bone(ctx, W(fig.elbowB), W(fig.handB), 2.0, far);

  // 3. torso as a TAPERED MASS, not a uniform bone. Shoulders wider than hips
  //    is most of what gives a 22px figure a readable body; a single thick
  //    line just swallowed the legs behind it.
  //
  // v0.2.16 "Enhanced Procedural" pass (design canvas Option A, approved):
  // the torso fill is now a two-stop gradient (shoulder->hip) between the
  // SAME `cloth`/`clothDark` values the flat fill already used, never a new
  // color — the file's own documented lesson stands (the value class a
  // shape reads as, not its shading, is what keeps cloth/near-limb/far-limb
  // legible at 22px; a gradient WITHIN one shape's existing value range
  // can't undo that, only a shift ACROSS value classes could). t1..t4 are
  // reused as the gradient's own endpoints — no extra transform work.
  var t1 = W([fig.chest[0] - 2.4, fig.chest[1] - 0.9]);
  var t2 = W([fig.chest[0] + 2.4, fig.chest[1] - 0.9]);
  var t3 = W([fig.hip[0] + 1.6, fig.hip[1] + 1.0]);
  var t4 = W([fig.hip[0] - 1.6, fig.hip[1] + 1.0]);
  var torsoGrad = ctx.createLinearGradient(t1.x, t1.y, t3.x, t3.y);
  torsoGrad.addColorStop(0, cloth);
  torsoGrad.addColorStop(1, clothDark);
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y);
  ctx.lineTo(t3.x, t3.y); ctx.lineTo(t4.x, t4.y);
  ctx.closePath();
  ctx.fill();
  // a single thin fold shadow down the lead side — dimensionality, not a
  // new shape; drawn in the same clothDark value the gradient already ends
  // on, just as a stroke instead of a fill.
  ctx.strokeStyle = clothDark;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  bone(ctx, W(fig.chest), W(fig.neck), 2.8, cloth);

  // 4. hooded head. The hollow reads as a hood, and offsetting it toward the
  //    facing direction is what tells you which way the character is looking.
  var h = W(fig.head);
  // Parry's own hood-glow (abilities spec §6) — read here, not passed in,
  // since drawFigure already runs as a View method with full access to the
  // instance that owns it. 0 for every tick outside a recent successful
  // parry, so every branch below is a dead no-op (identical output to
  // before this existed) whenever glowA is 0.
  var glowT = (this.parryGlow && this.parryGlow[player.id]) || 0;
  var glowA = glowT > 0 ? glowT / PARRY_GLOW_FRAMES : 0;
  ctx.fillStyle = clothDark;
  ctx.beginPath(); ctx.arc(h.x, h.y, fig.headR + 0.6, 0, 6.2831853); ctx.fill();
  ctx.fillStyle = COLOR.hood;
  ctx.beginPath(); ctx.arc(h.x + player.facing * 0.6, h.y + 0.3, fig.headR - 0.4, 0, 6.2831853); ctx.fill();
  if (glowA > 0) {
    // "The whole hood-hollow lights up" — the SAME hollow just filled dark
    // above, filled again in the same ember color the rim-light/chest-glow
    // already use, fading out over PARRY_GLOW_FRAMES rather than a hard cut.
    ctx.fillStyle = COLOR.emberHot;
    ctx.globalAlpha = glowA * 0.75;
    ctx.beginPath(); ctx.arc(h.x + player.facing * 0.6, h.y + 0.3, fig.headR - 0.4, 0, 6.2831853); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // a thin rim-light along the hood's lit (facing-side) edge — ambient catch
  // from the banked ember below, not a light source of its own; low alpha
  // so the "dark hollow hood" read this file's own header names stays true.
  // Widened and brightened for a few frames right after a successful parry
  // (glowA above), on top of its always-present resting value.
  ctx.strokeStyle = COLOR.emberHot;
  ctx.globalAlpha = 0.3 + glowA * 0.5;
  ctx.lineWidth = 0.5 + glowA * 1.5;
  ctx.beginPath();
  ctx.arc(h.x + player.facing * 0.6, h.y + 0.3, fig.headR - 0.4,
    player.facing > 0 ? -2.2 : -0.9, player.facing > 0 ? -0.9 : -2.2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOR.ember;
  ctx.fillRect(h.x + player.facing * 1.1 - 0.55, h.y - 0.35, 1.1, 1.1);

  // 5. near limbs
  bone(ctx, W(fig.hipF), W(fig.kneeF), 2.8, near);
  bone(ctx, W(fig.kneeF), W(fig.footF), 2.4, near);
  bone(ctx, W(fig.shoulderF), W(fig.elbowF), 2.5, near);
  bone(ctx, W(fig.elbowF), W(fig.handF), 2.2, near);

  // 6. the blade, hot on the frames that actually carry a hitbox
  if (fig.tipF) {
    bone(ctx, W(fig.handF), W(fig.tipF),
      fig.swinging ? 3 : 2, fig.swinging ? COLOR.bladeHot : COLOR.blade);
  }

  // 7. the ember at the chest — the only saturated point on the character, so
  //    the eye finds the player instantly in a crowded frame. A soft glow
  //    halo (a radial gradient, faded to fully transparent — never a flat
  //    translucent disc, which would just look like a second, blurrier
  //    square) now sits BEHIND the same hot core this file always drew, so
  //    the one saturated point on the character reads as light, not paint.
  var e = W(fig.chest);
  var glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 3.2);
  glow.addColorStop(0, COLOR.emberHot);
  glow.addColorStop(1, 'rgba(255,154,92,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(e.x, e.y, 3.2, 0, 6.2831853); ctx.fill();
  ctx.fillStyle = COLOR.emberHot;
  ctx.fillRect(e.x - 1, e.y - 0.5, 2, 2);
  return this;
};

View.prototype.drawBoxes = function (ctx, sim) {
  for (var i = 0; i < sim.players.length; i++) {
    var hb = Combat.activeBox(sim.players[i], sim.rig);
    if (!hb) continue;
    ctx.fillStyle = COLOR.box;
    ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
    ctx.strokeStyle = COLOR.boxEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
  }
  return this;
};

View.prototype.drawPlayers = function (ctx, sim) {
  for (var i = 0; i < sim.players.length; i++) {
    var p = sim.players[i];
    if (p.state === 'dead') continue;
    // Blink while invulnerable. Reading p.iframes is a read; the presenter
    // never writes it back.
    if (p.iframes > 0 && (p.iframes >> 2) % 2 === 0) continue;
    this.drawFigure(ctx, p, sim.tick);
  }
  return this;
};

View.prototype.drawHud = function (ctx, sim, w, h) {
  var i, p, j;
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'top';
  for (i = 0; i < sim.players.length; i++) {
    p = sim.players[i];
    for (j = 0; j < CFG.MAX_HP; j++) {
      ctx.fillStyle = j < p.hp ? '#d1495b' : '#3a2f36';
      ctx.fillRect(10 + j * 14, 10 + i * 18, 10, 10);
    }
    ctx.fillStyle = '#7d7386';
    ctx.fillText(p.state, 10 + CFG.MAX_HP * 14 + 8, 10 + i * 18);
  }
  return this;
};

C.View = View;
C.Camera = Camera;
C.Particles = Particles;

})(CINDER);
