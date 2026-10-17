/* ===========================================================================
 * tests/verify_platform.js  —  settings sanitization, rebind, and the menu
 * ---------------------------------------------------------------------------
 * Everything here runs against the REAL functions (L8) in a bare sandbox that
 * has nothing but Pad.BUTTONS available — no DOM, no localStorage. The two
 * lines of storage glue in 95-app.js are covered separately, for real, by
 * verify_render (a corrupted-localStorage / disabled-storage browser test).
 * ======================================================================== */
'use strict';

const H = require('./harness');
const s = new H.Suite('verify_platform');
const C = H.loadPlatform();
const Settings = C.Settings, Menu = C.Menu, Pad = C.Pad;

/* ================================================================ defaults */
{
  const d = Settings.defaults();
  s.eq('defaults declare the current version', d.version, Settings.VERSION);
  s.eq('one keybind entry per action', Object.keys(d.keybinds).length, Pad.BUTTONS.length);
  for (const action of Pad.BUTTONS) {
    s.ok('default binds ' + action, Array.isArray(d.keybinds[action]) && d.keybinds[action].length > 0);
  }
  s.eq('defaults match the pre-settings keymap: jump', d.keybinds.jump.join(','), 'Space,KeyK');
  s.eq('defaults match the pre-settings keymap: roll', d.keybinds.roll.join(','), 'ShiftLeft,ShiftRight,KeyL');
  s.eq('switchWeapon defaults to the free KeyI binding (D15)', d.keybinds.switchWeapon.join(','), 'KeyI');
  s.eq('reduced motion defaults off', d.reducedMotion, false);
  s.eq('the frame meter defaults on', d.showMeter, true);
  s.eq('sound defaults unmuted', d.muted, false);
  s.eq('touch parry assist defaults off (Manual is the default mode)', d.touchParryAssist, false);

  s.ok('two calls to defaults() do not share arrays',
    (() => { const a = Settings.defaults(), b = Settings.defaults();
      a.keybinds.jump.push('X'); return b.keybinds.jump.indexOf('X') === -1; })());
}

