# Abilities and character rendering — Ember Dash, Parry, and the enhanced figure

Status: design approved by user 2026-08-24. Character rendering (§5) is
already implemented and shipped (`80-view.js`, gate green). Abilities
(§1-4) are designed and approved but NOT yet implemented.
Companion docs: `CINDER_LOOP_MASTERFILE.md` (D-series decisions),
`2026-08-23-room-checkpoint-structure-design.md` (the cinders economy
these enhancements connect to).

## 0. Why this is a separate spec from rooms/checkpoints

Decomposed deliberately (brainstorming session, 2026-08-23): movement,
platforming, and combat are already real, shipped, and tested — nothing
about them needed scoping. What's genuinely new here is a real ability
system, how abilities get unlocked/enhanced, and the character's visual
identity — none of which depend on the room/checkpoint/cinders feature,
though the enhancement economy (§4) deliberately reuses that spec's
`meta.currency` pool rather than inventing a third one.

## 1. Scope: character-level abilities, not weapon-specific

Abilities belong to the CHARACTER, available regardless of which of the
four weapons ends up equipped. This was a deliberate choice over
weapon-specific abilities, made for a concrete technical reason: weapon
switching isn't shipped yet (`player.weapon` defaults to `'blade'` and
nothing changes it at runtime — a real, already-named D4 gap). Making
abilities weapon-specific would have made weapon-switching a REQUIRED
prerequisite for this feature, not an optional one.

**Named, not silently dropped:** weapon-flavored ability variants (e.g.
a Warmaul-specific heavy-Dash) are real, later, additive design space —
explicitly deferred until weapon equip/switch exists, the same
"scope it, then build it" pattern D11/D12 and D8's flask charges/backpack
slot already used.

## 2. The two abilities

### 2a. Ember Dash (movement)

A fast horizontal burst, usable in the air — a genuine gap in the
current kit (today's only air options are jump/double-jump/wall
interactions, nothing gives horizontal air mobility).

**Input: reuses the existing Roll button, context-sensitive.** Grounded,
Roll behaves exactly as it does today. Airborne, the same input
triggers Ember Dash instead. This needed zero new `Pad.BUTTONS` entries,
zero keybind/rebind UI changes, zero gamepad remapping — the same
pattern Hollow Knight and Dead Cells both already use for their own
dash/dodge. `30-player.js`'s roll-input handler gains one branch: airborne
→ `beginDash()`, grounded → the existing `beginRoll()`.

**I-frames**, matching Roll's own precedent — a real dash without
invulnerability would just be a worse jump.

### 2b. Parry / Deflect (combat)

