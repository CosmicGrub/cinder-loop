/* ===========================================================================
 * tests/verify_build.js  —  build.py, exercised for real (L8)
 * ---------------------------------------------------------------------------
 * Adversarially found (2026-09-06 audit): build.py had zero dedicated test
 * coverage — every one of its checks was only ever exercised as a side
 * effect of the current, always-clean src/ tree passing the happy path.
 * Its own failure paths (the BANNED-token scan, the REQUIRED-file check,
 * node --check) had never actually been PROVEN to fire; reproduction during
 * that same audit found two real, silent gaps in the happy path itself (a
 * stray leftover file joining the build with zero warning, and 56-caller.js
 * missing from REQUIRED since D16 — both fixed in build.py directly, this
 * file is what proves the fixes actually work and stays working).
 *
 * This is the one place in the whole test suite that shells out to a SECOND
 * language (Python) rather than loading a src/ module into a JS sandbox —
 * there is no other way to exercise build.py's own real logic without
 * reimplementing it in JS, which L8 exists specifically to avoid. Every
 * mutation below runs against a full, isolated TEMP COPY of the real
 * project (build.py + src/), never the actual working tree — a failing
 * assertion here must never leave a broken src/ file behind for a later
 * suite to trip over.
 * ======================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const H = require('./harness');

const s = new H.Suite('verify_build');
const ROOT = H.ROOT;
const SRC = H.SRC;

// Mirrors tests/run_all.sh's own resolution exactly: respect PYTHON if set,
// else try `python`, falling back to `python3` — the same two-step probe,
// so this suite runs on the identical interpreter run_all.sh itself would
// pick, not a second, independently-guessed one.
function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const probe = spawnSync('python', ['--version']);
  if (!probe.error) return 'python';
  return 'python3';
}
const PYTHON = resolvePython();

// A fresh temp copy of build.py + src/ — every test gets its own, so a
// mutation in one can never bleed into another, and nothing here ever
// touches the real working tree.
function makeTempProject(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinder-build-test-'));
  fs.copyFileSync(path.join(ROOT, 'build.py'), path.join(dir, 'build.py'));
  const srcOut = path.join(dir, 'src');
  fs.mkdirSync(srcOut);
  for (const f of fs.readdirSync(SRC)) {
    if (f.endsWith('.js')) fs.copyFileSync(path.join(SRC, f), path.join(srcOut, f));
  }
  if (mutate) mutate(srcOut);
  return dir;
}

function runBuild(dir) {
  const r = spawnSync(PYTHON, ['build.py', '--check'], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ============================================================ 1. baseline
 * Proves the harness itself is sound before trusting any failure-path
 * result below — if the unmutated copy didn't build clean, a "failure"
 * elsewhere could just be this test rig, not build.py's own logic. */
{
  const dir = makeTempProject();
  const r = runBuild(dir);
  s.eq('an unmutated copy of the real project builds clean', r.code, 0, r.stderr || r.stdout);
  s.ok('reports the real module count', /modules\s+22\b/.test(r.stdout), r.stdout.slice(0, 80));
  cleanup(dir);
}

/* ============================================== 2. the BANNED-token scan */
{
  const dir = makeTempProject((srcOut) => {
    const p = path.join(srcOut, '30-player.js');
    fs.appendFileSync(p, '\nfunction _t() { return Math.random(); }\n');
  });
  const r = runBuild(dir);
  s.ok('a real banned token (Math.random) fails the build', r.code !== 0);
  s.ok('names the violation as an offline/determinism problem',
    r.stderr.indexOf('offline/determinism violations') !== -1, r.stderr);
  s.ok('cites the real file it was found in', r.stderr.indexOf('30-player.js') !== -1, r.stderr);
  cleanup(dir);
}
{
  // The [^:] guard exists specifically so a real URL in prose (a comment)
  // is still caught, while `https://` is never mistaken FOR a comment —
  // confirm the positive case (a real fetch() call, not in a comment) still
  // fails, proving the scan runs against actual code, not just any text.
  const dir = makeTempProject((srcOut) => {
    const p = path.join(srcOut, '95-app.js');
    fs.appendFileSync(p, '\nfunction _t() { return fetch("https://example.com"); }\n');
  });
  const r = runBuild(dir);
  s.ok('a real fetch()+absolute URL both fail the build', r.code !== 0);
  s.ok('reports both violations, not just the first', (r.stderr.match(/95-app\.js/g) || []).length >= 2, r.stderr);
  cleanup(dir);
}

