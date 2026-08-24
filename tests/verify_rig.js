/* ===========================================================================
 * tests/verify_rig.js  —  the hitbox bake, and the audit that guards it
 * ---------------------------------------------------------------------------
 * Two jobs. First, that the real moves bake into something sane and pass the
 * overreach audit clean (D6). Second — and this is the half that matters —
 * that the audit CAN FAIL. An audit over boxes derived from the animation is
 * structurally hard to violate, which is exactly the condition under which a
 * check quietly becomes a no-op and nobody notices for a year. So every rule
 * is fired at a deliberately poisoned bake and must catch it.
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_rig');

const C = H.loadSim();
const { Rig, RIG, CFG } = C;

// A mutable copy of one baked move, so a rule can be fed a broken bake. The
// real bake is frozen; this is the only way to test the audit at all.
function corrupt(id, fn) {
  const m = RIG.move(id);
  const copy = {
    id: m.id, data: m.data, frames: m.frames, poses: m.poses,
    boxes: m.boxes.slice(), speeds: m.speeds.slice(),
    active: m.active.slice(), chainFrom: m.chainFrom
  };
  fn(copy);
  const out = {};
  out[id] = copy;
  return out;
}
const rules = (violations) => violations.map((v) => v.rule);

/* ------------------------------------------------------------- the bake */
{
  s.eq('fifteen moves are baked (four weapons + one enemy move)', RIG.ids().length, 15);
  s.ok('every declared move baked',
    ['slashA', 'slashB', 'heavy', 'clawA',
     'daggerA', 'daggerB', 'daggerC', 'daggerHeavy',
     'maulA', 'maulHeavy',
     'spearA', 'spearB', 'spearC', 'spearD', 'spearHeavy'].every((id) => !!RIG.move(id)));

  s.eq('slashA frame count', RIG.move('slashA').frames, 10);
  s.eq('slashB frame count', RIG.move('slashB').frames, 8);
  s.eq('heavy frame count', RIG.move('heavy').frames, 16);
  s.eq('clawA frame count', RIG.move('clawA').frames, 11);
  s.eq('daggerA frame count', RIG.move('daggerA').frames, 7);
  s.eq('daggerB frame count', RIG.move('daggerB').frames, 6);
  s.eq('daggerC frame count', RIG.move('daggerC').frames, 7);
  s.eq('daggerHeavy frame count', RIG.move('daggerHeavy').frames, 12);
  s.eq('maulA frame count', RIG.move('maulA').frames, 13);
  s.eq('maulHeavy frame count', RIG.move('maulHeavy').frames, 14);
  s.eq('spearA frame count', RIG.move('spearA').frames, 8);
  s.eq('spearB frame count', RIG.move('spearB').frames, 7);
  s.eq('spearC frame count', RIG.move('spearC').frames, 7);
  s.eq('spearD frame count', RIG.move('spearD').frames, 7);
  s.eq('spearHeavy frame count', RIG.move('spearHeavy').frames, 9);

  // An enemy move is baked and audited on ITS OWN proportions, not the
  // player's — L9 is not a rule about the protagonist.
  s.ok('the enemy move declares its own geometry', !!RIG.move('clawA').data.geom);
  s.eq('clawA active frames', RIG.move('clawA').active.join(','), '5,6,7');

  // A second WEAPON (D7) declares its own geometry too — a shorter blade,
  // not a new engine capability — and gets the exact same fairness scrutiny
  // as the default one: baked, never hand-authored, audited generically.
  s.ok('the second weapon declares its own geometry', !!RIG.move('daggerA').data.geom);
  s.eq('the twin daggers use a shorter blade than the default weapon',
    RIG.move('daggerA').data.geom.blade < CFG.RIG_BLADE, true);

  // Weapons #3 and #4 (D9's roster is now complete). Same scrutiny again —
  // baked, audited, no hand-authored box — and the roster's reach now spans
  // a real order: daggers < default < warmaul < thornspear.
  s.ok('the third weapon declares its own geometry', !!RIG.move('maulA').data.geom);
  s.ok('the fourth weapon declares its own geometry', !!RIG.move('spearA').data.geom);
  s.ok('reach is strictly ordered across the whole roster',
    RIG.move('daggerA').data.geom.blade < CFG.RIG_BLADE &&
    CFG.RIG_BLADE < RIG.move('maulA').data.geom.blade &&
    RIG.move('maulA').data.geom.blade < RIG.move('spearA').data.geom.blade,
    RIG.move('daggerA').data.geom.blade + ' < ' + CFG.RIG_BLADE + ' < ' +
    RIG.move('maulA').data.geom.blade + ' < ' + RIG.move('spearA').data.geom.blade);
  s.eq('warmaul\'s light move ends its own chain (no combo)', Rig.MOVES.maulA.chain, null);
  s.eq('thornspear chains four hits deep', Rig.MOVES.spearA.chain, 'spearB');
  s.eq('thornspear\'s second hit chains onward too', Rig.MOVES.spearB.chain, 'spearC');
  s.eq('thornspear\'s third hit chains onward too', Rig.MOVES.spearC.chain, 'spearD');
  s.eq('thornspear\'s fourth hit ends the chain', Rig.MOVES.spearD.chain, null);

  // The active windows are CONSEQUENCES of the poses, not typed anywhere.
  // Pinning them here is what turns "I nudged a keyframe" into a visible diff.
  s.eq('slashA active frames', RIG.move('slashA').active.join(','), '4,5,6');
  s.eq('slashB active frames', RIG.move('slashB').active.join(','), '3,4,5');
  s.eq('heavy active frames', RIG.move('heavy').active.join(','), '9,10,11');
  s.eq('daggerA active frames', RIG.move('daggerA').active.join(','), '2,3');
  s.eq('daggerB active frames', RIG.move('daggerB').active.join(','), '2,3,4');
  s.eq('daggerC active frames', RIG.move('daggerC').active.join(','), '2,3');
  s.eq('daggerHeavy active frames', RIG.move('daggerHeavy').active.join(','), '6,7,8');
  s.eq('maulA active frames', RIG.move('maulA').active.join(','), '7,8,9');
  s.eq('maulHeavy active frames', RIG.move('maulHeavy').active.join(','), '8,9,10');
  s.eq('spearA active frames', RIG.move('spearA').active.join(','), '4,5,6');
  s.eq('spearB active frames', RIG.move('spearB').active.join(','), '3,4');
  s.eq('spearC active frames', RIG.move('spearC').active.join(','), '3,4');
  s.eq('spearD active frames', RIG.move('spearD').active.join(','), '3,4');
  s.eq('spearHeavy active frames', RIG.move('spearHeavy').active.join(','), '5,6,7');

  for (const id of RIG.ids()) {
    const m = RIG.move(id);
    s.ok(id + ' can hit something', m.active.length > 0, m.active.length + ' active frames');
    s.ok(id + ' has startup before its first hit', m.active[0] > 0, 'first active frame ' + m.active[0]);
    s.ok(id + ' has recovery after its last', m.active[m.active.length - 1] < m.frames - 1);
  }
}
{
  // A box exists on exactly the frames where the blade is swinging.
  let mismatched = 0, boxed = 0;
  for (const id of RIG.ids()) {
    const m = RIG.move(id);
    for (let i = 0; i < m.frames; i++) {
      const fast = m.speeds[i] >= CFG.RIG_ACTIVE_SPEED;
      if (!!m.boxes[i] !== fast) mismatched++;
      if (m.boxes[i]) boxed++;
    }
  }
  s.eq('boxes appear exactly on swinging frames', mismatched, 0);
  s.eq('and there are boxes at all', boxed, 40);

  s.ok('baked boxes are frozen', Object.isFrozen(RIG.move('slashA').boxes[4]));
  s.ok('baked moves are frozen', Object.isFrozen(RIG.move('slashA')));
}
{
  // Geometry sanity: a sword out-reaches the body, but not by a silly amount.
  const env = RIG.envelope;
  s.ok('the blade reaches past the body', env.x1 > CFG.PLAYER_W, 'x1 ' + env.x1.toFixed(1));
  s.between('reach is about two tiles, not ten', env.x1, 20, 40);
  s.ok('the envelope is finite', [env.x0, env.y0, env.x1, env.y1].every(Number.isFinite));

  const box = RIG.move('slashA').boxes[4];
  s.ok('a box has real area', (box.x1 - box.x0) > 1 && (box.y1 - box.y0) > 1,
    (box.x1 - box.x0).toFixed(1) + 'x' + (box.y1 - box.y0).toFixed(1));
}
{
  // A real pattern the weapons #3/#4 design panel discovered by reading this
  // table, not one dictated in advance: blade's light chain (slashA+slashB)
  // and daggers' (daggerA+B+C) already total the same 13 base damage despite
  // different hit counts. Warmaul's single hit and Thornspear's four-hit
  // chain both extend the same total — hit count is what varies per weapon,
  // not the light chain's overall damage budget. Pinned here as a real,
  // checkable fact about the shipped data, not asserted as a rule the engine
  // enforces (nothing in 35-rig.js or 40-combat.js requires it).
  const chainTotal = (id) => {
    let total = 0, cur = Rig.MOVES[id];
    for (;;) { total += cur.damage; if (!cur.chain) break; cur = Rig.MOVES[cur.chain]; }
    return total;
  };
  s.eq('blade\'s light chain totals 13', chainTotal('slashA'), 13);
  s.eq('daggers\' light chain totals 13', chainTotal('daggerA'), 13);
  s.eq('warmaul\'s one-hit "chain" totals 13', chainTotal('maulA'), 13);
  s.eq('thornspear\'s four-hit chain totals 13', chainTotal('spearA'), 13);
}
{
  // L9, structurally: the source table holds poses and nothing else.
  let authored = 0;
  for (const id of Object.keys(Rig.MOVES)) {
    const data = Rig.MOVES[id];
    for (const k of Object.keys(data)) if (/^(box|hitbox|hurtbox|reach)$/i.test(k)) authored++;
    for (const f of data.frames) if (!Array.isArray(f) || f.length !== 3) authored++;
  }
  s.eq('the move table declares no hitboxes', authored, 0);

  s.eq('slashA chains into slashB', Rig.MOVES.slashA.chain, 'slashB');
  s.eq('slashB is the end of the chain', Rig.MOVES.slashB.chain, null);
  const a = RIG.move('slashA');
  s.ok('the chain window opens after the swing', a.chainFrom > a.active[a.active.length - 1],
    'chainFrom ' + a.chainFrom);
  s.ok('and before the move ends', a.chainFrom < a.frames);
}