/* =============================================================== sanitize
 * Every argument here is something a hand-edited or corrupted localStorage
 * payload could actually contain. None of them may throw, and none may
 * produce a result Pad or the app's dispatch could not safely consume. */
{
  const cases = [
    ['undefined', undefined],
    ['null', null],
    ['a bare string', 'not an object'],
    ['a number', 42],
    ['an array', [1, 2, 3]],
    ['an empty object', {}],
    ['wrong version', { version: 999, keybinds: {} }],
    ['keybinds as a string', { version: 1, keybinds: 'nope' }],
    ['keybinds as an array', { version: 1, keybinds: [] }],
    ['a code that is a number', { version: 1, keybinds: { jump: [5] } }],
    ['a code with punctuation', { version: 1, keybinds: { jump: ['Key J!'] } }],
    ['a code that is an object', { version: 1, keybinds: { jump: [{}] } }],
    ['an unknown action', { version: 1, keybinds: { flyToTheMoon: ['KeyF'] } }],
    ['reducedMotion as a string', { version: 1, reducedMotion: 'yes' }],
    ['showMeter as a number', { version: 1, showMeter: 1 }],
    ['muted as a string', { version: 1, muted: 'yes' }],
    ['touchParryAssist as a string', { version: 1, touchParryAssist: 'yes' }],
    ['a deeply nested garbage blob', { version: 1, keybinds: { jump: [['nested']] } }]
  ];
  for (const [label, input] of cases) {
    let out, threw = false;
    try { out = Settings.sanitize(input); } catch (e) { threw = true; }
    s.ok('sanitize never throws on ' + label, !threw);
    if (!threw) {
      s.eq(label + ' still binds every action', Object.keys(out.keybinds).length, Pad.BUTTONS.length);
      s.eq(label + ' still has a boolean reducedMotion', typeof out.reducedMotion, 'boolean');
      s.eq(label + ' still has a boolean showMeter', typeof out.showMeter, 'boolean');
      s.eq(label + ' still has a boolean muted', typeof out.muted, 'boolean');
      s.eq(label + ' still has a boolean touchParryAssist', typeof out.touchParryAssist, 'boolean');
    }
  }
}
{
  // A genuinely valid custom payload survives intact.
  const custom = {
    version: 1,
    keybinds: {
      left: ['KeyH'], right: ['KeyL'], up: ['KeyK'], down: ['KeyJ'],
      jump: ['KeyF'], roll: ['KeyG'], attack: ['KeyE']
    },
    reducedMotion: true,
    showMeter: false,
    muted: true,
    touchParryAssist: true
  };
  const out = Settings.sanitize(custom);
  s.eq('a valid custom keybind is kept', out.keybinds.jump.join(','), 'KeyF');
  s.eq('reducedMotion true is kept', out.reducedMotion, true);
  s.eq('showMeter false is kept', out.showMeter, false);
  s.eq('muted true is kept', out.muted, true);
  s.eq('touchParryAssist true is kept', out.touchParryAssist, true);
}
{
  // Two actions claiming the same key in one payload: first-in-order wins,
  // and the loser falls back to ITS OWN default rather than ending up unbound.
  const clash = {
    version: 1,
    keybinds: { left: ['KeyX'], right: ['KeyX'] }
  };
  const out = Settings.sanitize(clash);
  s.eq('the earlier action keeps the contested key', out.keybinds.left.join(','), 'KeyX');
  s.ok('the later action does not also claim it', out.keybinds.right.indexOf('KeyX') === -1);
  s.ok('and falls back to its own default instead',
    out.keybinds.right.join(',') === Settings.DEFAULT_KEYS.right.join(','));
}
{
  // A default that collides with something the user deliberately rebound
  // must not be silently restored out from under them.
  const stolen = {
    version: 1,
    // jump's own default is Space/KeyK; give 'roll' one of jump's defaults.
    keybinds: { roll: ['Space'], jump: ['xyz not a real code but matches regex'] }
  };
  const out = Settings.sanitize(stolen);
  s.eq('roll keeps the key it was explicitly given', out.keybinds.roll.join(','), 'Space');
  s.ok('jump does not fall back onto a key roll already holds',
    out.keybinds.jump.indexOf('Space') === -1);
}
{
  // Adversarially found (v0.2.16): the corruption sweep above only ever
  // corrupts ONE field at a time, with every other field absent/default —
  // it never proves `muted` survives independently when its SIBLINGS are
  // simultaneously garbage, or the reverse (muted itself corrupted while
  // everything else is a genuinely valid custom payload). This is exactly
  // the bug CLASS this file's own sanitize() header already names as
  // having bitten keybinds once (an earlier field's fallback stealing state
  // a later field explicitly asked for) — muted's own recovery is
  // structurally independent today (three flat conditionals, no shared
  // mutable state), so this is a regression guard, not a live bug.
  const out1 = Settings.sanitize({
    version: 1, muted: true, keybinds: 'garbage', reducedMotion: {}, showMeter: null
  });
  s.eq('muted survives valid while every sibling field is corrupted', out1.muted, true);
  s.eq('...and siblings still fall back to their own defaults', out1.reducedMotion, false);

  const out2 = Settings.sanitize({
    version: 1, muted: { nested: true },
    keybinds: { left: ['KeyH'], right: ['KeyL'], up: ['KeyK'], down: ['KeyJ'],
                jump: ['KeyF'], roll: ['KeyG'], attack: ['KeyE'] },
    reducedMotion: true, showMeter: false
  });
  s.eq('muted falls back to its own default while every sibling field is valid', out2.muted, false);
  s.eq('...and does not drag any sibling down with it', out2.keybinds.jump.join(','), 'KeyF');

  // Same independent-recovery property, for touchParryAssist.
  const out3 = Settings.sanitize({
    version: 1, touchParryAssist: true, keybinds: 'garbage', muted: {}
  });
  s.eq('touchParryAssist survives valid while siblings are corrupted', out3.touchParryAssist, true);
  const out4 = Settings.sanitize({
    version: 1, touchParryAssist: 'nope', muted: true
  });
  s.eq('touchParryAssist falls back to its own default while muted is valid', out4.touchParryAssist, false);
  s.eq('...and does not drag muted down with it', out4.muted, true);
}
{
  // Round trip through JSON, the shape a real payload actually takes.
  const custom = Settings.sanitize({ version: 1, reducedMotion: true });
  const text = Settings.serialize(custom);
  const back = Settings.deserialize(text);
  s.eq('serialize -> deserialize is lossless for a valid payload', JSON.stringify(back), JSON.stringify(custom));

  s.ok('deserialize(null) returns defaults, not a throw', (() => {
    let ok = true, out;
    try { out = Settings.deserialize(null); } catch (e) { ok = false; }
    return ok && JSON.stringify(out) === JSON.stringify(Settings.defaults());
  })());
  s.ok('deserialize of truncated JSON returns defaults', (() => {
    let ok = true, out;
    try { out = Settings.deserialize('{"version":1,"keybi'); } catch (e) { ok = false; }
    return ok && out.version === Settings.VERSION;
  })());
  s.ok('deserialize of a JSON array (not an object) returns defaults', (() => {
    let out;
    try { out = Settings.deserialize('[1,2,3]'); } catch (e) { out = null; }
    return !!out && out.version === Settings.VERSION;
  })());
}

