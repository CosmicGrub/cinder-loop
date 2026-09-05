# Dead Cells parity notes

Status: reference material, not a spec. Compiled 2026-08-31 from (a) direct
observation of a short (~12 min) "brand new player" blind-playthrough video
and (b) general knowledge of Dead Cells' shipped systems. Written to inform
CINDER LOOP's own design decisions by comparison, not to be copied — treat
every section below as "here is the mechanic and the shape of the trade-off
it creates," not as source text to port verbatim. Where CINDER LOOP already
has a clear structural analog, it's called out; where it doesn't, that's a
real gap worth weighing against the roadmap, not an instruction to close it.

## What was directly confirmed on screen (small, verified sample)

- The starting-loadout screen offers three items simultaneously, each shown
  as its own card with a headline stat and a one-line mechanical summary:
  a shield (percentage-based partial block while held; a quick tap instead
  attempts a full-block parry — two distinct inputs, two distinct outcomes,
  not one button doing one thing), a melee weapon (a flat DPS rating shown
  directly on the card), and a ranged weapon (also DPS-rated, with ammo
  explicitly regenerating from kills rather than recharging over time).
  Framing weapon choice as a real, up-front decision with visible numbers
  — not just flavor text — is itself a design choice worth naming.
- A thrown weapon (knife) applies a bleed status — damage over time layered
  on top of (not instead of) the direct hit.
- At least one heal source is described as restoring a percentage of
  *maximum* HP, not a flat amount — meaning its value scales with whatever
  the player's current max-HP investment is, and is worth more to a
  glass-cannon build than a flat heal would be.
- The commentary track itself is a useful onboarding data point: a
  brand-new player lost roughly a third of total HP within the first
  seconds of engaging the first real threat, and treated the starting
  weapon choice as a genuinely weighed trade-off rather than a formality.
  Both read as intentional — Dead Cells is not shy about a punishing first
  contact, and it wants the loadout screen to feel like a real choice.

## Core structural loop

Dead Cells: a single continuous run through a sequence of biomes, each
biome built by stitching together hand-authored ROOMS in a randomized
order/arrangement (not fully procedural tile generation — the rooms
themselves are fixed content, the run's *path* through them is what's
randomized), gated by boss doors between major biome groups. Death is
permanent for the run (all currency/items carried IN the run are lost);
progress that persists is a separate, deliberately narrow meta-progression
layer (see below). A run that reaches a boss door with currency banked
"locks in" that currency permanently even if the run later ends in death —
banking is the moment of safety, not the boss kill itself.

**CINDER LOOP's analog**: `50-gen.js`'s tile-level procedural generation
(reachability-audited beats, not room-stitching) plus the room-checkpoint
structure (D14) is a different generation strategy aimed at the same goal
— a run that's different each time but never unfair. The room-clear →
checkpoint → next-room loop (`_onRoomClear`, D21's checkpoint narration)
is CINDER LOOP's equivalent of Dead Cells' room-to-room flow, just built
on finer-grained procedural tiles rather than pre-authored room chunks.
Worth naming explicitly: Dead Cells' fairness guarantee comes from **rooms
being hand-authored** (a human already proved each room is fair before it
ever ships); CINDER LOOP's comes from `audit()` proving fairness by
**construction and re-derivation** on every generated candidate — a
different mechanism reaching for the same designer promise ("never ask
for a jump nobody can make"), and arguably a harder, more interesting one
to have built well, since there's no human safety net per-room.

## Currency and banking

Dead Cells: "Cells," dropped by killed enemies, collected during a run,
and BANKED (made permanent) only at specific altar/door points — carried-
but-unbanked Cells are lost on death, same as everything else run-scoped.
Banked Cells buy permanent meta-upgrades (new weapon blueprints becoming
available in future runs, stat-scroll drop rates, starting-loadout
options) at a hub between runs, never mid-run power.

**CINDER LOOP's analog**: the roadmap's own "cinder economy" (referenced
as unfinished D14 work, Tier 2) is clearly this exact system's namesake —
worth checking, when that work resumes, whether the bank-at-a-safe-point
mechanic (not just "collect currency," but "currency is only real once
banked") is part of the current design, since that specific tension (risk
carrying more, or bank early and safe) is a large part of what makes Dead
Cells' economy feel like a real decision each run rather than a passive
counter going up.

## Stats: the three-color system

Dead Cells: every weapon/scroll is tagged one of three colors — Brutality
(red, melee-leaning, high burst), Tactics (blue, ranged/traps/utility),
Survival (green, sustain/defense) — and a Scroll of Power spent on one
color raises that stat, which in turn scales the damage of every item
tagged that color. Builds emerge from which color(s) a run's scroll drops
lean into, not from a pre-picked class.

**CINDER LOOP's analog**: this is close to a direct match —
`this.stats = { ember, umbral, verdant }` (`30-player.js`) is the same
three-axis shape (three color-coded stats gating weapon scaling), already
named and implemented. Worth treating as a confirmed-correct parity point
rather than an open question: CINDER LOOP already has this system's
skeleton; the open work is content (how many weapons per color, how the
color tags interact with the existing four-primitive enemy roster) not
architecture.

## Movement kit

Dead Cells' player kit: run, jump (with a wall-jump/wall-cling off most
vertical surfaces), a roll with brief invulnerability frames and a fixed
committed distance, and (depending on unlocked mutations) various
traversal options layered on top later in a run's progression (a grapple-
type vine-swing mutation is one well-known example). No stamina meter
gating basic movement — roll has a cooldown, not a resource pool.