/* ----------------------------------------------- the audit, on real moves */
{
  const v = RIG.audit();
  s.eq('the shipped moves pass the audit', v.length, 0,
    v.length ? v.map((x) => x.move + '#' + x.frame + ' ' + x.rule + ': ' + x.detail).join(' | ') : 'clean');

  // Windup legally goes behind the character; it just must not carry a box.
  const heavy = RIG.move('heavy');
  const windupBehind = heavy.poses.slice(0, 8).some((p) => p.tip[0] < 0);
  s.ok('windup does take the blade behind', windupBehind);
  s.ok('but no windup frame carries a box', heavy.boxes.slice(0, 8).every((b) => b === null));
}

/* ------------------------------------------ the audit, on poisoned bakes */
{
  // OVERREACH: pad a box outward. This is the IRON CIRCUIT v1.3 failure —
  // 56 of 56 moves with hitboxes larger than the weapon drawn.
  const fat = corrupt('slashA', (m) => {
    const b = m.boxes[4];
    m.boxes[4] = { x0: b.x0 - 8, y0: b.y0 - 8, x1: b.x1 + 8, y1: b.y1 + 8 };
  });
  s.ok('audit catches an inflated box', rules(Rig.audit(fat)).includes('overreach'),
    rules(Rig.audit(fat)).join(',') || 'MISSED');

  // Even a small pad. A generous box is generous by one pixel at a time.
  const slightly = corrupt('slashA', (m) => {
    const b = m.boxes[4];
    m.boxes[4] = { x0: b.x0, y0: b.y0, x1: b.x1 + CFG.RIG_SKIN + 0.5, y1: b.y1 };
  });
  s.ok('audit catches a one-pixel pad', rules(Rig.audit(slightly)).includes('overreach'));

  // ...but not within the stated skin, or the rule would be unusable.
  const within = corrupt('slashA', (m) => {
    const b = m.boxes[4];
    m.boxes[4] = { x0: b.x0, y0: b.y0, x1: b.x1 + CFG.RIG_SKIN * 0.5, y1: b.y1 };
  });
  s.eq('audit tolerates the stated skin', Rig.audit(within).length, 0);

  // BEHIND: a forward swing that would hit someone standing behind you.
  const backwards = corrupt('slashA', (m) => {
    const b = m.boxes[4];
    m.boxes[4] = { x0: b.x0 - 40, y0: b.y0, x1: b.x1, y1: b.y1 };
  });
  s.ok('audit catches a box reaching behind', rules(Rig.audit(backwards)).includes('behind'));

  // PHANTOM: a hitbox lingering on a frame where the blade has stopped.
  const lingering = corrupt('slashA', (m) => {
    m.boxes[8] = { x0: 0, y0: 0, x1: 4, y1: 4 };
  });
  s.ok('audit catches a box on a still frame', rules(Rig.audit(lingering)).includes('phantom'));

  // INERT: a move that cannot hit anything.
  const harmless = corrupt('slashA', (m) => {
    m.boxes = m.boxes.map(() => null);
    m.active = [];
  });
  s.ok('audit catches a move that can never hit', rules(Rig.audit(harmless)).includes('inert'));

  // AUTHORED: a hand-written box smuggled into the data (L9).
  const handmade = corrupt('slashA', (m) => {
    m.data = Object.assign({}, m.data, { hitbox: { x0: 0, y0: 0, x1: 30, y1: 30 } });
  });
  s.ok('audit catches an authored hitbox', rules(Rig.audit(handmade)).includes('authored'));

  const malformed = corrupt('slashA', (m) => {
    const frames = m.data.frames.slice();
    frames[0] = [-150, -20, 0, 99];
    m.data = Object.assign({}, m.data, { frames: frames });
  });
  s.ok('audit catches a malformed pose frame', rules(Rig.audit(malformed)).includes('authored'));

  // And the audit must not cry wolf on a clean copy of the same shape.
  const untouched = corrupt('slashA', () => {});
  s.eq('an untouched copy stays clean', Rig.audit(untouched).length, 0);
}

