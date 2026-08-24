#!/usr/bin/env python3
"""
build.py — concatenate src/NN-*.js into one offline HTML file (L2, L6).

    python build.py            -> cinder-loop.html
    python build.py --check    -> validate only, write nothing

Two invariants are enforced here rather than left to review:

  * Module order is the numeric prefix, always. Dependencies in this codebase
    run strictly one way (00 -> 95) and a file that needs something from a
    higher number is a design error, not a build flag.

  * Zero network. The built page must run from a thumb drive with the wifi
    off, so any absolute URL, fetch, XHR or dynamic import in the sources
    fails the build. Vendored libraries, if any are ever added, are dropped in
    whole and never text-edited.
"""

import base64
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
OUT = os.path.join(ROOT, "cinder-loop.html")

# Every module that must exist for a build to be meaningful. A missing file is
# a hard error: silently producing a smaller game is the worst outcome here.
REQUIRED = [
    "00-core.js",
    "05-input.js",
    "10-data.js",
    "20-world.js",
    "25-body.js",
    "30-player.js",
    "35-rig.js",
    "40-combat.js",
    "45-enemy.js",
    "50-gen.js",
    "55-boss.js",
    "60-run.js",
    "65-meta.js",
    "70-sim.js",
    "80-view.js",
    "82-narrative.js",
    "85-audio.js",
    "90-settings.js",
    "92-menu.js",
    "94-touch.js",
    "95-app.js",
]

BANNED = [
    (re.compile(r"https?://"), "absolute URL"),
    (re.compile(r"\bfetch\s*\("), "fetch()"),
    (re.compile(r"\bXMLHttpRequest\b"), "XMLHttpRequest"),
    (re.compile(r"\bimport\s*\("), "dynamic import()"),
    (re.compile(r"\bWebSocket\b"), "WebSocket"),
    (re.compile(r"\bMath\.random\b"), "Math.random"),
]

# Math.random is legal nowhere in this codebase (L4). The presenter has its
# own integer streams; see Camera.offset and Particles.rand.