/* ============================================================ actionForCode */
{
  const d = Settings.defaults();
  s.eq('actionForCode finds a bound key', Settings.actionForCode(d, 'Space'), 'jump');
  s.eq('actionForCode finds the second binding for a key with two', Settings.actionForCode(d, 'KeyK'), 'jump');
  s.eq('actionForCode returns null for an unbound key', Settings.actionForCode(d, 'KeyZ'), null);
  // Adversarially found (coverage gap): the default keybind array check
  // above (line 26) only proves the raw DEFAULT_KEYS config contains
  // 'KeyI' — it never proves the real production dispatch translation
  // (a KeyboardEvent.code -> Settings.actionForCode -> pad.set(...)) that
  // 95-app.js actually relies on for the new D15 binding.
  s.eq('actionForCode maps KeyI to switchWeapon (D15)', Settings.actionForCode(d, 'KeyI'), 'switchWeapon');
}

/* =================================================================== rebind */
{
  const before = Settings.defaults();
  const snapshot = JSON.stringify(before);
  const after = Settings.rebind(before, 'jump', 'KeyF');

  s.eq('rebind does not mutate its input', JSON.stringify(before), snapshot);
  s.eq('rebind changes the target action', after.keybinds.jump.join(','), 'KeyF');
  s.eq('rebind replaces rather than appends',
    after.keybinds.jump.length, 1);

  // Stealing a key another action already held.
  const stolen = Settings.rebind(after, 'roll', 'KeyF');
  s.ok('a key taken by rebind leaves its old action', stolen.keybinds.jump.indexOf('KeyF') === -1);
  s.eq('and belongs solely to the new one', stolen.keybinds.roll.join(','), 'KeyF');

  s.eq('rebinding an unknown action is a no-op', Settings.rebind(before, 'flyToTheMoon', 'KeyZ'), before);

  // Every action can end up bound to every legal key without ever producing
  // two actions sharing one — the property the whole module exists to hold.
  let dup = false, cur = Settings.defaults();
  for (let i = 0; i < Pad.BUTTONS.length; i++) {
    cur = Settings.rebind(cur, Pad.BUTTONS[i], 'KeyQ');
    const holders = Pad.BUTTONS.filter((a) => cur.keybinds[a].indexOf('KeyQ') !== -1);
    if (holders.length > 1) dup = true;
  }
  s.eq('repeated rebinding to the same key never double-claims it', dup, false);
}

/* ===================================================================== menu */
function menu(onChange) {
  return new Menu(Settings.defaults(), { onChange: onChange || function () {} });
}

