/* ===========================================================================
 * 82-narrative.js  —  dialogue trigger + text-box render (D11/D12)
 * ---------------------------------------------------------------------------
 * PRESENTER layer, entirely — the module stack diagram places this file
 * below the PRESENTER BOUNDARY line for exactly the reason D11 states:
 * "chosen text has zero effect on sim state, so it costs nothing in
 * hash()/determinism." This file never writes a single field on Sim,
 * Player, Enemy, or any sim object — it only ever READS them, the same
 * one-way relationship 80-view.js already has with the sim it draws.
 *
 * Two pools (D11): a recurring narrator voice (the Kilnkeeper), triggered
 * at run milestones, and short per-template enemy ambient barks, both
 * line-picked via a seeded RNG this file owns ITSELF — never `sim.rng`.
 * Drawing from the sim's own live stream from presenter code would consume
 * a real draw from a resource gameplay determinism depends on, for a
 * decision gameplay is explicitly not supposed to depend on at all (L4/L5)
 * — the same reasoning `pickStatColour` already established for consuming
 * `sim.rng` correctly (from SIM code) applies in reverse here: presenter
 * code gets its OWN stream instead.
 *
 * Milestones are detected by polling `sim.run`'s own already-existing
 * fields each frame (phase, levelSeed, runsCompleted) and each player's
 * own `state`, the identical "remember the last value, compare, act on the
 * edge" technique `Sim.prototype._stepRun()` already uses for
 * justDied/justRespawned — chosen deliberately over adding new Bus events,
 * matching `60-run.js`'s own "zero new Bus events" precedent one file
 * further: this feature needs zero changes to ANY sim file to work at all.
 * A death always wins over a level/boss transition on the same tick,
 * mirroring `_stepRun()`'s own identical priority rule exactly (a fatal
 * boss trade must read as a death, not a victory).
 *
 * D12: the villain reveal fires once, the first time `sim.run.phase`
 * becomes `'boss'` — SESSION-scoped only, not persisted across a reload, a
 * real, named simplification (see "what was deliberately not done" in the
 * changelog) that keeps this file's own promise of zero effect on sim
 * state genuinely true: a persisted version would need a real Sim/Meta
 * method to mark it (L5), the exact kind of sim-side surface this file is
 * designed to need none of.
 *
 * Owned by: Narrative team.
 * ======================================================================== */
