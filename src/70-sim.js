/* ===========================================================================
 * 70-sim.js  —  Sim.step(), THE tick loop
 * ---------------------------------------------------------------------------
 * SIM layer, top of it. Owns the world, the pads, the players, the RNG and
 * the bus. Nothing above the presenter line reaches past Sim to touch them.
 *
 * Sim owns its own loop (L3): step() advances exactly one 1/60 tick and there
 * is no dt parameter to pass in and no way to scale it. The accumulator that
 * decides HOW MANY times to call step() lives in 95-app.js, on the far side
 * of the presenter boundary, where wall-clock time is allowed to exist.
 *
 * Owned by: Sim team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG, RNG = C.RNG, Bus = C.Bus, Pads = C.Pads,
    World = C.World, Player = C.Player, Combat = C.Combat, aabb = C.aabb,
    Run = C.Run, RunLogic = C.RunLogic, Gen = C.Gen, Boss = C.Boss,
    Meta = C.Meta, MetaLogic = C.MetaLogic, DATA = C.DATA;

// A pickup point (D2) — position only. Colour is deliberately NOT decided
// here: it is read lazily, at the moment of collection (Sim.prototype.step
// below), from whatever the collecting player's stats actually are by
// then, not a snapshot from before the level was ever played.
function Pickup(id, x, y) {
  this.id = id;
  this.x = x; this.y = y;
  this.w = 8; this.h = 8;
  this.collected = false;
}

// A sealed 40x24 room with a floor. Deliberately dull: real levels come from
// 50-gen.js, and a placeholder that looks like content invites someone to
// build on it.
function fallbackWorld() {
  var w = 40, h = 24, world = new World(w, h), x, y;
  for (x = 0; x < w; x++) {
    world.set(x, h - 1, World.TILE.SOLID);
    world.set(x, h - 2, World.TILE.SOLID);
  }
  for (y = 0; y < h; y++) {
    world.set(0, y, World.TILE.SOLID);
    world.set(w - 1, y, World.TILE.SOLID);
  }
  return world;
}

function Sim(opts) {
  opts = opts || {};
  this.seed = opts.seed === undefined ? 1 : (opts.seed >>> 0);
  this.world = opts.world || fallbackWorld();
  this.spawns = opts.spawns || [[CFG.TILE * 3, CFG.TILE * 18]];

  var n = opts.players || 1, i, sp;
  this.pads = new Pads(n);
  this.players = [];
  for (i = 0; i < n; i++) {
    sp = this.spawns[i % this.spawns.length];
    this.players.push(new Player(i, sp[0], sp[1]));
  }

  // Hitboxes are baked once at boot and shared (L9). The bake is pure and the
  // boxes are frozen, so sharing one rig across sims cannot leak state.
  this.rig = opts.rig || C.RIG;
  this.targets = opts.targets || [];
  this.shots = [];
  // D2. opts.pickups matches Gen.generate()'s own [[x,y], ...] output shape
  // directly — Sim owning the construction (rather than requiring a caller
  // to pre-build Pickup instances) keeps that shape the one public contract
  // 50-gen.js and 70-sim.js both already agree on.
  this.pickups = (opts.pickups || []).map(function (xy, i) {
    return new Pickup(300 + i, xy[0], xy[1]);
  });

  // Handed to every target each tick. Keeping it on the Sim rather than
  // rebuilding it per entity means an enemy cannot accidentally capture a
  // stale rig or a dead shot queue.
  var self = this;
  this.ctx = {
    rig: this.rig,
    addShot: function (shot) { self.shots.push(shot); return shot; }
  };

  this.rng = new RNG(this.seed);
  this.bus = new Bus();
  this.tick = 0;
  this.hitstop = 0;

  /* --- run loop (60-run.js, D1) --------------------------------------
   * Inert by construction: this.run always exists (a plain data holder,
   * see 60-run.js), but the orchestration in _stepRun() below only ever
   * runs once this.exit or this.bossTarget is non-null, which happens
   * only inside beginRun()/_enterLevel()/_enterBoss() — never at plain
   * construction. Every existing hand-built scenario() in this codebase
   * (no exit, never calls beginRun()) takes zero of those branches,
   * forever, byte-for-byte identical to before this file existed. */
  this.run = new Run(this.seed);
  this.exit = null;
  this.bossTarget = null;
  this.runEndFrames = -1;       // -1 = no boss-victory-without-death pause pending
  this._pendingLevel = null;    // eagerly-computed next level, applied only at commit
  this._levelRosterIds = [];    // which live target ids count toward THIS level's own "clear"
  this._wasDead = [];
  for (i = 0; i < this.players.length; i++) this._wasDead.push(false);

  /* --- meta progression (65-meta.js, D4/D8) --------------------------
   * Deliberately NOT reset by beginRun() (unlike this.run) — permanent
   * progression is exactly the thing a within-session restart must NOT
   * wipe, the whole reason this file exists. opts.meta lets 95-app.js hand
   * in whatever it just loaded from localStorage at construction time,
   * the same accepted shape opts.seed/opts.world already use — this is
   * supplying a constructor option, not the presenter reaching in to
   * assign a field on an already-live sim (L5). Every already-constructed
   * player gets the current maxHpBonus applied immediately (covers the
   * opts.meta case specifically — players just above already reset to the
   * bare CFG.MAX_HP baseline before this line ever runs).
   *
   * Routed through MetaLogic.sanitize() rather than assigned directly — a
   * real, adversarially-found gap: a bare reference assignment let two
   * Sims constructed from (or later applyMeta()'d with) the SAME caller-
   * supplied Meta object end up with `simA.meta === simB.meta`, including
   * the shared `unlocked` object, so a purchase made through one Sim's
   * real API silently mutated the other's future ticks too. sanitize()
   * already builds a fresh Meta AND a fresh `unlocked` object from
   * whatever it's handed (verify_meta.js's own "two calls to defaults()
   * do not share the unlocked object" assertion already proves this) and
   * safely no-ops on `undefined`, so this one call both isolates the copy
   * and validates it — the identical single-owner discipline
   * sanitize()/defaults() already enforce for every OTHER path a Meta
   * object is produced through, extended to these two. */
  this.meta = MetaLogic.sanitize(opts.meta);
  for (i = 0; i < this.players.length; i++) this._applyMetaToPlayer(this.players[i]);

  // Regular (non-boss) kills bank toward this run's D8 currency stub. A
  // real Bus subscription, not a per-tick frame scan — listeners survive
  // resetTransient() by design (its own comment: "listeners are not sim
  // state"), so this only ever needs to be wired once, here.
  //
  // Gated on the SAME "has beginRun() actually engaged the loop" signal
  // step() itself checks — without it, this counted every ordinary combat
  // kill in every existing test that never touches the run loop at all
  // (any suite driving a real fight through Combat.resolveBox), silently
  // drifting this.run.kills on a Sim resetTransient() never resets (see
  // its own scope note below) and breaking the "byte-for-byte identical to
  // before this file existed" guarantee for every one of them. A real,
  // adversarially-shaped bug caught by the existing gate itself, not
  // assumed safe.
  this.bus.on('targetDown', function (e) {
    if (self.exit === null && self.bossTarget === null) return;
    if (self.bossTarget && e.id === self.bossTarget.id) return;
    // Only THIS level's own real roster counts (_levelRosterIds, the same
    // guard isLevelClear()/_roster() already use) — a boot-path practice
    // Dummy (95-app.js, id 100, added AFTER beginRun() specifically so it
    // never blocks "clear") lives in this exact array and, without this
    // check, banks real run currency for a tutorial fixture no roster ever
    // placed. A real, adversarially-found gap: isLevelClear() was already
    // guarded this way; this listener, doing the analogous job for
    // currency, was not.
    if (self._levelRosterIds.indexOf(e.id) === -1) return;
    self.run.kills++;

    // D4: a blueprint may drop from a real roster kill. Consumes from the
    // sim's own live rng stream, the same convention pickStatColour already
    // established for in-run reactive randomness (RunLogic's own
    // derive*Seed functions are the OTHER shape, for a level's own
    // independently-reproducible geometry — this is neither of those, it
    // is a live event during an already-in-progress level). Assigned to
    // the first player with an empty carry slot (capacity
    // CFG.META_BLUEPRINT_CAPACITY, currently 1) — not attributed to
    // whichever player actually landed the kill, the same "a shared run
    // resource, not a per-player one" reasoning run.kills itself already
    // uses (confirmed by the adversarial pass over 60-run.js: kill-banking
    // is correctly a single global counter regardless of which player's
    // attack lands it).
    var dropId = MetaLogic.rollBlueprintDrop(DATA.WEAPON_IDS, self.meta, self.rng);
    if (dropId) {
      for (var pi = 0; pi < self.players.length; pi++) {
        var pl = self.players[pi];
        if (pl.alive() && !pl.carriedBlueprint) {
          pl.carriedBlueprint = dropId;
          self.bus.emit('blueprintDrop', { id: dropId, playerId: pl.id, x: e.x, y: e.y });
          break;
        }
      }
    }
  });
}

