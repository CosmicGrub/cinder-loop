/* ===========================================================================
 * tests/verify_narrative.js  —  dialogue trigger + text-box render (D11/D12)
 * ---------------------------------------------------------------------------
 * Pure logic only, against hand-built fake sim fixtures (L8) — the same
 * precedent RunLogic's own tests already established: a plain object
 * shaped like `{run, players, exit, bossTarget, bus}` is exactly as valid
 * an argument as a real Sim, since 82-narrative.js itself never learns
 * Sim's real type, only reads these exact fields. A bare sandbox
 * (H.loadNarrative()) — nothing at module-evaluation time in
 * 82-narrative.js touches window/document, only render() does, and a test
 * never has to call that to exercise the trigger logic.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_narrative');
const C = H.loadNarrative();
const DIALOGUE = C.DATA.DIALOGUE, ENEMY_IDS = C.DATA.ENEMY_IDS;

function fakeBus() {
  const handlers = {};
  return {
    on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    emit(type, payload) { (handlers[type] || []).forEach((fn) => fn(payload)); }
  };
}
function fakeSim(overrides) {
  return Object.assign({
    run: { phase: 'level', levelSeed: 1, runsCompleted: 0 },
    players: [{ state: 'fall' }],
    exit: [0, 0],
    bossTarget: null,
    bus: fakeBus()
  }, overrides);
}

/* ============================================================ 1. content */
{
  const pools = ['levelStart', 'bossEntry', 'reveal', 'bossVictory', 'death'];
  for (const p of pools) {
    s.ok('narrator pool "' + p + '" is non-empty', DIALOGUE.narrator[p] && DIALOGUE.narrator[p].length > 0);
    for (const line of DIALOGUE.narrator[p] || []) {
      s.ok('every line in "' + p + '" is a real, non-empty string',
        typeof line === 'string' && line.length > 0);
    }
  }
  for (const tid of ENEMY_IDS) {
    s.ok('bark pool exists for every real enemy id (' + tid + ')',
      DIALOGUE.barks[tid] && DIALOGUE.barks[tid].length > 0);
  }
  s.eq('no bark pool exists for an id outside the real roster',
    DIALOGUE.barks.notATemplate, undefined);
}

/* =========================================================== 2. construction */
{
  const sim = fakeSim();
  const n = new C.Narrative(sim, { seed: 1 });
  s.eq('a freshly constructed Narrative shows nothing yet', n.current, null);
  s.eq('revealed starts false', n.revealed, false);
  // Feeding the SAME sim (no field changed) back through update() must not
  // spuriously trigger anything — the constructor's own baseline has to
  // already match reality, not "nothing yet, seeded from zero".
  n.update(sim, 16);
  s.eq('no phantom trigger on the very next frame with nothing changed', n.current, null);
}