**CINDER LOOP's analog**: roll (i-frames, fixed `ROLL_FRAMES`/`ROLL_SPEED`,
cooldown-gated) is already a very close match. Wall-jump/wall-slide,
ledge-grab, coyote time, and jump-cut variable height are all present and
tested (`verify_move.js`) — CINDER LOOP's movement kit is, if anything,
already MORE built-out in tested edge cases (ledge-grab specifically) than
what a first-time-player video would typically show off. Ember Dash
(airborne reuse of the roll button) is CINDER LOOP's own addition without
a direct 1:1 Dead Cells analog in the base kit — closer in spirit to a
later-game mutation than a day-one move, worth keeping in mind if a future
balance pass wants dash to feel like an earned capability rather than a
baseline one.

## Defense: shield and parry

Dead Cells: holding block (on a shield-type weapon) absorbs a PERCENTAGE
of incoming damage, not all of it — a real, felt cost to blocking rather
than a free pause button. A precisely-timed tap (not a hold) attempts a
parry instead, which — if timed to the hit — blocks 100% of the damage
and staggers the attacker, a strictly better outcome than holding, but
only available in a narrow timing window. Two inputs, two risk/reward
tiers, not one mechanic with one outcome.

**CINDER LOOP's analog**: the existing parry (`40-combat.js`'s
`Combat.resolveBox`, timing-windowed, `parryWindow`/`parryCd`) already
captures the "narrow window, full negation" half of this. Worth checking
against the roadmap whether a HOLD-based partial-block option (distinct
from the tap-parry, not a replacement for it) is or isn't part of the
plan — Dead Cells treats these as two genuinely different tools a player
picks between moment to moment, not a single mechanic with a lenient and
strict version of the same check.

## Healing: flasks

Dead Cells: a limited number of healing-potion CHARGES (not a mana-style
regenerating pool), refilled at fixed points (usually room/checkpoint
transitions or specific fountains), each charge healing a meaningful
percentage of the player's current max HP. Running out of charges mid-run
is a real, felt resource crunch, not a soft inconvenience.

**CINDER LOOP's analog**: named directly on the roadmap ("D23 Flask
charges," Tier 2, not yet built) — this is a clean, already-identified
parity item. Worth flagging, from the video's own confirmed detail above,
that Dead Cells' heal scales off *maximum* HP specifically (not a flat
number) — a real design choice to weigh when D23 is speced, since a flat
heal and a percent-of-max heal produce different incentives around
whether raising max HP is worth it.

## Mutations / permanent run-modifiers

