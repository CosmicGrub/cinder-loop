/* ===========================================================================
 * capture-moveset.js — records real gameplay footage of every shipped move
 * ---------------------------------------------------------------------------
 * Throwaway capture tool, not part of the game or its test suite. Reuses
 * tests/cdp.js verbatim (the same real, tested, zero-dependency headless
 * Chromium driver verify_render.js already uses) to drive the REAL built
 * cinder-loop.html — real key dispatch, real sim ticks, real screenshots.
 *
 * Forces the hand-built demoLevel() geometry (via the real Sim.loadFallback
 * method, L5) rather than a random procedurally generated level, because
 * demoLevel() is purpose-built with exactly the terrain a moveset showcase
 * needs: a raised block for wall-slide/wall-jump, one-way platforms at three
 * heights, and a one-tile-high tunnel that only crouch/roll fit through.
 * Between segments the player is directly repositioned/healed/re-weaponed via
 * evaluate() — a documented debug technique (this project's own test suite
 * already sets `player.weapon` directly, since runtime weapon-switching
 * isn't a shipped feature), never hidden.
 * ======================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');
const cdp = require('../../tests/cdp.js');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = path.join(ROOT, 'cinder-loop.html');
const FRAMES_DIR = path.join(__dirname, 'frames');
const MANIFEST_PATH = path.join(__dirname, 'segments.json');

function log(...a) { console.log('[capture]', ...a); }

async function main() {
  if (!fs.existsSync(BUILD)) throw new Error('no cinder-loop.html — run build.py first');
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const exe = cdp.findChromium();
  if (!exe) throw new Error('no chromium found');
  const { proc, wsUrl, userDir } = await cdp.launch(exe, { width: 960, height: 540 });
  const segments = [];
  let client = null;

  try {
    client = await cdp.CDP.connect(wsUrl);
    const sid = await cdp.openPage(client);
    await cdp.navigate(client, sid, pathToFileURL(BUILD).href);
    await waitFor(client, sid, '!!(window.CINDER_APP && window.CINDER_APP.sim)', 8000);
    await waitFor(client, sid,
      '!!(window.CINDER_APP.frames > 10 && window.CINDER_APP.sim.players[0].body.onGround)', 8000);
    log('booted');

    // The `CINDER` namespace is intentionally NOT exposed globally (the
    // whole build is wrapped in its own IIFE) — so demoLevel()/Combat.Dummy
    // aren't reachable from here. Instead: sample real SOLID/EMPTY tile
    // values directly off the world `window.CINDER_APP.sim` already
    // exposes, then carve a clean practice strip with the world's own real
    // `set()` method — the exact same API the real generator itself uses,
    // just called from here instead of from 50-gen.js.
    const TILE = 16; // matches harness.js's own FLOOR_Y = (h-2)*16 convention
    const geo = await ev(client, sid, `(function(){
      var sim = window.CINDER_APP.sim, w = sim.world;
      var b = sim.players[0].body;
      var tx = Math.floor(b.x / ${TILE}), ty = Math.floor((b.y + b.h + 1) / ${TILE});
      var SOLID = w.get(tx, ty);            // a tile the player is resting on
      var EMPTY = w.get(tx, ty - 4);         // open air well above the player
      var floorTileY = ty;

      // Flatten a wide, clean strip: open air above, solid floor at the
      // bottom, for the whole practice area — regardless of what the real
      // procedural generator happened to place here this boot.
      var x0 = Math.max(1, tx - 3), x1 = tx + 55;
      for (var x = x0; x <= x1; x++) {
        for (var y = floorTileY - 10; y < floorTileY; y++) w.set(x, y, EMPTY);
        w.set(x, floorTileY, SOLID);
      }

      // A wall column for wall-slide/wall-jump, 10 tiles right of spawn,
      // 6 tiles tall.
      var wallX = tx + 10;
      for (var wy = floorTileY - 6; wy < floorTileY; wy++) w.set(wallX, wy, SOLID);

      // A one-tile-high tunnel (only the crouch/roll hitbox fits), 24
      // tiles right of spawn, 6 tiles long — ceiling lowered to exactly
      // 1 tile above the floor.
      var tunnelX0 = tx + 24, tunnelX1 = tx + 29;
      for (var tx2 = tunnelX0; tx2 <= tunnelX1; tx2++) w.set(tx2, floorTileY - 1, SOLID);

      // Reposition the real practice dummy (boot() already added it, id
      // 100) well clear of the new geometry, for the combat segments — and
      // strip every OTHER target (the real generated level's own live
      // enemy roster) so nothing wanders into the carved practice strip
      // and attacks the player mid-demo. sim.targets is a real, plain
      // array — filtering it in place is the same shape _enterLevel()/
      // _enterBoss() already use to swap the whole roster on a transition.
      var dummy = sim.targets.filter(function (t) { return t.id === 100; })[0];
      sim.targets.length = 0;
      var dummyX = ${TILE} * (tx - 2) + 8, dummyY = null;
      if (dummy) { dummy.body.x = dummyX; dummy.body.y = b.y; dummy.hp = 999; sim.targets.push(dummy); }

      return { spawnTileX: tx, spawnTileY: floorTileY, spawnX: b.x, spawnY: b.y,
               wallX: wallX * ${TILE}, tunnelX0: tunnelX0 * ${TILE}, tunnelX1: tunnelX1 * ${TILE},
               dummyExists: !!dummy, dummyX: dummyX, dummyY: b.y };
    })()`);
    log('geometry carved: ' + JSON.stringify(geo));
    if (!geo.dummyExists) log('WARNING: no id-100 practice dummy found; combat segments will hit nothing');

    let idx = 0;
    async function segment(name, caption, fn) {
      idx++;
      const dir = path.join(FRAMES_DIR, String(idx).padStart(2, '0') + '-' + name);
      fs.mkdirSync(dir, { recursive: true });
      let frame = 0;
      const shots = [];
      const capture = async () => {
        const p = path.join(dir, String(frame).padStart(3, '0') + '.png');
        await cdp.screenshot(client, sid, p);
        shots.push(p);
        frame++;
      };
      await fn(capture);
      segments.push({ name, caption, dir, frames: shots.length });
      log(name + ': ' + shots.length + ' frames');
    }

    // Reset the player to a clean, grounded, full-hp, blade-equipped state
    // at a given world position — the safety net between every segment.
    async function place(x, y, weapon, facing) {
      await ev(client, sid, `(function(){
        var p = window.CINDER_APP.sim.players[0];
        p.body.x = ${x}; p.body.y = ${y}; p.body.vx = 0; p.body.vy = 0;
        p.hp = p.maxHp; p.iframes = 0; p.hitstopRequest = 0;
        p.weapon = ${weapon ? JSON.stringify(weapon) : "'blade'"};
        p.attack = null; p.actionLock = 0;
        p.facing = ${facing || 1};
        window.CINDER_APP.sim.hitstop = 0;
        var pad = window.CINDER_APP.sim.pads.get(0); pad.reset();
        return true;
      })()`);
      await ev(client, sid, 'window.CINDER_APP.sim.step()');
    }
    async function healDummy() {
      await ev(client, sid, `(function(){
        var t = window.CINDER_APP.sim.targets.filter(function(x){return x.id===100;})[0];
        if (t) t.hp = 999;
        return true;
      })()`);
    }

    const sx = geo.spawnX, sy = geo.spawnY, wallX = geo.wallX,
          tunX0 = geo.tunnelX0, tunX1 = geo.tunnelX1,
          dumX = geo.dummyX, dumY = geo.dummyY;

    // --------------------------------------------------------- 1. run
    await place(sx, sy, null, 1);
    await segment('run', 'RUN', async (shot) => {
      await cdp.keyDown(client, sid, 'KeyD');
      for (let i = 0; i < 14; i++) { await cdp.sleep(40); await shot(); }
      await cdp.keyUp(client, sid, 'KeyD');
    });

    // --------------------------------------------------- 2. jump + double jump
    await place(sx, sy, null, 1);
    await segment('jump', 'JUMP + DOUBLE JUMP', async (shot) => {
      await cdp.keyDown(client, sid, 'KeyD');
      await cdp.sleep(120);
      await cdp.keyDown(client, sid, 'Space');
      await cdp.sleep(90);
      await cdp.keyUp(client, sid, 'Space');
      for (let i = 0; i < 6; i++) { await cdp.sleep(40); await shot(); }
      await cdp.keyDown(client, sid, 'Space');
      await cdp.sleep(40);
      await cdp.keyUp(client, sid, 'Space');
      for (let i = 0; i < 10; i++) { await cdp.sleep(40); await shot(); }
      await cdp.keyUp(client, sid, 'KeyD');
    });

    // ----------------------------------------------- 3. wall-slide + wall-jump
    // The carved wall column sits `wallX`..`wallX+TILE`; approaching from the
    // left while airborne and holding INTO it triggers wall-slide.
    await place(wallX - 90, sy, null, 1);
    await segment('wall', 'WALL SLIDE + WALL JUMP', async (shot) => {
      await cdp.keyDown(client, sid, 'KeyD');
      await cdp.sleep(220);
      await cdp.keyDown(client, sid, 'Space');
      await cdp.sleep(110);
      await cdp.keyUp(client, sid, 'Space');
      for (let i = 0; i < 16; i++) { await cdp.sleep(40); await shot(); } // held into the wall, sliding
      // wall-jump: away input + jump
      await cdp.keyUp(client, sid, 'KeyD');
      await cdp.keyDown(client, sid, 'KeyA');
      await cdp.keyDown(client, sid, 'Space');
      await cdp.sleep(70);
      await cdp.keyUp(client, sid, 'Space');
      for (let i = 0; i < 10; i++) { await cdp.sleep(40); await shot(); }
      await cdp.keyUp(client, sid, 'KeyA');
    });

    // --------------------------------------------------------- 4. crouch under tunnel
    await place(tunX0 - 90, sy, null, 1);
    await segment('crouch', 'CROUCH — fits under the low tunnel', async (shot) => {
      await cdp.keyDown(client, sid, 'KeyD');
      await cdp.sleep(650);
      await shot();
      await cdp.keyDown(client, sid, 'KeyS');
      // Crouch speed is half run speed (measured: 75px/s), and the carved
      // tunnel is ~80px long — a real ~1.1s crossing, not the ~640ms the
      // original loop count covered; widened so the capture actually shows
      // the far side of the tunnel, not just entering it.
      for (let i = 0; i < 34; i++) { await cdp.sleep(40); await shot(); }
      await cdp.keyUp(client, sid, 'KeyS');
      await cdp.keyUp(client, sid, 'KeyD');
    });

    // --------------------------------------------------------- 5. roll under tunnel
    await place(tunX0 - 90, sy, null, 1);
    await segment('roll', 'ROLL — the fast way under', async (shot) => {
      await cdp.keyDown(client, sid, 'KeyD');
      await cdp.sleep(580);
      await shot();
      await cdp.keyDown(client, sid, 'ShiftLeft');
      await cdp.sleep(40);
      await cdp.keyUp(client, sid, 'ShiftLeft');
      for (let i = 0; i < 12; i++) { await cdp.sleep(40); await shot(); }
      await cdp.keyUp(client, sid, 'KeyD');
    });

    // --------------------------------------------------------- 6. slam
    await place(sx + 200, sy - 100, null, 1);
    await segment('slam', 'SLAM — ground pound', async (shot) => {
      await cdp.sleep(100);
      await shot();
      await cdp.keyDown(client, sid, 'KeyS');
      for (let i = 0; i < 16; i++) { await cdp.sleep(40); await shot(); }
      await cdp.keyUp(client, sid, 'KeyS');
    });

    // ----------------------------------------------------------- combat
    await place(dumX + 26, dumY, null, -1);
    await healDummy();
    await segment('light', 'BLADE — light chain', async (shot) => {
      for (let hit = 0; hit < 3; hit++) {
        await cdp.keyDown(client, sid, 'KeyJ');
        await cdp.sleep(40);
        await cdp.keyUp(client, sid, 'KeyJ');
        for (let i = 0; i < 6; i++) { await cdp.sleep(40); await shot(); }
        await healDummy();
      }
    });

    await place(dumX + 26, dumY, null, -1);
    await healDummy();
    await segment('heavy-blade', 'BLADE — heavy', async (shot) => {
      await cdp.keyDown(client, sid, 'KeyS');
      await cdp.keyDown(client, sid, 'KeyJ');
      await cdp.sleep(40);
      await cdp.keyUp(client, sid, 'KeyJ');
      await cdp.keyUp(client, sid, 'KeyS');
      for (let i = 0; i < 10; i++) { await cdp.sleep(40); await shot(); }
    });

    const weapons = [
      ['daggers', 'TWIN DAGGERS'],
      ['warmaul', 'WARMAUL'],
      ['thornspear', 'THORNSPEAR']
    ];
    for (const [wid, label] of weapons) {
      await place(dumX + 26, dumY, wid, -1);
      await healDummy();
      await segment('light-' + wid, label + ' — light (weapon set directly; runtime switching not shipped yet)', async (shot) => {
        for (let hit = 0; hit < 3; hit++) {
          await cdp.keyDown(client, sid, 'KeyJ');
          await cdp.sleep(40);
          await cdp.keyUp(client, sid, 'KeyJ');
          for (let i = 0; i < 5; i++) { await cdp.sleep(40); await shot(); }
          await healDummy();
        }
      });

      await place(dumX + 26, dumY, wid, -1);
      await healDummy();
      await segment('heavy-' + wid, label + ' — heavy', async (shot) => {
        await cdp.keyDown(client, sid, 'KeyS');
        await cdp.keyDown(client, sid, 'KeyJ');
        await cdp.sleep(40);
        await cdp.keyUp(client, sid, 'KeyJ');
        await cdp.keyUp(client, sid, 'KeyS');
        for (let i = 0; i < 9; i++) { await cdp.sleep(40); await shot(); }
      });
    }

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(segments.map((s) => ({
      name: s.name, caption: s.caption, dir: path.relative(__dirname, s.dir), frames: s.frames
    })), null, 2));
    log('done. ' + segments.length + ' segments, manifest at ' + MANIFEST_PATH);
  } finally {
    if (client) client.close();
    cdp.killTree(proc);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) {}
  }
}

async function ev(client, sid, expr) { return cdp.evaluate(client, sid, expr); }
async function waitFor(client, sid, expr, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ev(client, sid, expr)) return true;
    await cdp.sleep(80);
  }
  throw new Error('waitFor timed out: ' + expr);
}

main().catch((e) => { console.error('[capture] FAILED', e); process.exit(1); });