/* L10. The single authoritative reset. After this call the sim is
 * indistinguishable from a freshly constructed one with the same options —
 * verify_arch asserts exactly that by comparing hashes, which is what stops
 * a forgotten field from leaking between tests and making a suite green for
 * the wrong reason.
 *
 * Bus LISTENERS survive on purpose: the presenter subscribes once at boot and
 * a reset in the middle of a run must not silently unplug it. Listeners are
 * not sim state and are not in the hash.
 *
 * Deliberately does NOT touch this.run/this.exit/this.bossTarget/this.world —
 * the run loop's own state stays out of this method's scope entirely, the
 * same way this.world itself was already out of its scope before 60-run.js
 * ever existed (this method has never once assigned it). A Sim that never
 * calls beginRun() never leaves this.run's pristine constructed state (the
 * targetDown-kill-counter subscription above is gated on exactly that), so
 * every one of this codebase's existing scenarios is unaffected. A Sim
 * genuinely mid-run has no single well-defined meaning for "reset" between
 * "return to this run's current level" and "return to how it was
 * constructed" — beginRun() is that Sim's own real re-entry point instead;
 * calling it again is a complete, well-defined restart on its own. */
Sim.prototype.resetTransient = function () {
  this.rng = new RNG(this.seed);
  this.bus.frame.length = 0;
  this.bus.emitted = 0;
  this.pads.reset();
  for (var i = 0; i < this.players.length; i++) this.players[i].resetTransient();
  for (var j = 0; j < this.targets.length; j++) this.targets[j].resetTransient();
  for (var k = 0; k < this.pickups.length; k++) this.pickups[k].collected = false;
  this.shots.length = 0;
  this.tick = 0;
  this.hitstop = 0;
  return this;
};

/* Exactly one 1/60 tick.
 *
 * Pads update even while frozen. Hitstop stops the WORLD, not the player's
 * hands: a press made during hitstop arms its buffer and is still there when
 * the freeze lifts. verify_arch asserts this, because the opposite — dropping
 * inputs during the very frames that follow a hit — is the single most
 * common way a game with good numbers still feels bad. */