# ---------------------------------------------------------------------------
# App icon. Reuses the in-game hood/ember head exactly (COLOR.clothDark ring,
# COLOR.hood hollow, COLOR.emberHot eye from 80-view.js) rather than inventing
# a second visual language — the icon IS the character's head, enlarged. SVG,
# not a raster: crisp at any OS-requested size with one asset, no image
# pipeline needed, and it stays inline as a data: URI (L2 — zero network,
# nothing fetched at install or launch time). Corners are left square and
# unmasked on purpose: Android adaptive-icon shapes and iOS's own rounding
# both apply their own mask, and a hand-rounded SVG fights whichever the OS
# picks rather than complementing it.
ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" fill="#0d0b10"/>
<circle cx="50" cy="46" r="30" fill="#8a7350"/>
<circle cx="50" cy="46" r="24" fill="#1a1620"/>
<rect x="44" y="40" width="12" height="12" fill="#ff9a5c"/>
</svg>"""


def data_uri(mime, text):
    b64 = base64.b64encode(text.encode("utf-8")).decode("ascii")
    return "data:%s;base64,%s" % (mime, b64)


def build_manifest(icon_uri):
    """A Web App Manifest, embedded as a data: URI link rather than a second
    file — the single-file constraint (L2) has no exception for "just the
    manifest". This gets the page to a real installable state on Android
    Chrome (Settings > Add to Home screen, manually — data: URI manifests do
    not reliably satisfy the criteria for the automatic beforeinstallprompt
    banner, which additionally wants a same-origin service worker with a
    fetch handler, and a service worker cannot be registered from a data: URL
    at all per spec; that automatic prompt is out of reach inside one static
    file and is not claimed here). `orientation: landscape` is a soft
    preference honoured by browsers that support it for a STANDALONE-launched
    (installed) instance only — it does nothing for a plain browser tab,
    which is why 95-app.js separately shows an in-page rotate hint for that
    case rather than relying on this alone.
    """
    manifest = {
        "name": "CINDER LOOP",
        "short_name": "Cinder Loop",
        "description": "A standalone original 2D roguelite sidescroller.",
        "start_url": ".",
        "display": "standalone",
        "orientation": "landscape",
        "background_color": "#0d0b10",
        "theme_color": "#0d0b10",
        "icons": [{"src": icon_uri, "sizes": "any", "type": "image/svg+xml", "purpose": "any"}],
    }
    return data_uri("application/manifest+json", json.dumps(manifest))


HEAD_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>CINDER LOOP</title>
<link rel="manifest" href="__MANIFEST_URI__">
<link rel="icon" type="image/svg+xml" href="__ICON_URI__">
<link rel="apple-touch-icon" href="__ICON_URI__">
<!-- iOS Safari does not read the Web App Manifest for "Add to Home Screen"
     styling; it reads these meta tags specifically, so both paths are kept.
     apple-touch-icon as SVG is best-effort — some iOS versions prefer a PNG
     and fall back to a page-screenshot icon instead of this one. There is no
     image-rasterization step in this project (no Pillow/image pipeline, and
     adding one would be a new dependency for one icon), so that gap is
     accepted rather than silently claimed to be solved. -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Cinder Loop">
<meta name="theme-color" content="#0d0b10">
<style>
  :root {
    /* viewport-fit=cover above is what makes these resolve to anything but 0
       (per spec) — on a notched/rounded-corner/gesture-bar device this is the
       real inset in CSS px; everywhere else it is 0 and every rule below is a
       no-op. Exposed as custom properties so 95-app.js can read the same
       numbers back with getComputedStyle for on-CANVAS chrome (touch
       controls), which CSS alone cannot keep clear of a notch by itself. */
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-right: env(safe-area-inset-right, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-left: env(safe-area-inset-left, 0px);
  }
  html, body {
    margin: 0; padding: 0; height: 100%; overflow: hidden;
    background: #0d0b10; color: #e8d8b0;
    font-family: ui-monospace, Consolas, monospace;
    overscroll-behavior: none;
  }
  #game {
    display: block; width: 100%; height: 100%;
    image-rendering: pixelated; image-rendering: crisp-edges;
    touch-action: none; outline: none;
  }
  #hint {
    position: fixed; margin: 0;
    left: calc(10px + var(--safe-left)); bottom: calc(8px + var(--safe-bottom));
    font-size: 11px; color: #4a4350; pointer-events: none; user-select: none;
  }
  #rotate {
    position: fixed; inset: 0; z-index: 50;
    display: none; align-items: center; justify-content: center;
    flex-direction: column; gap: 10px; text-align: center; padding: 24px;
    background: rgba(13,11,16,0.94); color: #e8d8b0;
    font: 13px ui-monospace, Consolas, monospace;
  }
  /* Shown only on a touch-capable device narrower than it is tall — a soft
     nudge, not a hard lock (see 95-app.js: Screen Orientation lock requires
     a fullscreen gesture this page never forces on the player). */
  @media (pointer: coarse) and (orientation: portrait) {
    #rotate.active { display: flex; }
  }
</style>
</head>
<body>
<canvas id="game" tabindex="0"></canvas>
<p id="hint">move A/D &middot; jump SPACE &middot; attack J &middot; heavy S+J &middot; roll SHIFT &middot; crouch S &middot; slam S in air &middot; F2 co-op &middot; F3 meter &middot; F4 hitboxes</p>
<div id="rotate"><div>&#8635;</div><div>turn your device sideways<br>for the full view</div></div>
<script>
(function () {
'use strict';
var CINDER = {};
"""

TAIL = """})();
</script>
</body>
</html>
"""


def strip_comments(src):
    """Comments, for scanning purposes only — the emitted HTML keeps them.

    A comment that says "no Math.random in the sim" is documentation, not a
    call. Failing the build on prose teaches people to stop writing prose.
    The `[^:]` guard keeps `https://` from being mistaken for a comment, so a
    real URL is still caught.
    """
    src = re.sub(r"/\*[\s\S]*?\*/", " ", src)
    src = re.sub(r"(^|[^:])//[^\n]*", r"\1 ", src)
    return src