/* ------------------------------------------------------------- the figure
 * The character is posed from the same file the weapon is, so the two agree
 * about where the shoulder is. These assertions are about that agreement, and
 * about the figure never producing a joint the renderer cannot draw. */
const JOINTS = ['hip', 'chest', 'neck', 'head', 'hipF', 'kneeF', 'footF',
  'hipB', 'kneeB', 'footB', 'shoulderF', 'elbowF', 'handF',
  'shoulderB', 'elbowB', 'handB', 'tipF'];

{
  // Drive a real player through everything it can do and pose it every tick.
  // A synthetic fixture would only prove figure() handles the states I
  // remembered; this proves it handles the states the player actually enters.
  const a = H.scenario({ dummies: [[200, 588, 400]] });
  a.settle();
  const seen = new Set();
  let nonFinite = 0, noCloak = 0, posed = 0;

  for (let t = 0; t < 1500; t++) {
    a.pad().set('right', (t % 90) < 55).set('jump', t % 29 === 0)
      .set('roll', t % 61 === 0).set('down', (t % 97) > 86)
      .set('attack', t % 23 === 0);
    a.sim.step();
    seen.add(a.p().state);
    const fig = a.sim.rig.figure(a.p(), a.sim.tick);
    posed++;
    for (const key of JOINTS) {
      const p = fig[key];
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) nonFinite++;
    }
    if (!fig.cloak || fig.cloak.length < 3) noCloak++;
  }

  s.ok('the run exercised most of the state machine', seen.size >= 5,
    [...seen].sort().join(','));
  s.eq('every figure joint is finite', nonFinite, 0);
  s.eq('every figure has a cloak', noCloak, 0);
  s.ok('the figure was actually posed', posed === 1500, posed + ' poses');

  // A state with no stance silently falls back to idle, which reads as the
  // character freezing mid-action. Name them instead.
  const unstanced = [...seen].filter((st) => !Rig.STANCE[st] && st !== 'roll');
  s.eq('every state the player enters has a stance', unstanced.join(',') || '', '');
}
{
  // 'ledgeGrab' cannot be reached by the sweep above — flatWorld has no
  // wall that ever ends into a ledge, so the state is structurally
  // unreachable there (an adversarial pass found a comment in 35-rig.js
  // overclaiming this pose WAS covered by that sweep; it never was). Drive
  // a real ledgeGrab on a real constructed world instead, and pose it
  // directly, the same JOINTS/cloak check as every other state gets.
  function mantleWorld(C) {
    const w = new C.World(24, 20);
    for (let x = 0; x < 24; x++) w.set(x, 19, C.TILE.SOLID);
    for (let y = 6; y <= 12; y++) w.set(8, y, C.TILE.SOLID);
    for (let x = 9; x < 24; x++) w.set(x, 6, C.TILE.SOLID);
    return w;
  }
  const a = H.scenario({ C, world: (C2) => mantleWorld(C2), spawns: [[100, 20]], w: 24, h: 20 });
  a.settle();
  a.p().body.x = 118; a.p().body.y = 85;
  a.p().body.vx = 0; a.p().body.vy = 1;
  a.hold('right');
  let g = 0;
  while (a.p().state !== 'ledgeGrab' && g++ < 20) a.step(1);
  s.eq('a real ledgeGrab was actually reached', a.p().state, 'ledgeGrab');

  const fig = a.sim.rig.figure(a.p(), a.sim.tick);
  let nonFinite = 0;
  for (const key of JOINTS) {
    const p = fig[key];
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) nonFinite++;
  }
  s.eq('every joint of a real hanging figure is finite', nonFinite, 0);
  s.ok('a hanging figure still has a cloak', fig.cloak && fig.cloak.length >= 3);
  s.eq('figure() reports the ledgeGrab state, not a silent idle fallback', fig.state, 'ledgeGrab');
}
{
  const a = H.scenario();
  a.settle();
  const fig = a.sim.rig.figure(a.p(), 0);
  s.eq('idle reports the standing state', fig.state, 'idle');
  s.near('the front foot lands on the ground line', fig.footF[1], 22, 0.4);
  s.near('the back foot lands on the ground line', fig.footB[1], 22, 0.4);
  s.near('the front shoulder is the rig shoulder', fig.shoulderF[0], CFG.RIG_SHOULDER_X, 0.35);
  s.near('at the rig shoulder height', fig.shoulderF[1], CFG.RIG_SHOULDER_Y, 0.4);
  s.ok('the head sits above the chest', fig.head[1] < fig.chest[1]);
  s.ok('the chest sits above the hip', fig.chest[1] < fig.hip[1]);
  s.eq('idle is not curled', fig.curl, 0);
}
{
  // Mid-swing the drawn arm IS the baked arm — the same objects, not a copy
  // that could drift.
  const a = H.scenario();
  a.settle();
  a.hold('attack').step(5);
  const p = a.p();
  s.ok('mid-swing', !!p.attack, p.attack ? p.attack.id + '#' + p.attack.frame : 'none');
  const fig = a.sim.rig.figure(p, a.sim.tick);
  const pose = a.sim.rig.move(p.attack.id).poses[p.attack.frame];
  s.ok('the drawn hand is the baked hand', fig.handF === pose.hand);
  s.ok('the drawn blade tip is the baked tip', fig.tipF === pose.tip);
  s.ok('the drawn shoulder is the baked shoulder', fig.shoulderF === pose.shoulder);
}
{
  // The gait is a function of distance travelled, not of the clock. If it
  // were time-driven the feet would slide whenever speed changed.
  const fake = {
    id: 0, state: 'run', facing: 1, iframes: 0, attack: null,
    body: { x: 123, y: 586, w: 10, h: 22, vx: 2.5, vy: 0 }
  };
  const f1 = RIG.figure(fake, 10);
  const f2 = RIG.figure(fake, 9999);
  s.ok('the gait ignores the clock',
    f1.footF[0] === f2.footF[0] && f1.footF[1] === f2.footF[1]);

  fake.body.x = 141;
  const f3 = RIG.figure(fake, 10);
  s.ok('but advances with travel', f3.footF[0] !== f1.footF[0],
    f1.footF[0].toFixed(2) + ' -> ' + f3.footF[0].toFixed(2));

  fake.state = 'roll';
  const f4 = RIG.figure(fake, 10);
  s.eq('rolling curls the figure', f4.curl, 1);
  s.ok('and spins it', Number.isFinite(f4.spin));
}