Sim.prototype.step = function () {
  this.bus.beginFrame();

  var frozen = this.hitstop > 0;
  this.pads.update(frozen);

  if (frozen) {
    this.hitstop--;
    this.tick++;
    return this;
  }

  var i, p, want = 0;

  // 1. Attack input is consumed before anything moves, so a swing costs zero
  //    frames of latency for the same reason a jump does.
  for (i = 0; i < this.players.length; i++) {
    Combat.begin(this.players[i], this.pads.get(i), this.rig, this.bus);
  }

  // 2. Everything moves.
  for (i = 0; i < this.players.length; i++) {
    this.players[i].update(this.pads.get(i), this.world, this.bus);
  }

  // 2a. Pickups (D2), read against THIS tick's fresh position — a player
  // cannot collect one on the same tick their body has already left it,
  // which "before this tick's move" would allow. Colour is decided HERE,
  // lazily, from whatever this player's stats actually are right now — not
  // pre-baked when the pickup was placed — via the sim's own seeded `rng`
  // (L4), never Math.random.
  for (i = 0; i < this.pickups.length; i++) {
    var pu = this.pickups[i];
    if (pu.collected) continue;
    for (var pi = 0; pi < this.players.length; pi++) {
      p = this.players[pi];
      if (!p.alive()) continue;
      if (!aabb(pu.x, pu.y, pu.w, pu.h, p.body.x, p.body.y, p.body.w, p.body.h)) continue;
      pu.collected = true;
      var colour = C.pickStatColour(p.stats, this.rng);
      this.bus.emit('pickup', { id: pu.id, playerId: p.id, x: pu.x, y: pu.y, colour: colour });
      p.gainStat(colour, this.bus);
      break;   // one pickup, one player, one gain — never double-granted
    }
  }

  // Enemies act after the players have moved, so they read this tick's real
  // positions, and their own attacks resolve inside their update.
  for (i = 0; i < this.targets.length; i++) {
    this.targets[i].update(this.world, this.players, this.bus, this.ctx);
  }
  for (i = 0; i < this.shots.length; i++) {
    this.shots[i].update(this.world, this.players, this.bus);
  }
  // Prune in order, so the surviving sequence is identical every run.
  if (this.shots.length) {
    var live = [];
    for (i = 0; i < this.shots.length; i++) if (!this.shots[i].done) live.push(this.shots[i]);
    this.shots = live;
  }

  // 3. Player hits resolve against THIS tick's positions, not last tick's —
  //    slam impact too (Combat.resolveSlam is a no-op unless a slam landed
  //    THIS tick; owns and clears player.slamLanded itself).
  for (i = 0; i < this.players.length; i++) {
    Combat.step(this.players[i], this.targets, this.rig, this.bus);
    Combat.resolveSlam(this.players[i], this.targets, this.bus);
  }

  // 4. Hitstop is decided last, from what actually happened.
  for (i = 0; i < this.players.length; i++) {
    p = this.players[i];
    if (p.hitstopRequest > want) want = p.hitstopRequest;
  }
  if (want > 0) this.hitstop = want;

  this.tick++;

  // 5. Run loop (60-run.js) — see this.exit's own comment above for why
  // this is inert on any sim beginRun() was never called on.
  if (this.exit !== null || this.bossTarget !== null) this._stepRun();

  return this;
};

// Anything an attack can land on. Enemies satisfy the same shape when
// 45-enemy.js lands; until then it is dummies.
Sim.prototype.addTarget = function (target) {
  this.targets.push(target);
  return target;
};

/* Seed defaults to something derived from the spawn, not from a shared
 * counter: two enemies of the same template at different places diverge, and
 * the same enemy at the same place is reproducible (L4). */
Sim.prototype.addEnemy = function (tid, x, y, seed) {
  var id = 200 + this.targets.length;
  var s = seed === undefined ? (this.seed ^ (x * 73856093) ^ (y * 19349663) ^ id) >>> 0 : seed;
  return this.addTarget(new C.Enemy(id, tid, x, y, s));
};

// Co-op join (D5). Adds a pad and a player without disturbing anyone already
// playing — no reset, no reseed, no buffer loss for player one.
Sim.prototype.addPlayer = function () {
  var i = this.players.length;
  var sp = this.spawns[i % this.spawns.length];
  this.pads.ensure(i + 1);
  this.players.push(new Player(i, sp[0], sp[1]));
  this._wasDead.push(false);
  // A joiner is a fresh Player (its own constructor already called
  // resetTransient()) — apply the CURRENT permanent maxHp bonus immediately,
  // the same way opts.meta already does for every player present at
  // construction, rather than leaving a joiner under-powered relative to
  // whoever was already playing.
  this._applyMetaToPlayer(this.players[i]);
  return this.players[i];
};

/* -------------------------------------------------------- meta (65-meta.js)
 * Orchestration glue only — 65-meta.js itself never references Player, the
 * same one-way-dependency discipline 60-run.js already established for the
 * identical reason. */

// Shared by every place a player is freshly reset to the baseline
// CFG.MAX_HP (resetTransient()'s own job) and then needs the CURRENT
// permanent bonus layered on top: beginRun()'s restart loop,
// _commitPendingLevel()'s alive-player reset loop, _stepRun()'s own
// justRespawned detection, and addPlayer()/the constructor for a player who
// didn't go through resetTransient() at this exact moment but still needs
// to reflect whatever the bonus currently is. Deliberately ADDS to whatever
// resetTransient() just set (CFG.MAX_HP, full health) rather than assuming
// it starts from zero — the one shared place this pattern lives, after
// _relocatePlayers()'s own comment already named "one sibling patched,
// others missed" as a real bug class this codebase has hit before.
Sim.prototype._applyMetaToPlayer = function (player) {
  player.maxHp += this.meta.maxHpBonus;
  player.hp = player.maxHp;
  // Ability enhancements (§4): plain ownership mirrors, the ones this
  // player-side field actually gates (invulnerable()'s state check for
  // dash needs nothing from meta — it's the dash ITSELF, not an
  // enhancement). Dash Extra Charge also gets its starting charge here,
  // the same "current permanent bonus, reflected from the very first
  // tick" treatment maxHp's own bonus already gets above — not something
  // a freshly (re)spawned owner should have to touch ground to earn back.
  player.dashExtraCharge = this.meta.dashExtraCharge;
  player.dashExtIframes = this.meta.dashExtIframes;
  player.parryRiposte = this.meta.parryRiposte;
  player.parryReflect = this.meta.parryReflect;
  if (this.meta.dashExtraCharge) player.dashCharges = 1;
};

// Loads a DIFFERENT meta state into an already-constructed Sim — a real
// Sim method, not the presenter assigning sim.meta directly (L5). Has no
// production call site today: 95-app.js's own boot() supplies its loaded
// payload as the constructor's opts.meta instead (simpler for the one
// real case that exists, a fresh load at boot). This method is the
// primitive a FUTURE caller would need for a different case — reloading a
// different save slot into a Sim that is already running, without
// reconstructing it — the same "real, tested, but nothing yet gives the
// player a way to trigger it" shape this project already accepts
// elsewhere (RUN_SPEND_STUB_COST before this file existed, the weapon
// DATA before equip UI). An earlier draft of this comment claimed a
// 95-app.js call site that does not exist — corrected here rather than
// left to mislead the next reader, the same "comment overclaims coverage"
// shape this project's own adversarial passes keep finding. Routed
// through MetaLogic.sanitize() for the identical reason the constructor's
// own opts.meta branch is — see that comment for the real bug (shared-
// reference pollution across Sims) this specifically closes.
Sim.prototype.applyMeta = function (state) {
  this.meta = MetaLogic.sanitize(state);
  for (var i = 0; i < this.players.length; i++) this._applyMetaToPlayer(this.players[i]);
  return this;
};