def modules():
    """Every .js in src/, ordered by its numeric prefix."""
    if not os.path.isdir(SRC):
        die("no src/ directory at %s" % SRC)
    found = [f for f in os.listdir(SRC) if f.endswith(".js")]
    numbered = []
    for f in found:
        m = re.match(r"^(\d+)-", f)
        if not m:
            die("src/%s has no numeric prefix; module order would be undefined" % f)
        numbered.append((int(m.group(1)), f))
    numbered.sort()
    return [f for _, f in numbered]


def die(msg):
    sys.stderr.write("FATAL: %s\n" % msg)
    sys.exit(1)


def check_syntax(js_text):
    """Run `node --check` against the fully assembled script.

    A build step that only concatenates strings cannot see a stray comment
    terminator that swallows the next line as code, or a brace left unbalanced
    across a module boundary — the class of bug this exists to catch cost real
    debugging time once already, surfacing many steps downstream inside a
    browser test instead of at the point the edit was made. `node` is treated
    as a hard requirement here, same as tests/run_all.sh already treats it for
    the rest of the gate: silently skipping this on a machine that lacks it
    would quietly let the exact bug back in.
    """
    node = os.environ.get("NODE", "node")
    fd, tmp = tempfile.mkstemp(suffix=".js")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(js_text)
        try:
            proc = subprocess.run([node, "--check", tmp], capture_output=True, text=True)
        except FileNotFoundError:
            die("no node on PATH; required to syntax-check the assembled build")
        if proc.returncode != 0:
            return (proc.stderr or proc.stdout or "node --check failed").strip()
        return None
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def main():
    check_only = "--check" in sys.argv
    order = modules()

    missing = [f for f in REQUIRED if f not in order]
    if missing:
        die("missing required module(s): %s" % ", ".join(missing))

    icon_uri = data_uri("image/svg+xml", ICON_SVG)
    manifest_uri = build_manifest(icon_uri)
    # Plain token replace, not % or .format(): the template is full of literal
    # % (CSS percentages) and { } (CSS rules, the JS below it), either of
    # which a format-string substitution would trip over.
    head = HEAD_TEMPLATE.replace("__ICON_URI__", icon_uri).replace("__MANIFEST_URI__", manifest_uri)

    parts = [head]
    total = 0
    problems = []

    for name in order:
        path = os.path.join(SRC, name)
        with open(path, "r", encoding="utf-8") as fh:
            body = fh.read()
        scanned = strip_comments(body)
        for pattern, label in BANNED:
            for m in pattern.finditer(scanned):
                line = scanned.count("\n", 0, m.start()) + 1
                problems.append("src/%s:%d  %s" % (name, line, label))
        total += len(body.encode("utf-8"))
        parts.append("\n/* ==== src/%s ==== */\n" % name)
        parts.append(body)

    if problems:
        sys.stderr.write("FATAL: offline/determinism violations\n")
        for p in problems:
            sys.stderr.write("  %s\n" % p)
        sys.exit(1)

    parts.append("\n")
    parts.append(TAIL)
    html = "".join(parts)

    script_match = re.search(r"<script>\n(.*)\n</script>", html, re.S)
    if not script_match:
        die("could not locate the assembled <script> block to syntax-check")
    syntax_err = check_syntax(script_match.group(1))
    if syntax_err:
        sys.stderr.write("FATAL: the assembled script does not parse\n")
        sys.stderr.write(syntax_err + "\n")
        sys.exit(1)

    print("  modules   %d  (%s)" % (len(order), ", ".join(order)))
    print("  source    %d bytes" % total)
    print("  syntax    OK (node --check)")

    if check_only:
        print("  check     OK (nothing written)")
        return 0

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)
    # len(html) counts Unicode CHARACTERS, not the UTF-8 bytes actually
    # written to disk — this codebase's own comments are full of multi-byte
    # characters (em dashes, arrows), so a char count silently under-reports
    # the real file size. Found by an adversarial doc-verification pass
    # (v0.2.11) after a byte figure copied verbatim from this line's own
    # output didn't match the real file on disk.
    print("  wrote     %s  (%d bytes)" % (os.path.relpath(OUT, ROOT), len(html.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