/* ======================================================= 3. REQUIRED file */
{
  const dir = makeTempProject((srcOut) => {
    fs.unlinkSync(path.join(srcOut, '45-enemy.js'));
  });
  const r = runBuild(dir);
  s.ok('a missing REQUIRED module fails the build', r.code !== 0);
  s.ok('names it as a missing required module',
    r.stderr.indexOf('missing required module(s)') !== -1 && r.stderr.indexOf('45-enemy.js') !== -1, r.stderr);
  cleanup(dir);
}

/* ========================================== 4. node --check (real syntax) */
{
  const dir = makeTempProject((srcOut) => {
    const p = path.join(srcOut, '70-sim.js');
    fs.appendFileSync(p, '\nfunction _brokenOnPurpose( {\n');
  });
  const r = runBuild(dir);
  s.ok('an unbalanced brace fails the build', r.code !== 0);
  s.ok('reports it as a parse failure, not a BANNED-token or missing-file one',
    r.stderr.indexOf('does not parse') !== -1, r.stderr);
  cleanup(dir);
}

/* ============================ 5. adversarially-found guards (2026-09-06) */
{
  // A stray/leftover file joining the build with zero warning — the exact
  // bug reproduced during the audit that added this whole suite. A GENUINELY
  // unique prefix (99) is deliberate here, isolating this guard from the
  // duplicate-prefix one tested separately below — the original repro used
  // a same-prefix name ("56-caller-old.js") and that collision triggers the
  // OTHER guard first, proving nothing about this one specifically (found
  // writing this exact test, not assumed away).
  const dir = makeTempProject((srcOut) => {
    fs.copyFileSync(path.join(srcOut, '00-core.js'), path.join(srcOut, '99-stray.js'));
  });
  const r = runBuild(dir);
  s.ok('a stray extra file (not in REQUIRED) fails the build, not silently joins it', r.code !== 0);
  s.ok('names it as unexpected, not REQUIRED',
    r.stderr.indexOf('unexpected module(s) not in REQUIRED') !== -1 && r.stderr.indexOf('99-stray.js') !== -1,
    r.stderr);
  cleanup(dir);
}
{
  // Two files sharing one numeric prefix — module order would otherwise be
  // resolved silently by filename sort, not by anything meaningful.
  const dir = makeTempProject((srcOut) => {
    fs.copyFileSync(path.join(srcOut, '45-enemy.js'), path.join(srcOut, '45-enemy-dup.js'));
  });
  const r = runBuild(dir);
  s.ok('two files sharing a numeric prefix fail the build', r.code !== 0);
  s.ok('names the real prefix collision',
    r.stderr.indexOf('share numeric prefix 45') !== -1, r.stderr);
  cleanup(dir);
}

/* ==================================================== 6. REQUIRED itself
 * Confirms every currently-shipping file the build actually needs is
 * listed — a direct regression test for the exact gap the audit found
 * (56-caller.js missing from REQUIRED since D16, caught only because the
 * new "unexpected module" guard above happened to also catch its absence
 * from the reverse direction). Reads REQUIRED out of the real build.py
 * source rather than hand-copying the list here, so this can never drift
 * from what build.py itself actually enforces. */
{
  const buildPySrc = fs.readFileSync(path.join(ROOT, 'build.py'), 'utf8');
  const m = buildPySrc.match(/REQUIRED\s*=\s*\[([\s\S]*?)\]/);
  s.ok('REQUIRED is findable in the real build.py source', !!m);
  const required = m ? Array.from(m[1].matchAll(/"([^"]+)"/g)).map((x) => x[1]) : [];
  const realFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
  const missingFromRequired = realFiles.filter((f) => required.indexOf(f) === -1);
  s.eq('every real src/*.js file is present in REQUIRED',
    missingFromRequired.join(','), '', missingFromRequired.join(','));
  const requiredButAbsent = required.filter((f) => realFiles.indexOf(f) === -1);
  s.eq('and REQUIRED names nothing that does not actually exist',
    requiredButAbsent.join(','), '', requiredButAbsent.join(','));
}

process.exit(s.done());