Dead Cells: "Mutations" are passive or triggered effects a player equips
(three slots) at the start of a run and keeps for its duration — things
like extra healing on kill streaks, a chance to reset roll cooldown on a
successful dodge, bonus effects on critical hits. They're drawn from a
pool unlocked via the meta-progression currency, not randomly offered
mid-run the way some roguelites hand out build-defining choices on the fly.

**CINDER LOOP's analog**: "D20 Grafts" (Tier 2, not yet built) reads as
this system's clear namesake. No further detail confirmed from the video
sample to add here — worth its own dedicated brainstorm when that item
comes up, informed by this mapping rather than starting from zero.

## Curses / risk-for-reward modifiers

Dead Cells: an optional, stackable debuff a player can voluntarily pick up
mid-run (permadeath on the NEXT hit, for the duration of the curse) in
exchange for a guaranteed reward if survived — a deliberate, opt-in
high-risk-high-reward lever distinct from the base run's own difficulty.

**CINDER LOOP's analog**: nothing on the current roadmap maps to this
directly. Not a recommendation to add it — just flagging it as a Dead
Cells system with no current CINDER LOOP equivalent, in case it's ever
useful roadmap material.

## Enemy design: the "read the tell" contract

Dead Cells enemies each have a small number of distinct, clearly-telegraphed
attacks — the game's whole difficulty philosophy leans on "every hit that
lands was dodgeable if you read the animation," not on attacks a player
couldn't reasonably have seen coming. Elite/gilded variants of normal
enemies exist (tougher stats, sometimes an extra attack), rather than a
fully separate elite roster.

**CINDER LOOP's analog**: this maps closely onto CINDER LOOP's own already-
stated design language — `MIN_TELEGRAPH` as a fairness floor, the four
movement/attack primitives (melee/charge/shoot/dive), and the Caller as an
elite template layered on the existing roster rather than a fifth base
enemy (D16's own spec explicitly reasons about this the same way Dead
Cells' gilded-variant approach does). This is less a gap to close and more
a confirmation that CINDER LOOP's existing enemy-design instincts are
already well-aligned with the reference game's own philosophy.

## Biome / world-state variety

Dead Cells: later playthroughs (via the "Boss Cells" difficulty-stacking
system, separate from the run currency) change not just enemy stat
multipliers but the actual SHAPE of level generation — new hazards, new
enemy placements, sometimes entirely new room content unlocked at higher
difficulty tiers. Difficulty isn't purely a damage-multiplier slider.

**CINDER LOOP's analog**: `CFG.GEN_RISK_CHANCE`, `GEN_HAZARD_BEAT_CHANCE`
(D17, pending) and the broader `50-gen.js` beat-weighting system are
already headed in this direction structurally (tunable generation-time
knobs that change level SHAPE, not just enemy stats) — worth keeping in
mind as a precedent if a future difficulty-tiering pitch comes up: Dead
Cells' own answer to "how do you keep late-game replays interesting" is
squarely on the generation side, not purely the combat-stats side.

## Open gaps worth naming (not recommendations — just unmapped territory)

- **Curses** (above) — no CINDER LOOP analog yet.
- **A hub/meta-progression space between runs** — Dead Cells' between-run
  hub (where Cells are spent, blueprints browsed, mutations equipped) has
  no obvious CINDER LOOP equivalent named on the current roadmap; whatever
  "spend the cinder economy" ends up meaning will need to answer this.
- **Affix rolls on individual weapon drops** — Dead Cells' weapons carry
  randomized bonus-stat affixes per drop (not just a fixed base weapon);
  nothing on CINDER LOOP's current roadmap maps to per-drop item variance
  specifically (Backpack/D24 and the weapon-equip-switch design are the
  closest existing surfaces, but affix rolling is a distinct question from
  either).

## How to keep using this document

This is a living comparison, not a locked spec — update it (or write a
sibling doc) the next time a roadmap item with a clear Dead Cells analog
comes up for brainstorming (D19 Dominance Breakpoints, D22 Traversal Room,
D23 Flask charges, D20 Grafts all read as strong candidates), so the
comparison is fresh and specific to that feature rather than re-derived
from memory each time.