// D4's own "debug-room toggle" — flips whether the blueprint pool is
// enforced (locked, meaningful) or Stage 1's default (pre-unlocked,
// nothing to unlock). A real Sim method for the same L5 reason as
// applyMeta() above.
Sim.prototype.toggleEnforceLocks = function () {
  this.meta.enforceLocks = !this.meta.enforceLocks;
  return this.meta.enforceLocks;
};

// D8's +max HP purchase. A live top-up, not a reset-and-reapply
// (_applyMetaToPlayer's own job): every CURRENTLY ALIVE player's maxHp AND
// hp both grow by CFG.META_MAXHP_GAIN immediately — the same "current hp
// AND max hp both grow" coupling D2's own STAT_HP_GAIN already established
// for the within-run version of this exact concept, applied here to its
// permanent counterpart. A still-dead player (mid-countdown on their own
// death) is left untouched, the same _relocatePlayers()/_commitPendingLevel
// precedent for not force-touching an unfinished death — their own next
// reset picks up the new, already-persisted bonus
// via _applyMetaToPlayer() regardless. Returns false, spending nothing, if
// currency is short — RunLogic.spend()'s own "refuse rather than go
// negative" contract, reused rather than re-derived (MetaLogic.spendOnMaxHp).
Sim.prototype.buyMaxHp = function () {
  var result = MetaLogic.spendOnMaxHp(this.meta.currency);
  if (!result.ok) return false;
  this.meta.currency = result.currency;
  this.meta.maxHpBonus += CFG.META_MAXHP_GAIN;
  for (var i = 0; i < this.players.length; i++) {
    var p = this.players[i];
    if (p.alive()) { p.maxHp += CFG.META_MAXHP_GAIN; p.hp += CFG.META_MAXHP_GAIN; }
  }
  return true;
};

/* Abilities spec §4 — four independent flat-cost purchases, same shape as
 * buyMaxHp above: check .ok, write meta.currency, flip the flag, live-top-
 * up every currently alive player. Each also guards against double-
 * purchase up front — a boolean flag has no "already own it" short-circuit
 * the way isUnlocked gives blueprints (RunLogic.spend would happily charge
 * currency again for a flag that's already true), so without this a second
 * buy would silently waste currency for zero additional effect. NOT routed
 * through _applyMetaToPlayer() for the live top-up — that helper's whole
 * contract is "layer a permanent bonus onto a freshly-RESET baseline," and
 * calling it here would re-run its maxHp/dashCharges logic against a
 * player's CURRENT, already-in-flight values rather than topping them up,
 * exactly the reason buyMaxHp above already avoids it too. */
Sim.prototype.buyDashExtraCharge = function () {
  if (this.meta.dashExtraCharge) return false;
  var result = MetaLogic.spendOnDashExtraCharge(this.meta.currency);
  if (!result.ok) return false;
  this.meta.currency = result.currency;
  this.meta.dashExtraCharge = true;
  for (var i = 0; i < this.players.length; i++) {
    var p = this.players[i];
    if (p.alive()) { p.dashExtraCharge = true; p.dashCharges = 1; }
  }
  return true;
};

Sim.prototype.buyDashExtIframes = function () {
  if (this.meta.dashExtIframes) return false;
  var result = MetaLogic.spendOnDashExtIframes(this.meta.currency);
  if (!result.ok) return false;
  this.meta.currency = result.currency;
  this.meta.dashExtIframes = true;
  for (var i = 0; i < this.players.length; i++) {
    var p = this.players[i];
    if (p.alive()) p.dashExtIframes = true;
  }
  return true;
};

Sim.prototype.buyParryRiposte = function () {
  if (this.meta.parryRiposte) return false;
  var result = MetaLogic.spendOnParryRiposte(this.meta.currency);
  if (!result.ok) return false;
  this.meta.currency = result.currency;
  this.meta.parryRiposte = true;
  for (var i = 0; i < this.players.length; i++) {
    var p = this.players[i];
    if (p.alive()) p.parryRiposte = true;
  }
  return true;
};

Sim.prototype.buyParryReflect = function () {
  if (this.meta.parryReflect) return false;
  var result = MetaLogic.spendOnParryReflect(this.meta.currency);
  if (!result.ok) return false;
  this.meta.currency = result.currency;
  this.meta.parryReflect = true;
  for (var i = 0; i < this.players.length; i++) {
    var p = this.players[i];
    if (p.alive()) p.parryReflect = true;
  }
  return true;
};

/* ------------------------------------------------------------ run loop
 * 60-run.js supplies pure decision/derivation functions; everything below
 * is the orchestration glue that actually touches World/Player/Enemy —
 * Sim's own job, the only file with direct access to any of them. See
 * 60-run.js's own header for the full design record. */

