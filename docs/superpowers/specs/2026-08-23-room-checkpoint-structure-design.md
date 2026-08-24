# Room-based level structure, checkpoints, and cinder banking

Status: design approved by user 2026-08-23, not yet implemented.
Companion docs: `CINDER_LOOP_MASTERFILE.md` (D-series decisions), `CINDER_LOOP_CHANGELOG.md`.

## 1. Goal

Give a level real internal structure — a sequence of discrete rooms you
fight through and clear, gated by checkpoints — instead of one continuous
generated space. Modeled on Dead Cells/Castlevania/Hollow Knight room
pacing, but deliberately grafted onto CINDER LOOP's own locked identity
(D1: the roguelite run loop) rather than replacing it.

## 2. The one decision everything else depends on: death still ends the run

D1 (this project's very first locked decision) defines the run loop as
spawn → clear → boss → die → spend → respawn, with death as one of
exactly two ways a run ends. This feature does **not** change that.

Rooms and checkpoints exist for **pacing and structure within one run**,
not as a death-recovery mechanic. A death anywhere, in any room, still
ends the whole run exactly as it does today — there is no "resume at
your last checkpoint after dying," the way a Castlevania/Hollow Knight
bonfire/save-crystal would work. That model was considered and explicitly
rejected in favor of keeping D1 intact (user choice, 2026-08-23).

Everything below is a hybrid: real checkpoints, real room structure, real
stakes at the room level — but the run's own permadeath identity is
untouched.

## 3. Room graph & pacing

- A level is a **linear chain**: 3 procedurally-generated combat rooms,
  then a boss room. (Branching/optional rooms were considered and
  deferred — see §11.)
- Difficulty escalates room 1 → 2 → 3 via enemy count/composition, the
  same lever D2's own stat/difficulty scaling already uses elsewhere —
  no new difficulty-curve system needed.
- The boss room is the existing boss encounter, now framed as the final
  room in the chain rather than a separate phase reached by an "exit."

## 4. Generation — reusing what already exists, not inventing new machinery

The single biggest risk-reducer in this design: **the mechanism this
needs already exists.** `Sim.prototype._enterLevel()` /
`Sim.prototype._enterBoss()` already tear down one `World` + enemy roster
and load a fresh one mid-run, for the existing level→boss transition.
Room-to-room transitions reuse that exact shape — a new
`Sim.prototype._enterRoom(i)`, modeled directly on the two that already
exist, called in a loop instead of once.

Each combat room is one `Gen.generate()` call bounded to smaller
dimensions than a full level, independently fairness-audited by the
*same* D3a machinery (reachability from entrance to exit, to every
pickup, minimum fightable-platform widths, reject-and-regenerate on
failure) — no changes to the audit's own rules, only smaller inputs.

Per-room seeds derive from the existing level-seed derivation
(`RunLogic.deriveLevelSeed`), extended one level deeper (room index folded
into the derivation), so a room's shape stays seeded and reproducible the
same way a level's already is.

## 5. Room content

- **Combat rooms** (the 3 in the chain): fully procedural, per §4. Zero
  new hand-authored content.
- **Checkpoint room and boss room**: each gets a small number of
  hand-authored layouts (not procedurally generated). This is a narrow,
  deliberate exception to D3's "procedural over hand-authored chunks" —
  bounded to these two room *types* specifically, not a general content
  pipeline. Reasoning: these are the two moments meant to feel like a
  designed space rather than "procedural chamber #47," and the set is
  small and closed (unlike combat rooms, which need infinite variety).

## 6. What "clear" means, per room

Reuses D1's own definition verbatim, scoped down from level to room:
every enemy this room placed has hp ≤ 0, **and** a living player has
reached the room's own exit/door. Reaching the door alone doesn't clear
it (would let a player tunnel past placed enemies); killing everything
without reaching the door doesn't either (mirrors `isLevelClear`'s own
existing "an empty roster is never vacuously clear" reasoning).

The door to the next room is locked/visually inert until the current
room is clear.

## 7. The checkpoint — four things it does

Reached the instant a room is cleared (§6). All four happen there,
together:

### 7a. Gates the room graph
This *is* §6 — the door unlocks. No separate mechanism.