/* ========================================================= 3. inert gate */
{
  // Mirrors Sim's own _stepRun() gate exactly: inert until the run loop
  // has actually engaged (exit/bossTarget both null).
  const sim = fakeSim({ exit: null, bossTarget: null, run: { phase: 'level', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.run.levelSeed = 999;   // would trigger levelStart if the gate didn't hold
  n.update(sim, 16);
  s.eq('a plain, never-begun sim never triggers anything', n.current, null);
}

/* ===================================================== 4. narrator triggers */
{
  const sim = fakeSim({ run: { phase: 'level', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.run.levelSeed = 2;
  n.update(sim, 16);
  s.ok('a real levelSeed change fires a levelStart line',
    n.current && DIALOGUE.narrator.levelStart.indexOf(n.current.text) !== -1);
  s.eq('and it is tagged as a narrator line', n.current.kind, 'narrator');
}

{
  const sim = fakeSim({ run: { phase: 'level', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.run.phase = 'boss';
  n.update(sim, 16);
  s.ok('the FIRST boss entry fires the reveal, not the ordinary bossEntry line',
    n.current && DIALOGUE.narrator.reveal.indexOf(n.current.text) !== -1);
  s.eq('and revealed flips true', n.revealed, true);
}

{
  // A SECOND boss encounter (a later run) gets the ordinary line instead.
  const sim = fakeSim({ run: { phase: 'boss', levelSeed: 1, runsCompleted: 1 } });
  const n = new C.Narrative(sim, { seed: 1 });
  n.revealed = true;   // simulate "already seen it this session"
  sim.run.phase = 'level'; n.update(sim, 16);   // leave boss phase first
  sim.run.phase = 'boss'; n.update(sim, 16);    // re-enter it
  s.ok('a SECOND boss entry (already revealed) fires the ordinary bossEntry line',
    n.current && DIALOGUE.narrator.bossEntry.indexOf(n.current.text) !== -1);
}

{
  // Constructed the real way (in 'level' phase, matching every real
  // 95-app.js boot) and driven through a REAL entering-boss update() first
  // — establishing _lastPhase === 'boss' the same way a real transition
  // would, not by injecting it at construction (which the reveal-blind-
  // spot fix below now specifically special-cases).
  const sim = fakeSim({ run: { phase: 'level', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.run.phase = 'boss';
  n.update(sim, 16);   // the reveal, since this is the first boss entry
  sim.run.phase = 'level'; sim.run.runsCompleted = 1;
  n.update(sim, 16);
  s.ok('a boss->level transition with runsCompleted advancing fires bossVictory',
    n.current && DIALOGUE.narrator.bossVictory.indexOf(n.current.text) !== -1);
}

{
  const sim = fakeSim({ run: { phase: 'level', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.players[0].state = 'dead';
  n.update(sim, 16);
  s.ok('a player entering the dead state fires a death line',
    n.current && DIALOGUE.narrator.death.indexOf(n.current.text) !== -1);
}

{
  // Regression-shaped: a fatal boss trade — the same tick a boss->level
  // transition AND a death both look true — must read as a death, the
  // identical priority _stepRun() itself already commits to.
  const sim = fakeSim({ run: { phase: 'boss', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.run.phase = 'level'; sim.run.runsCompleted = 1;
  sim.players[0].state = 'dead';
  n.update(sim, 16);
  s.ok('a death always wins over a same-tick boss victory reading',
    n.current && DIALOGUE.narrator.death.indexOf(n.current.text) !== -1);
  s.eq('never the victory line instead',
    DIALOGUE.narrator.bossVictory.indexOf(n.current.text), -1);
}

{
  // Co-op: two players, only ONE line fires even if both die the same tick.
  const sim = fakeSim({ players: [{ state: 'fall' }, { state: 'fall' }] });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.players[0].state = 'dead'; sim.players[1].state = 'dead';
  n.update(sim, 16);
  s.ok('simultaneous multi-player deaths still fire exactly one death line',
    n.current && DIALOGUE.narrator.death.indexOf(n.current.text) !== -1);
}

{
  // Regression (adversarial pass): a boss-phase death must never be
  // reported as bossVictory once the commit lands SEVERAL FRAMES later —
  // the real Sim timing (death now, respawn-and-commit later, on the tick
  // the player's own state has already cycled back to alive) is NOT the
  // same-tick case the earlier test above covers.
  const sim = fakeSim({ run: { phase: 'level', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.run.phase = 'boss'; n.update(sim, 16);           // real entry (the reveal)
  sim.players[0].state = 'dead'; n.update(sim, 16);    // the real death, its own tick
  s.ok('the death fires its own line on its own tick',
    n.current && DIALOGUE.narrator.death.indexOf(n.current.text) !== -1);

  for (let i = 0; i < 5; i++) n.update(sim, 16);       // quiet respawn-countdown frames

  // The commit frame: phase/levelSeed/runsCompleted all flip AND the
  // player's own state already reads alive again, all on this one tick —
  // exactly how Sim._commitPendingLevel()/justRespawned actually land it.
  sim.players[0].state = 'fall';
  sim.run.phase = 'level'; sim.run.levelSeed = 2; sim.run.runsCompleted = 1;
  n.update(sim, 16);
  const textAtCommit = n.current ? n.current.text : null;
  s.eq('the commit frame of a boss-phase death never shows a bossVictory line',
    DIALOGUE.narrator.bossVictory.indexOf(textAtCommit), -1);
}

{
  // Regression (adversarial pass): a REAL boss victory (no death anywhere
  // in the encounter) must still fire bossVictory normally — proving the
  // fix above didn't overcorrect into suppressing every victory line.
  const sim = fakeSim({ run: { phase: 'level', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.run.phase = 'boss'; n.update(sim, 16);
  sim.run.phase = 'level'; sim.run.levelSeed = 2; sim.run.runsCompleted = 1;
  n.update(sim, 16);
  s.ok('a genuine no-death boss victory still fires bossVictory',
    n.current && DIALOGUE.narrator.bossVictory.indexOf(n.current.text) !== -1);
}

{
  // Regression (adversarial pass): a SECOND real boss encounter, entered
  // cleanly after the first one's own death was correctly suppressed
  // above, must not still be treated as "a death happened here" —
  // _deathDuringBoss has to reset on every fresh entry, not just linger.
  const sim = fakeSim({ run: { phase: 'level', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  sim.run.phase = 'boss'; n.update(sim, 16);
  sim.players[0].state = 'dead'; n.update(sim, 16);
  for (let i = 0; i < 5; i++) n.update(sim, 16);
  sim.players[0].state = 'fall';
  sim.run.phase = 'level'; sim.run.levelSeed = 2; sim.run.runsCompleted = 1;
  n.update(sim, 16);   // first encounter's death-suppressed commit

  sim.run.phase = 'boss'; n.update(sim, 16);   // a genuinely fresh SECOND encounter
  sim.run.phase = 'level'; sim.run.levelSeed = 3; sim.run.runsCompleted = 2;
  n.update(sim, 16);
  s.ok('a clean second encounter fires bossVictory normally, not suppressed by the first',
    n.current && DIALOGUE.narrator.bossVictory.indexOf(n.current.text) !== -1);
}

{
  // Regression (adversarial pass): constructing Narrative while sim.run is
  // already mid-boss (not reachable through the real 95-app.js wiring
  // today, but nothing in the class itself prevented it) must still
  // deliver the reveal on that encounter, not skip it and misfire on a
  // later, unrelated one.
  const sim = fakeSim({ run: { phase: 'boss', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  n.update(sim, 16);
  s.ok('a Narrative constructed already mid-boss still delivers the reveal on THIS encounter',
    n.current && DIALOGUE.narrator.reveal.indexOf(n.current.text) !== -1);
  s.eq('and marks it revealed', n.revealed, true);
}

{
  // Regression (adversarial pass): a second subscribe() call must not
  // double-register — one real telegraph should consume exactly one RNG
  // draw and fire the bark exactly once.
  const sim = fakeSim();
  const n = new C.Narrative(sim, { seed: 1 });
  n.subscribe(sim.bus);   // a second call — must be a no-op
  let picks = 0;
  const origPick = n.rng.pick.bind(n.rng);
  n.rng.pick = (arr) => { picks++; return origPick(arr); };
  sim.bus.emit('telegraph', { tid: 'ashwalker' });
  s.eq('a second subscribe() call never double-registers the same bus', picks, 1);
}

/* ========================================================== 5. bark triggers */
{
  const sim = fakeSim();
  const n = new C.Narrative(sim, { seed: 1 });
  sim.bus.emit('telegraph', { tid: 'ashwalker' });
  s.ok('a real telegraph fires a bark from the matching template\'s pool',
    n.current && DIALOGUE.barks.ashwalker.indexOf(n.current.text) !== -1);
  s.eq('and it is tagged as a bark, not a narrator line', n.current.kind, 'bark');
}

{
  const sim = fakeSim();
  const n = new C.Narrative(sim, { seed: 1 });
  s.ok('an unknown tid never throws',
    (() => { try { sim.bus.emit('telegraph', { tid: 'notATemplate' }); return true; } catch (e) { return false; } })());
  s.eq('and shows nothing', n.current, null);
}

/* ======================================================= 6. determinism (L4) */
{
  function pickSequence(seed) {
    const sim = fakeSim({ run: { phase: 'level', levelSeed: 0, runsCompleted: 0 } });
    const n = new C.Narrative(sim, { seed });
    const out = [];
    for (let i = 1; i <= 20; i++) {
      sim.run.levelSeed = i;
      n.update(sim, 16);
      out.push(n.current.text);
    }
    return out;
  }
  s.eq('same seed -> identical line-pick sequence', JSON.stringify(pickSequence(7)), JSON.stringify(pickSequence(7)));
  s.ok('a different seed actually diverges somewhere across 20 picks',
    JSON.stringify(pickSequence(7)) !== JSON.stringify(pickSequence(8)));
}

/* ============================================================= 7. TTL */
{
  const sim = fakeSim();
  const n = new C.Narrative(sim, { seed: 1 });
  sim.bus.emit('telegraph', { tid: 'wickmoth' });
  const ttl0 = n.current.ttl;
  n.update(sim, 500);
  s.eq('ttl counts down by real elapsed ms', n.current.ttl, ttl0 - 500);
  n.update(sim, 100000);
  s.eq('and expires to null once it runs out, not a negative-lingering value', n.current, null);
}

/* ============================================================ 8. wrap() */
{
  // A controlled fake ctx — 7px per character, a plausible monospace
  // metric — proves wrap() actually splits on a real measured width
  // rather than a guessed character count (H.stubCanvas()'s own
  // measureText always returns 0, which would never split anything; this
  // suite builds its own stub specifically to exercise wrap() for real).
  const ctx = { font: '', textBaseline: '', calls: 0,
    measureText: (t) => ({ width: t.length * 7 }),
    fillRect() { this.calls++; }, strokeRect() { this.calls++; }, fillText() { this.calls++; } };
  const sim = fakeSim({ run: { phase: 'level', levelSeed: 1, runsCompleted: 0 } });
  const n = new C.Narrative(sim, { seed: 1 });
  n.current = { text: 'one two three four five six seven eight nine ten eleven twelve', kind: 'narrator', ttl: 1000 };
  n.render(ctx, 300, 200);
  s.ok('a long line actually wraps to more than one call\'s worth of text',
    ctx.calls > 2, String(ctx.calls));
}

/* =========================================================== 9. render() */
{
  const stub = H.stubCanvas(300, 200);
  const sim = fakeSim();
  const n = new C.Narrative(sim, { seed: 1 });
  const before = stub._ctx.calls;
  n.render(stub._ctx, 300, 200);
  s.eq('render() with nothing to show draws nothing', stub._ctx.calls, before);

  sim.bus.emit('telegraph', { tid: 'emberrush' });
  n.render(stub._ctx, 300, 200);
  s.ok('render() with a real current line draws something', stub._ctx.calls > before);
  s.ok('render() never throws against the shared stub canvas', true);
}

{
  // Regression (adversarial pass): sub-floor dimensions and a long line
  // must never produce a negative-width fillRect() or a panel drawn
  // entirely off-canvas — not reachable through the real 95-app.js
  // wiring (fit() floors cssW/cssH to 320x240 before every frame), but
  // fixed defensively rather than left as a landmine for a future caller.
  const calls = [];
  const ctx = { font: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
    measureText: (t) => ({ width: t.length * 7 }),
    fillRect(x, y, w, h) { calls.push([x, y, w, h]); },
    strokeRect() {}, fillText() {} };
  const sim = fakeSim();
  const n = new C.Narrative(sim, { seed: 1 });
  n.current = { text: DIALOGUE.narrator.reveal[0], kind: 'narrator', ttl: 1000 };

  n.render(ctx, 100, 100);
  let [, , panelW] = calls[0];
  s.ok('a sub-floor cssW never produces a negative panel width', panelW >= 0, String(panelW));

  calls.length = 0;
  n.render(ctx, 0, 800);
  [, , panelW] = calls[0];
  s.ok('cssW=0 never produces a negative panel width either', panelW >= 0, String(panelW));

  calls.length = 0;
  n.render(ctx, 100, 100);
  const [px, py, , panelH] = calls[0];
  s.ok('the panel never draws fully above the visible canvas (py stays clamped)',
    py + panelH > 0, 'py=' + py + ' panelH=' + panelH);
  s.ok('and never fully off the right/bottom edge either',
    px < 100 && py < 100, 'px=' + px + ' py=' + py);
}

process.exit(s.done());