// The one public entry point. Nothing moves out of the pristine
// newly-constructed state (this.exit/this.bossTarget both null) until this
// is called — the "how does the loop even start" question a losing panel
// pitch left unanswered, closed here explicitly rather than implicitly.
//
// A genuine restart, callable more than once on the same Sim, not just a
// first-time initializer: explicitly clears runEndFrames/_pendingLevel/
// _wasDead before handing off to _enterLevel(), which is what actually
// makes that true rather than merely claimed. An earlier draft left this
// implicit — _enterLevel() resets everything IT touches, but a run-end
// already in flight from a PRIOR call (an abandoned _pendingLevel computed
// from the old seed, or a boss-victory runEndFrames countdown still
// counting down) would otherwise survive a second beginRun() and later
// silently commit stale, wrong-seed data mid-tick — a real, adversarially-
// found gap, not a hypothetical one. There is exactly one production call
// site today (95-app.js's boot(), called once), so this was not yet
// reachable in the shipped game, but any future caller (a menu's "new
// game," a test) must not inherit a bug this method's own name promises
// it does not have.
Sim.prototype.beginRun = function (seed) {
  this.run = new Run(seed === undefined ? this.seed : seed);
  this.runEndFrames = -1;
  this._pendingLevel = null;
  // A genuine restart resets every player to THIS run's own pristine
  // baseline (D2: "each stat starts at 1 every run") — including reviving
  // anyone still mid-death-countdown from a PRIOR, now-abandoned run.
  // Without this, a still-dead player's own deadFrames keeps counting down
  // while _wasDead[] below is reset to false under them: the very next tick
  // reads "isDead && !_wasDead" as a BRAND NEW death (it is not — it is the
  // same old one, just relabeled) and opens a second, bogus _beginRunEnd()
  // sequence off this fresh run's own state, which later commits a stale
  // level swap nobody asked for once the old countdown finally reaches
  // zero. A real, adversarially-found gap — see this file's own regression
  // test in verify_run.js for the exact sequence that caught it.
  this._wasDead = [];
  for (var i = 0; i < this.players.length; i++) {
    this.players[i].resetTransient();
    this._applyMetaToPlayer(this.players[i]);
    this._wasDead.push(false);
  }
  var levelSeed = RunLogic.deriveLevelSeed(this.run.runSeed, 0);
  this._enterLevel(Gen.generate(levelSeed), levelSeed);
  return this;
};

// Installs a hand-built world directly, bypassing Gen.generate() entirely —
// the presenter's own emergency fallback (95-app.js) if beginRun() itself
// throws, and the only reason this exists: L5 forbids a presenter ever
// assigning sim.<field> directly, so the field-mutation has to live here,
// with the presenter only ever calling a real Sim method (and doing the
// console.warn that method is not allowed to do itself).
Sim.prototype.loadFallback = function (world, spawns) {
  this._clearEntities();
  this.world = world;
  this.exit = null;
  this.spawns = spawns;
  this._relocatePlayers(spawns);
  return this;
};

Sim.prototype._clearEntities = function () {
  this.targets.length = 0;
  this.bossTarget = null;
  this.shots.length = 0;
  this.pickups.length = 0;
  this._levelRosterIds = [];
};

// `gen`/`levelSeed` are ALWAYS supplied by the caller (beginRun() computes
// them fresh; _commitPendingLevel() below reuses ones already computed
// eagerly at run-end) — this method never calls Gen.generate() itself, so a
// level is never generated twice for the same transition.
Sim.prototype._enterLevel = function (gen, levelSeed) {
  this._clearEntities();
  this.world = gen.world;
  this.exit = gen.exit;
  this.run.levelSeed = levelSeed;
  this.run.phase = 'level';
  // A co-op player joining (addPlayer(), F2) after this fires must land
  // somewhere valid in THIS level, not the stale construction-time point —
  // a single-entry array, so every joiner lands at the same spot (a small,
  // named limitation: Gen.generate() only ever hands back one spawn point,
  // so this cannot offer a joiner their own distinct one the way a player
  // already present at transition time gets teleport()ed individually).
  this.spawns = [gen.spawn];

  var i;
  for (i = 0; i < gen.pickups.length; i++) {
    this.pickups.push(new Pickup(300 + i, gen.pickups[i][0], gen.pickups[i][1]));
  }
  // Tracked by id so isLevelClear() (see _stepRun() below) can tell THIS
  // level's own roster apart from anything else that might also be sitting
  // in this.targets — a boot-path practice dummy, most concretely: it has
  // no template, is never meant to die, and lives in the exact same array.
  // Without this, an undying entity in targets would make isLevelClear()
  // return false forever, and a level could never be cleared at all — a
  // real bug caught by driving this end to end in a real browser, not
  // assumed safe from the sim-only tests alone (none of which ever mixed a
  // Dummy into a beginRun()-driven roster). Not hashed separately: it is a
  // pure function of already-hashed state (run.levelSeed plus addEnemy()'s
  // own deterministic sequential id assignment), the same reasoning
  // _pendingLevel.gen itself isn't hashed either.
  var placed = RunLogic.placeEnemies(gen.platforms, RunLogic.deriveEnemySeed(levelSeed));
  this._levelRosterIds = [];
  for (i = 0; i < placed.length; i++) {
    this._levelRosterIds.push(this.addEnemy(placed[i].tid, placed[i].x, placed[i].y, placed[i].seed).id);
  }

  this._relocatePlayers([gen.spawn]);
};

/* Every place this file moves the whole player roster to a new point shares
 * this one method — deliberately, after an adversarial pass found the fix
 * below applied to only ONE of what were then three separate hand-written
 * copies of this same loop (_enterLevel had it, _enterBoss and
 * loadFallback did not), the exact "one sibling patched, others missed"
 * gap a shared helper closes by construction rather than by remembering to
 * copy a fix three times.
 *
 * A co-op partner can still be mid-death (their OWN deadFrames countdown
 * still running) the instant this fires — in a shared-death run-end, one
 * player's countdown reaching zero is what commits the level for BOTH, and
 * a staggered second death can still be counting down when that commit
 * lands. Forcibly teleporting a currently-dead player would stomp their
 * 'dead' state (and orphan hp at 0 with deadFrames never reaching 0,
 * 'respawn' never firing) while leaving their own countdown running;
 * setSpawn() alone (idempotent with any setSpawn() call already made by
 * _beginRunEnd()'s own caller) lets that sequence finish on its own and
 * land correctly once it does. */
// `spawns`: an array of [x,y] points, cycled per player index the same way
// this.spawns itself already is (addPlayer()'s own `i % this.spawns.length`)
// — a single-entry array (every caller except loadFallback's demo path) puts
// every player at the same point; loadFallback passes its own multi-point
// DEMO_SPAWNS through unchanged, preserving the distinct per-player landing
// spots that array has always provided.
Sim.prototype._relocatePlayers = function (spawns) {
  for (var i = 0; i < this.players.length; i++) {
    var sp = spawns[i % spawns.length];
    if (this.players[i].alive()) this.players[i].teleport(sp[0], sp[1]);
    else this.players[i].setSpawn(sp[0], sp[1]);
  }
};