### 7b. Save-and-quit resume point
On room-clear, persist `{room index, its own seed, run-in-progress
state}` to a new, small, run-scoped persistence key — parallel to
Settings/Meta, not merged into either (this project's own established
precedent: reuse a shape, never merge conceptually different things into
one payload). On reload, if this key is present and valid, `boot()`
restores directly into room index N+1, **freshly regenerated from its
stored seed** — not a rehydration of a live, mid-fight state. You never
resume inside a partially-cleared room; you resume at the checkpoint you
actually reached. This is a deliberate scope boundary, not a limitation
discovered later: serializing live enemy HP/position/hitstop/projectiles
would be real added complexity this feature doesn't need to deliver on
its own promise ("hit a save point").

This closes a real, already-existing gap: today, nothing about an
in-progress run survives a page reload — only permanent meta-progression
(currency, unlocked blueprints) does.

### 7c. Heal / narrative beat
A partial heal. A new `checkpoint` entry in `DIALOGUE.narrator`, fired
the same way `levelStart`/`bossEntry` already are (`82-narrative.js`). A
new SFX cue (`85-audio.js`/`10-data.js`'s `SFX` table), same shape as the
fifteen that exist today. No new architecture in either file — one more
row in an existing table, one more trigger off an existing pattern.

### 7d. Blueprint hand-in
D4 defines a carried blueprint's fate as: dropped from a kill, carried,
lost on death, handed in *at a transition*, paid to unlock into the
permanent pool. Today "a transition" only ever means the full level/run
end. A room-clear checkpoint is genuinely a mid-level transition too —
so the **same existing hand-in logic** (currently only called from
`Sim.prototype._commitPendingLevel()`) fires at every checkpoint as well,
not just the last one. No new mechanic; the existing code path gets a
second call site. (Implementation note: the hand-in loop inside
`_commitPendingLevel()` should be factored into a shared helper both the
checkpoint path and the final level-end path call, so there is exactly
one implementation of "hand in a carried blueprint," not two.)

**Real, worth-naming consequence:** blueprints become meaningfully easier
to actually cash in — up to three hand-in opportunities per level instead
of one. This is a genuine economy/difficulty shift, not a side effect to
bury; it should be named in the eventual changelog entry the same way
this project names every other deliberate tradeoff.

## 8. Cinders — a new, genuinely at-risk resource

Distinct from currency (which stays exactly as safe as it already is —
see §9). Named for the game's own existing kiln/ash/ember/wick vocabulary
(the Kilnkeeper, the title itself) — a content/flavor choice, not binding
if a better name turns up later.

- **Drop:** the same shape carried blueprints already use — kills have a
  chance to drop cinders (D4's "blueprints drop from real kills"
  precedent, generalized to a second droppable resource type).
- **Carry:** a new numeric field (e.g. `player.carriedCinders`), an
  accumulator — unlike a blueprint's single weapon-id slot, a player can
  carry several cinders before banking. Lost entirely on death, via the
  exact same `resetTransient()` path that already clears a carried
  blueprint. This is the actual stakes the mechanic needs: something is
  genuinely lost if you don't act before you die.
- **Bank:** the checkpoint room contains a real, interactable world
  object (the pneumatic tube). Reaching a checkpoint does **not**
  auto-bank cinders — the player must walk up and interact (an action-key
  prompt) to send everything currently carried through. This is a
  deliberate choice over an automatic version: it turns the checkpoint
  into a real decision point (bank now for safety, or keep carrying into
  the next room for fewer trips, at the real risk of losing everything to
  one death), and it earns the "sending it through a tube" framing with
  an actual moment — an animation, a whoosh SFX cue, a visible deposit —
  rather than an invisible number change.
- **Conversion:** banked cinders convert into `meta.currency` — the
  existing, already-safe permanent pool. No new currency type, no
  parallel economy to maintain; cinders are a *second, riskier income
  stream* into a pool that already exists, not a whole new ledger.
  Conversion rate is a tunable `CFG` constant, not specified here (see
  §11 — exact numbers are a balance/playtesting question, not a design
  question).
- **No multiplier for waiting.** Carrying cinders forward has no bonus
  attached — the risk of losing everything IS the mechanic. Adding a
  reward for delaying the bank is a real design lever this spec
  deliberately leaves out of v1 rather than speculatively including.
- The final checkpoint (end of room 3, before the boss room) works
  exactly like any other — the player's last chance to bank before the
  fight. No special-casing needed; it falls out of the room-chain shape
  in §3 for free.

## 9. What does NOT change

- Currency (`meta.currency`) keeps its existing, already-tested guarantee
  from v0.2.14: it converts to permanent progress at run-end regardless
  of whether that end was a death or a boss victory. This feature adds a
  new INCOME STREAM into that pool (§8); it does not touch the rule
  itself.
- Death still ends the whole run (§2). No mid-run "continue" exists.
- The meta-progression persistence model (`65-meta.js`) is untouched —
  the new save-and-quit key (§7b) is a separate, run-scoped payload, not
  a change to how permanent progression is stored.

## 10. Concrete file-level shape

Implementation-plan-level detail, offered for scope estimation — final
module boundaries belong to the implementation plan, not this spec.

| File | Change |
|---|---|
| `50-gen.js` | A room-bounded `generate()` entry point (smaller W/H than a full level); same D3a fairness audit, no new rules. |
| `60-run.js` (`RunLogic`) | Room index/count on run state; per-room seed derivation (extends `deriveLevelSeed` one level deeper); a room-scoped `isRoomClear`/`reachedRoomExit` pair, structurally identical to the existing level-clear shape. |
| `70-sim.js` | New `Sim.prototype._enterRoom(i)`, modeled on the existing `_enterLevel()`/`_enterBoss()`. The blueprint hand-in loop factored out of `_commitPendingLevel()` into a shared helper (§7d). New `player.carriedCinders` field, cleared by the existing `resetTransient()` path. A bank-at-tube interaction, reusing the shared hand-in helper's "convert carried resource → permanent pool" shape. |
| `10-data.js` | One new `DIALOGUE.narrator.checkpoint` pool. One new `SFX` table entry for the bank/checkpoint cue. |
| `82-narrative.js` | Trigger wiring for the new `checkpoint` narrator pool — same shape as the five that exist. |
| `85-audio.js` | Trigger wiring for the new SFX cue — same shape as the fifteen that exist. |
| new, small module (name TBD at implementation time) | The run-scoped save-and-quit persistence key (§7b) — a third payload, parallel to `90-settings.js`/`65-meta.js`, not merged into either. |
| `95-app.js` (`boot()`) | Checks the new save-and-quit key before calling `sim.beginRun()`; if present and valid, initializes into the stored room index instead of room 0. |

No new enemy templates or weapons are required — room-to-room difficulty
escalation reuses the existing 4-template roster via density/composition
(§3), the same lever D2 already uses elsewhere.

## 11. Explicitly out of scope for v1

- **Branching rooms.** The room graph is a linear chain (§3). A
  branching/optional-room graph was presented as an alternative and
  explicitly not chosen — a real, later, additive feature, not a gap.
- **Hand-authored combat rooms.** Only the checkpoint and boss room types
  get hand-authored layouts (§5); ordinary combat rooms stay fully
  procedural.
- **Mid-fight resume.** Save-and-quit always resumes at a checkpoint,
  never inside a partially-cleared room (§7b).
- **Any change to death ending the run.** Covered in full in §2 — not
  revisited here.
- **A bank-more-for-a-bonus multiplier.** Considered and left out of v1
  (§8) — the risk itself is the mechanic; a reward for delaying is a
  real, separate lever for later, not included now.
- **Exact tunable numbers** (cinder drop chance, conversion rate, partial
  heal amount, room dimensions, per-room enemy counts). These are
  balance/playtesting questions, deliberately left as `CFG` constants to
  be set during implementation rather than asserted here as if already
  decided — this project's own standing rule (Rule 6) is that a claim
  about a number requires it to have actually been measured or decided,
  not invented for the sake of looking complete.

---

*Next: abilities + ability progression + character design is a separate,
larger design surface — several existing systems (movement, platforming,
speed-based combat) are already built and tested and need no new
scoping; what's genuinely new is an ability system (layered on weapons or
separate from them — undecided), how abilities get unlocked/upgraded
(a natural connection point to the cinders economy above), and a visual
character identity that reads clearly against all of it. That gets its
own brainstorming pass and its own spec.*
