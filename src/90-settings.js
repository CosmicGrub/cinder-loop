/* ===========================================================================
 * 90-settings.js  —  the settings model
 * ---------------------------------------------------------------------------
 * PRESENTER layer, but deliberately storage-agnostic: nothing in this file
 * touches localStorage, window, or the DOM. It is pure data-in, data-out —
 * sanitize(), serialize(), deserialize(), rebind() — so verify_platform can
 * exercise the REAL sanitizer in a bare Node sandbox with a fake payload,
 * rather than reimplementing its rules to check against (L8).
 *
 * 95-app.js owns the two lines of localStorage glue and is the only file that
 * may throw a private-browsing/storage-disabled exception; that glue is
 * wrapped in try/catch there, not here.
 *
 * The action list is never re-typed: it is read from C.Pad.BUTTONS, so
 * settings and the sim's own input vocabulary cannot drift apart.
 *
 * Owned by: App team.
 * ======================================================================== */
;(function (C) {
'use strict';

var Pad = C.Pad;
var VERSION = 1;

// Mirrors the KEYMAP that shipped before settings existed (v0.1.0–v0.2.1),
// so a first boot with no saved settings behaves exactly as before. `parry`
// is the one addition since then (abilities spec §2b) — defaults() derives
// its keybind entries directly from Pad.BUTTONS (below), so the moment a
// new action exists there, EVERY action here needs a matching entry or
// defaults() throws outright reading .slice() off undefined; this pairs
// with 05-input.js's own BUTTONS/WINDOW addition as one same-step change,
// not deferred alongside the rest of parry's touch/gamepad wiring.
var DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyK'],
  roll: ['ShiftLeft', 'ShiftRight', 'KeyL'],
  attack: ['KeyJ'],
  parry: ['KeyU']
};

// A KeyboardEvent.code is always alphanumeric (ArrowLeft, Space, Digit1,
// KeyJ, F3, ...). Anything else in a saved payload is either corrupted or
// hostile and is dropped rather than trusted.
var CODE_RE = /^[A-Za-z0-9]+$/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function defaults() {
  var keybinds = {}, i;
  for (i = 0; i < Pad.BUTTONS.length; i++) keybinds[Pad.BUTTONS[i]] = DEFAULT_KEYS[Pad.BUTTONS[i]].slice();
  return {
    version: VERSION,
    keybinds: keybinds,
    reducedMotion: false,
    showMeter: true,
    // 85-audio.js (D11): a real, player-facing mute — unlike F5/F6
    // (65-meta.js's own debug-only toggles), audio has no reason to stay
    // developer-only; "can I turn the sound off" is ordinary settings
    // territory, the same shape reducedMotion/showMeter already occupy.
    muted: false,
    // Abilities spec §2b: Manual (a real zone, 94-touch.js) is the default
    // touch experience — false is the least-surprising default, the same
    // "off unless chosen" reasoning muted's own default already follows.
    // Assist (near a real telegraph, a Roll-zone touch also arms parry for
    // one tick) is the opt-in convenience mode.
    touchParryAssist: false
  };
}

/* Take anything — a freshly parsed JSON blob, `undefined`, a corrupted or
 * hand-edited payload, an object from a future version — and always return a
 * COMPLETE, valid settings object. Never throws. Missing or invalid fields
 * fall back to defaults() field by field, so one bad key does not discard an
 * otherwise-good rebind.
 *
 * No migration logic exists yet because no version but 1 has ever shipped;
 * a version mismatch is treated as "unknown, discard" rather than guessed
 * at, which is the safe failure and is exactly what a future migration step
 * replaces. */
function sanitize(raw) {
  var out = defaults();
  if (!isPlainObject(raw)) return out;
  if (raw.version !== VERSION) return out;

  if (isPlainObject(raw.keybinds)) {
    /* Two passes, and the order between them is the whole point.
     *
     * Pass 1 claims every VALID EXPLICIT request the payload made, across
     * every action, before pass 2 ever runs. Pass 2 then fills in defaults
     * only for actions that came out of pass 1 empty.
     *
     * A single combined pass — validate this action, fall back to its
     * default immediately if empty, move to the next — lets an EARLIER
     * action's fallback default steal a key a LATER action explicitly and
     * validly asked for, purely because of iteration order over
     * Pad.BUTTONS. That is a real bug, not a theoretical one: it showed up
     * as a failing assertion the first time this file was tested against a
     * payload where an early action's request was invalid and a later
     * action's valid request happened to want that early action's default
     * key. Splitting the passes makes explicit user intent always outrank a
     * fallback, regardless of which action is declared first. */
    var explicit = {}, i, action, codes, clean, c, code;
    for (i = 0; i < Pad.BUTTONS.length; i++) {
      action = Pad.BUTTONS[i];
      codes = raw.keybinds[action];
      clean = [];
      if (Array.isArray(codes)) {
        for (c = 0; c < codes.length; c++) {
          code = codes[c];
          if (typeof code === 'string' && CODE_RE.test(code)) clean.push(code);
        }
      }
      explicit[action] = clean;
    }

    var claimed = {}, out2 = {};
    for (i = 0; i < Pad.BUTTONS.length; i++) {
      action = Pad.BUTTONS[i];
      out2[action] = [];
      for (c = 0; c < explicit[action].length; c++) {
        code = explicit[action][c];
        if (!claimed[code]) { out2[action].push(code); claimed[code] = true; }
      }
    }

    for (i = 0; i < Pad.BUTTONS.length; i++) {
      action = Pad.BUTTONS[i];
      if (out2[action].length > 0) continue;
      var d = DEFAULT_KEYS[action], k;
      for (k = 0; k < d.length; k++) {
        if (!claimed[d[k]]) { out2[action].push(d[k]); claimed[d[k]] = true; }
      }
    }

    out.keybinds = out2;
  }

  if (typeof raw.reducedMotion === 'boolean') out.reducedMotion = raw.reducedMotion;
  if (typeof raw.showMeter === 'boolean') out.showMeter = raw.showMeter;
  if (typeof raw.muted === 'boolean') out.muted = raw.muted;
  if (typeof raw.touchParryAssist === 'boolean') out.touchParryAssist = raw.touchParryAssist;
  return out;
}

function serialize(settings) {
  return JSON.stringify(sanitize(settings));
}

// The one function allowed to see a raw string (or null/undefined, the shape
// `localStorage.getItem` returns for a missing key). JSON.parse's own
// exception is the only thing caught here; sanitize() handles every other
// way a payload can be wrong.
function deserialize(text) {
  if (typeof text !== 'string') return defaults();
  var parsed;
  try { parsed = JSON.parse(text); } catch (e) { return defaults(); }
  return sanitize(parsed);
}

// First action bound to `code`, or null. Powers live key dispatch — 95-app.js
// asks this instead of a static table, so a rebind takes effect the instant
// it is made.
function actionForCode(settings, code) {
  var i, action, list, c;
  for (i = 0; i < Pad.BUTTONS.length; i++) {
    action = Pad.BUTTONS[i];
    list = settings.keybinds[action];
    if (!list) continue;
    for (c = 0; c < list.length; c++) if (list[c] === code) return action;
  }
  return null;
}

/* Pure: returns a NEW settings object, the input is never mutated. Rebinding
 * REPLACES the action's whole binding with the single key just pressed — the
 * ordinary "press a key to bind" contract — and strips that key from every
 * other action first, so a rebind can never leave two actions sharing one
 * key. */
function rebind(settings, action, code) {
  if (Pad.BUTTONS.indexOf(action) === -1) return settings;
  var out = sanitize(settings), i, other;
  for (i = 0; i < Pad.BUTTONS.length; i++) {
    other = Pad.BUTTONS[i];
    if (other === action) continue;
    out.keybinds[other] = out.keybinds[other].filter(function (c) { return c !== code; });
  }
  out.keybinds[action] = [code];
  return out;
}

C.Settings = {
  VERSION: VERSION,
  DEFAULT_KEYS: DEFAULT_KEYS,
  defaults: defaults,
  sanitize: sanitize,
  serialize: serialize,
  deserialize: deserialize,
  actionForCode: actionForCode,
  rebind: rebind
};

})(CINDER);
