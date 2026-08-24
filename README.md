# CINDER LOOP

A standalone original 2D roguelite sidescroller in the Dead Cells grammar —
never a clone. No Motion Twin / Evil Empire assets, names, characters,
biomes, weapons, music, or sprites; genre conventions taken, all specific
expression authored fresh.

The canonical, always-current account of the project — status, design
decisions, and rationale — lives in [`CINDER_LOOP_MASTERFILE.md`](CINDER_LOOP_MASTERFILE.md),
with history in [`CINDER_LOOP_CHANGELOG.md`](CINDER_LOOP_CHANGELOG.md). This
README is just an orientation map for the repo; treat the masterfile as
canonical if the two ever disagree.

## Layout

```
src/NN-*.js     Source modules, numbered by dependency order (00 -> 95).
                Dependencies run strictly one way; a module needing something
                from a higher number is a design error, not a build flag.
build.py        Concatenates src/NN-*.js into the single offline build.
cinder-loop.html  The built game — zero network calls, runs standalone.
tests/          Node + CDP (Chrome DevTools Protocol) test suites, one
                verify_*.js per subsystem, run against a real headless
                Chrome instance driving the real built HTML.
docs/           Design specs.
```

## Building

```bash
python build.py            # writes cinder-loop.html
python build.py --check    # validate only, writes nothing
```

The build enforces two invariants rather than leaving them to review:
module order always follows the numeric prefix, and the output must run
completely offline — any absolute URL, `fetch`, `XHR`, or dynamic import in
the sources fails the build.

## Testing

```bash
tests/run_all.sh              # everything; green here means shippable
VERBOSE=1 tests/run_all.sh    # print every assertion, not just failures
```

`run_all.sh` builds first (a suite passing against unbuildable sources
proves nothing) and runs `verify_arch` next (when the architecture is
broken, every other failure is a symptom). Individual suites can also be
run directly, e.g.:

```bash
node tests/verify_render.js
```

## Status

See the top of [`CINDER_LOOP_MASTERFILE.md`](CINDER_LOOP_MASTERFILE.md) for
the current build's status and the most recently shipped feature.
