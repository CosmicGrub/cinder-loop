# Post-D19 audit: specs, roadmap, scaffolding, tests, architecture, gameplay

Produced by a 6-agent parallel audit (spec-consistency, roadmap-sequencing,
codebase-scaffolding, test-tooling, gameplay-depth, architecture-health),
each reading real files directly and citing file:line for every concrete
claim — the same discipline the original 15-pitch roadmap doc held itself
to. 54 raw findings; every one below is grounded in something a direct
`grep`/read confirmed, not inference from documentation alone. Full agent
transcripts: workflow run `wf_e7810127-44f`.

This is an audit-and-pitch document, not an approved spec — nothing here
is locked, and nothing here has been implemented. It exists so the next
"continue" has a menu to choose from with the thinking already done.

---

## 0. The one-paragraph version

The engine and its process discipline are in good shape — the specs are
detailed, the tests are real, the adversarial-review habit keeps finding
genuine bugs before they ship. The two things most worth fixing before
anything else: **`build.py` has a real, reproduced correctness bug** (a
stray leftover file silently joins the build with zero warning), and
**content variety plateaus after the very first room of the very first
run** (the 4-enemy roster spawns identically, in the same order, in every
room forever — layout varies, combat composition never does). Everything
else below is real but lower-stakes than those two.

---

## 1. Fix now — cheap, mechanical, no design judgment needed

1. **`build.py` accepts a stray file into the build with no warning at
   all.** Reproduced directly: copying `src/00-core.js` to
   `src/56-caller-old.js` and rebuilding silently concatenated it into the
   module chain (23 modules instead of 22, `node --check` still passed).
   `modules()` only checks `REQUIRED ⊆ discovered`, never the reverse, and
   has no duplicate-numeric-prefix guard. Fix: after building `order`,
   assert every discovered file is a member of `REQUIRED`
   (`die()` if not), and detect duplicate numeric prefixes explicitly
   (`Counter(prefix for prefix, _ in numbered)`, `die()` on any count > 1).
   Two small checks, closes a real hole in the one file whose whole job is
   "never silently produce the wrong game."

2. **`build.py` has zero dedicated test coverage** — every function in it
   is only ever exercised as a side effect of the current, always-clean
   happy path; its actual failure paths (the BANNED-token scan, the
   REQUIRED-file check) have never been proven to fire. Add a small Node
   test that shells out to `python build.py` against a deliberately-broken
   temp copy of `src/` (a banned token injected, a REQUIRED file removed,
   an unbalanced brace) and asserts the correct failure message and
   non-zero exit for each. This is the one place the project's own L8
   principle ("tests exercise real functions") isn't applied yet.