Sim.prototype._enterBoss = function () {
  this._clearEntities();
  this.world = Boss.arena();
  this.exit = null;             // the arena has no exit concept — a true fact, not a phase flag
  this.run.phase = 'boss';
  this.spawns = [Boss.playerSpawn];   // same reasoning as _enterLevel()'s own spawns update

  var bossSeed = RunLogic.deriveBossSeed(this.run.levelSeed);
  this.bossTarget = this.addEnemy(Boss.template, Boss.spawn[0], Boss.spawn[1], bossSeed);
  // _relocatePlayers(), never a bare teleport() loop — hp/stats carry
  // through the boss door on purpose (D2: stats are a whole-run resource;
  // an earlier panel pitch used a full-reset helper here instead and
  // granted a silent free heal at the threshold every time) AND a
  // currently-dead co-op partner's own countdown must not be stomped by a
  // forced teleport (see _relocatePlayers()'s own comment).
  this._relocatePlayers([Boss.playerSpawn]);
};

// Computes the NEXT run's level eagerly — but does not touch
// this.world/this.exit/this.targets, or bank any currency, yet. The world
// swap is deferred on purpose: 80-view.js keeps drawing the CURRENT world
// every frame regardless of player state, so swapping the geometry behind
// a still-visible death animation would pop the room out from under it.
// The swap, AND the currency banking, both wait for _commitPendingLevel(),
// at the exact tick a player becomes visible again (see _stepRun() below).
//
// Currency is deliberately NOT banked here (an earlier draft did, from
// this.run.kills as of THIS tick) — in co-op, the level this run is ending
// on is still fully live for the whole pending window (a surviving partner
// keeps fighting the OLD roster while the dying player counts down), so
// this.run.kills can keep climbing for real, through the real damage path,
// after this method returns and before _commitPendingLevel() actually
// fires. Banking early meant those extra real kills were counted (run.kills
// visibly climbed) but their currency was never paid — computed once, too
// soon, then silently discarded when _commitPendingLevel() zeroes
// run.kills for the next run. A real, adversarially-found gap; fixed by
// reading run.kills at the LATEST possible moment (commit) rather than the
// earliest.
Sim.prototype._beginRunEnd = function (victory) {
  var newRunSeed = RunLogic.nextRunSeed(this.run.runSeed, this.run.runsCompleted);
  var levelSeed = RunLogic.deriveLevelSeed(newRunSeed, 0);
  // `victory` rides along on _pendingLevel itself rather than a separate
  // field — like gen/levelSeed, it is a pure function of already-hashed
  // state at the moment this fires (which branch of _stepRun() called this
  // at all is itself derived from hashed player/boss state), so it needs
  // no hash() coverage of its own, the same reasoning hash()'s own comment
  // already gives for _pendingLevel's other fields.
  this._pendingLevel = { gen: Gen.generate(levelSeed), levelSeed: levelSeed, runSeed: newRunSeed, victory: victory };
};

Sim.prototype._commitPendingLevel = function () {
  var pending = this._pendingLevel;
  var earned = RunLogic.currencyEarned(this.run.kills, pending.victory);
  // RUN_SPEND_STUB_COST is retired (00-core.js) — this.run.currency simply
  // accumulates the session's own running total now; the real spend
  // (blueprint unlocks) happens below, against the PERMANENT meta pool,
  // not this one.
  this.run.currency = this.run.currency + earned;
  this.run.runSeed = pending.runSeed;
  this.run.kills = 0;
  this.run.runsCompleted++;
  this._pendingLevel = null;

  // D4/D8 (65-meta.js): this transition is "a transition" in D4's own
  // language — the one place a carried blueprint either hands in or was
  // already lost (lost already happened, at the moment of death, in
  // _stepRun()'s own justDied detection below; a still-dead co-op partner
  // has nothing left to hand in here). This run's own earnings sweep into
  // the PERMANENT pool first, so an unlock attempted the SAME tick a boss
  // bonus lands can actually spend it.
  this.meta.currency += earned;
  var handedIn = [];
  for (var hi = 0; hi < this.players.length; hi++) {
    var carrier = this.players[hi];
    if (!carrier.alive() || !carrier.carriedBlueprint) continue;
    var weaponId = carrier.carriedBlueprint;
    // Recorded HERE, before either branch below — every carry consumed at
    // this transition belongs in handedIn, including the case a SECOND
    // carrier of the identical still-locked weapon hits (the first
    // carrier processed this same loop already unlocked it, so
    // isUnlocked() below correctly makes THIS spend a no-op) and the
    // unaffordable case further down. An earlier draft pushed only inside
    // those two branches and silently dropped this one — a real,
    // adversarially-found gap: the carry slot empties either way (the
    // resetTransient() pass below clears it unconditionally), so the
    // event payload must say so either way too, not just report the
    // subset that also happened to spend currency.
    handedIn.push(weaponId);
    if (MetaLogic.isUnlocked(this.meta, weaponId)) continue;   // nothing to spend on
    var result = MetaLogic.spendOnUnlock(this.meta.currency);
    if (result.ok) {
      this.meta.currency = result.currency;
      this.meta.unlocked[weaponId] = true;
      this.bus.emit('blueprintUnlocked', { id: weaponId, playerId: carrier.id });
    }
    // An unaffordable hand-in is a real, named simplification, not a
    // banked-for-later queue: the blueprint is spent either way (the
    // carry slot always empties at this transition, matching D4's own
    // "hand in AT a transition" as something that happens TO the
    // blueprint here, not something the player separately chooses).
  }

  // D2: "each stat starts at 1 every run." This is the moment the game's
  // own bookkeeping calls a new run (runsCompleted just advanced) — every
  // ALIVE player present resets to the fresh baseline here, not just
  // beginRun()'s own explicit restart. Before this, only the ONE player
  // whose death happened to trigger the run end got reset, as an
  // incidental side effect of their own deadFrames -> resetTransient()
  // respawn machinery — a co-op partner who never personally died (or the
  // sole player in a boss-victory-with-no-death run) kept arbitrary
  // stat/maxHp growth straight through a boundary the game calls brand
  // new. A still-dead player (a co-op partner mid-countdown of their OWN,
  // separate death) is deliberately left untouched here, the same
  // precedent _relocatePlayers() already set for not force-touching a
  // player who is not done dying yet — their own natural respawn already
  // calls resetTransient() on their own schedule, so nothing here needs to
  // race it. resetTransient() also clears carriedBlueprint (already read
  // and resolved above) — "handed in" and "cleared" are the same reset,
  // not two separate steps to keep in sync.
  for (var i = 0; i < this.players.length; i++) {
    if (this.players[i].alive()) {
      this.players[i].resetTransient();
      this._applyMetaToPlayer(this.players[i]);
    }
  }

  // The one new event this feature needs (00-core.js's own EVENTS
  // comment): fires exactly once, after every meta mutation above has
  // settled, so a listener (95-app.js, persisting to localStorage) reads
  // the FINAL values for this transition, not a mid-resolution snapshot.
  this.bus.emit('runEnd', { currency: this.meta.currency, handedIn: handedIn });

  this._enterLevel(pending.gen, pending.levelSeed);
};

