# Post-D13 System Pitches — Roadmap (PROPOSED, not yet approved)

> **Status:** This is a pitch deck, not an approved spec. Nothing here is a
> locked design decision until it goes through this project's own
> brainstorming → spec → plan flow the way D13 (abilities) and the room-
> checkpoint-structure work did. D-numbers below (D15–D24) are the
> synthesis's own proposed numbering, assuming the in-flight room/checkpoint/
> cinders work lands and gets documented as **D14** first.
>
> Produced by a 7-agent workflow: one grounding pass over the real `src/`
> and both open specs, five parallel domain passes (combat/build-diversity,
> generation/level-variety, meta-progression/economy, narrative/world-
> building, enemy/boss-content) each reading live source and citing file:line
> for every claim, and one synthesis pass reading all five against each
> other — dropping duplicates, naming conflicts/synergies, and ranking
> survivors against D1's own test (does it deepen spawn→clear→boss→die→
> spend→respawn itself, not just sit near it).

---

## Ground truth this whole deck rests on

The room-checkpoint-structure spec (2026-08-23) is **mid-implementation**,
not a future proposal — `_enterRoom`/`_buildCheckpointAlcove`/
`_onRoomClear`/`_healAtCheckpoint` are real and firing in `70-sim.js` today,
and `CFG.ROOM_COUNT`/`CHECKPOINT_ALCOVE_TILES`/`TUBE_INTERACT_RADIUS`/
`CHECKPOINT_HEAL_FRAC`/`CINDER_DROP_CHANCE`/`CINDER_CONVERSION_RATE` are all
real CFG constants — but it hasn't been written up as a masterfile
D-decision or changelog entry yet. This deck assumes it lands as **D14**
once documented, and drops one pitch (a "wire the cinder economy" system)
as a duplicate of that unfinished work rather than ranking it as new.

## Cut as duplicate

**"Wire the cinder economy end-to-end"** — not a new system. Every field
it proposes (`carriedCinders`, `_bankCinders()`, `cinder*` Bus events) is
already named/reserved by the in-flight D14 spec; the pitch's own cited
evidence is a comment *inside* that spec's own code (`70-sim.js:670`, "the
tube... the cinder-bank trigger, still to come"). Ships as part of
finishing D14, not as a competing decision.

## Real conflict, parked deliberately

**"Cindermaw" — a second boss.** Buildable/testable standalone exactly as
Kilnwarden was, but D12 fires the villain reveal keyed only to
`sim.run.phase === 'boss'`, calling it "the final boss fight" — a second
boss makes that ambiguous, and `_enterBoss()` has no boss-selection concept
at all. Needs a companion run-structure decision made jointly with whoever
owns D12. Not ranked; stays parked until that decision is made on purpose.

## Real synergies worth sequencing around

- **Grafts (D20)** and **Dominance Breakpoints (D19)** both want the same
  `dominantColour(stats)` extraction out of `Player.prototype.gainStat` —
  build once, both benefit. They touch disjoint chokepoints otherwise.
- **Grafts' `onHitDealt` multiplier** composes with **Guard's (D18)** break
  threshold — a damage-boosting graft could push a normally-chip-only hit
  across `GUARD_BREAK_DAMAGE`. Free, correct interaction once both land;
  needs one confirming test, not an assumption.
- **Weapon Equip (D15)**, **Grafts' socket cost (D20)**, **Flask charges
  (D23)**, and **Backpack slot (D24)** all spend currency with **no
  player-facing trigger** — every one currently punts to an F-key debug
  stand-in, the same gap the shipped D13 enhancements already have. A
  shop/hub UI is real, separately-owned infrastructure; named once here
  rather than re-deferred in every section.
- **D21/D22/D23** all touch files D14 is still actively shaping
  (`_enterRoom`, `_onRoomClear`, the `'checkpoint'` payload shape) — flagged
  to sequence *after* D14 locks, not before.

---

## Recommended build order