3. **`CFG.TICK_HZ` is dead.** Defined (`00-core.js:31`), zero real
   consumers — the actual tick loop reads `CFG.DT` directly, and the two
   values just happen to agree today with no code-level link between them.
   Delete `TICK_HZ` (simplest, matches `DT`'s own "NEVER scaled" framing),
   or make it load-bearing by defining `DT: 1/CFG.TICK_HZ`. Either is a
   five-minute fix; leaving it is a latent single-source-of-truth gap in
   an otherwise L3-locked invariant.

4. **Six of eight approved specs still say "Not yet implemented"** despite
   the feature having shipped (room-checkpoint-structure/D14,
   abilities/D13, summon-primitive/D16, weapon-equip-switch/D15,
   checkpoint-narration/D21, hazard-beats/D17 — confirmed against the
   masterfile's own D-table, which documents all of them as shipped with
   real file:line citations). Only backpack-slot's (D24) status line was
   ever updated the way D17's spec amendment shows the project already
   knows how to do. Add the one-line update to each, and make it an
   explicit doc-sync checklist item going forward (masterfile + changelog
   + visual map + **the spec's own Status line**) so a ninth spec doesn't
   repeat this.

5. **The D16 (summon-primitive) spec is now factually wrong in two places**
   and was never amended, unlike D17's own self-correcting §1a. Its §3
   says "no terrain-probing needed" for a summoned add's spawn placement;
   the shipped code does exactly the terrain probe the spec says is
   unneeded (`45-enemy.js:452-473`, `ctx.rectSolid` check), because the
   original claim was one of five real bugs the D16 adversarial pass
   found ("climbs upward through solid rock" — `CHANGELOG.md:416-430`).
   Its §4 ("the one true new integration point") is now incomplete — a
   second `ctx` field (`rectSolid`) was added to support the fix. Add a
   short amendment section mirroring hazard-beats' §1a, specifically
   because D20 (Grafts) is sequenced to reuse D16's own patterns — a
   future spec-writer skimming this file for "how does off-body Enemy
   placement work here" would be misled into re-omitting the same check.

6. **The abilities (D13) spec's own Parry definition is ambiguous in a way
   the shipped code had to resolve unilaterally.** §2b describes Parry
   generically as negating "an incoming attack" with no carve-out; the
   real code (`40-combat.js:216-220`) makes base Parry a complete no-op
   against ranged attacks — Reflect isn't a bonus on top of an already-
   working ranged parry, it's what first makes ranged attacks parryable at
   all. A player who hasn't bought Reflect gets zero protection from
   timing a parry against a kilnspitter's shot. Add one carve-out sentence
   to §2b.

7. **The weapon-equip-switch (D15) spec never named the save-hook
   requirement its own adversarial pass later found missing as bug #1**
   (`meta.lastWeapon` had no save-to-disk trigger). The general lesson
   ("every new permanent `meta` field needs an explicit save-trigger
   audit") is already written into the roadmap pitch doc as a checklist
   item for D20/D23/D24, but never back-filled into the D15 spec where it
   actually originated. Worth a one-line addition there too.

8. **Two of the eight specs (the first two ever written — room-checkpoint-
   structure and abilities) have no Testing-approach section at all**,
   while every spec written the very next day onward does. Retrofit a
   short section to both (five minutes each, citing the real test files
   that did end up covering them) and make the section an explicit,
   enforced item in whatever governs new specs — right now it's convention
   by imitation, not a rule, and nothing stopped it from lapsing once.

---

## 2. Roadmap corrections — real gaps and stale claims in the pitch doc itself

9. **The shop/hub-UI gap is cited four times as a blocking dependency
   (D15, D20, D23, D24, plus the shelved Lore Codex idea) but has never
   itself been pitched** — no D-number, no tier slot, no owner. This is
   now time-sensitive, not just untidy: **every debug F-key is claimed**
   (F2 through F12, eleven in a row — confirmed against `95-app.js`).
   D23 (Flask charges) will be the first currency-spend feature in the
   whole roadmap unable to reuse the debug-key stopgap every prior one
   used. Give this its own numbered, tiered pitch before D23 is speced —
   see §5 below for a concrete shape (a literal Kilnkeeper hub room, not a
   generic menu).

10. **"Finish D14's cinder economy" has no D-number** despite being
    explicitly re-classified to D15-sized scope ("comparable in real
    scope to D15's own `switchWeapon` work, not a quick add-on") — every
    other tracked-but-unbuilt system (D18/D20/D22/D23) has one reserved.
    Assign it a real number now, before doc-sync time forces an awkward
    "does this amend D14's row or become a new one" decision under
    pressure.

11. **D22's own design goal directly collides with a locked regression
    test.** D22 wants a room archetype that "may skip enemy placement,
    require only `reachedExit`" — but `tests/verify_run.js:76` pins
    `RunLogic.isLevelClear([]) === false` as deliberate, load-bearing
    behavior ("a level whose enemy-placement roll happened to place zero
    of them still requires a player to actually walk to the door"). The
    fix is narrower and cheaper than the pitch doc's "touches
    `isLevelClear` semantics" phrasing implies: branch around the ONE real
    call site (`70-sim.js:1244`) for a traversal-kind room specifically,
    never touch `isLevelClear`'s own zero-length behavior, which stays
    exactly as every other room kind needs it. Worth stating this
    precisely in D22's eventual spec so its author doesn't rediscover the
    collision the hard way.

12. **The "standing risk" file list (70-sim.js's core, 45-enemy.js's state
    machine) is already falsified by D17**, which touched neither file and
    still produced 5 production bugs including a real cross-feature
    interaction with D14. The list was never revisited after D17, D21, or
    D24 shipped. Separately, `40-combat.js`'s `Combat.resolveBox` — D20's
    own primary touch point — has an equally dense, already-documented D13
    bug history (a parry/invulnerable ordering bug, a co-op double-damage
    bug, a stale-`alive()` Reflect bug) that the list omits entirely,
    understating D20's real risk. Generalize the rule from "these two
    files" to the pattern the project's actual history now supports: any
    feature introducing a new state-machine branch, a new physics
    primitive, or a new interaction with already-shipped room/checkpoint/
    hazard geometry gets a full adversarial pass, regardless of which file
    it lands in. D18 and D22 both qualify under the honest version of the
    rule even though neither touches the two originally-named files.

13. **The Tier-3 "level-scoped generation presets" entry's own stated
    precondition has already been met** ("worth building once D17 has its
    own tunable chance constant to fold in" — D17 shipped
    `CFG.GEN_HAZARD_BEAT_CHANCE` months ago) but the doc's later Tier
    restatement still describes it as future-conditional, verbatim. Update
    the entry to say the precondition is satisfied; whether to actually
    build it next is a separate call, but the doc should stop describing a
    fired trigger as still-hypothetical.

14. **A second cross-cutting pattern deserves naming alongside the
    shop-UI one:** invisible-but-gameplay-affecting state. Which weapon is
    equipped changes damage scaling with zero on-screen indicator (D15's
    own named, unaddressed gap); which stat colour is dominant is about to
    change core ability cooldowns/windows mid-run (D19, approved today)
    with the identical zero-indicator cut, made without cross-referencing
    D15's. Unlike the currency-trigger gap, this one compounds silently —
    a player now has two separate pieces of state materially changing
    moment-to-moment ability behavior with no signal for either. Worth
    naming once so a future HUD pass covers both at the same time.

15. **The doc's two build-order presentations now disagree on D20's risk
    without cross-referencing each other** — the original table calls it
    "Medium," the later Tier-2 revision calls it "the largest net-new
    engine surface of the original core nine," sequenced last in its tier
    specifically because of that heavier read. A reader who stops at the
    first table gets a different risk picture than one who reads to the
    end. Add a one-line pointer atop the original table noting the Tier
    list supersedes its risk column for anything past D16.

16. **The full per-file-line grounding for the four still-unbuilt systems
    (D18, D20, D22, D23) exists only in an ephemeral agent workflow
    transcript**, not in any committed file — a real gap against the
    project's own stated "canonical, synced" doc discipline. D17's own
    one-paragraph pitch summary already proved insufficient once (it
    missed the wall-leniency physics dependency entirely). Treat
    re-deriving each of these four's full grounding as part of that
    feature's own brainstorming step, not an assumption that the pitch
    doc's short summary is enough — it wasn't, for the last one that
    shared this exact shape.

---

## 3. Scaffolding — real capability sitting unspent right now

17. **Seven registered Bus events fire real payloads every run with zero
    listener anywhere** — not even the deliberate empty-stub acknowledgment
    `80-view.js` gives every other consciously-deferred effect (`rollEnd`,
    `dashEnd`, `crouch` all get an explicit "recorded; no visual yet"
    stub; these seven don't even get that): `parryStart`, `ledgeGrab`,
    `ledgeClimb`, `ledgeRelease`, `statGain`, `blueprintDrop`,
    `blueprintLost`. Concretely worst: the entire ledge-grab/mantle system
    — real geometry, real hitbox measurement, extensively regression-
    tested — has **no audio or visual feedback at all** for grabbing,
    climbing, or releasing a ledge. And `blueprintUnlocked` already gets a
    three-note ascending chime while its own sibling events (drop, loss)
    are silent — a real one-sided-feedback asymmetry in the same mechanic.
    This is a small, self-contained, presenter-only pitch (zero sim risk,
    the same profile that let D21 skip a full adversarial pass): give each
    of the seven either a real cue or an explicit documented stub.

18. **The `scale` field is authored on all six enemy/boss/elite templates
    — including a comment explicitly reading "at boss scale" — and never
    read by the renderer.** Kilnwarden's authored 1.6 boss-scale multiplier
    produces zero visual size difference beyond its own already-modest
    hitbox (28×36 vs. Ashwalker's 12×24). Either wire it (scale the drawn
    rect around center in `drawTargets()`, leave the collision box
    untouched) or delete the field and the misleading comment from all six
    templates.

19. **No HUD identity display exists at all** — every enemy/weapon `name`
    field (populated on all 11 entries across the roster) is never read
    outside `10-data.js`; the HUD (`80-view.js:716-729`) draws only hp pips
    and a raw state string. The data this needs (weapon name, enemy name,
    the three stat colour values — also otherwise invisible) already
    exists and is already correct on the sim side; this is purely a render
    call away from existing, and is the natural next home for closing
    finding #14's "invisible state" pattern.

20. **`DATA.SFX_IDS` mirrors the validated-key-list convention `ENEMY_IDS`/
    `WEAPON_IDS` use but has zero production consumer** — `85-audio.js`'s
    real trigger list is a separately hand-typed array never cross-checked
    against it. Low priority: either assert `TRIGGERS ⊆ SFX_IDS` at
    construction (catches a future typo loudly instead of silently
    dropping a cue) or just document that `SFX_IDS` exists for test
    coverage only.

---

## 4. Test and build tooling health

21. **`verify_move.js` (1453 lines, the largest test file) has silently
    absorbed the entire D13 Roll/Dash/Parry ability system** — a
    contiguous 667-line block (46% of the file) covering exactly the scope
    of the separately-approved abilities spec. Extract into
    `tests/verify_abilities.js`; mechanically low-risk since every
    `verify_*.js` file already independently loads its own sandbox.

22. **`verify_meta.js` (1400 lines) shows the same pattern** — everything
    from line 289 onward (80% of the file) lives under one unnumbered "2.
    Integration" banner despite containing three separately-specced
    feature epochs (D15 weapon-switch, D24 backpack-slot). Split the
    fully-self-contained D15 block (~366 lines, never touches
    `carriedBlueprints`/currency) into `tests/verify_weapon.js`; leave D24
    where it is since it's a real extension of this file's own concern.

23. **The trivial `fresh(spec)` fixture helper is duplicated byte-for-byte
    across four test files** (`verify_move.js`, `verify_enemy.js`,
    `verify_stats.js`, `verify_combat.js`) — precisely the "one sibling
    patched, others missed" risk the project's own changelog names and has
    already fixed twice for other helpers (`attemptHop`/`realKill`), just
    never applied here because it was too trivial to have broken yet.
    Promote to `H.fresh()` in `harness.js`, delete the four copies.

24. **`verify_render.js`'s own header documents 5-of-6 adversarial runs
    failing from fixed-sleep flakiness — but only the two sleeps that
    caused that specific failure were converted to polling.** Roughly 20
    other fixed `cdp.sleep()` calls remain in the same file, several as
    short as 50-80ms, guarding the exact same class of real-UI-transition
    race already proven to fail under load at durations up to 900ms. Audit
    every remaining one and convert to the polling helper already proven
    in this file.

25. **`cdp.js`'s zero-dependency design rests on an unstated Node-version
    floor** (global `WebSocket` is only unflagged from Node ~v22) with no
    `engines` field or runtime check anywhere — an older LTS would produce
    a raw `ReferenceError` instead of a clear message. Add an explicit
    version guard to `run_all.sh`.

26. **Measured, not assumed: the 16 pure-Node suites already run in ~3.1s
    combined; the one browser suite alone costs ~10.3s of the ~17.3s
    total.** Don't parallelize the Node suites first (saves ~2s at best,
    and process-spawn overhead for 16 sub-second suites could eat back a
    real fraction of that) — if wall-clock ever becomes a real problem, the
    actual lever is `verify_render`'s own internal cost or Chromium
    process-tree overhead, not suite count.

27. **`verify_arch.js`'s comment-stripping regex duplicates `build.py`'s
    `strip_comments()`/BANNED-scan logic line-for-line**, independently
    hand-written in two languages, never cross-checked. Low priority (they
    can't be literally unified across languages) but worth a cross-
    referencing comment in each so a future edit to one doesn't silently
    drift from the other.

28. Minor, already largely mitigated: `verify_render.js` is the sole
    suite depending on external machine state (a cached Chromium, OS
    process-tree behavior) — already caused one real historical failure
    (37 orphaned Chrome processes from repeated runs), already fixed via
    `killTree()`. Worth a clearer upfront diagnostic when no Chromium is
    found, not urgent otherwise.

---

## 5. Architecture health

29. **`Player` calls directly into `Combat`** (`30-player.js:624`,
    `C.Combat.cancel(this, bus)`) — the one real, single-instance break of
    the stated one-way dependency rule ("the player... never learns what a
    move is"). Introduced with D13/Parry, never documented as a deliberate
    exception. Prefer inverting it: a `player._cancelAttack` flag Combat
    reads and clears, mirroring how `hitstopRequest` already flows the
    other direction — keeps "Player never learns what a move is" literally
    true everywhere else in the file that assumes it.

30. **`70-sim.js` (1402 lines, the largest file by a 65% margin over the
    next) bundles at least four separable responsibilities** — the actual
    tick loop, meta-purchase glue, weapon switching, and room/run/
    checkpoint orchestration, the last of which alone is ~46% of the file
    and has essentially nothing to do with the file's own "THE tick loop"
    header description. Extract the room/run/checkpoint cluster
    (`beginRun` through `_roster`, ~645 lines) into a new `72-runflow.js`
    — there's a full 10-number gap available, and `build.py`'s own
    numeric-sort discovery already proves an extra file outside `REQUIRED`
    loads cleanly (56-caller.js is the existing precedent, though note
    honestly: there's no existing precedent for a LATER file extending an
    EARLIER file's prototype the way this split would — say so explicitly
    in the split's own note rather than overclaim precedent). This also
    gives D18/D20/D22/D23's own room/run-adjacent future work an obvious
    home that isn't "append more to the 1400-line file."

31. **`hash()`'s hand-maintained ~120-line field list has already caused
    one documented desync bug** (D16's `summonsUsed`, caught only by a
    dedicated adversarial pass, not the standing gate) and has no
    structural safeguard against a repeat beyond per-feature tests written
    after the fact. Co-locate each hashable class's own field list next to
    its own declaration (`Player.HASH_FIELDS = [...]` at the bottom of
    `30-player.js`, etc.) and have `hash()` iterate those arrays
    generically — moves the point of remembering to the same diff that
    adds the new field, not a separate file 1400 lines away. Belt-and-
    suspenders: a generic test walking a real instance's own enumerable
    fields against an explicit allow-list would convert "a new field
    silently un-hashed" into a same-commit test failure instead of an
    adversarial-pass-only catch.

32. **Two adjacent module-prefix pairs (55/56 Boss→Caller, 94/95
    Touch→App) already have zero integer headroom** under `build.py`'s
    strictly-integer sort — no file could ever be inserted between them
    without a renumber. D18 (an Enemy-team elite template, the same shape
    as Boss/Caller) is a plausible future occupant of exactly the 55/56
    gap. Cheap to fix now (rename `56-caller.js`→`58-caller.js`,
    `95-app.js`→`98-app.js`, update `REQUIRED` and doc references, one
    commit, two files) — expensive to fix later under time pressure
    mid-feature.

33. **Four of Sim's five flat-cost ability-purchase methods are near-
    byte-identical boilerplate** the file's own comment already
    acknowledges ("same shape as buyMaxHp above") without ever
    parameterizing. Collapse into one data table + one shared
    `_buyAbility(key)` implementation — the same "content, not engine code"
    philosophy D7 already applies to weapons/enemies, applied to this one
    corner of `Sim` that doesn't yet follow it. A fifth future purchase
    then costs one data-table row instead of a 12-line copy-paste.

34. Lower priority: `Player.prototype.update()` is a single ~386-line
    function covering every movement/combat/hazard state — the largest
    single function in the four largest files. The domain (one shared
    body/state per tick) doesn't split as cleanly as `Sim`'s orchestration
    does; worth a deliberate look only if a future ability needs new
    state-machine branches here, not urgent on its own.

---

## 6. Gameplay content-scale, assessed honestly with real numbers

- **Enemy roster: 4 regular templates, hard-pinned, placed identically
  every room.** `RunLogic.placeEnemies` loops `DATA.ENEMY_IDS`
  unconditionally — no `roomIndex` input, no seeded subset, no scaling.
  **After room 0 of run 1, a player has seen the entire regular roster,
  forever.** This is the single thinnest content axis in the game.
- **Room count: 3, one archetype, no biome/palette variety.** Every room
  runs through the identical generation path with the same beat/pickup
  counts. D22 (a second archetype) is speced but unbuilt.
- **Boss count: 1** (Kilnwarden). A second (Cindermaw) is real and
  buildable but explicitly parked on an unrelated D12 reveal-logic
  decision.
- **Weapon roster: 4, all melee.** No ranged player option exists. The
  one boss in the game is 100% ranged/zone (every move `contact: 0`,
  rooted, `speed: 0`) — **the game's only boss never once tests the
  melee-spacing identity its own weapon roster is built around.**
- **Stat progression actively resists player-directed builds.**
  `pickStatColour` gives the currently-dominant colour the *least* weight
  of the three (an 86% chance of being pulled off it at 3/1/1) — a
  deliberate anti-death-spiral design, but one that's about to sit in
  direct, undocumented tension with D19's passives, which reward
  *sustaining* dominance. Worth an explicit call before D19 ships: soften
  the correction as a run progresses, or state plainly in D19's own spec
  that "dominance is meant to be a fragile, contested state, not a stable
  build."
- **Blueprint drops permanently stop, forever, once all 4 weapons are
  unlocked** — the drop function returns `null` unconditionally past that
  point, with no fallback content behind the gate. This is the concrete
  mechanism behind the roadmap's own honest "thinnest standalone value"
  self-assessment of D24 (Backpack slot) — capacity for a resource that
  stops existing is worth nothing for the rest of that save.
- **Replayability, net assessment:** procedural layout genuinely varies
  and is fairness-audited — the project's real strength. Nearly every
  other axis a player actually notices (enemy composition, room count,
  boss, room archetype, stat trajectory) is currently fixed or actively
  randomized away from divergence. **The single highest-leverage fix for
  replay value specifically is per-room enemy composition** — cheapest of
  the thin axes to touch (a pure function, not a hot sim path), and the
  one a player notices every room of every run, not once per level or
  once per run.
- **Roll's i-frame uptime (43% of its own cooldown cycle) is comparable
  to or longer than most enemy telegraphs** (14-28 frames) — worth a
  deliberate playtest-driven call on whether Roll is meant to function as
  a periodic panic button (with Parry, at a much tighter 28.6% cycle,
  as the real skill-testing tool) or whether the cooldown should tighten
  relative to the roll duration. A balance question, not a bug.

---

## 7. New gameplay pitches — concrete, sized, grounded in real hooks

Each names the existing system it extends (matching the roadmap's own
"D2 × D13" cross-reference convention) and the specific player-facing gap
it closes. None of these are approved designs — each would go through the
normal brainstorm → spec → plan cycle if picked up.

**A. Per-room enemy composition** (extends D14 + D9). `placeEnemies`
starts reading `roomIndex` and drawing a seeded subset/repeat-weighted
list instead of a fixed all-4 loop — gentler room 0, an escalated,
possibly-doubled-up room right before the boss door. Pure-function change,
never touches the two highest-risk files in the codebase. **This is my
own top recommendation for what to build next, ahead of anything else in
this section** — see §8.

**B. Elite affix variants of the regular roster** (extends D9 + D16).
Reuses the exact "template object outside `DATA.ENEMIES`" mechanism
Kilnwarden and the Caller already validate — a small seeded chance at
placement time to spawn an "Ashen" variant (bonus attack or +50% hp, tint
override) instead of the base template. Reintroduces real mid/late-run
surprise for near-zero new engine surface — no `resolveBox`/`hurt`
signature changes.

**C. Knockback-into-hazard environmental kills** (extends D17 + D9).
Enemies currently take zero damage from `TILE.HAZARD`, ever, even though
every hit already produces real knockback. One check in
`Enemy.prototype.update` reusing the world's existing `isHazard` query and
the player's own `CFG.HAZARD_DAMAGE` constant. Makes every hazard beat
D17 already generates matter to combat, not just traversal.

**D. "Cinder Wager"** — a curse-shaped, opt-in risk lever built natively
around the still-unfinished cinder economy rather than porting Dead
Cells' permadeath-on-next-hit literally (which doesn't fit D1's respawn
structure). At the tube, declining to bank now and wagering instead
multiplies what's banked at the *next* checkpoint — but any hit while
wagering forfeits everything currently carried. Uses only resources the
project already committed to building (Tier 2, cinder economy).

**E. A literal Kilnkeeper hub room** — the concrete answer to the
shop/hub-UI gap named four times in the roadmap and now genuinely
time-pressured by F-key exhaustion (§2.9). Reuses D14's own interact-radius
pattern (`TUBE_INTERACT_RADIUS`), made permanent, one narratively-grounded
space instead of four systems each inventing their own debug-key entry
point. The narrator already personifies "the kiln" as a physical space in
its own dialogue text.

**F. Colour-affix reroll on blueprint drop** (extends D7 + D2). At drop
time, one extra seeded bit can swap one of a weapon's two colour-scaling
slots for a third colour outside its normal pair. A genuinely different,
per-run reason to care which stat you've invested in when a drop lands —
and, applied to an *already-unlocked* weapon as a standalone "reroll this
weapon's pair for the run" pickup, gives the drop table a second life past
the permanent post-unlock content cliff named in §6.

---

## 8. My own recommendation for what to do next

If I had to pick one thing from this entire audit to build immediately
after D19 ships: **pitch A, per-room enemy composition.** It's the
cheapest fix to the single weakest axis in the whole game (content variety
plateaus after room 0 of run 1), it touches a pure, already-tested
function rather than either of the two files the project's own history
says produces bugs on first contact, and unlike most of what's in this
document it changes something every player notices every single room, not
once per run.

Close behind, in rough order:

1. **The `build.py` fix (§1.1)** — this is a real, reproduced bug, not a
   style note, and it's cheap. Do this regardless of what else gets
   picked up.
2. **Wire the seven silent Bus events (§3.17)** — presenter-only, zero sim
   risk, closes a real feel gap (the ledge-grab system in particular has
   shipped with no feedback at all since it landed).
3. **Give the shop/hub-UI gap its own pitch (§2.9)**, since D23 is the
   next feature that will structurally need somewhere to live that isn't
   a thirteenth F-key.
4. Everything else in §1 (the spec-hygiene fixes) is cheap enough to batch
   into a single "doc hygiene" pass whenever convenient — none of it is
   urgent, all of it is easy.

Everything in §5 (architecture health) and the rest of §7 (new pitches) is
real and worth having on record, but lower-urgency than the above — good
material for when D20 (which needs the `70-sim.js` split more than
anything currently queued does) or a future balance pass comes up
naturally.