/* -------------------------------------- the two bugs this pass introduced
 * Both shipped in the first draft of the figure and both are invisible to
 * every other assertion in the project, because nothing else looks at where
 * the drawing puts things. */
function poser(state, x, vx) {
  return {
    id: 0, state: state, facing: 1, iframes: 0, attack: null,
    body: { x: x === undefined ? 80 : x, y: 586, w: 10, h: 22, vx: vx || 0, vy: 0 }
  };
}
{
  // Crouch dropped the hips to 18 but left the legs at their standing angles,
  // so the figure floated 5px above the floor.
  // 'dead' is excluded on purpose: a corpse sprawls, and the renderer skips
  // it anyway. Only stances a standing character holds are checked.
  for (const st of ['idle', 'crouch']) {
    const fig = RIG.figure(poser(st), 0);
    s.near(st + ' plants the front foot', fig.footF[1], 22, 0.9);
    s.near(st + ' plants the back foot', fig.footB[1], 22, 0.9);
  }
}
{
  // The carried sword is 11px past the hand. Any rest pose that angles the
  // forearm downward buries the tip in the ground.
  const STATES = ['idle', 'run', 'jump', 'fall', 'crouch', 'slam'];
  let through = 0, worst = 0, checked = 0;
  for (const st of STATES) {
    for (let dx = 0; dx < 60; dx += 2) {      // sweeps the whole gait cycle
      const fig = RIG.figure(poser(st, 80 + dx, st === 'run' ? 2.5 : 0), 0);
      checked++;
      if (fig.tipF[1] > 22.5) { through++; if (fig.tipF[1] > worst) worst = fig.tipF[1]; }
    }
  }
  s.ok('the carried blade never reaches through the floor', through === 0,
    through ? through + ' of ' + checked + ' poses, worst tip y ' + worst.toFixed(1)
            : checked + ' poses checked');

  /* And the resting blade stays inside the same reach the SWINGS occupy.
   * Bounding it against the baked envelope rather than a typed number means
   * the check keeps its meaning if the weapon is ever re-proportioned. */
  const env = RIG.envelope;
  let wild = 0;
  for (const st of STATES) {
    const fig = RIG.figure(poser(st), 0);
    if (fig.tipF[0] < env.x0 - 2 || fig.tipF[0] > env.x1 + 2) wild++;
  }
  s.eq('the carried blade stays inside the swing envelope', wild, 0);
}

process.exit(s.done());