{
  const m = menu();
  s.eq('a fresh menu starts closed', m.open, false);
  m.openRoot();
  s.eq('openRoot opens it', m.open, true);
  s.eq('and lands on root', m.screen, 'root');
  s.eq('cursor starts at 0', m.cursor, 0);
  s.eq('root has exactly two rows', m.rowLabels().length, 2);
}
{
  const m = menu(); m.openRoot();
  m.move(1);
  s.eq('move steps the cursor', m.cursor, 1);
  m.move(1);
  s.eq('move wraps past the end', m.cursor, 0);
  m.move(-1);
  s.eq('move wraps backward past the start', m.cursor, 1);
}
{
  const m = menu(); m.openRoot();
  m.confirm();   // cursor 0 = Resume
  s.eq('confirming Resume closes the menu', m.open, false);
}
{
  const m = menu(); m.openRoot();
  m.move(1); m.confirm();   // Options
  s.eq('confirming Options enters the options screen', m.screen, 'options');
  s.eq('cursor resets entering a new screen', m.cursor, 0);
  s.eq('one row per action, plus six more',
    m.rowLabels().length, Pad.BUTTONS.length + 6);
}
{
  let changed = null;
  const m = menu((next) => { changed = next; });
  m.openRoot(); m.move(1); m.confirm();          // -> options
  const toggleRow = Pad.BUTTONS.length;           // Reduced Motion
  m.cursor = toggleRow;
  m.confirm();
  s.ok('toggling Reduced Motion fires onChange', changed !== null);
  s.eq('and actually flips it', changed.reducedMotion, true);
  s.eq("the menu's own settings reference moves with it", m.settings.reducedMotion, true);

  m.confirm();     // toggle it back
  s.eq('toggling again flips it back', m.settings.reducedMotion, false);
}
{
  // 85-audio.js's own Sound row — the same shape reducedMotion/showMeter
  // already use, one row further down.
  let changed = null;
  const m = menu((next) => { changed = next; });
  m.openRoot(); m.move(1); m.confirm();
  m.cursor = Pad.BUTTONS.length + 2;              // Sound
  // Adversarially found (v0.2.16): this test (and its Reduced Motion/Reset/
  // Back siblings around it) only ever asserted what confirm() DOES at a
  // hardcoded cursor offset, never that the row actually LABELED at that
  // cursor is the one the offset's own comment claims — so a rowLabels()/
  // confirm() index drift (e.g. a future row inserted between two existing
  // ones) would silently desync label from action with nothing here to
  // catch it; only the separate, slower browser suite (verify_render.js)
  // would. Closing that gap for the Sound row specifically here.
  s.eq('cursor is actually on the row labeled Sound', m.rowLabels()[m.cursor].indexOf('Sound:'), 0);
  m.confirm();
  s.ok('toggling Sound fires onChange', changed !== null);
  s.eq('and actually flips muted on (Sound: Off)', changed.muted, true);
  s.eq("the menu's own settings reference moves with it", m.settings.muted, true);

  m.confirm();     // toggle it back
  s.eq('toggling again flips it back (Sound: On)', m.settings.muted, false);
}
{
  // Touch Parry Assist (abilities spec §2b) — the same shape and the same
  // row-label-matches-cursor regression the Sound row above already closes,
  // for the row this feature itself inserted.
  let changed = null;
  const m = menu((next) => { changed = next; });
  m.openRoot(); m.move(1); m.confirm();
  m.cursor = Pad.BUTTONS.length + 3;              // Touch Parry Assist
  s.eq('cursor is actually on the row labeled Touch Parry Assist',
    m.rowLabels()[m.cursor].indexOf('Touch Parry Assist:'), 0);
  m.confirm();
  s.ok('toggling it fires onChange', changed !== null);
  s.eq('and actually flips it on', changed.touchParryAssist, true);
  s.eq("the menu's own settings reference moves with it", m.settings.touchParryAssist, true);

  m.confirm();     // toggle it back
  s.eq('toggling again flips it back', m.settings.touchParryAssist, false);
}
{
  let changed = null;
  const m = menu((next) => { changed = next; });
  m.openRoot(); m.move(1); m.confirm();
  m.cursor = Pad.BUTTONS.length + 4;              // Reset to Defaults
  m.rebindAction = null;
  // Dirty it first so the reset is observable.
  m.settings = Settings.rebind(m.settings, 'jump', 'KeyZ');
  m.confirm();
  s.eq('Reset to Defaults restores the default jump binding',
    changed.keybinds.jump.join(','), Settings.DEFAULT_KEYS.jump.join(','));
}
{
  const m = menu(); m.openRoot(); m.move(1); m.confirm();
  m.cursor = Pad.BUTTONS.length + 5;              // Back
  m.confirm();
  s.eq('Back returns to root', m.screen, 'root');
  s.eq('landing on the Options row', m.cursor, 1);
}
{
  // Adversarially found (v0.2.16): move()'s wrap-around
  // (`((cursor+delta)%n+n)%n`) was only ever exercised against the ROOT
  // screen's 2-row list — nothing drove it on the OPTIONS screen, now
  // Pad.BUTTONS.length+6 rows (the exact list this feature's own Sound row,
  // and later Touch Parry Assist, each grew by one). Correct today (this is
  // a coverage gap, not a live bug), but exactly the kind of computed-list-
  // length arithmetic a future row insertion/removal could silently break
  // with nothing here to catch it.
  const m = menu(); m.openRoot(); m.move(1); m.confirm();   // -> options, cursor 0
  const total = Pad.BUTTONS.length + 6;
  m.move(-1);
  s.eq('moving back from the first row wraps to the last (Back)',
    m.rowLabels()[m.cursor].indexOf('Back'), 0);
  m.move(1);
  s.eq('moving forward from Back wraps to the first row again',
    m.cursor, 0);
  for (let i = 0; i < total; i++) m.move(1);
  s.eq('a full lap (total moves) returns to the exact same row', m.cursor, 0);
  m.cursor = 0;
  m.move(total * 3 + 2);
  s.eq('a large delta resolves to the correct modular position', m.cursor, 2);
}
{
  // The rebind flow, end to end.
  let changed = null;
  const m = menu((next) => { changed = next; });
  m.openRoot(); m.move(1); m.confirm();           // -> options
  m.cursor = 0;                                   // 'left' is always row 0
  m.confirm();
  s.eq('confirming a keybind row enters rebind mode', m.screen, 'rebind');
  s.eq('and remembers which action', m.rebindAction, 'left');

  m.move(1);
  s.eq('navigation is inert while capturing a key', m.screen, 'rebind');

  m.captureKey('KeyQ');
  s.eq('a captured key rebinds the action', changed.keybinds.left.join(','), 'KeyQ');
  s.eq('and returns to the options list', m.screen, 'options');
  s.eq('leaving no action selected', m.rebindAction, null);
}
{
  // Escape is the one key that can never be captured.
  let changed = null;
  const m = menu((next) => { changed = next; });
  m.openRoot(); m.move(1); m.confirm();
  const before = JSON.stringify(m.settings);
  m.cursor = 1; m.confirm();                      // rebind 'right'
  m.captureKey('Escape');
  s.eq('Escape cancels a rebind instead of binding to it', changed, null);
  s.eq('nothing changed', JSON.stringify(m.settings), before);
  s.eq('and it lands back on options', m.screen, 'options');
}
{
  // cancel() at every depth.
  const m = menu(); m.openRoot();
  m.cancel();
  s.eq('cancel at root closes the menu', m.open, false);

  const m2 = menu(); m2.openRoot(); m2.move(1); m2.confirm();
  m2.cancel();
  s.eq('cancel at options returns to root', m2.screen, 'root');

  const m3 = menu(); m3.openRoot(); m3.move(1); m3.confirm();
  m3.cursor = 0; m3.confirm();
  m3.cancel();
  s.eq('cancel from rebind returns to options, not root', m3.screen, 'options');
}
{
  // handleKey — the single dispatch point 95-app.js relies on.
  const m = menu(); m.openRoot();
  s.eq('handleKey navigates on ArrowDown', (m.handleKey('ArrowDown'), m.cursor), 1);
  s.eq('handleKey confirms on Enter', (m.handleKey('Enter'), m.screen), 'options');
  s.ok('handleKey reports it consumed the key', m.handleKey('ArrowUp') === true);

  const closed = menu();
  s.eq('a closed menu still answers handleKey truthfully for its own keys',
    typeof closed.handleKey('Escape'), 'boolean');
}
{
  // render() must not throw against a stub 2D context, at every screen.
  const stub = H.stubCanvas(320, 240);
  const ctx = stub.getContext();
  const m = menu(); m.openRoot();
  let threw = false;
  try {
    m.render(ctx, 320, 240);
    m.move(1); m.confirm();                       // options
    m.render(ctx, 320, 240);
    m.cursor = 0; m.confirm();                     // rebind
    m.render(ctx, 320, 240);
  } catch (e) { threw = true; }
  s.ok('render never throws across every screen', !threw);

  const closed = menu();
  let calls = 0;
  const spy = Object.assign({}, ctx, { fillRect: () => calls++ });
  closed.render(spy, 320, 240);
  s.eq('a closed menu draws nothing', calls, 0);
}

process.exit(s.done());