/* The tail of step(), only ever reached once beginRun() has actually
 * engaged the loop (see step()'s own call site above). Two independent
 * end-of-run triggers converge on the same _beginRunEnd()/
 * _commitPendingLevel() pair:
 *
 *   - a player dying reuses Player's own EXISTING deadFrames/
 *     resetTransient() countdown (30-player.js, entirely unmodified) as
 *     the pacing clock — this file only watches for the state edges.
 *   - a boss defeated with nobody having died gets its OWN dedicated
 *     countdown (this.runEndFrames), deliberately never nested inside a
 *     `this.run.phase === 'boss'` guard: a losing panel pitch nested its
 *     equivalent countdown inside exactly that guard, and because
 *     _beginRunEnd() flips the phase away from 'boss' the instant the
 *     countdown starts, the guard was permanently false on every
 *     following tick and the countdown could never reach zero again — a
 *     real, source-verified deadlock an adversarial judge caught in that
 *     pitch's own pseudocode. Checking runEndFrames directly and
 *     unconditionally, every tick, is what keeps this reachable. Nor does
 *     this force any player's own hp to 0 to borrow their death machinery
 *     the way another losing pitch did — that pitch's own force-death loop
 *     ran unconditionally over every player, so a co-op partner who was
 *     very much alive got silently killed by their teammate's boss
 *     victory. A dedicated timer avoids needing to touch a living player's
 *     state at all.
 *
 * A death this same tick always wins over a level/boss transition — a
 * fatal trade must never quietly promote a corpse into the boss arena, or
 * paper over a run that just ended as if it were still in progress. */
Sim.prototype._stepRun = function () {
  var i, justDied = false, justRespawned = false, isDead;

  for (i = 0; i < this.players.length; i++) {
    isDead = !this.players[i].alive();
    if (isDead && !this._wasDead[i]) {
      justDied = true;
      // D4: "lose on death." The MOMENT of death, not later — Player's own
      // resetTransient() (which clears carriedBlueprint) does not fire
      // until deadFrames reaches 0, several ticks from now, so this is the
      // one place the field is still readable at the instant it's lost.
      // The clearing itself still happens naturally at resetTransient();
      // this is only the notification, the same "state IS the signal"
      // shape 60-run.js's own header already uses for phase transitions.
      if (this.players[i].carriedBlueprint) {
        this.bus.emit('blueprintLost', { id: this.players[i].carriedBlueprint, playerId: this.players[i].id });
      }
    }
    if (!isDead && this._wasDead[i]) {
      justRespawned = true;
      // The natural per-death respawn path (Player.update()'s own 'dead'
      // branch) already called resetTransient() THIS tick, before Sim ever
      // gets a chance to orchestrate anything — this is the one place that
      // path's own maxHp needs the current permanent bonus layered on,
      // mirroring what beginRun()'s and _commitPendingLevel()'s own reset
      // loops already do for their two different reset moments.
      this._applyMetaToPlayer(this.players[i]);
    }
    this._wasDead[i] = isDead;
  }

  if (justDied && this.runEndFrames < 0 && !this._pendingLevel) {
    this._beginRunEnd(false);
    for (i = 0; i < this.players.length; i++) {
      this.players[i].setSpawn(this._pendingLevel.gen.spawn[0], this._pendingLevel.gen.spawn[1]);
    }
  }
  if (justRespawned && this._pendingLevel) this._commitPendingLevel();

  if (this.runEndFrames >= 0) {
    this.runEndFrames--;
    if (this.runEndFrames <= 0) {
      this.runEndFrames = -1;
      if (this._pendingLevel) this._commitPendingLevel();
    }
  }

  if (this.run.phase === 'boss' && !justDied && this.runEndFrames < 0 && !this._pendingLevel) {
    if (this.bossTarget && !this.bossTarget.alive()) {
      this._beginRunEnd(true);
      this.runEndFrames = CFG.RESPAWN_FRAMES;
    }
  }

  // Guarded against a run-end already pending (from a death elsewhere this
  // countdown, in co-op) — that run already ended; a still-alive partner
  // reaching the exit in the meantime must not open a boss door onto a run
  // that is in the middle of concluding.
  if (this.run.phase === 'level' && !justDied && !this._pendingLevel) {
    var atExit = false, p, b, cx, cy;
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      if (!p.alive()) continue;
      b = p.body;
      cx = b.x + b.w / 2; cy = b.y + b.h / 2;
      if (RunLogic.reachedExit(cx, cy, this.exit, CFG.RUN_EXIT_RADIUS)) { atExit = true; break; }
    }
    if (atExit && RunLogic.isLevelClear(this._roster())) this._enterBoss();
  }
};

// This level's own real roster only — see _enterLevel()'s own comment on
// _levelRosterIds for why anything else living in this.targets (a boot-path
// practice dummy, most concretely) must never be allowed to affect "clear".
Sim.prototype._roster = function () {
  var out = [];
  for (var i = 0; i < this.targets.length; i++) {
    if (this._levelRosterIds.indexOf(this.targets[i].id) !== -1) out.push(this.targets[i]);
  }
  return out;
};

