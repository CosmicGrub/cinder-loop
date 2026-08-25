# Checkpoint narration (D21)

Status: design approved by user 2026-08-25. Not yet implemented.
Companion docs: `CINDER_LOOP_MASTERFILE.md` (D-series decisions),
`docs/superpowers/pitches/2026-08-24-post-d13-system-pitches.md` (the
pitch this spec formalizes, ranked #1 of the revised Tier 1 build order).

## 0. Why this exists

D11's own reserved Bus surface has a declared consumer — `82-narrative.js`
— that D14's checkpoint work never wired up. A room checkpoint is
currently narratively silent: `Sim.prototype._onRoomClear()`
(`70-sim.js:1066-1071`) fires a real `'checkpoint'` Bus event with real
context (`{roomIndex, healed, handedIn}`) the instant a room's roster
clears, and nothing reads it. This is the highest-confidence, lowest-risk
narrative gap left in the game — finishing a declared-but-unbuilt half of
an existing feature (D11), not a new design decision.

## 1. Scope: one new subscription, one new line pool, nothing else

`Narrative.prototype.subscribe` (`82-narrative.js:117-123`) currently
subscribes to exactly one Bus event, `'telegraph'`, idempotently (a
`this._subscribed` guard prevents double-registration). Gains a sibling
subscription:

```js
bus.on('checkpoint', function () { self._say('checkpoint', LINE_TTL_MS); });
```

`_say(pool, ttl)` (`82-narrative.js:131-135`) already exists and does
exactly what's needed — picks a random line from `DIALOGUE.narrator[pool]`
via this file's own presenter-owned RNG (never `sim.rng`, per this file's
own L4/L5 discipline) and shows it. No new method, no branching on the
payload's `healed`/`handedIn` fields — this is deliberately scoped to
match the pitch's own explicit judgment call, resolved below.

**Named judgment call, resolved with the user: one generic pool, not two
tiered ones.** The original pitch offered a fork — a single
`DIALOGUE.narrator.checkpoint` pool, or two (`checkpoint` /
`checkpointFinal`, the latter reserved for the room right before the boss
door, keyed on `e.roomIndex === CFG.ROOM_COUNT - 1`). The tiered version
would require importing `CFG` into `82-narrative.js` for the first time
in this file's history — confirmed by reading the file in full: it
currently imports only `RNG` and `DIALOGUE` (`82-narrative.js:45`),
matching its own stated purity ("chosen text has zero effect on sim
state" — its header's own words). A single generic pool keeps that
genuinely true: this feature adds **zero new CFG, zero new Bus event**
(`'checkpoint'` is already whitelisted by D14) and **zero sim-file
changes** — exactly what makes it the cheapest system in the entire
roadmap, a property a tiered version would quietly give up for a real
but modest texture gain. Decided in favor of preserving it.

## 2. What's inherited for free, not built new

- **Death-always-wins priority.** `_onRoomClear()`'s own guard
  (`!justDied` at its call site, `70-sim.js`'s `_stepRun()`) already
  guarantees `'checkpoint'` never fires on the exact tick a death also
  happens — so a checkpoint line can never collide with (or wrongly
  override) a death line. No new arbitration logic needed on the
  narrative side; the invariant already holds at the source.
- **Display-slot behavior.** `_show()` (`82-narrative.js:137-139`)
  unconditionally overwrites `this.current` — the same "whichever fires
  last wins the box" behavior every other narrator/bark interaction in
  this file already has (a bark firing moments after a narrator line
  already does this). Checkpoint narration needs no special handling to
  fit this existing rule.
- **D12's double-voice rule.** Honored purely through how the lines are
  worded (calmer, "tempered"/"mended" register than `bossEntry`; written
  to reread differently once the Kilnkeeper reveal has landed) — no code
  path change, matching how every other narrator pool already carries
  this rule in content, not logic.

## 3. Concrete file-level shape

- `src/10-data.js` — one new array, `DIALOGUE.narrator.checkpoint`, a
  handful of real, non-empty strings, sibling to the existing
  `levelStart`/`bossEntry`/`reveal`/`bossVictory`/`death` pools
  (`10-data.js:220-249`).
- `src/82-narrative.js` — one new line in `subscribe()`.
- No other file changes.

## 4. Testing approach (L8 — exercise the real functions)

Mirrors the existing `'telegraph'`-bark test shape in
`tests/verify_narrative.js` exactly (the fake-bus/fake-sim fixture
already there, `fakeBus()`/`fakeSim()`, `verify_narrative.js:20-35`):

- The content-completeness sweep (`verify_narrative.js:37-53`, iterating
  a fixed pool-name list) extends to include `'checkpoint'` — every line
  in the new pool is a real, non-empty string.
- A real `sim.bus.emit('checkpoint', {roomIndex: 0, healed: 0, handedIn:
  []})` shows a line from `DIALOGUE.narrator.checkpoint`, tagged
  `'narrator'` (mirrors `verify_narrative.js`'s own bark-trigger test,
  ~line 249-257).
- The existing double-subscribe regression (`verify_narrative.js:235-247`)
  already counts RNG draws generically across every subscription — no new
  test needed there, but worth confirming it still passes unmodified
  (proving the new subscription doesn't introduce a second registration
  path).
- TTL counts down and expires the same way every other narrator line
  already does (`verify_narrative.js:287-295`'s own shape) — a real
  regression, not just inherited by inspection, since it's cheap to add.

## 5. Explicitly out of scope for v1

- Reacting to the `'checkpoint'` payload's `healed`/`handedIn` fields with
  distinct line variants — doubles the content-authoring surface, a
  deliberate v2, not a v1 gap.
- Any `'cinderBanked'`/`'cinderLost'` reaction — blocked on the cinder
  economy itself not existing yet (D14's own named follow-up, Tier 2 on
  the current roadmap).
- The two-pool tiered version named in §1 — a real, legitimate future
  enhancement if the single generic pool ever feels thin, not ruled out
  permanently, just not built now.
