/* ===========================================================================
 * tests/cdp.js  —  a minimal Chrome DevTools Protocol driver
 * ---------------------------------------------------------------------------
 * No npm dependencies, on purpose. Node ships a global WebSocket, and
 * Playwright's Chromium is already cached on disk, so the render gate needs
 * nothing installed and no network. That matters: a gate that only runs after
 * `npm install` is a gate that stops being run.
 *
 * Screenshots come from Page.captureScreenshot, which is the COMPOSITED frame
 * as the compositor produced it (L12). Nothing here ever reads pixels back out
 * of a canvas — that path can show you a buffer the user never saw.
 * ======================================================================== */
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* Chrome is a process TREE, not a process — the browser we spawn launches
 * its own GPU/renderer/utility helpers as further children. Plain
 * `proc.kill()` only signals the ONE pid Node handed us; on Windows that
 * does not cascade to children the way a POSIX process-group signal can,
 * so every one of those helpers survives as an orphan. Found the hard way
 * (v0.2.11): repeated real gate runs left 37 orphaned chrome-headless-shell
 * processes behind, tens to hundreds of MB each, and once enough had
 * accumulated a FRESH launch would fail to even reach the "DevTools
 * listening" line — silently, with no stdout/stderr at all, misread at
 * first as sim-timing flakiness in verify_render.js when the real cause
 * was resource exhaustion from every PRIOR run's own leftovers. `taskkill
 * /T` (tree) is the Windows-specific fix; POSIX's plain kill is kept as
 * the fallback since it already reaches a whole process GROUP there. */
function killTree(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === 'win32' && proc.pid) {
    try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch (e) { /* already gone, or taskkill itself unavailable */ }
  }
  try { proc.kill(); } catch (e) { /* already gone */ }
}

/* Where a Chromium might be. Playwright's cache first, because it is the one
 * pinned to a known revision; a system browser is a usable fallback but its
 * version is whatever the machine happens to have. */
function findChromium() {
  if (process.env.CINDER_CHROME && fs.existsSync(process.env.CINDER_CHROME)) {
    return process.env.CINDER_CHROME;
  }
  const roots = [];
  if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
  const home = os.homedir();
  roots.push(path.join(home, '.cache', 'ms-playwright'));
  roots.push(path.join(home, 'Library', 'Caches', 'ms-playwright'));

  const layouts = [
    ['chrome-win64', 'chrome.exe'],
    ['chrome-win', 'chrome.exe'],
    ['chrome-linux', 'chrome'],
    ['chrome-mac', 'Chromium.app/Contents/MacOS/Chromium'],
    ['chrome-mac-arm64', 'Chromium.app/Contents/MacOS/Chromium']
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d/.test(d)).sort().reverse();
    for (const dir of dirs) {
      for (const [sub, exe] of layouts) {
        const p = path.join(root, dir, sub, exe);
        if (fs.existsSync(p)) return p;
      }
    }
  }

  const system = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const p of system) if (fs.existsSync(p)) return p;
  return null;
}

function launch(exe, { width = 1280, height = 720 } = {}) {
  return new Promise((resolve, reject) => {
    const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinder-cdp-'));
    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      '--user-data-dir=' + userDir,
      '--no-first-run', '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      // rAF must run at full rate or "ticks in real time" measures throttling
      // rather than the game.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--hide-scrollbars',
      '--mute-audio',
      '--window-size=' + width + ',' + height,
      'about:blank'
    ];

    const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killTree(proc);
      reject(new Error('chromium never reported a devtools endpoint\n' + buf));
    }, 30000);

    proc.stderr.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ proc, wsUrl: m[1], userDir });
      }
    });
    proc.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    proc.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('chromium exited early (code ' + code + ')\n' + buf));
    });
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (ev) => this._onMessage(String(ev.data)));
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new CDP(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error('websocket failed: ' + url)), { once: true });
    });
  }

  _onMessage(text) {
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.resolve(msg.result);
      return;
    }
    for (const fn of this.listeners) fn(msg);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error('CDP timeout: ' + method));
      }, 30000);
    });
  }

  on(fn) { this.listeners.push(fn); return fn; }
  close() { try { this.ws.close(); } catch (e) { /* already closed */ } }
}

async function openPage(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);
  return sessionId;
}

/* Anything the browser considers an error. All three channels, because a page
 * can fail in any of them and "zero console errors" has to mean zero. */
function collectErrors(cdp) {
  const errors = [];
  cdp.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails || {};
      errors.push('exception: ' + (d.exception && d.exception.description ? d.exception.description : d.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? '?').join(' '));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push('log: ' + msg.params.entry.text);
    }
  });
  return errors;
}

function navigate(cdp, sessionId, url) {
  const loaded = new Promise((resolve) => {
    cdp.on((msg) => {
      if (msg.method === 'Page.loadEventFired' && msg.sessionId === sessionId) resolve();
    });
  });
  return cdp.send('Page.navigate', { url }, sessionId).then(() =>
    Promise.race([loaded, new Promise((r) => setTimeout(r, 15000))])
  );
}

async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true
  }, sessionId);
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error(d.text + ' ' + ((d.exception && d.exception.description) || ''));
  }
  return r.result.value;
}

// Only the keys the movement build binds. e.code is what 95-app.js reads.
const KEYS = {
  KeyA: { key: 'a', code: 'KeyA', vk: 65 },
  KeyD: { key: 'd', code: 'KeyD', vk: 68 },
  KeyS: { key: 's', code: 'KeyS', vk: 83 },
  KeyW: { key: 'w', code: 'KeyW', vk: 87 },
  KeyI: { key: 'i', code: 'KeyI', vk: 73 },   // D15: switchWeapon's default binding
  KeyJ: { key: 'j', code: 'KeyJ', vk: 74 },
  KeyP: { key: 'p', code: 'KeyP', vk: 80 },
  Space: { key: ' ', code: 'Space', vk: 32 },
  ShiftLeft: { key: 'Shift', code: 'ShiftLeft', vk: 16 },
  F4: { key: 'F4', code: 'F4', vk: 115 },
  F5: { key: 'F5', code: 'F5', vk: 116 },
  F6: { key: 'F6', code: 'F6', vk: 117 },
  // Menu/pause navigation, added for the pause-menu render gate (v0.2.2).
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 }
};

function key(cdp, sessionId, name, type) {
  const k = KEYS[name];
  if (!k) throw new Error('cdp: unmapped key ' + name);
  return cdp.send('Input.dispatchKeyEvent', {
    type,
    key: k.key,
    code: k.code,
    windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk
  }, sessionId);
}
const keyDown = (c, s, n) => key(c, s, n, 'keyDown');
const keyUp = (c, s, n) => key(c, s, n, 'keyUp');

/* Input.dispatchTouchEvent. `points` is [{x, y, id}], CSS-pixel coordinates
 * viewport-relative — matches exactly what a real Touch's clientX/clientY
 * would be, and `id` round-trips as that touch's `identifier` on the page
 * side. Requires touch emulation to already be active on this session
 * (Emulation.setDeviceMetricsOverride with mobile:true, plus
 * Emulation.setTouchEmulationEnabled) — the same combination the resize/PWA
 * suite already established is what actually flips `pointer: coarse`. */
function touchEvent(cdp, sessionId, type, points) {
  return cdp.send('Input.dispatchTouchEvent', {
    type: type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id }))
  }, sessionId);
}
const touchStart = (c, s, points) => touchEvent(c, s, 'touchStart', points);
const touchMove = (c, s, points) => touchEvent(c, s, 'touchMove', points);
const touchEnd = (c, s, points) => touchEvent(c, s, 'touchEnd', points);
const touchCancel = (c, s, points) => touchEvent(c, s, 'touchCancel', points);

/* Input.dispatchMouseEvent — a real, trusted pointer press/release, the
 * same input pipeline keyDown()/touchEvent() above already use. Added for
 * v0.2.16's audio-unlock coverage: 95-app.js wires audio.unlock() to
 * 'pointerdown' as one of exactly three real-gesture entry points
 * (keydown/pointerdown/touchstart), and before this only the keydown leg
 * had any test coverage anywhere in the gate (an adversarially-found gap
 * — a mouse-first player who clicks before ever touching a key or the
 * touchscreen was untested). CDP's mousePressed/mouseReleased dispatch
 * through the real browser input pipeline, so the page's real
 * 'pointerdown' listener fires exactly as it would for a real click, not
 * a synthetic/untrusted `dispatchEvent` call. */
function mouseEvent(cdp, sessionId, type, x, y, button) {
  return cdp.send('Input.dispatchMouseEvent', {
    type, x, y, button: button || 'left', clickCount: type === 'mousePressed' ? 1 : 0
  }, sessionId);
}
const mouseDown = (c, s, x, y) => mouseEvent(c, s, 'mousePressed', x, y);
const mouseUp = (c, s, x, y) => mouseEvent(c, s, 'mouseReleased', x, y);

async function screenshot(cdp, sessionId, outPath) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false
  }, sessionId);
  const buf = Buffer.from(data, 'base64');
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
  }
  return buf;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  findChromium, launch, CDP, openPage, collectErrors,
  navigate, evaluate, keyDown, keyUp, screenshot, sleep,
  touchStart, touchMove, touchEnd, touchCancel, killTree,
  mouseDown, mouseUp
};
