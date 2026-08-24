/* ===========================================================================
 * 92-menu.js  —  the pause / options menu
 * ---------------------------------------------------------------------------
 * PRESENTER layer, and deliberately NOT part of 80-view.js. L5 defines
 * 80-view.js as the one place a SIM EVENT becomes an effect; the menu is not
 * that — it never touches the bus, never reads sim state, and would render
 * identically if the sim did not exist. Folding it into 80-view.js would blur
 * the one boundary in the codebase that a source scan can currently verify by
 * itself. So it is its own file: reads and proposes changes to a Settings
 * object, draws itself, and knows nothing else.
 *
 * Rebinding is a live-input capture, not a form: openRoot() -> confirm a row
 * -> for a keybind row, screen becomes 'rebind' and the very next key ANY key
 * sends becomes that action's new binding (Escape cancels instead of binding
 * itself — the one key that can never be captured, because a menu with no
 * escape from a rebind prompt is a trap).
 *
 * Owned by: App team.
 * ======================================================================== */
;(function (C) {
'use strict';

var Pad = C.Pad, Settings = C.Settings;

var PALETTE = {
  dim: 'rgba(9,7,11,0.74)',
  panel: 'rgba(24,20,29,0.96)',
  panelEdge: '#443a52',
  ink: '#e8d8b0',
  inkDim: '#8b8194',
  cursor: '#ff9a5c',
  title: '#ffd166'
};

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// A tiny explicit merge rather than Object.assign — the codebase makes no
// ES2015+ runtime assumptions anywhere else (var, no arrow fns), which
// matters more once a Wear OS WebView is a real target than it does today.
function withField(obj, key, value) {
  var out = {}, k;
  for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  out[key] = value;
  return out;
}

var ROOT_ROWS = ['Resume', 'Options'];

function Menu(settings, callbacks) {
  this.settings = settings || Settings.defaults();
  this.open = false;
  this.screen = 'root';       // 'root' | 'options' | 'rebind'
  this.cursor = 0;
  this.rebindAction = null;
  callbacks = callbacks || {};
  this.onChange = callbacks.onChange || function () {};
  this.onClose = callbacks.onClose || function () {};
}

Menu.ROOT_ROWS = ROOT_ROWS;

Menu.prototype.openRoot = function () {
  this.open = true;
  this.screen = 'root';
  this.cursor = 0;
  return this;
};

Menu.prototype.close = function () {
  this.open = false;
  this.screen = 'root';
  this.cursor = 0;
  this.onClose();
  return this;
};

Menu.prototype.setSettings = function (settings) {
  this.settings = settings;
  return this;
};

// The number of rows on the OPTIONS screen that are keybinds, exactly
// Pad.BUTTONS long — read from the same source of truth Settings uses, so
// this file cannot silently drift out of step with it either.
Menu.prototype.rowLabels = function () {
  if (this.screen === 'root') return ROOT_ROWS.slice();
  if (this.screen !== 'options') return [];      // 'rebind' has no row list

  var rows = [], i, action, codes;
  for (i = 0; i < Pad.BUTTONS.length; i++) {
    action = Pad.BUTTONS[i];
    codes = this.settings.keybinds[action] || [];
    rows.push(cap(action) + ': ' + (codes.length ? codes.join(' / ') : '(unbound)'));
  }
  rows.push('Reduced Motion: ' + (this.settings.reducedMotion ? 'On' : 'Off'));
  rows.push('Frame Meter: ' + (this.settings.showMeter ? 'On' : 'Off'));
  rows.push('Sound: ' + (this.settings.muted ? 'Off' : 'On'));
  // Abilities spec §2b: Manual (a real touch zone) vs Assist (auto-armed
  // near a real telegraph) — always shown, unconditionally, the same as
  // every other row here regardless of whether THIS device is a touch one;
  // this file has no DOM access to detect that anyway, and no existing row
  // hides itself by platform either.
  rows.push('Touch Parry Assist: ' + (this.settings.touchParryAssist ? 'On' : 'Off'));
  rows.push('Reset to Defaults');
  rows.push('Back');
  return rows;
};

Menu.prototype.move = function (delta) {
  if (this.screen === 'rebind') return this;      // capture mode ignores nav
  var n = this.rowLabels().length;
  if (n === 0) return this;
  this.cursor = ((this.cursor + delta) % n + n) % n;
  return this;
};

Menu.prototype.confirm = function () {
  if (this.screen === 'root') {
    if (this.cursor === 0) { this.close(); return this; }
    this.screen = 'options';
    this.cursor = 0;
    return this;
  }

  if (this.screen === 'options') {
    var n = Pad.BUTTONS.length;
    if (this.cursor < n) {
      this.rebindAction = Pad.BUTTONS[this.cursor];
      this.screen = 'rebind';
      return this;
    }
    if (this.cursor === n) {
      this._apply(Settings.sanitize(withField(this.settings, 'reducedMotion', !this.settings.reducedMotion)));
      return this;
    }
    if (this.cursor === n + 1) {
      this._apply(Settings.sanitize(withField(this.settings, 'showMeter', !this.settings.showMeter)));
      return this;
    }
    if (this.cursor === n + 2) {
      this._apply(Settings.sanitize(withField(this.settings, 'muted', !this.settings.muted)));
      return this;
    }
    if (this.cursor === n + 3) {                 // Touch Parry Assist
      this._apply(Settings.sanitize(withField(this.settings, 'touchParryAssist', !this.settings.touchParryAssist)));
      return this;
    }
    if (this.cursor === n + 4) {                 // Reset to Defaults
      this._apply(Settings.defaults());
      return this;
    }
    if (this.cursor === n + 5) {                  // Back
      this.screen = 'root';
      this.cursor = 1;
      return this;
    }
  }
  return this;
};

Menu.prototype.cancel = function () {
  if (this.screen === 'rebind') {
    this.screen = 'options';
    this.rebindAction = null;
    return this;
  }
  if (this.screen === 'options') {
    this.screen = 'root';
    this.cursor = 1;
    return this;
  }
  this.close();
  return this;
};

// The only key that a rebind prompt will never bind to itself — an escape
// hatch that cannot be talked out of existing.
Menu.prototype.captureKey = function (code) {
  if (this.screen !== 'rebind') return this;
  if (code === 'Escape') { this.cancel(); return this; }
  this._apply(Settings.rebind(this.settings, this.rebindAction, code));
  this.screen = 'options';
  this.rebindAction = null;
  return this;
};

Menu.prototype._apply = function (settings) {
  this.settings = settings;
  this.onChange(settings);
  return this;
};

/* One entry point for keyboard, so 95-app.js's listener is a single
 * conditional rather than reimplementing this dispatch table. Returns true
 * if the key was consumed by the menu (the caller should preventDefault and
 * NOT also dispatch it as a gameplay action). */
Menu.prototype.handleKey = function (code) {
  if (this.screen === 'rebind') { this.captureKey(code); return true; }
  if (code === 'Escape') { this.cancel(); return true; }
  if (code === 'ArrowUp' || code === 'KeyW') { this.move(-1); return true; }
  if (code === 'ArrowDown' || code === 'KeyS') { this.move(1); return true; }
  if (code === 'Enter' || code === 'Space' || code === 'KeyJ') { this.confirm(); return true; }
  return false;
};

Menu.prototype.render = function (ctx, cssW, cssH) {
  if (!this.open) return this;

  ctx.fillStyle = PALETTE.dim;
  ctx.fillRect(0, 0, cssW, cssH);

  var title = this.screen === 'root' ? 'PAUSED'
    : this.screen === 'options' ? 'OPTIONS' : 'REBIND';
  var rows = this.rowLabels();
  var lineH = 16;
  var panelW = Math.min(cssW - 40, 280);
  var panelH = this.screen === 'rebind' ? 70 : (40 + rows.length * lineH + 12);
  var px = Math.round((cssW - panelW) / 2);
  var py = Math.round((cssH - panelH) / 2);

  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(px, py, panelW, panelH);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);

  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.title;
  ctx.fillText(title, px + 14, py + 12);

  if (this.screen === 'rebind') {
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(cap(this.rebindAction) + ' — press any key', px + 14, py + 36);
    ctx.fillStyle = PALETTE.inkDim;
    ctx.fillText('Esc to cancel', px + 14, py + 52);
    return this;
  }

  var i, y;
  for (i = 0; i < rows.length; i++) {
    y = py + 34 + i * lineH;
    ctx.fillStyle = (i === this.cursor) ? PALETTE.cursor : PALETTE.ink;
    ctx.fillText((i === this.cursor ? '> ' : '  ') + rows[i], px + 14, y);
  }
  return this;
};

C.Menu = Menu;

})(CINDER);