/* A total, exact ordering of every piece of sim state. Used by the suites to
 * compare two runs. Values are stringified at full precision rather than
 * rounded: the point is byte-identical, and a tolerance here would hide the
 * very drift it exists to find. */
Sim.prototype.hash = function () {
  var out = [
    this.tick, this.hitstop, this.rng.s, this.bus.emitted,
    // Run loop (60-run.js). run.levelSeed decides what _commitPendingLevel()
    // produces LATER — a real, future-tick-relevant source of divergence,
    // not a redundant re-derivation of something already hashed elsewhere.
    // this.exit is position, not presence-only: the same levelSeed silently
    // placing its exit at the wrong pixel would otherwise never show up
    // here. this.bossTarget is identity only (which reference Sim is
    // tracking) — its own fields are already walked by the per-target loop
    // below, so hashing them a second time here would be redundant, not
    // additional coverage. _wasDead/_pendingLevel are deliberately NOT
    // listed: _wasDead is a pure re-derivation of p.state (already hashed
    // per-player below) and _pendingLevel's own gen/levelSeed are pure
    // functions of run.runSeed/runsCompleted (already hashed) plus
    // Gen.generate()'s own determinism (already proven elsewhere) — hashing
    // a stringified World a second time would only ever re-prove what the
    // seed already fully determines.
    this.run.phase, this.run.runSeed, this.run.levelSeed, this.run.currency,
    this.run.runsCompleted, this.run.kills,
    this.exit ? this.exit[0] : -1, this.exit ? this.exit[1] : -1,
    this.bossTarget ? this.bossTarget.id : -1,
    this.runEndFrames,
    // Meta progression (65-meta.js). All four affect FUTURE ticks: currency
    // decides what a later spend can afford, maxHpBonus decides a later
    // reset's maxHp, enforceLocks/unlocked together decide whether a later
    // blueprint drop has anything left to roll for. Walked via
    // DATA.WEAPON_IDS (already alphabetical) rather than
    // Object.keys(this.meta.unlocked) — a plain object's own key order is
    // insertion-dependent, not a source of truth this hash can lean on.
    this.meta.currency, this.meta.maxHpBonus, this.meta.enforceLocks ? 1 : 0,
    // Ability enhancements (§4): all four decide FUTURE ticks (whether a
    // future dash/parry/stagger gets the enhanced behavior), the same
    // "affects later ticks" bar the three fields above already hold to.
    this.meta.dashExtraCharge ? 1 : 0, this.meta.dashExtIframes ? 1 : 0,
    this.meta.parryRiposte ? 1 : 0, this.meta.parryReflect ? 1 : 0
  ], i, p, b, t;
  for (i = 0; i < DATA.WEAPON_IDS.length; i++) {
    out.push(this.meta.unlocked[DATA.WEAPON_IDS[i]] ? 1 : 0);
  }
  for (i = 0; i < this.players.length; i++) {
    p = this.players[i]; b = p.body;
    out.push(
      p.id, p.state, p.stateFrames, p.facing, p.hp, p.airJumps, p.coyote,
      p.rollFrames, p.rollCd, p.iframes, p.cutArmed ? 1 : 0,
      p.dashFrames === undefined ? 0 : p.dashFrames,
      p.dashCd === undefined ? 0 : p.dashCd,
      p.dashCharges === undefined ? 0 : p.dashCharges,
      p.parryWindow === undefined ? 0 : p.parryWindow,
      p.parryCd === undefined ? 0 : p.parryCd,
      p.dashExtraCharge ? 1 : 0, p.dashExtIframes ? 1 : 0,
      p.parryRiposte ? 1 : 0, p.parryReflect ? 1 : 0,
      p.crouching ? 1 : 0, p.slamHang, p.deadFrames, p.stepTimer,
      p.attack ? p.attack.id : '-', p.attack ? p.attack.frame : -1,
      p.attack ? p.attack.hits.length : 0, p.actionLock,
      p.weapon === undefined ? '-' : p.weapon,
      p.carriedBlueprint === undefined || p.carriedBlueprint === null ? '-' : p.carriedBlueprint,
      p.wallJumpLock === undefined ? 0 : p.wallJumpLock,
      p.ledgeGrabLock === undefined ? 0 : p.ledgeGrabLock,
      p.ledgeHang === undefined ? 0 : p.ledgeHang,
      p.maxHp === undefined ? 0 : p.maxHp,
      p.stats ? p.stats.ember : 0, p.stats ? p.stats.umbral : 0, p.stats ? p.stats.verdant : 0,
      b.x, b.y, b.w, b.h, b.vx, b.vy,
      b.onGround ? 1 : 0, b.onCeiling ? 1 : 0, b.onWall, b.dropThrough
    );
  }
  for (i = 0; i < this.targets.length; i++) {
    t = this.targets[i]; b = t.body;
    out.push(
      t.id, t.hp, t.iframes,
      t.state === undefined ? '-' : t.state,
      t.stateFrames === undefined ? 0 : t.stateFrames,
      t.cooldown === undefined ? 0 : t.cooldown,
      t.facing === undefined ? 0 : t.facing,
      t.lockFacing === undefined ? 0 : t.lockFacing,
      t.attack ? t.attack.frame : -1,
      t.rng ? t.rng.s : 0,
      // Boss-only fields (55-boss.js), '-'/0 for every regular template —
      // a real gap the judged boss design panel flagged and this project
      // left open at the time; closed here rather than left to linger.
      t.phase === undefined ? 0 : t.phase,
      t.activeMove ? t.activeMove.id : '-',
      b.x, b.y, b.vx, b.vy, b.onGround ? 1 : 0
    );
  }
  for (i = 0; i < this.shots.length; i++) {
    t = this.shots[i]; b = t.body;
    out.push(t.id, t.life, b.x, b.y, b.vx, b.vy);
  }
  for (i = 0; i < this.pickups.length; i++) {
    out.push(this.pickups[i].id, this.pickups[i].collected ? 1 : 0);
  }
  return out.join('|');
};

Sim.fallbackWorld = fallbackWorld;
C.Sim = Sim;

})(CINDER);