;(function (C) {
'use strict';

var RNG = C.RNG, DIALOGUE = C.DATA.DIALOGUE;

// Presenter-only display timing — the identical "a local constant in the
// file that owns it, not promoted to the shared CFG" convention
// 94-touch.js's own Stick hysteresis (ENTER/EXIT) already established;
// CFG is reserved for the SIMULATION's own tunables (00-core.js's own
// header), and how long a text box stays up has no bearing on the sim at
// all. Named design judgments, not measurements — no capture plate for
// "how long should a line of dialogue stay readable" any more than one
// exists for GEN_MIN_FIGHT_TILES. Barks are shorter than narrator lines on
// purpose (a bark is a beat, not a paragraph); the reveal gets the longest
// window of anything in this file, deliberately, because it's the one
// line this whole system exists to land.
var BARK_TTL_MS = 1800;
var LINE_TTL_MS = 4200;
var REVEAL_TTL_MS = 6000;

var PALETTE = {
  panel: 'rgba(18,14,12,0.82)',
  panelEdge: 'rgba(200,150,90,0.35)',
  narrator: '#e8c9a0',
  bark: '#c9ada0'
};

function Narrative(sim, opts) {
  opts = opts || {};
  this.rng = new RNG(opts.seed === undefined ? 1 : opts.seed);
  this.current = null;      // { text, kind, ttl } — kind: 'narrator' | 'bark'
  this.revealed = false;    // session-scoped only (see this file's own header)
  // Adversarially found: if this class is ever constructed while sim.run
  // is already mid-boss (never true through the real 95-app.js call site,
  // which always constructs AFTER a fresh beginRun() leaves phase
  // 'level' — but nothing in the class itself prevented it), baselining
  // _lastPhase at the REAL current 'boss' would erase the "entering boss"
  // edge entirely: there would be no transition left to observe, so
  // neither the reveal nor bossEntry could ever fire for that encounter.
  // Baselining as NOT-boss instead means the very next update() correctly
  // reads it as a fresh entry, the same outcome a genuine transition would
  // produce — defensive, not exercised by the real game today.
  this._lastPhase = sim.run.phase === 'boss' ? null : sim.run.phase;
  this._lastLevelSeed = sim.run.levelSeed;
  this._lastRunsCompleted = sim.run.runsCompleted;
  // Tracks whether a death has happened since the CURRENT boss encounter
  // began, independent of whether that player's own state has already
  // cycled back to alive by the time the run-end commit lands several
  // frames later (Player's own respawn machinery, unmodified, always
  // finishes before a solo run's own commit can land — a death always
  // ends the run, so the player is always mid-respawn or freshly
  // respawned by then, never still reading 'dead'). Without this, the
  // commit-frame's own boss->level + runsCompleted-advanced signature is
  // field-for-field identical whether the run ended in victory or death —
  // a real, adversarially-found gap: the "death wins" priority below only
  // ever held WITHIN one update() call, not across the real multi-frame
  // death/respawn/commit sequence Sim actually stages.
  this._deathDuringBoss = false;
  this._wasDead = [];
  var i;
  for (i = 0; i < sim.players.length; i++) this._wasDead.push(sim.players[i].state === 'dead');
  this.subscribe(sim.bus);
}

/* The only Bus subscription this file needs — an enemy's own 'telegraph'
 * (45-enemy.js) already fires at the exact moment the fairness rule
 * commits its attack (D9's own MIN_TELEGRAPH floor), which is already the
 * natural "announcing itself" beat a bark belongs on; no second signal is
 * invented for the same moment. Idempotent — a second call is a silent
 * no-op rather than a second registration. Adversarially found: nothing
 * originally stopped a second subscribe() call on the same instance/bus
 * from registering a second closure, which would have made one real
 * telegraph fire _bark() (and consume this.rng) twice — the constructor
 * is still the only real call site today, but guarding here costs nothing
 * and closes the gap for any future one. */
Narrative.prototype.subscribe = function (bus) {
  if (this._subscribed) return this;
  this._subscribed = true;
  var self = this;
  bus.on('telegraph', function (e) { self._bark(e.tid); });
  return this;
};

Narrative.prototype._bark = function (tid) {
  var lines = DIALOGUE.barks[tid];
  if (!lines || !lines.length) return;
  this._show(this.rng.pick(lines), 'bark', BARK_TTL_MS);
};

Narrative.prototype._say = function (pool, ttl) {
  var lines = DIALOGUE.narrator[pool];
  if (!lines || !lines.length) return;
  this._show(this.rng.pick(lines), 'narrator', ttl);
};

Narrative.prototype._show = function (text, kind, ttl) {
  this.current = { text: text, kind: kind, ttl: ttl };
};

/* Called once per rendered frame (95-app.js's own frame(), alongside
 * view.render()) — NOT once per sim tick. Milestone polling is therefore a
 * frame-cadence concern, matching every other presenter-side timer in this
 * project (view.particles, the accumulator's own dt). `ms`: real elapsed
 * milliseconds since the last frame, the same value 95-app.js's own
 * accumulator already computes for itself — reused, not re-measured.
 *
 * A named limitation, not silently absorbed: because this reads the sim
 * only ONCE per frame, several real sim transitions landing within a
 * single frame's worth of ticks (the accumulator can call sim.step()
 * more than once per frame) can only ever surface the LAST one here — an
 * intermediate milestone within that same frame is invisible to a
 * once-per-frame poll. Cosmetic only (D11: zero effect on sim state), and
 * the scenario itself (multiple real run-loop transitions inside one
 * ~16ms frame) is not a case this file's own scope takes on solving. */
Narrative.prototype.update = function (sim, ms) {
  if (this.current) {
    this.current.ttl -= ms;
    if (this.current.ttl <= 0) this.current = null;
  }

  // Inert exactly when the run loop itself is (70-sim.js's own gate on
  // _stepRun()) — nothing here can fire before beginRun() has engaged it.
  if (sim.exit === null && sim.bossTarget === null) return;

  var justAnyDied = false, i, isDead;
  for (i = 0; i < sim.players.length; i++) {
    isDead = sim.players[i].state === 'dead';
    if (isDead && !this._wasDead[i]) justAnyDied = true;
    this._wasDead[i] = isDead;
  }

  // A death always wins over a level/boss transition — the identical
  // priority _stepRun() itself already commits to. This has to hold
  // across the real MULTI-FRAME sequence Sim actually stages, not just
  // within one update() call: a boss-phase death and the eventual commit
  // land on DIFFERENT frames (the player's own respawn machinery, several
  // frames of countdown, always finishes before the commit does — see
  // 60-run.js's own justRespawned/_commitPendingLevel() timing), so by the
  // time the commit frame is polled here, players[i].state already reads
  // alive again either way. _deathDuringBoss is what actually remembers a
  // death happened this encounter, since the field set this file is
  // allowed to read (run.phase/levelSeed/runsCompleted, players[i].state)
  // is otherwise field-for-field identical for a victory and a
  // boss-phase death by the time their shared commit-frame signature
  // (boss->level, runsCompleted advanced) is observed. A real,
  // adversarially-found gap: the same-tick case alone (already tested)
  // does not cover this.
  if (justAnyDied) {
    this._say('death', LINE_TTL_MS);
    if (sim.run.phase === 'boss') this._deathDuringBoss = true;
  } else if (sim.run.phase === 'boss' && this._lastPhase !== 'boss') {
    this._deathDuringBoss = false;   // a fresh encounter starts clean
    if (!this.revealed) {
      this.revealed = true;
      this._say('reveal', REVEAL_TTL_MS);
    } else {
      this._say('bossEntry', LINE_TTL_MS);
    }
  } else if (this._lastPhase === 'boss' && sim.run.phase === 'level'
             && sim.run.runsCompleted !== this._lastRunsCompleted) {
    // A death already covered this encounter's own narration (above, on
    // the real tick it happened) — no second line needed at the commit
    // itself, and definitely never the triumphant one.
    if (!this._deathDuringBoss) this._say('bossVictory', LINE_TTL_MS);
    this._deathDuringBoss = false;
  } else if (sim.run.phase === 'level' && sim.run.levelSeed !== this._lastLevelSeed) {
    this._say('levelStart', LINE_TTL_MS);
  }

  this._lastPhase = sim.run.phase;
  this._lastLevelSeed = sim.run.levelSeed;
  this._lastRunsCompleted = sim.run.runsCompleted;
};

/* Bottom-anchored, centered text box — the same panel/font language
 * 92-menu.js's own render() already established (a translucent panel, a
 * hairline edge, ui-monospace), not a second visual vocabulary invented
 * for one more presenter file. Narrator lines and barks share the box,
 * distinguished only by ink colour — a bark does not need its own frame
 * to read as a different kind of line from the Kilnkeeper's own voice. */
Narrative.prototype.render = function (ctx, cssW, cssH) {
  if (!this.current) return this;

  var text = this.current.text;
  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'top';
  var maxW = Math.min(cssW - 48, 460);
  var lines = wrap(ctx, text, maxW);
  var lineH = 16;
  var panelW = maxW + 24;
  var panelH = lines.length * lineH + 16;
  var px = Math.round((cssW - panelW) / 2);
  var py = cssH - panelH - 28;
  // Defensive clamping — adversarially found: with no floor, a sub-floor
  // cssW (below 48) drives panelW negative (fed straight to fillRect), and
  // a tall enough panelH (a long line at a short cssH) can push py far
  // enough negative to draw the ENTIRE panel off-canvas — including,
  // worst case, the one line this whole system exists to land (D12's
  // reveal). Not reachable today: 95-app.js's own fit() unconditionally
  // floors cssW/cssH to 320x240 before every frame (verify_render.js's
  // own device-metric sweep already proves this holds even for a 200x150
  // override), and every real DIALOGUE line stays comfortably inside that
  // floor's own panel bounds. Clamped anyway, the same "real but not
  // currently reachable, fixed rather than left as a landmine" call this
  // project already made for 65-meta.js's own opts.meta reference-sharing
  // gap (§5m) — render() should not have to trust every future caller to
  // already know 95-app.js's own floor.
  panelW = Math.max(panelW, 40);
  px = Math.max(4, Math.min(px, cssW - panelW - 4));
  py = Math.max(4, Math.min(py, cssH - panelH - 4));

  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(px, py, panelW, panelH);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);

  ctx.fillStyle = this.current.kind === 'narrator' ? PALETTE.narrator : PALETTE.bark;
  var i;
  for (i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], px + 12, py + 8 + i * lineH);
  }
  return this;
};

// Word wrap against a real measured width (ctx.measureText), not a
// guessed character count — a monospace font makes a character-count
// guess tempting, but the box still has to hold up if the font ever
// changes. Pure aside from the ctx.measureText calls, so it is exercised
// directly by verify_narrative against a stub context exactly as
// tests/harness.js's own stubCanvas already provides for other suites.
function wrap(ctx, text, maxW) {
  var words = text.split(' '), lines = [], cur = '';
  var i, test;
  for (i = 0; i < words.length; i++) {
    test = cur ? cur + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = words[i];
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

C.Narrative = Narrative;

})(CINDER);