| # | System | Extends | Size/Risk | Why here |
|---|---|---|---|---|
| **D15** | **Weapon equip & switch** — `player.weapon` goes live (gated on `!player.attack`); `meta.startWeapon` adds a free starting-loadout choice once unlocked | D9, D2, D4, D8 | Small — under 40 lines, every touch point mirrors an existing pattern | Closes the single largest already-built-but-inert surface in the game: D9's 4-weapon roster and D2's colour-scaling axis have been dead code from a player's view since v0.2.8 |
| **D16** | **"Summon" primitive** — elite Caller template (kept out of `DATA.ENEMIES`, D9-style) calls in an existing template via `ctx.addEnemy` | D9 | Small — reuses fully-tested `Sim.prototype.addEnemy` | Adds a sustained/attrition axis the 4 single-threat primitives can't produce, for near-zero new risk |
| **D17** | **Roll-crossable hazard beats** — new generation beat stamps an on-path `TILE.HAZARD` strip sized off `CFG.GEN_ROLL_HAZARD_TILES` | D3/D3a | Small — self-contained to `50-gen.js` | Spends a real, measured capability constant that has had **zero consumers** since it was written |
| **D18** | **"Guard" primitive** — second `guardHp` pool gates break on the `amount` already passed into `Enemy.prototype.hurt`, no `resolveBox` signature change | D9 | Small — one function touched | A "change your attack, not your position" lever; real feel-risk only playtesting resolves |
| **D19** | **Dominance Breakpoints** — one passive per D2 colour (Ember→Dash cooldown, Umbral→Parry window, Verdant→Roll cooldown) past a dominance threshold | D2 × D13 | Small — 3 CFG constants + 3 field-write-site edits | Connects two shipped-but-never-linked systems; makes colour choice qualitative, not just a bigger number |
| **D20** | **Grafts** — closed 3-hook-type passive-modifier system (`onHitDealt`/`onHitTaken`/`onKill`), per-run carry, dropped from kills only | D7 | Medium — touches `resolveBox` (×2), `resolveSlam`, kill-hook | Gives D7's own named-but-undefined third content table ("weapons **and grafts**") an actual mechanic — the least-defined real noun in the project |
| **D21** | **Checkpoint narration** — `82-narrative.js` finally subscribes to the already-emitted `'checkpoint'` event | D11 | Cheapest system in the deck — no new CFG/Bus, two line pools | Finishes a declared D11 consumer that was never wired up |
| **D22** | **Traversal Room archetype** — one `ROOM_COUNT` slot (fixed at index 1 for v1) may skip enemy placement, require only `reachedExit` | D14 | Medium — touches `isLevelClear` semantics + per-room-kind plumbing | Genuine room-*type* variety inside the existing linear chain, without reopening the deferred branching question |
| **D23** | **Flask charges** — flat-integer heal, zero base charges, purchased via the existing cost tier | D8, D2 | Medium — real open question is refill timing (recommend `_onRoomClear()`) | First player-triggered heal in the game — a real risk/resource lever inside the core loop |
| **D24** | **Backpack slot** — `carriedBlueprint` (scalar) → `carriedBlueprints` (capacity-bounded array) | D8 | Small, low urgency | Makes the already-dead `CFG.META_BLUEPRINT_CAPACITY: 1` constant real; correctly scoped to blueprints only |

**Sequencing:** Start D15–D18 now, in parallel with D14 finishing — none
touch a file D14 is actively changing, all four are low-risk completions of
already-built-but-inert infrastructure. D19 follows right behind (shares
the `dominantColour()` extraction with D20). Let D14 land and get its own
masterfile number before starting D21–D23. Build D20 after D19 (shared
refactor, bigger/more novel — low-risk-before-novel). D24 can go anywhere
after D15 — no dependencies, but also the thinnest standalone value until
a second carriable resource (cinders) exists to arbitrate against.

### Considered, ranked below the line

- **Level-scoped generation presets** (`DATA.GEN_PRESETS` reweighting
  `riseWeights`/`onewayChance`/`riskChance` per level) — real and
  D7-idiomatic, but reweights an existing distribution rather than adding a
  new mechanism, and every number is an unmeasured placeholder. Worth
  building once D17 has its own tunable chance constant to fold in.
- **Run-to-run narrative memory** (a persisted `src/83-memory.js`
  remembering death/reveal history across reloads) — the deepest of the 15
  source pitches, but explicitly presentation-only ("zero effect on sim
  state"), so it fails the roadmap's own D1 test (deepen the loop itself).
  Real depth, correctly lower priority.
- **Lore Codex** (a fifth currency sink: purchasable world-building text) —
  legitimate, but inherits rather than solves the shared shop-UI/`meta`-in-
  `Menu` gap every currency-spend pitch above also punts on.

---

## Full pitch detail

The complete grounding digest, all 15 individual pitches (5 domain decks ×
3 each) with exact file:line implementation shapes, and the full synthesis
reasoning are preserved in this session's workflow transcript
(`wx1hnawlh`). Ask to expand any single system above into its full
file-level implementation shape before it goes through this project's own
brainstorming → spec → plan flow.