A timed input that, landed correctly against an incoming attack,
negates the damage and staggers the attacker. Hooks into REAL, existing
machinery: enemies already emit a real `telegraph` Bus event before
they swing (45-enemy.js's own fairness-rule commit moment) — that is
exactly the signal a parry window needs, and it already exists for
narrative's own barks to react to.

**Input: needs a genuinely new one.** Nothing in the current 7-action
vocabulary (left/right/up/down/jump/roll/attack) has room to host Parry
without an awkward overload (heavy attack already claims crouch+attack).
A new `Pad.BUTTONS` entry — mechanical, low-risk, the existing
Settings/Menu/gamepad machinery already generalizes over N actions
cleanly.

**Touch:** a real, named exception to D10's otherwise-locked Gesture
Surface layout. A new settings toggle (same shape `reducedMotion`/
`showMeter`/`muted` already use) lets the PLAYER choose:
- *Manual* — a new zone added to the Gesture Surface.
- *Assist* — no new zone; a well-timed dodge/roll gesture near a real
  `telegraph` event auto-triggers the parry effect.

Named honestly: this is the one place touch and keyboard/gamepad
genuinely play the mechanic differently, by player choice, not a
platform-forced compromise.

**The technically riskiest piece of this whole spec, not hidden:**
"stagger the attacker" needs 45-enemy.js to support an attack being
INTERRUPTED mid-telegraph or mid-swing — a real new capability, not
something the enemy state machine has today. This is real, scoped work
in its own right, not a trivial flag flip.

## 3. Unlock model: available from the start

Both abilities are part of the core kit from the very first spawn — no
"unlock the kit itself" gate, matching the user's own explicit choice
over the D4-blueprint-style alternative (drop/carry/lose-on-death/
hand-in). Early runs stay complete rather than naked. Meta-currency
instead buys the enhancements below — progression still has real teeth,
just aimed at making an existing tool better, not gatekeeping it.

## 4. Enhancements — four flat-cost currency purchases

Same shape `MetaLogic.spendOnMaxHp` already established (D8): a flat
`meta.currency` cost, a permanent flag/counter on `meta`, no tree, no
prerequisites between them.

| Purchase | Effect |
|---|---|
| Ember Dash — Extra Charge | A second dash usable before landing/recharging, mirroring double-jump's own "second charge" shape. |
| Ember Dash — Extended I-Frames | Lengthens the dash's own invulnerability window. |
| Parry — Riposte | A successful parry lands a free counter-hit on the staggered attacker. |
| Parry — Reflect | A successful parry against a ranged attack (kilnspitter's own `shotBurst`) sends it back at the attacker — the one enhancement with a concrete, named target, not a generic buff. |

Exact currency costs are `CFG` constants, deliberately left unspecified
here — a balance/playtesting question, the same "don't fabricate a
number that hasn't been measured or decided" discipline this project's
own Rule 6 already applies everywhere else.

## 5. Character rendering — already shipped

The judged direction (Claude Design canvas, three options presented,
Option A chosen) is real, implemented code as of this spec, not a
proposal: `80-view.js`'s `drawFigure()` now renders the torso as a
two-stop gradient between the SAME `cloth`/`clothDark` values the flat
fill already used (never a new color — the file's own documented
"four widely-separated value steps keep the figure legible at 22px"
lesson stands, since a gradient WITHIN one shape's existing value range
can't cross into another shape's value class), a soft radial-gradient
glow behind the chest ember (replacing the old flat translucent square),
and a low-alpha rim-light along the hood's facing-side edge. Zero new
colors, zero image assets, zero change to the pose rig or its baked
hitboxes (D6/L9 untouched).

**Verified:** `tests/harness.js`'s `stubCanvas()` gained
`createLinearGradient`/`createRadialGradient` stubs (a real, adversarially-
found-by-actually-running-it gap: `verify_arch.js` threw immediately the
first time this code ran against the fake canvas, since gradients weren't
part of its API surface before this). Full gate green, 1957/1957 across
16 suites, after the fix.

**What was deliberately not chosen:** Option B (painterly/textured
overlay — same low risk, deferred for now, real option to revisit) and
Option C (illustrated sprite art — highest visual ceiling, but a real
architectural regression risk: breaks the hitbox-baked-from-animation
guarantee unless new infrastructure keeps hand-drawn art in sync, and
needs a real animation pipeline this project doesn't have). Both remain
named, real, later options, not closed doors.

## 6. Ability VFX — designed, not yet implemented

Sketched and validated as a hand-animated preview (not real game code —
a throwaway prototype, kept out of `src/`), built on TOP of the now-real
§5 baseline:

- **Ember Dash**: the chest ember (already glowing at rest, per §5)
  flares brighter during the dash, with a fading ember-colored trail
  left behind — reusing the real particle system `80-view.js` already
  owns (renderer/camera/particles per this project's own architecture),
  not a new rendering subsystem.
- **Parry**: on a successful read, the WHOLE hood-hollow lights up
  (not just the usual small dim accent square near the head) — reusing
  the same "something flashes at the moment of impact" precedent an
  ordinary hit already uses.

Both cues are one Bus-trigger away from a real SFX cue too (`85-audio.js`'s
existing 15-cue table, D11) — a dash whoosh and a parry clang, same shape
as the cues already there, not scoped in detail here.

## 7. Concrete file-level shape

Implementation-plan-level detail, offered for scope estimation.

| File | Change |
|---|---|
| `30-player.js` | Airborne-roll-input branch → `beginDash()`. New fields: dash charge count/cooldown, parry window/cooldown. |
| `40-combat.js` | Parry-window damage interception: negate + signal stagger to the attacking enemy, reusing the existing hit-resolution path rather than a parallel one. |
| `45-enemy.js` | A real "interrupted mid-attack" capability — the one genuinely new piece of enemy state machine this spec needs (§2b's own named risk). |
| `05-input.js` / `90-settings.js` | One new `Pad.BUTTONS` entry (Parry) — default keybind, automatic rebind-UI support via the existing generalized machinery. |
| `94-touch.js` | A new Gesture Surface zone (Manual mode) + the settings-toggled auto-assist branch (Assist mode). |
| `65-meta.js` | Four new flat-cost enhancement purchases, same shape as `spendOnMaxHp`. |
| `80-view.js` | VFX hooks for both abilities (§6) — ember flare/trail on dash, hood-glow on parry. |
| `10-data.js` / `85-audio.js` / `82-narrative.js` | Two new SFX cues (dash, parry); narrator/bark reactions are optional, not required for v1. |

## 8. Explicitly out of scope for v1

- Weapon-specific or weapon-flavored ability variants (§1) — deferred
  until weapon equip/switch exists.
- Any third ability beyond Dash and Parry (Ash Flare/ranged-utility and
  the locked-shortcut interact were both pitched and explicitly not
  chosen for v1).
- An enhancement tree or prerequisites between purchases (§4) — four
  independent, flat-cost buys only.
- Option B/C character rendering (§5) — named, real, later options.
- Exact tunable numbers (dash charge count, i-frame duration, parry
  window width, enhancement costs) — `CFG` constants, decided during
  implementation/playtesting, not asserted here.
