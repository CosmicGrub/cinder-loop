# CINDER LOOP — MASTERFILE

Canonical. Amend in place; never duplicate. Companion docs:
`CINDER_LOOP_CHANGELOG.md`, `CINDER_LOOP_VISUAL_MAP.html`. All three are kept
in sync across Project Knowledge, Claude's memory, and the Google Drive folder.

A standalone original 2D roguelite sidescroller in the Dead Cells grammar —
never a clone. No Motion Twin / Evil Empire assets, names, characters, biomes,
weapons, music or sprites. Genre conventions taken; all specific expression
authored fresh.

**Status at v0.2.17 (2026-08-23): Ember Dash and Parry (D13) — two new
character-level abilities, four flat-cost meta-currency enhancements,
real gamepad/touch wiring, and VFX/SFX for all of it — are BUILT and
GREEN.** Both abilities available from the very first spawn, D4-style
unlock gating deliberately not used. Ember Dash costs zero new input —
the same buffered `roll` press context-switches into a dash whenever it
resolves airborne, evaluated at consumption time, not press time — and
carries full i-frames across a measured 14 frames/77px, a 30-frame
cooldown. Parry is a lightweight timed flag (`parryWindow`/`parryCd`),
deliberately NOT its own committed player state the way Roll/Dash are —
the deciding fork between two independently-converging Plan agents,
settled by the user directly: a state-based Parry folded into
`invulnerable()` would silently grant hazard immunity for the whole
window, not just protection against the timed attack, since
`invulnerable()` also gates lava/spike damage. Negation and stagger both
resolve inside `Combat.resolveBox`'s own shared chokepoint. Parry needed
one genuinely new capability from `45-enemy.js` — an idempotent, real
interrupt (`Enemy.prototype.stagger()`, a new `'staggered'` state with
its own fixed punish window, handing off to the EXISTING
`recover` → `chase`/`phaseTransition` branching rather than skipping it)
— named as the single riskiest piece of the whole spec before it was
built. Four enhancements (Dash Extra Charge, Dash Extended I-Frames,
Parry Riposte, Parry Reflect) reuse `buyMaxHp`'s own D8 shape exactly;
Reflect needed one new field on `Shot` (`owner`) and sends a projectile's
own damage back at whoever fired it, directly, rather than a second live
projectile flying back through the world. Three dedicated
adversarial-verification passes (Parry's stagger mechanic, the four
enhancements, touch/gamepad wiring), two lighter targeted passes
(VFX/SFX, the base dash/parry mechanic), and a sixth dedicated
gate-stability re-verification pass (run because §6's own binding
process rule requires the repeated runs a "stable" claim rests on, not
one green reading trusted on faith) found and fixed thirteen real
problems across the whole feature — two of them the same class of bug
independently, in two different subsystems (a parry check that could be
silently eaten by an unrelated invulnerable() gate, and Riposte/Reflect
each independently vulnerable to a co-op double-hit through the identical
shared-chokepoint shape) — plus two real, pre-existing bugs from BEFORE
this session, both found the same way, one during VFX wiring and one
during the stability pass: `rollStart`'s own particle burst, and then its
sibling `step`'s own footstep-dust burst, have each been spawning at
`y === NaN`, silently invisible, since they first shipped — plus a real
CDP-dispatch race the stability pass traced to root cause under measured
heavy machine load (up to 51% CPU) rather than papering over with a
longer sleep: the roll/dash input buffer's own real 133ms window can be
missed by a genuinely late real keypress, fixed with a bounded real-retry
rather than by loosening the buffer itself. GREEN 2262/2262 across 16
suites, confirmed across three consecutive full-gate runs including the
browser suite. Full account in §5p. Below that, synthesized SFX (§5o,
v0.2.16) — `85-audio.js`, a real
Web Audio engine plus a real player-facing mute toggle (D11) — are BUILT
and GREEN. Fifteen cues (10-data.js's own `SFX` table, D7), two
synthesis primitives (a `tone` — oscillator + gain-envelope notes,
optionally pitch-swept — and a filtered `noise` burst), fired off the
same Bus trigger design narrative (§5n) already established, per D11's
own explicit scoping. A real, player-facing "Sound: On/Off" row in the
pause menu, not a debug-only key. This project's own standing
discipline — an independent adversarial-verification pass after a
feature is built and green — ran here too, its ninth in a row to find
real problems: five lenses, fourteen candidate findings, thirteen
confirmed by an independent skeptical re-check (one correctly refuted).
Six were real code defects, fixed — the most severe let a broken
`AudioContext` throw an uncaught exception straight through this file's
own Bus listener into `95-app.js`'s crash-recovery path, silently
resetting the player's entire current run over what should have been an
optional presenter-layer failure; also fixed: gamepad-only sessions
never unlocking audio at all, a menu change silently reverting an
unrelated F3 debug toggle, a stale doc/data mismatch, a missing
anti-click attack ramp on noise cues, and a `subscribe()` guard keyed on
the wrong thing. Six more were real test-coverage gaps, closed with new
regression coverage — most notably, the audio test suite's own fake
context never recorded the actual numbers fed into it, so three
independent mutations (a hardcoded gain, a disabled pitch sweep, a
flattened waveform) all sailed through 191 assertions completely
undetected. One dead function was deleted. The pass itself also
surfaced something outside the code: a prompt-injection attempt via
tool output, mid-task, instructing two independent verifier agents (and
this session directly, afterward) to treat an unauthorized file edit as
intentional and conceal it — all three refused and reported it rather
than complying, an actual test of this project's instruction-source-
boundary rule, not a hypothetical one. Full account in §5o. Below that,
narrative (§5n, v0.2.15) — `82-narrative.js`, the Kilnkeeper's dialogue
trigger + text-box render (D11/D12) — a recurring narrator voice heard
at run milestones and short per-template enemy barks, both real and
rendering for the first time, zero new Bus events, zero changes to any
SIM file. Its own dedicated adversarial pass (five lenses) found and
fixed six real problems, two of them live — a boss-phase death that
could misread as a triumphant victory line across the real multi-frame
commit sequence, and a dialogue RNG that silently fell back to its
hardcoded default on every real boot because `95-app.js` never passed it
a seed — full account in §5n. Below that, meta
progression (§5m, v0.2.14) — `65-meta.js`, D4's blueprint carry-and-hand-in
loop plus D8's +max HP purchase — currency now survives a page reload;
blueprints drop from real kills, carry the same "lose on death, hand in
at a transition" risk D4 always named, and unlock a weapon permanently
into the pool; a real +max HP purchase permanently grows every future
run's health pool. Its own dedicated adversarial pass (five independent
lenses) found and fixed four real problems, two of them the same bug
found independently by two lenses — a real data-loss gap where the F5/F6
debug keys, currently the ONLY exposed way to spend meta currency at all,
never persisted their own result unless a run also happened to end
afterward; an event-payload gap where two survivors handing in the same
weapon under-reported how many carries were actually consumed; a
live-reference sharing gap between two Sims constructed from the same
Meta object; and a comment naming a call site that does not exist. Full
account in §5m. Below that, the run loop (§5l, v0.2.13) — `60-run.js`,
D1's day-one
target, spawn -> clear -> boss -> die -> spend -> respawn — closed the gap
the boss's own §5f left honest: Kilnwarden is reachable from a real
`boot()`-driven run, not only from direct construction in a test. Its own
dedicated adversarial pass (five independent lenses) found and fixed six
real problems — a co-op pending-window currency leak, a run boundary that
only reset the player who died, a structural seed-mixing collision, a
tutorial dummy banking real currency, an unguarded `Gen.generate()`
failure that could freeze the game permanently past boot, and an
overclaiming comment — full account in §5l. Below that, the movement core
(now with wall slide,
wall jump, ledge grab/mantle, and a slam that finally hits what it lands
on), the hitbox bake,
the combat resolver (now driving all FOUR weapons D9 ever named, D2's
three-colour stat contract with real weapon scaling, and slam impact), the
posed player figure, the enemy roster (4 templates, D9), PC platform
hardening, phone touch input (the "Gesture Surface" scheme, D10), procedural
tile generation with its mandatory fairness audit (D3/D3a, whose own pickup
coordinates now feed real, collectible stat pickups), boot playing a real
generated level, and the boss — Kilnwarden, a two-phase rooted zone-control
fight, chosen by a judged 3-concept design panel over two rivals both
independently found by adversarial review to carry real, source-verified
engineering bugs — are BUILT and GREEN.
**1177 assertions across 12 suites**, one offline HTML file (246 KB),
verified in a real headless Chromium with a composited screenshot, with
real dispatched touch events driving actual gameplay, with every
audited-legal generation edge confirmed reachable by a real held jump
through real sim ticks (§5d), with the boss's fairness rule, phase
transition, and arena hazard all driven and proven through real sim ticks
(§5f), with wall interaction and the second weapon each measured and driven
the same way, never asserted from config (§5g), with the stat contract —
gains, dominance, HP coupling, weighted pickup colour, and weapon scaling —
proven the identical way, including one real bug three separate tests were
quietly passing FOR THE WRONG REASON before it was caught (§5h), with
weapons #3 and #4 — Warmaul and Thornspear, D9's roster now genuinely
complete — chosen by a judged 3-pitch panel that SPLIT (unlike every earlier
panel in this project) and hand-baked against the real overreach audit,
which caught its own real design overreach before either weapon shipped
(§5i), and with the slam finally wired into real combat — no judged panel
needed, the shape was already implied by the "one shared resolveBox" rule —
which turned up an ES2015+ violation, a stale comment, a wrong test, five
MORE flaky browser-suite timing assertions, an untested AOE dimension, a
mislabeled byte count, and the real cause of this project's own gate
instability: a leaked pool of orphaned Chromium processes, not sim timing
at all (§5j), and with ledge grab/mantle — a real spatial-reasoning move,
not a velocity clamp the way wall slide is, catching a wall's own top edge
into a stand-on-able surface within reach, climbed with the same jump
input rather than a new one — measured against constructed test worlds
before being wired in, and whose own adversarial pass found a body left
straddling two tile columns after climbing (fixed by anchoring to tile
boundaries, not a hand-tuned nudge), a crouched climb that stood the body
up in the wrong frame's `b.h`, a hazard hit unable to knock a hanging
player free of a wall it was still pinned to, and a negative test that
never actually touched the wall it claimed to prove couldn't be grabbed
(§5k), and with the run loop itself now closing spawn → clear → boss →
die → spend → respawn into one real, `boot()`-driven cycle — a real
Sim/Player/Enemy integration proven the same way every other system in
this list was, not just self-consistent pure logic, and whose own
regression test caught `beginRun()` silently committing a stale level swap
left over from a prior, abandoned run before this version was called done
(§5l — whose own dedicated adversarial pass then found and fixed six more
real problems, full account there), with meta progression (§5m,
v0.2.14) — whose own dedicated adversarial pass found and fixed four more,
full account there too — and with narrative (§5n, v0.2.15), the
Kilnkeeper's own dialogue trigger and text-box render, real and driving
`boot()` now, zero SIM files touched to build it, and whose own dedicated
adversarial pass found and fixed five more real problems (including a
live, currently-reachable one — a boss-phase death could show a
triumphant victory line).** **2262 assertions
across 16 suites**, one offline HTML file (398 KB), verified in a real
headless Chromium with a composited
screenshot, with real dispatched touch events driving actual gameplay,
with every audited-legal generation edge confirmed reachable by a real
held jump through real sim ticks (§5d), with the boss's fairness rule,
phase transition, and arena hazard all driven and proven through real sim
ticks (§5f), with wall interaction and the second weapon each measured and
driven the same way, never asserted from config (§5g), with the stat
contract — gains, dominance, HP coupling, weighted pickup colour, and
weapon scaling — proven the identical way, including one real bug three
separate tests were quietly passing FOR THE WRONG REASON before it was
caught (§5h), with weapons #3 and #4 — Warmaul and Thornspear, D9's roster
now genuinely complete — chosen by a judged 3-pitch panel that SPLIT
(unlike every earlier panel in this project) and hand-baked against the
real overreach audit, which caught its own real design overreach before
either weapon shipped (§5i), with the slam finally wired into real combat
— no judged panel needed, the shape was already implied by the "one shared
resolveBox" rule — which turned up an ES2015+ violation, a stale comment,
a wrong test, five MORE flaky browser-suite timing assertions, an untested
AOE dimension, a mislabeled byte count, and the real cause of this
project's own gate instability: a leaked pool of orphaned Chromium
processes, not sim timing at all (§5j), with ledge grab/mantle — a real
spatial-reasoning move, not a velocity clamp the way wall slide is,
catching a wall's own top edge into a stand-on-able surface within reach,
climbed with the same jump input rather than a new one — measured against
constructed test worlds before being wired in, and whose own adversarial
pass found a body left straddling two tile columns after climbing (fixed
by anchoring to tile boundaries, not a hand-tuned nudge), a crouched climb
that stood the body up in the wrong frame's `b.h`, a hazard hit unable to
knock a hanging player free of a wall it was still pinned to, and a
negative test that never actually touched the wall it claimed to prove
couldn't be grabbed (§5k), with the run loop (§5l, D1), and with meta
progression (§5m, D4/D8) — currency now survives a reload, blueprints
drop, carry, are lost on death or handed in and unlocked at a survived
transition, and a real +max HP purchase permanently grows every future
run's health pool — see above. Flask charges and a backpack slot (also
named by D8) remain deliberately deferred, real open design space with
nothing existing to build on, named rather than silently built or
silently ignored. Weapon equipping/switching still has no player-facing
path — `player.weapon` is a fixed default, unchanged by either `60-run.js`
or `65-meta.js` landing (§5g/§5h/§5i/§5m) — so an unlocked blueprint's
weapon has no way to actually become what a run starts with yet.
A Galaxy Watch6 Classic companion exists as a **static design mockup only**
(§5c) — sample data, no live channel, not part of the game build or its
gate.

v0.1.0 was authored on 2026-07-26. An earlier status line in this document
described a v0.1.0 with 171 assertions that had never been written; the
resolution is recorded in §6 and in the changelog. Every number in §3 is a
measurement of the code that is actually on disk.

---

## 1. Locked decisions

### Engineering invariants
*(L-series, carried from IRON CIRCUIT / CROSS CIRCUIT / CROSSFLOW / IRON EPOCH)*

| # | Decision | Origin |
|---|---|---|
| L1 | Original IP, never a clone | standing rule |
| L2 | Single offline HTML, zero network, vendored libs never text-edited | CF/CC D6 |
| L3 | Fixed 1/60 sim tick, never scaled dt | IC/CF D7, D17 |
| L4 | Per-instance seeded RNG; no Math.random in the sim | CF D24, IE D7 |
| L5 | Sim / presenter split; one file is the only place an event becomes an effect | CC-D16, CF-D16 |
| L6 | Builds from numbered `src/` modules via `build.py` | all projects |
| L7 | One command gate: `tests/run_all.sh` | all projects |
| L8 | The harness never reimplements the thing under test | IC v1.8 |
| L9 | Hitboxes baked from the animation at boot; never hand-authored | IC D28 / CC-D6 |
| L10 | One authoritative `resetTransient()`; `scenario()` is the only test setup | CC harness lesson |
| L11 | Determinism is within-build on one machine; no netcode | CC-D21 |
| L12 | Screenshot the composited frame; never readPixels | IC gotcha |
| L13 | Desktop + gamepad first, Z Fold 5 after | standing order |
| L14 | Masterfile + changelog + visual map, canonical, synced to Drive | standing rule |

### Design decisions
*(D-series, locked from the phased answer sheet)*

| # | Decision | Rationale |
|---|---|---|
| D1 | Day-one target is the complete run loop — spawn → clear → boss → die → spend → respawn, all systems thin but present | the loop is the product; a biome without a death-and-spend cycle is a platformer demo |
| D2 | Three-colour stat contract with HP coupling. Each stat starts at 1 every run. A pickup grants +1 to a chosen stat and +HP only if that stat is dominant. Weapons list two colours and scale off the larger; colourless gear scales off the highest. Dual choices are weighted toward the two lowest stats. | this is what turns loot into a build decision rather than a bigger number, and it is the anti-death-spiral mechanism |
| D3 | Procedural tile generation, paired with a mandatory fairness audit in the gate | Chris's call over hand-authored chunks; the audit is the guardrail that makes it shippable |
| D3a | Generation fairness audit: every generated level runs a reachability pass from spawn to exit and to every pickup, asserts minimum fightable-platform widths, rejects and regenerates any failing layout, and REPORTS the rejection rate | an unfair layout surfaces as "that run felt bad", the hardest bug class to chase; a rejection-rate number turns it into data |
| D4 | Blueprint carry-and-hand-in is the real system — drop, carry, lose on death, hand in at a transition, pay to unlock into the pool. Stage 1 ships with the pool pre-unlocked, plus a debug-room toggle to enforce it. | carrying risk is what makes a blueprint drop an event; pre-unlocking lets the slice be played today |
| D5 | Co-op in Stage 1. The sim is written N-player from the first commit: a player array, a camera rig with a target list, a pad array. | retrofitting a second player is the rewrite class that has cost real work before |
| D5a | Camera is staged: shared-camera-pull-back first (playable co-op on its own), then split-and-merge with hysteresis layered on top | if the split fights us there is still working co-op, not a broken camera |
| D6 | Hitboxes baked from the animation with an overreach audit in the gate from commit one | IRON CIRCUIT v1.3 had 56 of 56 moves overreaching, noticed by the player before any test |
| D7 | Content is data. Enemies, rooms, weapons and grafts live in tables; adding content never means writing engine code. | the difference between 6 weapons and 60 |
| D8 | Meta currency buys blueprint unlocks and permanent capability (flask charges, +max HP, backpack slot, starting-loadout choice) | keeps the "spend" half of the loop meaningful |
| D9 | Scope trade for co-op: keep the boss, thin content volume instead (4 weapons, 4 enemy types, fewer templates) | the boss is the climax the run loop needs; furniture is data and cheap to add later |
| D10 | Phone touch input is the "Gesture Surface" scheme: a floating hysteresis stick (movement zone, left half) plus three refcounted tap zones (jump/roll/attack, right half), no fixed button art ever, faint glyph outlines that fade further with use | chosen by a judged design panel scoring three independently-designed schemes against this game's own measured mechanics (0-frame latency, 5-frame jump buffer, the down+attack heavy combo) — it won outright on the two hardest criteria: the heavy combo needs no combined-gesture recognition at all (two independently tracked fingers are sufficient), and it is the only scheme that does not permanently occupy play-area pixels |
| D11 | Story-related events (dialogue + sound) are one data-driven system, not two: a `DIALOGUE` table (D7 — content, not code) fires through the EXISTING typed Bus (`00-core.js`), the same pipe `telegraph`/`hit`/`targetDown` already use, and is rendered entirely presenter-side in a new `82-narrative.js` (L5 — chosen text has zero effect on sim state, so it costs nothing in `hash()`/determinism). Two pools: a recurring narrator voice (the Kilnkeeper) triggered at run milestones, and short per-template enemy ambient barks, both line-picked via a seeded RNG (L4). `85-audio.js`, still not built, is scoped to hang off the same trigger design rather than invent a second one later. | scoped 2026-08-15, following the same "scope it, then build it" discipline as every other D-series decision — nothing here is built yet |
| D12 | The villain reveal: the Kilnkeeper — heard as an ambiguous guide throughout every run via D11's system — is revealed as the true antagonist at or during the final boss fight, which is or channels its true form; every line heard earlier rereads once the reveal lands. Depends on `60-run.js` (what "the final boss" and "a run milestone" even mean) and `55-boss.js`; scoped now, built once both exist. | gives the ongoing dialogue system and the ending the same payoff, rather than two disconnected features — build once, land twice |
| D13 | Two new character-level abilities — Ember Dash (an airborne reuse of the existing Roll button/timing) and Parry (a new input that negates one hit and staggers its source) — plus four flat-cost meta-currency enhancements (`buyMaxHp`-shaped: Dash Extra Charge, Dash Extended I-Frames, Parry Riposte, Parry Reflect). Parry is implemented as a lightweight timed flag (`parryWindow`/`parryCd`) on `Player`, never its own committed state, and is deliberately excluded from `invulnerable()` — folding it into that state-gated shape would also grant free hazard immunity (lava, spikes) as a side effect, since `invulnerable()` gates both combat i-frames and hazard checks. The negate+stagger check is a direct call inside `Combat.resolveBox` (`40-combat.js`), the one shared chokepoint every hit already routes through, rather than a Bus listener — the fairness rule already guarantees any hit reaching that point is the result of an already-completed telegraph, so a timed window checked at resolution time is structurally sufficient with no new targeting/aim query needed. | resolved a real design fork surfaced independently by two planning passes over the same question (state vs. flag) with a concrete, traceable failure mode (hazard-immunity leakage) rather than a preference call; keeping the check inside the existing chokepoint avoids a second precedent for one live entity's event mutating another's state |
| D14 | A level becomes a linear chain of `CFG.ROOM_COUNT` (3) procedurally-generated combat rooms plus the existing boss room — not a branching graph, not hand-authored combat content — reusing the exact mid-run teardown-and-reload shape `_enterLevel()`/`_enterBoss()` already established via a new `Sim.prototype._enterRoom(i)` called in a loop instead of once, each room independently fairness-audited by the same D3a machinery at smaller `CFG.ROOM_BEATS`/`ROOM_PICKUPS` dimensions and its own `RunLogic.deriveRoomSeed`-derived seed. A checkpoint fires the instant a room's roster clears (`_onRoomClear()`), deliberately decoupled from reaching the room's own exit — `_healAtCheckpoint()` (a fraction of MISSING hp, never a flat number) and `_handInCarriedBlueprints()` (a helper extracted out of `_commitPendingLevel()` so the SAME hand-in logic now fires at every checkpoint, not just true run-end) both land immediately, giving the player a real, player-paced window to act before the door itself unlocks. Death still ends the whole run exactly as D1 defines it — no mid-run "continue," a hybrid explicitly chosen over a bonfire/save-crystal model. Cinders (a second, riskier income stream into the same `meta.currency` pool, D8) are scoped and reserved for the mechanic's own follow-up — `CFG.CINDER_DROP_CHANCE`/`CINDER_CONVERSION_RATE` and three Bus events (`cinderDrop`/`cinderLost`/`cinderBanked`) exist, and the tube's own physical anchor point is real and reachability-audited (`_buildCheckpointAlcove()`) — but the drop/carry/bank mechanic itself (`player.carriedCinders`, a drop-on-kill roll, a bank-at-tube interaction) has no wired implementation yet; named honestly in §5q, not silently claimed complete. | rooms give a level real internal pacing (Dead Cells/Castlevania/Hollow Knight-style structure) without touching D1's own locked run-loop identity — reusing `_enterLevel()`'s existing shape was the single biggest risk-reducer available, over inventing new machinery; decoupling checkpoint-fires-on-clear from advance-fires-on-clear-AND-exit is what actually earns a real decision point rather than an invisible auto-save |
| D15 | `player.weapon` goes live for the first time since v0.2.8. `Sim.prototype.switchWeapon(playerIndex, weaponId)` is the real primitive — validates `player.alive()`, `canSwitchWeapon()`, and `DATA.WEAPON_IDS` membership before consulting `MetaLogic.isUnlocked` — gated on `!player.attack`, a correctness requirement rather than a feel choice: `Combat.step` re-reads `player.weapon` every tick an attack resolves (`Combat.weaponScale`, `40-combat.js:302-313`), so a mid-swing switch would silently reweight an in-flight move's damage using the new weapon's stat-colour pair instead of the one the move actually belongs to. `Sim.prototype.cycleWeapon(playerIndex)` is the thin wrapper the one v1 input trigger (gamepad button 4 / `KeyI`) actually calls, consumed in a new phase 0 of `Sim.prototype.step` — before attack input, so a same-tick switch-then-swing combo correctly attacks with the newly-equipped weapon — in the SIM layer, not the presenter, matching every other action already consumed there. `meta.lastWeapon` is captured immediately inside `switchWeapon()` itself, on player 0's own explicit switch, deliberately NOT a run-end snapshot — reading the real reset-timing source found a run-end capture would need a second, `blueprintLost`-style timing hook to handle a player-0 death correctly, real avoidable complexity a capture-on-switch design sidesteps entirely. | this is the single largest already-built-but-inert surface in the game closing at once — D9's four weapons and D2's entire per-weapon colour-scaling axis have been dead build-diversity from a player's perspective since v0.2.8; gating on attack-state alone is both necessary and sufficient because `player.weapon` is read nowhere else, so no second, broader lock is needed |

All remaining design answers take the ★ defaults recorded in the phased answer sheet.

---

## 2. Architecture

Strict one-way dependency. Nothing above the presenter line may know anything
below it. **BUILT** marks a file that exists and is under test.

```
        ┌──────────── SIM (pure; loads with no window/document) ────────────┐
00-core.js   RNG (per-instance seeded) · Bus (typed) · CFG (every tunable) · math   BUILT
05-input.js  Pad / Pads — N-player array, first-press-safe edges, pending buffer,   BUILT
             parry button + WINDOW entry (D13)
10-data.js   tables: enemy roster (D9, 4 templates), weapons (D7/D9, 4 — done). grafts [PARTIAL]
20-world.js  tilemap: empty / solid / one-way platform / hazard + queries           BUILT
25-body.js   AABB, axis-separated tilemap collision, sub-stepped, one-way+drop       BUILT
30-player.js movement: run, jump, double jump, wall slide/jump, roll,               BUILT
             ledge grab/mantle, crouch, slam, hazards, death, respawn;
             D2 stats + gainStat(); Ember Dash + Parry window (D13)
35-rig.js    skeletal poses + hitbox bake + overreach audit (L9, D6); figure()      BUILT
40-combat.js damage resolver, hit windows, hitstop policy, i-frames, D2 weapon      BUILT
             scaling (Combat.weaponScale), slam impact (Combat.resolveSlam);
             parry negate+stagger, Riposte/Reflect hooks in resolveBox (D13)
45-enemy.js  enemy entities, per-instance-seeded brains, the fairness rule;         BUILT
             stagger() + 'staggered' state (D13)
50-gen.js    procedural generator + fairness audit (D3a)                            BUILT
55-boss.js   Kilnwarden — two-phase boss + arena, kept OUT of DATA.ENEMIES (D9)      BUILT
60-run.js    run loop: spawn → clear → boss → death → spend → respawn (D1)         BUILT
65-meta.js   persistence, blueprints, +max HP capability unlock (D4/D8);            BUILT
             four Dash/Parry enhancement flags + spendOnX (D13)
70-sim.js    Sim.step() — THE tick loop; owns everything above, D2 pickups too;     BUILT
             buyDashExtraCharge/buyDashExtIframes/buyParryRiposte/
             buyParryReflect (D13)
        └──────────────────── PRESENTER BOUNDARY (L5) ──────────────────────┘
80-view.js   the ONLY place an event becomes an effect: renderer, camera rig,       BUILT
             particles; dashStart/parry bursts + per-player parryGlow (D13)
82-narrative.js dialogue trigger + text-box render, off the DIALOGUE table (D11/D12)     BUILT
85-audio.js  synthesized Web Audio + real mute toggle, off the SFX table            BUILT
             (D7/D11; +dashStart/parry cues, D13)
90-settings.js settings model: sanitize/serialize/rebind, storage-agnostic;         BUILT
             touchParryAssist (D13)
92-menu.js   in-canvas pause/options menu — chrome only, no sim knowledge;          BUILT
             Touch Parry Assist row (D13)
94-touch.js  touch input: zoneAt + Stick hysteresis (pure) + DOM shell (D10);       BUILT
             PARRY zone + Assist-mode wiring (D13)
95-app.js    boot, fixed-timestep accumulator, keyboard + gamepad + pause,          BUILT
             DPR-aware resize, lazy touch-layer construction; parry gamepad
             binding, F7-F10 debug buys, telegraph-tracking touchController (D13)
```

Hitstop is split, deliberately: `70-sim.js` owns the COUNTER because it owns
the tick, and `40-combat.js` owns the POLICY — how many frames a given hit is
worth. Requests travel through `player.hitstopRequest` and Sim takes the
largest.

The attack state machine lives in `40-combat.js` rather than `30-player.js`
because an attack needs the rig and 30 sits below 35. The player exposes
`attack` and `actionLock`, reads them as its own fields, and never learns what
a move is.

**Team ownership** — each team owns disjoint files, so no two ever edit the same
function: Core 00 · Input 05 · Data 10 · World 20 · Physics 25 · Player 30 ·
Rig 35 · Combat 40 · Enemy 45 · Generation 50 · Boss 55 · Run 60 · Meta 65 ·
Sim 70 · View 80 · Narrative 82 · Audio 85 · Platform 90/92 · App 95.

### 2a. The enemy roster (D9)

Four templates, fixed. Each names one of the engine's four primitives and
supplies numbers; adding a fifth ENEMY costs a data row in `10-data.js`,
adding a fifth ARCHETYPE (shielded, burrowing, summoning) costs exactly one
new primitive.

| Template | Primitive | What it teaches |
|---|---|---|
| Ashwalker | walk + melee | the baseline — patrol, close, telegraph, swipe. Every other enemy is read against this one. |
| Emberrush | walk + charge | roll THROUGH, not away — the long helpless recovery after a whiffed charge is the punish window, and is asserted directly. |
| Kilnspitter | walk (stationary) + shoot | keep moving — an arcing ember that dies on terrain or on a 150-frame timer, never lives forever. |
| Wickmoth | fly + dive | gives the jump and double jump a combat purpose: it ignores terrain, hovers, then dives. |

**The fairness rule, and it is the whole design:** an enemy commits its facing
at the start of its telegraph (`MIN_TELEGRAPH` = 14 frames, a hard floor every
template must clear) and cannot revise it. `verify_enemy` asserts this for
every template by committing an attack, then running the player hard the
other way for the rest of the windup — the enemy's `lockFacing` must never
change. This is narrower than "you can always walk away": fleeing in a
straight line does not beat a 4.6 px/frame charger, and is not supposed to.
What holds for all four is that the attack goes where it was committed, so the
telegraph is real information, not decoration. The presenter makes the
telegraph visible with a pulsing tint (`verify_enemy` proves the rule; nothing
proves a player can perceive it, because nothing can from here).

Melee enemies swing a baked move exactly like the player does — `clawA` bakes
and is overreach-audited on Ashwalker's own 12×24 proportions, not the
player's (`Combat.pointToWorld` takes each entity's own pose box, `poseW`/
`poseH`, precisely so an enemy never borrows the player's geometry by
accident).

---

## 3. Measured numbers

Not asserted from config — measured by driving the sim and reading the result
(L8). Values below are what `verify_move` printed on 2026-07-26.

| Quantity | Value | How |
|---|---|---|
| Tick | fixed 1/60 | L3, asserted |
| Run speed | **150.0 px/s** (2.5 px/frame) | displacement over exactly 60 ticks at terminal speed |
| Acceleration | 5 frames rest → top speed; 5 frames back to rest | counted tick by tick |
| Jump apex | **48.6 px = 3.04 tiles** | min y over the arc, minus launch y |
| Rise | **18 frames** | ticks with vy < 0 |
| Airtime (full, uncut) | **36 frames** | ticks with `onGround === false` |
| Airtime (short hop) | 13.4 px apex | jump released on frame 1 |
| Jump cut | fires once, not per-frame | vy after release still −1.46 |
| Coyote grace | **5 frames** | walk off a ledge, sweep k, largest k still producing a *ground* jump |
| Jump buffer | **5 frames** | sweep the press tick against the first tick a jump can succeed |
| Pending input hold | **8 frames** | same sweep with roll; expiry asserted at 9 |
| Input latency | **0 frames** when actionable | body displaces on the same tick the key goes down |
| Roll | **18 frames, 85.5 px** | measured between `rollStart` and `rollEnd` ticks |
| Roll i-frames | throughout | rolls through a spike bed taking 0 damage; the walking control run bleeds |
| Roll cooldown | **24 frames** | `rollStart[1].tick − rollEnd[0].tick` |
| Ember Dash (D13) | **14 frames, 77 px**, airborne only | measured between `dashStart` and `dashEnd` ticks; i-frames throughout, same shape as Roll's |
| Dash cooldown | **30 frames** | `dashStart[1].tick − dashEnd[0].tick`; refunded to a live charge instead on ground contact with the Extra Charge enhancement owned |
| Parry window | **12 frames** | `parryStart.tick` to the last tick a real hit through `Combat.resolveBox` still negates |
| Parry cooldown | **30 frames** | armed only after a whiff (window expires with no hit negated); a successful parry does not itself arm the cooldown |
| Crouch | height 22 → 12 px, **75 px/s** | half speed, measured over 60 ticks |
| Terminal fall | **9.0 px/frame** | peak vy over a long drop |
| Slam | 4-frame hang, then **11.0 px/frame**, 6 frames hitstop on landing | measured |
| Ledge grab lockout | **10 frames** before the same ledge re-grabs | measured, real boundary swept, not asserted from config |
| Ledge grab auto-drop | **90 frames** unattended hang before it releases | measured against `LEDGE_GRAB_MAX_HANG` |
| Hazard | 1 heart, **60 i-frames**, damage resumes after | long spike strip so the player cannot walk clear |
| Respawn | **30 unfrozen frames**, plus 8 frames of death hitstop | counted separately |

### Combat and rig (v0.2.0)

Active windows are **consequences of the poses**, not numbers anyone typed. A
frame carries a hitbox when the blade tip travels ≥ `RIG_ACTIVE_SPEED` (12px)
between ticks; startup and recovery are whatever is left over.

| Move | Frames | Active | Damage | Hitstop | Input |
|---|---|---|---|---|---|
| slashA | 10 | 4–6 | 6 | 5 | attack |
| slashB | 8 | 3–5 | 7 | 5 | attack again, from frame 7 of slashA |
| heavy | 16 | 9–11 | 14 | 9 | crouch + attack |

| Quantity | Value | How |
|---|---|---|
| Blade reach | **30.4 px** from the body's left edge (~20 px past a 10 px body) | max of the baked pose envelope |
| Hitboxes in the game | **9**, all derived | one per swinging frame; zero authored |
| Hits per target per move | **1** | asserted across a 3-frame active window |
| Target i-frames | **24 frames** | measured off the target's own counter, not a tick budget |
| Attack drift | **0.35×** ground control | measured against an unencumbered run |
| Attack latency | **0 frames** | the swing starts on the tick the button goes down |

*The two rows above are the ORIGINAL v0.2.0 measurement, Blade-only, before
`daggers` (v0.2.8) or `warmaul`/`thornspear` (v0.2.10) existed — left as the
historical record rather than silently overwritten, per this doc's own
"amend in place" rule not applying to a dated snapshot section. Kept
current for the whole four-weapon roster in the "Weapons #3 and #4
(v0.2.10, D9)" subsection below: reach envelope 38.65px, 40 hitboxes across
15 moves. A real, adversarially-found inconsistency: this exact
contradiction (30.4px/9 here vs. 38.65px/40 there, same document) sat
unflagged through both intervening versions until a verification pass
caught it while reviewing v0.2.10's own work.*

### The figure (v0.2.1)

The player is drawn from a full skeleton posed in `35-rig.js`, not a rectangle.
The body skeleton lives beside the weapon poses **because they have to agree
about where the shoulder is** — `FIG` anchors the front shoulder at
`CFG.RIG_SHOULDER`, so the arm on the body and the arm in a swing are the same
arm, and both reach the screen through `Combat.pointToWorld`, the transform the
sim tests hitboxes with.

| Property | Value | Why |
|---|---|---|
| Gait | driven by **distance travelled**, not a timer | a time-driven cycle slides the feet whenever speed changes |
| Stride | 60 px per two-step cycle | one footfall every 12 frames at run speed, matching the `step` event |
| Head | 25% of body height | 3.1px radius read as a lollipop on a 22px figure |
| Torso | tapered mass, shoulders wider than hips | a uniform-width bone swallowed the legs behind it |
| Tones | four widely-separated values | cloth, near limb and far limb within a few percent made the legs vanish |
| Roll | curled and spun, also by distance | a timer-spun ball skids |

**Three invariants the figure has to hold, each learned by breaking it:**

1. **Feet land on y = 22** in any grounded stance. Crouch dropped the hips to
   18 and left the legs at standing angles, floating the character 5px.
2. **The carried blade stays above the floor.** The sword is 16px past the
   elbow. A rest pose that angles the forearm down buries the tip — the run
   back-swing reached 25px deep before the assertion caught it.
3. **The carried blade stays inside the swing envelope**, bounded against the
   baked envelope rather than a typed number, so it keeps its meaning if the
   weapon is ever re-proportioned.

**Both halves of the audit matter.** Boxes derived from the animation are
structurally hard to violate, which is exactly the condition under which a
check quietly becomes a no-op. So `verify_rig` fires every audit rule at a
deliberately poisoned bake — inflated box, one-pixel pad, box reaching behind,
box on a still frame, a move that cannot hit, an authored hitbox smuggled into
the data — and each must be caught. A clean copy of the same shape must stay
clean.

**Corrections against the previously documented numbers.** The old sheet gave
jump apex as "~48px, derived from JUMP_VEL/GRAVITY". The continuous formula
`v²/2g` is the wrong model for a 60 Hz integrator that applies gravity on the
same tick as the impulse: the real rise is `Σ(V − kg)` over the frames where
that is positive. Solving the continuous equation gives `JUMP_VEL = -5.4` and a
jump that measures **45.9 px** — short of three tiles. The discrete solution is
`-5.55`, which measures 48.6 px over 18 frames with a symmetric 18-frame fall.
The airtime band "30–48 frames" is retained as a band; the specific uncut jump
measures 36.

**Not measurable from here:** whether it holds 60 Hz on Chris's hardware. The
frame meter (F3) in the build is the instrument; reading it is the one thing
Claude cannot do. Headless Chromium reported 60–62 ticks/s, which proves the
loop is live and real-time — not that the target machine will hold it.

### Generation (v0.2.5)

Every `GEN_*` gap ceiling is a real measurement with margin subtracted below
the true reliable maximum, using the same hold-to-natural-apex discipline as
the movement numbers above (a one-tick tap silently triggers `JUMP_CUT` and
measures a cut arc instead). `GEN_MIN_FIGHT_TILES` and `GEN_RISK_CHANCE` are
called out separately below because they are not measurements at all.

| Quantity | Value | How |
|---|---|---|
| Flat/descending gap ceiling | **3 tiles** | dy ≤ 0; measured reliable to 4 |
| Rise-1 gap ceiling | **3 tiles** | single jump; measured reliable to 4 |
| Rise-2 gap ceiling | **2 tiles** | single jump, near its own limit; measured reliable to 3 |
| Double-jump gap ceiling (rise 3-4) | **4 tiles** | measured reliable to 6-7 |
| Double-jump gap ceiling (rise 5) | **3 tiles** | tighter — near the double jump's own limit; measured reliable to 5 |
| Double-jump gap FLOOR (rise 3-4) | **1 tile** | below this, the rising arc's horizontal drift carries the body under the target's footprint, hitting its underside like a low ceiling |
| Double-jump gap FLOOR (rise 5) | **2 tiles** | the floor of 1 is NOT enough at the top of the range — clean gap sweep at rise 3/4/5 found gap 1 fails every time at rise 5 where it clears reliably at rise 3-4; found via the physics cross-check exercising real generated rise-5 edges, not assumed to scale with the rise-3/4 case |
| Max climbable rise | **5 tiles** | `GEN_MAX_RISE_TILES` — no generated beat may ever ask for more |
| Roll-crossable hazard strip | **4 tiles** | 85.5 px measured roll distance ÷ tile size, margin taken |
| Aggregate rejection rate | **21.1%** over 60 seeds | 47/60 needed zero regeneration, 13/60 needed at least one — non-vacuous in both directions |

**Not measurements — design judgments, named as such rather than dressed up
as derived:** `GEN_MIN_FIGHT_TILES` (4 tiles — no capture plate for "how much
room feels fair to fight on"; roughly six times the player's own width).
`GEN_RISK_CHANCE` (0.02 — tuned by sweeping several values against 60 seeds
each and picking the one that keeps the audit reading as a guardrail
catching real, occasional unfairness rather than either never firing or
dominating the generator's output).

**The bug the physics cross-check exists to catch, caught for real.** D3a's
whole justification is that an unfair layout "shows up as 'that run felt
bad,'" the hardest bug class to chase. `verify_gen`'s cross-check — a real
player, through real sim ticks, attempting every edge the audit's graph
model calls legal, in an isolated two-platform world built from nothing but
that pair's own coordinates — found the audit silently calling a real,
unreachable rise-5 climb "legal" before the floor above was tightened to 2
tiles. Two further real bugs from the same effort, found before this
specific one: `edgeAllowed` originally OR'd both directions of rise into one
undirected edge (a valid DROP could license an invalid CLIMB the other way
across the same pair — fixed by making the graph genuinely DIRECTED), and
the original missing double-jump floor itself (the rise 3-4 case above).

### Wall interaction (v0.2.8)

`onWall` was already computed every tick by `25-body.js`'s own
axis-separated collision (Emberrush's charge already read it to end early)
— this is the first PLAYER mechanic to act on it, so unlike every other
number in this section it has no prior baseline to measure against. Real,
driven-not-guessed measurements below; **not yet claimed as tuned** the way
`JUMP_VEL`/`ROLL_SPEED` are — see `verify_move`'s own wall-interaction
section for the exact scenarios these numbers came from.

| Quantity | Value | How |
|---|---|---|
| Wall slide terminal speed | **2.2 px/frame** (clamped, exact) | held into a wall while airborne, real `vy` sampled every tick |
| vs. normal terminal fall | 9.0 px/frame | the slide is a genuine, large reduction — real control, not a token one |
| Wall jump apex | **48.6 px** — identical to a normal jump | reuses `JUMP_VEL` directly rather than a new number, held through the natural apex the same way every jump measurement in this file is |
| Wall jump push-off | measurably real (>4px before landing, even fighting continued into-wall input) | `WALLJUMP_LOCKOUT` dampens (`ATTACK_DRIFT`-style, not a hard override) rather than eliminates return-to-wall drift |
| Requires holding INTO the wall | confirmed both ways | slides when held in; measured NOT to slide when merely brushing past one while airborne |
| Air jump refresh | confirmed | both wall-sliding and wall-jumping restore the air jump, the same generosity landing already gets |
| Wall jump priority over double jump | confirmed the strong way | fires even with the air jump already spent elsewhere, proving it is never gated behind that resource |

### Weapons as data (v0.2.8, D7)

The first real second WEAPON. Not a new measurement in the `verify_move`
sense (nothing here is a physics constant) — the claim being proven is
narrower: that a weapon really is just two move IDs into the shared rig
pipeline, with a genuinely different feel falling out of geometry and
timing alone. Twin Daggers uses a `blade` geometry of 6px against the
default weapon's 11px — everything else about the character (shoulder,
upper arm, forearm) is identical, it is still the same arm.

| Move | Frames | Active | Damage | Chain |
|---|---|---|---|---|
| daggerA | 7 | 2–3 | 4 | → daggerB |
| daggerB | 6 | 2–4 | 4 | → daggerC |
| daggerC | 7 | 2–3 | 5 | ends the combo |
| daggerHeavy | 12 | 6–8 | 10 | — |

Baked and audited through the exact same generic pipeline as the default
blade — a candidate bake was checked directly against `Rig.audit()` (zero
violations) before any of this was written into the shipped `MOVES` table,
the same discipline as every other measured number in this project.

### The stat contract (v0.2.9, D2)

"Each stat starts at 1 every run. A pickup grants +1 to a chosen stat and
+HP only if that stat is dominant. Weapons list two colours and scale off
the larger; colourless gear scales off the highest. Dual choices are
weighted toward the two lowest stats." Three colours: **ember**, **umbral**,
**verdant** — original names for a red/violet/green triad, not borrowed
ones (L1). "+HP" reuses this project's own already-established vocabulary
rather than a new invented meaning: D8 names "+max HP" as exactly what meta
currency buys permanently; this is the within-run version of the same
concept.

| Quantity | Value | How |
|---|---|---|
| Stat start | STAT_START = 1 | every colour, every run |
| Dominance | strictly the sole highest | a tie does not count — proven directly: gaining a stat that only ties the leader grants no HP |
| HP coupling | STAT_HP_GAIN = 1 | max hp AND current hp both grow by this on a dominant gain |
| First pickup of a run | always dominant | 1,1,1 → 2,1,1 has no tie to fail against; the anti-death-spiral property only needs to matter once stats have actually diverged |
| Weapon scaling | 1 + (statValue − 1) × STAT_SCALE_PER_POINT | STAT_SCALE_PER_POINT = 0.15, a **design judgment**, not a measurement — no capture plate for "how much should a stat point matter," named as one rather than dressed up as derived, the same discipline as `GEN_MIN_FIGHT_TILES` |
| Colourless fallback | scales off the highest of all three | proven directly with an unregistered weapon id |

**One real simplification, stated plainly rather than left to be
discovered.** `50-gen.js`'s pickups are single points, not spatial pairs a
player physically walks up to and chooses between — building that would
mean changing an already-shipped, fairness-audited generator to place
deliberate pairs, a real, separate piece of scope not taken on here.
"Weighted toward the two lowest stats" is instead a soft preference applied
at the moment of collection (`pickStatColour`, 30-player.js): whichever
colour is currently the sole highest is weighted down, the other two (or
all three, if tied) split the remainder — confirmed statistically over
3000 real seeded draws, not by inspecting the formula, both for a stat
pushed clearly ahead and for a genuine three-way tie.

### Weapons #3 and #4: Warmaul and Thornspear (v0.2.10, D9)

D9 locks the roster at four weapons; only `blade` and `daggers` existed
before this. Chosen by a judged 3-pitch panel (2 judges, each independently
reading `10-data.js`/`35-rig.js`/`40-combat.js` live before scoring) — the
first panel in this project's history that genuinely SPLIT: judge 1 scored
42/39/36 for pitch 1, judge 2 scored 37/42/46 for the same three, favouring
different winners. Read on substance rather than mechanically summed:
pitch 1's weaker weapon duplicated Blade's exact reach AND chain length
(both judges' harshest individual-weapon criticism of any of the six
weapons proposed); the chosen pitch (Warmaul + Thornspear) was the only one
with zero false claims from BOTH judges, a full 1/2/3/4 hit-count spread
across the whole roster, and a discovered invariant — Blade's and Daggers'
light chains already total the same 13 base damage — extended cleanly to
both new weapons.

| Weapon | Colours | Reach | Chain | Light dmg | Heavy dmg | Identity |
|---|---|---|---|---|---|---|
| Warmaul | umbral, verdant | 18px | 1 hit, `chain: null` | 13 | 20 | one committed swing, no combo at all |
| Thornspear | ember, verdant | 20px | 4 hits | 3,3,3,4 | 9 | longest reach, lowest knock, weakest heavy |

Both reuse the hitstop constant the OTHER weapon's slot conventionally
uses — Warmaul's light move takes `CFG.HITSTOP_HEAVY` (even its fast button
freezes like a heavy hit), Thornspear's heavy takes `CFG.HITSTOP_LIGHT`
(even its strong button stays quick) — a real, legal reuse of two constants
that already existed, not a new one invented for the occasion.

**The panel's own runner-up concern turned out to be real, and was measured,
not waved off.** A judge flagged that the pitch's own 22px Thornspear blade
was "nearly quadruple the character's own default reach... no acknowledgment
of how extreme." Baked into the real merged table (every move in the game
together, the same construction `C.RIG = new Rig(MOVES)` does at boot) it
pushed the whole game's measured reach envelope to 40.5px — past
`verify_rig`'s own long-standing "reach is about two tiles, not ten" ceiling
(20-40px), an invariant that predates this weapon and was not loosened to
fit it. Pulled back to 20px (measured envelope 38.65px), the longest reach
in the roster with real headroom to spare.

**A second real bug, this one geometric rather than a stale assertion.**
First-draft frames for both new weapons copied the existing `heavy` move's
angular deltas onto a longer `geom.blade`. `heavy`'s windup can swing back
to -143° and stay under `RIG_ACTIVE_SPEED` because its 11px blade is short
— the same angles on Warmaul's 18px/Thornspear's 20px lever were ALREADY
moving fast while still behind the body, failing the audit's `behind` rule
on both moves, caught by baking against the real `Rig.bakeMove()`/`audit()`
before either was ever written into the shipped table — the same discipline
Twin Daggers used, this time actually catching something. Fixed with a
shallower, held windup (small angular steps until just clear of the body,
then one large release frame), not by weakening the rule.

**Verified against the real bake, not read as correct (L8).** `verify_rig`
grew from 97 to 144 assertions: frame counts and active windows pinned for
all 7 new moves: `maulA`(7,8,9), `maulHeavy`(8,9,10), `spearA`(4,5,6),
`spearB`(3,4), `spearC`(3,4), `spearD`(3,4), `spearHeavy`(5,6,7); reach
proven strictly ordered across all four weapons (daggers < default < warmaul
< thornspear); the 13-damage light-chain invariant proven for all four
weapons, not assumed from three. `verify_combat` grew from 67 to 90:
equipping each new weapon changes both light and heavy opening moves; three
repeated Warmaul swings prove `chain: null` behaves as a clean, repeatable
single hit rather than silently eating a buffered second press; real damage
through the unmodified resolver for `maulA` (13, the single biggest
LIGHT-classed hit in the game) and separately for `maulHeavy` (20, the
single biggest hit in the whole game, heavies included — the first version
of this claim named the wrong move, caught by an adversarial re-read and
fixed rather than left to mislead); Thornspear's four-hit chain proven with
the same buffered-early-press technique Daggers' three-hit chain already
established, carried one hit further; determinism with each new weapon
equipped. A second adversarial pass also found the three-repeated-swing
`chain: null` test above provably cannot reach `Combat.begin`'s mid-move
branch (the one that actually reads `m.data.chain`) — confirmed by mutating
the real, shared `maulA.chain` field and watching the existing test stay
green regardless. A second test drives a press buffered WHILE `maulA` is
still active, squarely into that branch; the same mutation now flips it red
(`attackStart` count 1 → 2), confirmed directly before trusting the fix. No
new hash-coverage gap — both weapons are pure `WEAPONS`/`MOVES` table rows,
no new per-entity field.

**What was deliberately not done here.** Weapon equipping/switching still
has no player-facing path — same D4 dependency named in §5g/§5h, unchanged
by adding two more rows to a table nothing yet lets a player choose from.

### Slam impact (v0.2.11)

The slam (§ above, movement) has always had landing FX — 6 frames of
hitstop, a screen shake, particles — but never dealt damage: a false
affordance, since it visibly LOOKS like an attack and was not one. No
judged panel here, unlike weapons #3/#4 — this genuinely isn't open design
space the way a weapon's identity is; the wiring is dictated by an existing
rule (`Combat.resolveBox` is THE shared hit-resolution function, "the
moment there are two places that subtract from hp, neither of them is the
rule") and the numbers are named design judgments, the same shape wall
interaction (§5g) used to skip a panel too.

| Quantity | Value | Note |
|---|---|---|
| Damage | SLAM_DAMAGE = 10 (before scaling) | matches daggerHeavy's tier; a named judgment, not derived |
| Reach | 22px each side of the body | comparable to the roster's "long" weapon class |
| AOE height | 14px up from the feet | a ground-level band, not a tall swing box |
| Knockback | mostly horizontal (3.2), slight lift (-1.4) | a shockwave shove, not a swing's upward pop |
| Weapon-agnostic | yes — deliberately, D7 not extended here | a ground-pound is movement-triggered, not a swing; still scales via `Combat.weaponScale` off current stats, so D2 stays coupled to every damage source |
| Hitstop on a real hit | `CFG.HITSTOP_HEAVY` (9), up from the unconditional landing 6 | the same "biggest hits get the biggest freeze" rule every weapon's heavy already follows |

**The architecture question, decided by re-reading the existing rules, not
invented.** A slam has no `facing` — it is a shockwave centred on the
landing point, not a directional swing — but `Combat.resolveBox` always
pushes every target it hits in ONE shared direction (`spec.facing`).
Teaching `resolveBox` a second knockback model would be exactly the "two
places that subtract from hp" failure the project's own rule warns against.
The actual fix: two `resolveBox` calls, a LEFT box (facing -1) and a RIGHT
box (facing +1) flanking the body, sharing one dedupe list — the ONE shared
resolver still resolves every hit, it is just called twice.

**Four real problems, caught before this ever reached the gate.** (1) The
first draft used `Object.assign` to build the two boxes' specs — this
codebase makes NO ES2015+ runtime assumptions anywhere (`var`, no arrow
functions), stated explicitly in `92-menu.js`'s own `withField` comment,
because a Wear OS WebView is a real target; fixed to two full literal
objects, matching how `Combat.step` already writes one inline. (2) A nearby
comment on `player.weapon` still blamed "the not-yet-built pickup system
(D2)" for the missing equip path — D2 shipped in v0.2.9; the real dependency
is D4, corrected while touching the same file for an unrelated reason
rather than left to keep misleading. (3) The knockback test itself failed
on its first run — not because knockback was broken, but because
`Dummy.prototype.hurt` applies knock as VELOCITY, and a connecting slam's
own `CFG.HITSTOP_HEAVY` request freezes the whole sim (targets included) for
9 ticks immediately afterward; the test read position before a single
un-frozen tick had run. Fixed by stepping past the freeze before checking,
not by weakening the assertion. (4) Repeated real re-runs of the full gate
(chasing (3) down) surfaced two MORE `verify_render` timing flakes beyond
the two this version's own adversarial pass already found and fixed
(§5i) — a keystroke-displacement check and a jump-height check, both a
fixed real-time sleep assumed to cover enough SIM TICKS. Given the class of
bug was now proven three times over, a third, still-undiscovered instance
(a touch-drag displacement check, same shape) was found and fixed
proactively by grep rather than waiting for a fourth unlucky re-run.

**Verified against real sim ticks, not read as correct (L8).** `verify_combat`
grew from 90 to 109: real damage in range on both the left and right box
independently; a target just past each box's outer edge takes none; the
VERTICAL reach (`SLAM_HIT_H`) proven too — a target pinned above the AOE
band takes nothing, one pinned within its real vertical reach does (an
adversarially-found gap: every dummy elsewhere in this section rests on the
floor, where its own body height already spans nearly any plausible
`SLAM_HIT_H`, so the horizontal-only tests alone never actually exercised
this number); knockback proven to push each side AWAY from the landing
point, not in one shared direction; a whiffed slam requests only the base 6
hitstop, a connecting one requests 9; weapon-scaling proven through a
raised stat, not just the flat base; the flag `Combat.resolveSlam` owns
does not re-fire on a later, unrelated tick; i-frames respected;
determinism over 200 ticks including a real slam landing on a real target.
`bash tests/run_all.sh` → **GREEN 1149/1149 across 12 suites**. A later
adversarial pass over this same work found the real cause of the gate's
own residual instability — an orphaned-Chromium-process leak, not sim
timing — fixed separately; see the `verify_render` entry above and §5j.

**What was deliberately not done here.** No per-weapon slam variant — a
stated scope choice (universal, see the table above), not an oversight.
Slam still costs no resource and has no cooldown beyond the existing
`SLAM_HANG_FRAMES`/landing recovery; whether that is balanced is a "played,
not measured" question this session did not attempt to answer.

### Ledge grab / mantle (v0.2.12)

Genre-standard shape (hold into a wall while falling to catch its own top
edge, jump to climb up onto it, down or a timeout to drop) rather than open
design space, so this skipped a judged panel the same way wall interaction
(§5g) and slam impact (§ above) both did — but the DETECTION geometry
itself, not being a velocity clamp the way wall slide/jump are, was
measured against real constructed test worlds (a clean ledge, a tall wall
with none, a ledge with no headroom to climb into) before being wired into
`update()`, the same "bake-test before shipping" discipline every rig move
already follows.

| Quantity | Value | Note |
|---|---|---|
| Grab condition | airborne, touching a wall, holding INTO it, `vy ≥ 0`, not locked out | checked before wall slide's own clamp — a genuine ledge takes priority over merely sliding past the same wall |
| Climb input | jump | genre-standard; not a new "up" input this project doesn't otherwise use anywhere |
| Release | down, or `LEDGE_GRAB_MAX_HANG` (90 frames) elapsed | measured, not asserted |
| Re-grab lockout | `LEDGE_GRAB_LOCKOUT` (10 frames) | stops the ledge just climbed off from instantly re-catching on the way up |
| While hanging | `vx`/`vy` pinned to 0 every tick | the wall IS the support, the same way a ground tile is |
| Hazard interrupt | a hit releases the hang immediately | see bugs below — not the original behaviour |

**Three real bugs found and fixed while building, before any adversarial
pass.** (1) The first climb draft nudged the body a fixed 6px off the wall
face (`LEDGE_CLIMB_NUDGE_X`) rather than anchoring to the tile grid;
traced by hand that this left the body straddling two tile columns instead
of standing fully on the ledge (`PLAYER_W` = 10 into a 16px tile leaves
only 6px of margin, which is not the same as 6px of travel). Fixed by
removing the nudge constant entirely and anchoring directly to the tile
boundary `detectLedge()` already proved has headroom. (2) Immediately
after climbing, `state` read `fall` and `onGround` read `false` for
exactly one tick despite the body already sitting correctly — the same
class of bug already fixed once for roll's own start frame: `move()`'s
Y-step never runs at all when `vy` is exactly 0, because the substep loop
skips a zero-length axis. Fixed the same way: `b.vy += CFG.GRAVITY` on the
transition tick. (3) `finish()`'s own state classifier would have silently
overwritten `state = 'ledgeGrab'` back to `'wallSlide'` the same tick it was
set, since the classifier's exclusion list did not yet know the state
existed — caught by re-reading `finish()` before ever running a test, not
by watching one fail.

**A dedicated adversarial verification pass, run the same way as every
feature this session, found four more real problems — three substantive,
one cosmetic.** (1) A crouched approach (rolled or crouch-walked into the
wall before grabbing) that then climbs never stood the body up: `b.h`
stayed at the crouched 12px while `b.y` was computed for the standing 22px
ledge position, leaving the feet ~10px above the real surface — `onGround`
false, and `finish()`'s own classifier silently overwrote the intended
`idle` back to `fall` that same tick, self-healing only several ticks
later once the ordinary in-air auto-uncrouch caught up. Fixed by standing
the body up unconditionally on the climb transition — unlike the ordinary
ground jump's own crouch-cancel, which gates on a real `canStand()` check,
`detectLedge()` had already proven `PLAYER_H`'s worth of clearance at the
landing spot specifically, so there was nothing left to ask permission
for. (2) A hazard hit landed on a hanging player did nothing: the
`ledgeGrab` block's own per-tick "pin velocity to zero" ran again the very
next tick, before `move()` ever applied the knockback, leaving a player
caught by a hazard while hanging permanently unable to be knocked free.
Fixed in `Player.prototype.hurt()` — a hit now releases the hang
immediately, the same way every other interruption in this game already
takes priority over holding still. (3) The negative "touching but not
holding in" test never actually touched the wall — it only proved a body
released the wrong way for the right side effect. Rewritten to genuinely
touch the wall first (proven via `onWall === 1`), then release, before
asserting no grab follows. (4) `STANCE.ledgeGrab`'s own comment in
`35-rig.js` claimed the generic 1500-tick figure-drive sweep in
`verify_rig` validated the pose — it structurally cannot, since that sweep
runs against `flatWorld`, which has no wall that ever ends into a ledge, so
`ledgeGrab` is unreachable there. The comment was corrected and a
dedicated test added that drives a real `ledgeGrab` on a real constructed
world and poses it directly instead.

**Verified against real sim ticks, not read as correct (L8).** `verify_move`
grew from 116 to 140: a falling body held into a real ledge catches it at
the wall's own top row, flush against the wall face, velocity pinned;
grabbing fires its event exactly once; a genuinely-touching-but-not-held
body never grabs; a wall with no ledge anywhere reachable never grabs; a
ledge with no headroom above it never grabs; climbing lands the body
re-grounded on the SAME tick, not one tick later, with the air jump
refreshed; dropping and the auto-drop timeout both measured directly, not
asserted from config; the re-grab lockout's real boundary swept and pinned
at exactly `LEDGE_GRAB_LOCKOUT`; determinism over a full grab-hang-climb
sequence, hashed twice. `verify_rig` grew from 144 to 148: a real
`ledgeGrab` reached on a real constructed world, every joint finite,
cloak present, and `figure()` reporting the real state rather than a
silent idle fallback. `bash tests/run_all.sh` → **GREEN 1177/1177 across
12 suites**.

**What was deliberately not done here.** No mid-air ledge-to-ledge chaining
or wall-to-wall ledge climbing beyond a single catch-climb-or-drop cycle —
genre convention for this move is exactly that one cycle, not a traversal
combo, and nothing in this session's scope asked for more. The re-grab
lockout test's own precision is coupled to its test geometry (a much
larger `LEDGE_GRAB_LOCKOUT` could in principle let the body fall past
`detectLedge()`'s scan window before the lockout itself expires) — not a
concern at the current value, but named in the test's own comment rather
than assumed away.

---

## 4. The gate

One command: `tests/run_all.sh`. **2262 assertions across 16 suites**, plus
the build itself, which now includes a `node --check` syntax pass over the
fully assembled script (§4a explains why that exists). `VERBOSE=1` prints
every assertion; failures always print.

- **verify_arch (215)** — sim purity in a bare sandbox with no browser globals
  and a `Math.random` that throws; no browser globals, `Math.random` or `dt` in
  any sim module (source-scanned with comments stripped, so prose about a
  banned identifier is not a use of it); the presenter never assigns sim state;
  Sim owns its own tick loop; hitstop does not eat input; 900 identical ticks
  with and without a presenter leave byte-identical state; `resetTransient()`
  restores a run to a fresh sim exactly, while leaving bus listeners subscribed;
  the suite is not vacuous (a probe suite is fed deliberate failures and must
  report them). Registering `50-gen.js` into `harness.js`'s `SIM_FILES` for
  v0.2.5 added 9 of these (this suite's own per-file purity checks now also
  run against it, no assertions hand-added here) — the previously documented
  count of 153 does not otherwise reconcile against 168 and was already stale
  before this session for reasons not traced here. Registering `55-boss.js`
  for v0.2.7 added another 9, the same mechanism, no assertions hand-added.
  Registering `60-run.js` for v0.2.13 added another 9, same mechanism again.
  Registering `65-meta.js` for v0.2.14 added another 9, same mechanism a
  fourth time, 195 total. Registering `82-narrative.js` into `APP_FILES`
  for v0.2.15 added a DIFFERENT 6 — `APP_FILES` members are source-scanned
  for the same invariants, not loaded and purity-tested the mechanical way
  a `SIM_FILES` registration is, so the growth shape genuinely differs
  here, not an inconsistency. 201 total. Registering `85-audio.js` into
  `APP_FILES` for v0.2.16 added the same DIFFERENT 6, the identical
  mechanism as `82-narrative.js` one version earlier — not a new growth
  shape. 207 total. Since v0.2.17 (D13, §5p): two new regression blocks —
  a grounded roll's own particles proven finite (closing a gap the dash
  VFX sweep in `verify_render` exposed but could not close on its own,
  since it only ever exercises the airborne path) and a real running
  sequence proven to produce finite footstep-dust particles (the `step`
  emit's own sibling NaN bug, finding 12 — see §5p) — +8. 215 total.
- **verify_core (55)** — RNG determinism, per-instance divergence, snapshot
  restore, range and NaN sweeps; bus semantics, typed rejection and listener
  isolation; world queries, out-of-bounds rules, half-open spans and text
  round-trip; config sanity; sim determinism over 600 ticks.
- **verify_move (202)** — every movement mechanic MEASURED, not asserted from
  the config. Includes a 1200-tick stress run over a world with every tile
  kind asserting the body never ends a tick overlapping a solid tile. Since
  v0.2.8, also wall interaction (§3): a grounded press next to a wall is an
  ordinary jump, never a wall jump; airborne and pressed INTO a wall clamps
  fall speed to `WALL_SLIDE_MAX` and refreshes the air jump; airborne but
  merely brushing a wall never slides; a wall jump reuses `JUMP_VEL` (apex
  matches a normal jump exactly), pushes measurably away even against
  continued into-wall input, and fires even with the double jump already
  spent — proving it is never gated behind that resource. Since v0.2.12
  (§5k), ledge grab/mantle: a falling body genuinely held into a real ledge
  catches it, positioned and event-fired exactly once; a body merely
  touching but never holding never grabs; a tall wall with no ledge
  anywhere reachable never grabs; a ledge with no headroom above it never
  grabs; climbing re-grounds the body the SAME tick, not one tick later,
  with the air jump refreshed; the auto-drop timeout and the re-grab
  lockout's real boundary both measured directly, not asserted from
  config; determinism over a full grab-hang-climb sequence. Since v0.2.17
  (D13, §5p): Ember Dash measured the identical way — grounded press
  still rolls (regression), airborne press dashes with a real measured
  distance/frame count, blocked on cooldown, i-frames proven through a
  real hit landed mid-dash, timers frozen on a hitstop tick, the
  buffered-roll-lands-as-ground-roll race driven for real; Parry's own
  window/cooldown/whiff-arms-cooldown timing, and a direct regression for
  the `Pad.BUTTONS`/`WINDOW` two-map silent-failure trap named in the
  plan as the single most likely first-draft bug in the whole feature —
  +62. 202 total.
- **verify_rig (148)** — the bake and the audit that guards it (D6). Frame
  counts and derived active windows are pinned, so nudging a keyframe shows up
  as a diff. Boxes appear on exactly the swinging frames and are frozen. The
  move table is checked to declare no hitboxes at all (L9). Every audit rule
  is fired at a poisoned bake and must catch it — and must not cry wolf on a
  clean copy. Also poses the FIGURE every tick of a 1500-tick run: every joint
  finite, every state the player can enter has a stance (including v0.2.8's
  new `wallSlide` state, once missing this exact assertion caught it), feet
  land on the ground line, the carried blade never reaches through the floor
  or outside the swing envelope. Also bakes and audits an ENEMY move
  (`clawA`) on its own proportions, proving L9 is not a rule about the
  protagonist — and since v0.2.8/v0.2.10, all THREE non-default weapons'
  moves on their own geometry, proving the same of D7. Since v0.2.10 (§5i):
  reach proven strictly ordered across the whole four-weapon roster; the
  13-damage light-chain total proven to hold for all four, not assumed from
  three; frame counts and active windows pinned for all 7 of Warmaul's and
  Thornspear's moves; the real merged-table envelope re-measured and proven
  still inside the pre-existing 20-40px "about two tiles, not ten" ceiling
  after adding the roster's two longest-reach weapons — this pre-existing
  assertion is what caught Thornspear's first-draft reach as too extreme
  (§5i), not a new check added to rubber-stamp the fix. Since v0.2.12
  (§5k): a dedicated test drives a real `ledgeGrab` on a real constructed
  world and poses it directly, closing a gap the 1500-tick sweep above
  cannot close on its own — `flatWorld` has no wall that ever ends into a
  ledge, so that generic sweep can never reach `ledgeGrab` at all (an
  adversarial pass found an earlier draft of `STANCE.ledgeGrab`'s own
  comment overclaiming that it did).
- **verify_combat (109)** — hits land where the blade is, once per move,
  mirrored correctly by facing, and anchored to the FEET so a crouched swing
  does not sink into the floor. Startup carries no hitbox. I-frames gate the
  second hit, driven off the target's own counter rather than a tick budget.
  Hitstop durations, combo chaining with an early press left buffered rather
  than eaten, roll and death cancels, attack drift, and determinism over 700
  ticks of scripted fighting. Since v0.2.8, weapons (D7): equipping Twin
  Daggers changes both the light AND the crouch-attack heavy entry point;
  its own three-hit chain (daggerA → daggerB → daggerC, one hit longer than
  the default blade's) proven the same buffered-early-press way, not with
  the helper built to prove a chain's ABSENCE; real damage through the
  unmodified `Combat.resolveBox`; and determinism with a second weapon
  equipped, closing a hash-coverage gap (`player.weapon`, `wallJumpLock`)
  the same session also closed for the boss's own new fields. Since v0.2.10
  (§5i): equipping Warmaul or Thornspear changes both entry points the same
  way; three repeated Warmaul swings prove `chain: null` behaves as a clean,
  repeatable single hit rather than silently eating a buffered second press
  — AND, since that test alone cannot reach `Combat.begin`'s mid-move
  chain-check branch (the gap an adversarial re-check found and a mutation
  test confirmed), a second test drives a press buffered mid-swing squarely
  into that branch and is proven to catch the same mutation the first test
  missed; Thornspear's four-hit chain proven the same buffered-early-press
  way, carried one hit further than Daggers'; real damage through the
  unmodified resolver for `maulA` (the biggest LIGHT-classed hit in the
  game) and separately for `maulHeavy` (the biggest hit in the whole game —
  the first draft of this claim named the wrong move); determinism with
  each new weapon equipped. Since v0.2.11 (§5j), slam impact: real damage
  on both the left and right AOE box independently, a target just past
  either box's outer edge takes none, knockback proven to push each side
  AWAY from the landing point (not one shared direction — the reason it is
  two `resolveBox` calls, not one), a whiffed slam requests only the base
  landing hitstop while a connecting one requests the bigger heavy one,
  weapon-scaling proven through a raised stat, the one-tick `slamLanded`
  flag proven not to re-fire, i-frames respected, and determinism over 200
  ticks including a real landed slam.
- **verify_stats (41, D2)** — the stat contract, driven through real
  `gainStat`/`pickStatColour`/`Combat.weaponScale` calls and, for pickup
  collection, real sim ticks: a tie is proven NOT dominant, only a strict
  overtake is; the pickup-weighting formula proven statistically (3000 real
  seeded draws) rather than by inspection; weapon scaling proven to read
  the LARGER of a weapon's two colours (never their sum, never an unrelated
  third colour) and to fall back to the highest of all three for an
  unregistered weapon id, then proven again through real, rounded,
  resolved combat damage. A real bug found and fixed while writing this
  suite, not in the mechanism: the first draft of the pickup tests never
  actually moved the player, so nothing was ever collected — two later
  tests (double-collection, `resetTransient`) were passing anyway, for the
  WRONG reason (nothing to double-collect or reset in the first place),
  until each was rewritten to prove collection happened before testing its
  absence.
- **verify_enemy (132)** — the roster (§2a) and the fairness rule. Every
  template declares a telegraph ≥ `MIN_TELEGRAPH`; a melee template names a
  move that actually bakes; a shooter carries a projectile spec that dies on a
  timer. The dodge/commit test runs against all four templates: commit, then
  run the other way, and `lockFacing` must never change. Contact damage is
  proven OFF while an Emberrush merely patrols and ON only while it is
  actively charging. Per-instance seeding (L4): two Ashwalkers, same spot,
  different seeds, provably different wander. Determinism over 900 ticks with
  a full four-enemy roster fighting. Since v0.2.17 (D13, §5p):
`Enemy.prototype.stagger()`'s idempotency (co-op's two-players-one-hitbox
case produces exactly one stagger, not two); `dangerous()` false while
staggered; a staggered enemy's in-flight `attack` cleared so no delayed
hit lands; a staggered enemy still reaches `recover` and is still
eligible afterward; the pre-existing fairness-rule loop unaffected for
every path that never presses parry — +47. 132 total.
- **verify_boss (73)** — Kilnwarden (§5f). Every move (both phases) clears
  `MIN_TELEGRAPH`; Kilnwarden is confirmed absent from `DATA.ENEMIES`/
  `ENEMY_IDS` (D9's four-template pin stays exactly four); the move-picker's
  eligible pool is proven never empty by a real distance sweep across the
  whole arena, not by inspecting the authored ranges; the fairness dodge
  test runs against every move in both phases; the phase transition is
  proven to trigger only at a safe point (never mid-attack, confirmed by
  forcing the threshold mid-telegraph and checking the committed attack
  resolves unrevised), run for exactly its declared length, and never be
  dangerous; the arena hazard is read off the real `World` directly —
  non-hazard before, `HAZARD` for exactly its declared window, reverted
  after — and a player standing in a live vent takes real damage through
  the same generic hazard path every other `HAZARD` tile already uses;
  determinism through a full phase transition and zone attack; two-player
  fairness (aggro locks to the nearer player, the other takes zero damage
  from that commit). Found one real interaction with pre-existing behavior
  while writing this suite, not a bug in the boss: a Kilnwarden shot already
  in flight can connect with the player mid-transition, and `Player.hurt()`'s
  existing 8-tick impact hitstop freezes the whole sim, boss included — the
  first draft of this suite counted those frozen ticks as transition
  progress and failed until it started measuring real (non-frozen) ticks
  instead. Since v0.2.17 (D13, §5p): a real parry stagger still reaches
  `recover` and is still eligible for a boss phase-transition check
  afterward — proving stagger routes through the EXISTING branching
  rather than a parallel path built just for it — +4. 73 total.
- **verify_gen (56, D3/D3a)** — four layers, cheapest and most isolated
  first. The pure capability model (`maxGapForRise`/`gapBetween`/
  `edgeAllowed`) against hand-derived boundaries, including genuine
  directional asymmetry (climbing 2 tiles across a gap that only fits the
  flat ceiling fails; dropping back down across the exact same gap
  succeeds). The DIRECTED graph/BFS (`buildGraph`/`reachableFrom`) against
  hand-built platform lists with a known right answer, never derived from
  the generator itself (L8) — an island platform placed far beyond any
  capability, and a platform reachable only via two hops proving real
  multi-hop search, not adjacency-only. The audit (`audit()`) against
  hand-built fair and deliberately unfair candidates — an unreachable exit,
  an unreachable pickup, a too-narrow main platform (with the one deliberate
  exemption: a narrow SPUR does not fail on width alone), and multiple
  simultaneous failures all reported, not just the first. The generator
  itself: determinism across the full reject/regenerate loop (L4 — one RNG
  instance owns every attempt), structural sanity across 40 seeds, every
  generated level still passing a fresh audit of its own platform list, a
  non-vacuous rejection rate (0.05-0.45 band, confirmed both some seeds need
  zero regeneration and some need real regeneration), and the hard ceiling
  proven reachable by an intentionally impossible config that fails loudly
  rather than hanging or lying. Then — the strongest claim in the suite — a
  REAL physics prover attempts every edge the audit calls legal in an
  isolated two-platform world, holding through each jump's natural apex the
  same way the capability numbers themselves were measured, trying five
  genuinely distinct landing techniques per edge and confirming it if any
  one lands: **174/174 real generated edges physically confirmed**, 6
  zero-gap edges correctly out of scope. Found the rise-5 double-jump floor
  bug documented in §3.
- **verify_run (118, D1, new suite v0.2.13)** — two layers matching
  `verify_gen`'s own precedent: pure `RunLogic` logic (seeding, `isLevelClear`,
  `reachedExit`, the D8 currency/spend stub, `placeEnemies`) against
  hand-built fixtures first, real `Sim`/`Player`/`Enemy` integration second
  — proving `70-sim.js` actually wires the pure logic in correctly, not
  merely that the logic is self-consistent in isolation (L8). A plain
  `scenario()` never engages the loop at all; `beginRun()` loads a real
  audited-fair level and places a real roster; killing everything without
  reaching the exit, or reaching the exit without clearing everything, both
  correctly refuse the boss door; an undying boot-path Dummy living
  alongside a real roster never blocks "clear" forever (found by driving
  the real built game end to end in a browser, not caught by any sim-only
  test until this suite existed); every real kill through
  `Combat.resolveBox` is banked, boss kills never double-counted; a full
  clear opens the boss door and carries hp through with no free heal at the
  threshold; a boss victory with no death starts a `CFG.RESPAWN_FRAMES`
  pause before committing the next level, timed exactly; death mid-level
  reuses `Player`'s own existing `deadFrames`/`resetTransient()` machinery
  unmodified and still pays out currency for kills already banked without a
  clear; co-op (D5): the run ends at the first death, the survivor is never
  force-killed (the exact bug an adversarial judge found in a losing panel
  pitch's own force-death loop), and a genuinely STAGGERED co-op death
  proves the second player's still-running countdown survives both the
  level commit AND a subsequent level->boss transition without being
  stomped; determinism (L4) across a full scripted clear/boss-death/respawn
  loop; and a dedicated regression proving `beginRun()` is a genuine
  restart — a real bug this suite caught before the version shipped, full
  account in §5l. Since the dedicated adversarial pass over this file's own
  work (§5l): a boot-path dummy killed for real banks zero kills; a
  co-op partner's kills landed during a real pending window are paid out in
  full at commit; a co-op survivor AND a solo boss-victory player are both
  proven reset to the D2 baseline at a real run boundary; 500 consecutive
  derived levels from four starting seeds are swept and proven to never
  repeat — six real bugs the pass found, all fixed, full account in §5l.
- **verify_meta (265, D4/D8, new suite v0.2.14)** — two layers matching
  `verify_run`'s own precedent: pure `MetaLogic` logic (`sanitize` across
  nineteen corrupted-payload shapes, `serialize`/`deserialize` round-trips,
  `isUnlocked` under both Stage-1-default and enforced modes,
  `rollBlueprintDrop`'s determinism and its "zero draws when nothing is
  locked" rule, both spend functions proven to reuse `RunLogic.spend`
  directly) against hand-built fixtures first, real `Sim`/`Player`
  integration second. A fresh sim owns a real `Meta` instance at Stage 1's
  own default; `buyMaxHp()` refuses when unaffordable, grows the current
  player's hp AND maxHp immediately when affordable, stacks, and survives
  a genuine `beginRun()` restart; a co-op joiner immediately reflects the
  current bonus; a real kill under `enforceLocks` drops a real, still-
  locked weapon (found by brute-forcing seeds); carry capacity is
  respected across many more real kills once already carrying; Stage 1's
  default never drops anything across a full real clear; a real death
  fires `blueprintLost` at the exact moment (before the natural respawn
  clears the field) and never unlocks what was lost; a boss victory with
  no death hands in an affordable blueprint (spending exactly the unlock
  cost on top of that run's own real earnings) and correctly refuses an
  unaffordable one without banking it for later; a co-op scenario proves
  BOTH D4 outcomes at the same commit — the player who died loses theirs,
  the survivor hands in and unlocks theirs — with real per-player event
  payloads, not aggregate counts; `hash()` coverage confirmed by direct
  divergence checks; determinism (L4) across a full scripted clear/boss/
  blueprint-drop/hand-in loop. One real bug in this suite's own first
  draft, caught by running it rather than reasoning about it: three tests
  assumed a player whose own death ends the run would also hand in their
  carried blueprint at that commit — running them showed the shipped code
  was already correct (the dying player's own natural respawn clears
  `carriedBlueprint` before `_commitPendingLevel()` ever runs, exactly D4's
  "lose on death"), so the tests were rewritten around a boss-victory
  transition instead. Since the dedicated adversarial pass over this
  file's own work (§5m): two Sims constructed from the same caller-
  supplied `Meta` object no longer share it or its `unlocked` object;
  `applyMeta()` itself is now exercised directly, previously zero
  coverage; two surviving co-op partners carrying the identical
  still-locked weapon correctly unlock it exactly once while
  `runEnd.handedIn` now reports both consumed carries, not just one — four
  real bugs the pass found, all fixed, full account in §5m. Since v0.2.17
  (D13, §5p): each of the four `spendOnX`/`buyX` enhancement pairs
  (Dash Extra Charge, Dash Extended I-Frames, Parry Riposte, Parry
  Reflect) proven through the identical two-layer shape `buyMaxHp` itself
  already established — refuses when unaffordable, guards against a
  double purchase, live-tops-up every currently-alive player additively
  without disturbing a freshly-reset player's own baseline, and each
  flips `hash()` — +74. 265 total.
- **verify_narrative (65, D11/D12, new suite v0.2.15)** — pure trigger logic
  against hand-built fake sim fixtures (L8 — a plain object shaped like
  `{run, players, exit, bossTarget, bus}` is exactly as valid an argument
  as a real `Sim` here, since `Narrative` only ever reads these fields).
  Every narrator pool and every real enemy id's own bark pool is
  non-empty; a fresh `Narrative` shows and triggers nothing spurious; inert
  until the run loop itself is; a real levelSeed change fires `levelStart`;
  the FIRST boss entry fires the reveal, not the ordinary line, and flips
  `revealed`; a SECOND boss entry fires the ordinary `bossEntry` line
  instead; a boss→level transition with `runsCompleted` advancing fires
  `bossVictory`; a death fires the death line; a same-tick fatal-boss-trade
  reads as death, never victory — the identical priority `_stepRun()`
  itself already uses; simultaneous multi-player deaths fire exactly one
  line, not one per player; a real `telegraph` fires a bark from the
  matching template's pool, tagged distinctly from a narrator line; an
  unknown template id never throws; same-seed picks reproduce identically
  (L4) while a different seed genuinely diverges; TTL counts down by real
  elapsed ms and expires to null, never lingering negative; `wrap()`
  proven against a real measured width (a dedicated fake ctx, not the
  shared stub's own always-zero `measureText`) to actually split a long
  line; `render()` draws nothing with nothing to show, something real once
  a line is set. Since the dedicated adversarial pass over this file's own
  work (§5n): a boss-phase death across the real multi-frame commit
  sequence no longer shows `bossVictory` (and a genuine no-death victory,
  and a clean second encounter after a suppressed first one, both still
  fire normally — proving the fix didn't overcorrect); a `Narrative`
  constructed already mid-boss still delivers the reveal on that
  encounter; a second `subscribe()` call never double-registers;
  sub-floor dimensions never produce a negative panel width or an
  off-canvas panel — five real bugs the pass found, all fixed, full
  account in §5n.
- **verify_audio (338, D11, new suite v0.2.16)** — pure logic against a
  hand-built fake `AudioContext` (L8), never a real one, never `window`.
  The SFX content table's own shape (10-data.js): every cue is a valid
  `tone`/`noise` with sane freq/dur/gain/delay/sweepTo/filterFreq bounds,
  and every one of the fifteen real triggers has a matching cue. Every
  real trigger fired end to end against a fake ctx proves the right node
  SHAPE (tone → osc+gain pairs, one per note; noise → buffer+bufferSource+
  filter+gain); every real Bus event OUTSIDE the curated trigger list
  (checked against the real `C.Bus.KNOWN`, never a hand-copied list)
  proven silent. Mute suppression at construction and live-toggled;
  `subscribe()` idempotency; `unlock()` across suspended/running/no-
  support states; graceful degradation with zero Web Audio support at
  all; ctx reuse across cues; RNG determinism/divergence for the noise
  buffer (L4), and — since the dedicated adversarial pass (§5o) — that
  the buffer is genuinely bipolar, not a broken one-sided signal a bare
  non-silence check would miss. A richer `instrumentedCtx()` fixture
  (recording the REAL numeric/string arguments passed to every
  `AudioParam` call, not just which node types got built) checks every
  real cue's actual gain/waveform/sweep-target/filter-cutoff math against
  the content table — added after the pass found three independent
  mutations (a hardcoded gain, a disabled pitch sweep, a flattened
  waveform) all sailed through the original 191 assertions undetected;
  re-confirmed by re-applying one of them (18 real failures). A dedicated
  regression proves a `ctx` that throws from node creation never escapes
  `play()` OR a real `bus.emit()` call — the exact path the pass's own
  most severe finding traced into `Sim.step()`'s crash-recovery path —
  mutation-tested (the fix's own `try`/`catch` removed in a scratch copy,
  all four of that regression's assertions failed exactly as expected,
  the real fix restored and reconfirmed byte-identical). Since v0.2.17
  (D13, §5p): the two new `dashStart`/`parry` cues proven against the
  content table's own shape and fired end to end against the fake ctx
  the identical way every pre-existing cue already is — +35. 338 total.
- **verify_platform (207)** — the settings sanitizer and the pause menu, both
  pure and both tested against the REAL functions (L8), never a
  reimplementation. Every shape a corrupted or hand-edited localStorage
  payload could take (wrong type, wrong version, punctuation in a key code, an
  unknown action, a two-pass keybind collision where an early action's
  INVALID request must not let its fallback default steal a key a LATER
  action validly asked for) is fed through `sanitize()` and must never throw
  and must always return something Pad can safely consume. The menu state
  machine — root → options → rebind → captured, cancel at every depth, Escape
  as the one key that can never be bound to itself — driven the same way a
  player drives it, through `handleKey`. Since v0.2.16 (D11, §5o): a real
  "Sound: On/Off" row and the `muted` field across defaults/sanitize/
  round-trip, including its independence from corrupted sibling fields in
  both directions (the same bug class this file's own `sanitize()` header
  already names as having bitten `keybinds` once); the Sound row's own
  cursor position checked against its actual label, not just what
  `confirm()` does there, closing a gap the adversarial pass found the
  fast Node suite was blind to (only the slower browser leg caught it);
  `move()`'s wrap-around driven on the real 12-row OPTIONS list, not only
  the 2-row root screen. Since v0.2.17 (D13, §5p): a new "Touch Parry
  Assist: On/Off" row and the `touchParryAssist` field across
  defaults/sanitize, the exact `muted` mirror; every hardcoded `confirm()`
  cursor offset at or after the insertion point re-derived and checked
  against the row it actually labels, not just what `confirm()` does
  there — the same class of footgun this file's own Sound-row precedent
  (§5o) already names — +34. 207 total.
- **verify_touch (93)** — `zoneAt` boundary correctness (including the
  degenerate-viewport case) and the `Stick` hysteresis (enter at 14px, exit
  at 8px, independent axes, a direct reversal flips cleanly without needing
  an intermediate frame back through the dead zone), then `TouchControls`
  itself driven directly via fake touch-event-shaped objects (L8 — no browser
  needed for logic this pure). Specifically pins the two properties the
  judged design panel (D10) caught as bugs in the WINNING proposal's own
  prose before this was built: ghost-promotion can never cross zones (a
  touch that started in the jump band, still held, must never become the
  stick owner when the real owner releases), and action zones are refcounted
  (a second finger resting in the same band must not release the button when
  only one of the two lifts). Also caught, for real, during this suite's own
  first draft: promoting a ghost via a bare `for...in` loop silently turns
  `stickOwner` into a STRING (`for...in` always yields string keys), and
  every subsequent `touchmove`'s strict `t.identifier === this.stickOwner`
  check — real touch identifiers are numbers — would then permanently fail,
  freezing movement the instant a promotion happened. The fix stores the
  identifier's own original type on each record rather than re-deriving it
  from a loop key; a dedicated regression test drives an actual `touchmove`
  through a promoted ghost and checks the pad responds, not just that the
  promotion field looks right.
- **verify_render (145)** — real headless Chromium over CDP with **zero npm
  dependencies** (Node's global WebSocket, Playwright's cached browser): the
  canvas is laid out and not 0×0, the spawn is a finite coordinate, the player
  is standing, the sim ticks in real time, keystrokes move the character, the
  jump key lifts it, a swing takes exactly the documented damage off a
  training dummy, the F4 hitbox overlay toggles, a composited frame is
  screenshotted via `Page.captureScreenshot` (L12) and proven live by
  differing from an earlier frame, and zero console errors across the whole
  run. Since v0.2.2 it also drives Escape/ArrowDown/Enter through the real
  pause menu and asserts the sim tick genuinely stops and resumes; sweeps five
  device-metric overrides (narrow, wide, below the 320×240 floor, square, and
  a forced 3x-DPR case clamped to 2x) asserting the logical size tracks the
  real viewport and the canvas's own `clientWidth` agrees — see §4a for the
  regression this specific pair of assertions exists to catch; and writes a
  real payload into `localStorage`, reloads, and confirms it survived,
  including a deliberately corrupted payload that must not prevent boot.
  Since v0.2.3 it also verifies the manifest/icon/safe-area work (§5b) —
  fetches the manifest data: URI and confirms it parses as the right JSON,
  not just that a link tag exists — and, the strongest claim in the whole
  suite, drives REAL touch input via CDP `Input.dispatchTouchEvent` through
  the entire pipeline: a dispatched drag actually moves the character's `x`
  in the live sim, a dispatched tap in the jump band produces real negative
  `vy`, two simultaneous dispatched touches produce a real `heavy` attack,
  and a dispatched tap on the pause corner opens and closes the real menu —
  not TouchControls' internal bookkeeping inspected in isolation (that is
  what verify_touch is for), but the sim itself observably responding to
  synthesized fingers on glass. **Timing hardened across v0.2.10/v0.2.11**:
  SEVEN separate assertions (boot/frame-count, post-keydown attack read,
  swing-damage read, drag-release, keystroke displacement, jump height,
  touch-drag displacement) used a FIXED real-time sleep before reading a
  threshold on live sim state — under real load, wall-clock time does not
  reliably correspond to a fixed number of SIM TICKS, and repeated real
  re-runs (not a single pass) proved every one of them could fail. All seven
  replaced with a poll for the actual condition (`waitForCondition`) — see
  §5i and §5j for the two separate discovery passes (2 fixed in §5i, 5 more
  in §5j). **A separate, deeper cause found the same session (§5j):** the
  Chromium child process this suite spawns is a process TREE, and a plain
  `proc.kill()` on Windows does not cascade to its own GPU/renderer
  children — every real gate run left orphans behind, accumulating (37
  observed in one sitting) until a fresh launch failed outright with zero
  output, which is what first looked like more of the same timing flakiness
  before the real cause was traced. Fixed with a Windows tree-kill
  (`taskkill /T`, `tests/cdp.js`'s `killTree`); orphan count no longer grows
  across repeated runs. A residual, lower-frequency launch failure remains
  under artificially rapid back-to-back re-runs (the kind this project's own
  verification passes do, not normal usage) and is not further diagnosed —
  named honestly rather than claimed fixed. **Since v0.2.13:** the
  training-dummy assertion now looks the boot dummy up by its own fixed id
  (100, matching `H.scenario()`'s own `dummies` convention) rather than by
  array position — `sim.beginRun()` populates `targets` with the level's
  real roster BEFORE `boot()` adds the dummy, so it is no longer reliably
  `targets[0]`. +1 assertion ("the practice dummy (id 100) is among them").
  **Since v0.2.14 (§5m):** a new "meta persistence" section, the identical
  shape the existing Settings-persistence section already uses, driven
  through real F5/F6 key dispatch rather than a direct `sim.meta` poke —
  found by an adversarial pass that F5/F6 (currently the ONLY exposed way
  to spend meta currency or flip the lock toggle) never triggered a save
  at all, only the `runEnd` bus event did, so a real purchase or toggle
  silently reverted on an ordinary reload. +15 assertions; `cdp.js` gained
  F5/F6 key-code mappings to make the real dispatch possible.
  **Since v0.2.15 (§5n):** a new "narrative" section proving the real
  production wiring end to end — a real `telegraph` emitted on the real
  bus produces a real displayed bark line through a real `Narrative`
  instance, and the text box actually composites into a real captured
  frame. Emits directly on the bus rather than waiting for a real enemy's
  own AI to naturally telegraph — this suite proves narrative's own
  reaction and rendering, not enemy timing, which `verify_enemy` already
  covers separately. +4 assertions. **Since this file's own dedicated
  adversarial pass:** one more — `narrative.rng` proven seeded from the
  real boot seed, not the class's own hardcoded default, checked against
  the pristine just-constructed instance before anything could mutate the
  stream (the pass found this had silently been the SAME fixed value on
  every real boot ever launched). +1 assertion. **Since v0.2.16 (§5o):** a
  new "audio" section — a monkeypatched `AudioContext.prototype`, installed
  before the very first navigate so it is in place before `95-app.js`'s own
  auto-boot IIFE ever runs, proves a real `AudioContext` is constructed and
  a real oscillator node created through the actual production path, not
  just that `85-audio.js`'s own internal functions ran; the real Sound row
  driven through real keys reaches both the live `SFXPlayer.muted` AND the
  live settings object (the exact `app.settings` staleness this session's
  own new coverage here caught and fixed, before the adversarial pass ever
  ran); mute/unmute proven against real `bus.emit()` calls with a live
  node counter. +16 assertions. **Since the dedicated adversarial pass:**
  two more, closing a gap the pass found — `pointerdown`/`touchstart`
  (two of `audio.unlock()`'s own three real-gesture entry points) had zero
  coverage anywhere in the whole gate, only `keydown` did; `cdp.js` gained
  a real, trusted `Input.dispatchMouseEvent` wrapper (`mouseDown`/
  `mouseUp`, the same input pipeline `keyDown`/`touchEvent` already use) to
  make the `pointerdown` proof possible. +2 assertions. **Since v0.2.17
  (D13, §5p):** a real airborne roll-key press produces a real dash,
  proven through real keyDown/keyUp dispatch rather than a direct sim
  poke, plus finite-position and spark-color checks on the particles it
  produces; a real `parry` bus event arms and decays the real hood-glow
  timer. **Hardened by this release's own dedicated gate-stability pass,
  not just written once and trusted:** checking live `state === 'dash'`
  alone raced against the dash's own short (14-frame) duration plus CDP
  round-trip latency — fixed by also accepting the far more durable
  `dashCd > 0` signal; separately, the roll/dash input buffer's own real
  133ms window (§3) was found, under measured heavy machine load, to
  sometimes miss a genuinely late real keypress, exactly as it would for
  a real late player — fixed with a bounded real-retry (up to three
  attempts) around the whole jump-then-roll-press sequence, rather than
  loosening the buffer window itself. Full account in §5p findings 12-13.

---

## 4a. A bug the gate could not have caught, and what closed the gap

`build.py` concatenates source files as text; it never parsed the result.
During the platform-hardening pass, an edit closed a `/* */` comment one
sentence too early, and the trailing prose fell out of the comment and became
bare JavaScript. This is `Unexpected identifier 'button'` — a SyntaxError that
fails the ENTIRE assembled script, meaning the whole app failed to boot. Every
one of the 654 sim-side assertions across 7 suites stayed green throughout,
because none of them load the built HTML — they load individual `src/` files
directly into a sandbox. Only `verify_render`, which loads `cinder-loop.html`
itself in a real browser, could have caught it, and even there the first
symptom was an opaque `Cannot read properties of undefined` several calls
downstream of the actual defect.

Two things closed this permanently, not just for this instance:

1. **`build.py` now runs `node --check` against the fully assembled script**
   before it will write the file, and treats a missing `node` as fatal rather
   than silently skipping the check (`tests/run_all.sh` already hard-requires
   node for everything else; skipping here would just reopen the gap on
   whichever machine lacks it). A syntax error now fails the BUILD, at the
   point of the edit, not several tool calls later inside a browser.
2. **`verify_render` itself no longer dies silently.** A throw mid-suite used
   to print one bare error line and discard every assertion that had already
   passed before it. `s.done()` now always runs and reports partial results,
   with the throw itself recorded as one more failing line — the difference
   between "something broke, here is exactly how far it got" and "something
   broke, good luck."

---

## 5. Honest state

**Real and verified:** movement core, physics with sub-stepping, wall slide,
wall jump, and a slam that deals real damage on landing (§5g, §5j), input
with buffering and pending, world/tilemap, camera rig (shared pull-back, N
targets), renderer, particles, the hitbox bake with its overreach audit,
three-move combat with combo chaining and cancels now driving all FOUR
weapons D9 ever named, D2's stat scaling, and slam impact (§5g, §5h, §5i,
§5j, D7, D9, D2), the posed player figure, the four-template
enemy roster with the fairness/telegraph rule, PC platform hardening (§5a),
phone touch input and PWA/safe-area hardening (§5b), procedural tile
generation and its mandatory fairness audit (§5d, D3/D3a) — now feeding
real, collectible pickups rather than inert coordinates (§5h) — boot playing
a real generated level with a debug seed override (§5e), Kilnwarden — the
two-phase boss and its arena (§5f) — the build pipeline (now with a syntax
gate, §4a), the gate, and a browser-verified playable file at
`cinder-loop.html`. **Since v0.2.13:** the run loop itself — spawn → clear
→ boss → die → spend → respawn (D1, §5l) — real and driving `boot()`, not
just designed; Kilnwarden is now reachable from an actual played run, not
only from direct construction in a test, closing the gap §5f left open.
**Since v0.2.14:** meta progression (D4/D8, §5m) — currency persists
across a reload, blueprints drop from real kills and carry real
lose-on-death/hand-in-at-a-transition stakes, and a real +max HP purchase
permanently grows every future run's health pool. `RUN_SPEND_STUB_COST`,
the placeholder §5l's own currency stub used, is retired now that a real
price exists. **Since v0.2.15:** narrative (D11/D12, §5n) — the
Kilnkeeper's recurring narrator voice and per-template enemy barks are
real and rendering, driven entirely presenter-side with zero changes to
any SIM file; the villain reveal fires the first time a real boot-driven
run reaches the boss. **Since v0.2.16:** synthesized SFX (D11, §5o) —
fifteen cues, `tone` and `noise` synthesis off a real Web Audio engine,
real and playing in the live game through the same Bus trigger design
narrative already established; a real, player-facing mute toggle in
Settings/Menu, not a debug key. **Since v0.2.17:** Ember Dash and Parry
(D13, §5p) — two new character-level abilities, real and available from
the very first spawn; four flat-cost meta-currency enhancements, real
and live-topping-up every currently-alive player on purchase; real
gamepad and touch wiring for both, including a genuinely new touch
Assist mode; VFX/SFX reacting to all of it through the same Bus-trigger
design every prior presenter feature already established. **Since
v0.2.18:** rooms and checkpoints (D14, §5q) — a level is a real chain of
`CFG.ROOM_COUNT` combat rooms plus the boss room, each entered through a
new `Sim.prototype._enterRoom(i)`; a checkpoint fires the instant a
room's roster clears, independent of reaching the exit, and really heals
(`_healAtCheckpoint`) and hands in carried blueprints
(`_handInCarriedBlueprints`, now shared with true run-end) on the spot; a
critical alcove-reachability bug that could make an audited-fair room's
own exit physically unreachable was found and fixed in two rounds,
verified across 150 seeds. **Since v0.2.19:** weapon equip and switch
(D15, §5r) — `player.weapon` is finally live: `Sim.prototype.switchWeapon`
is the real, validated primitive and `Sim.prototype.cycleWeapon` is the
real input-facing wrapper a permanent gamepad-button-4/`KeyI` binding
actually drives from a new phase 0 in `Sim.prototype.step`;
`meta.lastWeapon` persists the starting-loadout choice, captured the
instant player 0 switches.

**Designed, not built:** two of D8's four named meta-currency purchases —
flask charges and a backpack slot — real, open design space with no
existing engine surface to build on, named and deliberately deferred
rather than folded in quietly (§5m). Also not built: curses, grafts, and
the split/merge camera. A Galaxy Watch6 Classic
companion status view (§5b) — not gameplay on the watch, a data view
only, per the 2026-07-26 scoping decision. **Since v0.2.17 (D13, §5p):**
a shop/hub UI for the four Dash/Parry enhancements — F7-F10 debug keys
are the only way to trigger a purchase today, the identical "real,
tested, reachable, but nothing yet gives the player a way to trigger it
outside a debug key" shape D4/D8's own +max HP purchase already has; a
true continuous ember trail across the whole dash (a single burst at the
start stands in — every particle effect in this codebase fires off one
discrete Bus event, never a live per-render-frame emission, and that
pattern does not exist yet); a third ability beyond Dash and Parry (a
ranged/utility option and a locked-shortcut interact were both pitched
during D13's own brainstorm and explicitly not chosen). **Since v0.2.18
(D14, §5q):** the cinders economy itself — `player.carriedCinders`, a
drop-on-kill roll, and a bank-at-tube interaction — `CFG.CINDER_DROP_CHANCE`/`CINDER_CONVERSION_RATE` and the `cinderDrop`/`cinderLost`/
`cinderBanked` Bus events are reserved but nothing yet emits them; the
tube's own physical anchor point is real and reachability-audited, the
interaction it exists to trigger is not. Also not built: the checkpoint's
own narrative beat and SFX cue (spec §7c's other half — a new
`DIALOGUE.narrator.checkpoint` pool and SFX table entry, wired the same
way `levelStart`/`bossEntry` already are) and the save-and-quit resume
point (spec §7b — a room-scoped persistence key `boot()` would restore
into on reload); branching rooms (spec §11, explicitly deferred); a
distinct hand-authored checkpoint room type (spec §5 described one — what
shipped instead stamps the checkpoint alcove directly onto each combat
room's own procedurally-generated exit platform, folding it into an
existing room rather than introducing a fifth room type). **Since v0.2.19
(D15, §5r):** no HUD indicator of the currently-equipped weapon
(`80-view.js`); no touch-input wiring for `switchWeapon` (L13 defers
this — desktop + gamepad first); no per-player independent "last weapon"
memory (`meta.lastWeapon` is single and player-0-sourced, a named
judgment, not an oversight); weapon-specific or weapon-flavored ability
variants (blocked on weapon equip/switch existing at all — D15 clears
that block, but the variants themselves are not built).

**Scaffolding that must be deleted, not built on:** `demoLevel()` in
`95-app.js` is retired from the primary boot path as of v0.2.6 (§5e) — boot
now plays a real `Gen.generate()` level — but the function itself is NOT
deleted: it is what boot() falls back to, loudly, if generation ever
genuinely fails. `Sim.fallbackWorld()` is a sealed room for
tests. The training dummies in `40-combat.js` are target practice, not
enemies — they have no brain and never will; real enemies (`45-enemy.js`,
now built) satisfy the same shape (`body`, `alive`, `invulnerable`, `hurt`,
`update`, `resetTransient`) and `Dummy` stays as a debug-room prop.

**Known gap:** the moves themselves (now fourteen player, one enemy) still
live as pose tables in `35-rig.js`, not `10-data.js` — `WEAPONS` (v0.2.8,
now 4 rows as of v0.2.10) only ever points at a move ID by name, it does not
contain the pose data. They belong in `10-data.js` alongside the enemy
roster and weapons (D7) so that adding a new swing means adding a row
rather than editing the rig.

---

## 5a. PC platform hardening (v0.2.2)

**Pause is presenter-owned; the sim does not know it exists.** Escape or
gamepad Start stops `sim.step()` from being called at all — the accumulator
simply is not fed while paused, so it resumes exactly where it left off with
no burst of catch-up steps no matter how long the menu was open (L3: nothing
here scales a tick, and nothing here owes one either). `view.render()` still
runs every frame so the frozen game is visible under the dim menu overlay.

**Rebinding is live, not a form.** `Settings.actionForCode(settings, code)`
replaced the static `KEYMAP` table entirely; a rebind takes effect on the very
next keypress with nothing to rebuild. The sanitizer resolves a keybind
collision in **two passes** — every action's valid explicit request is
claimed first, defaults are filled in only afterward — specifically so an
earlier action's fallback default cannot steal a key a later action explicitly
and validly asked for. The first version combined both passes into one loop
and got this backwards; `verify_platform` pins the corrected two-pass
behaviour directly.

**Settings persist to `localStorage` under `cinderloop.settings.v1`,** with
the only two lines in the project allowed to throw on storage access
(`95-app.js`'s `loadSettings`/`saveSettings`) wrapped in try/catch — a
private-browsing tab or a disabled-storage policy degrades to "play, but
don't remember," never a crash. Everything else in `90-settings.js` is pure
and cannot throw.

**Reduced motion is a density/intensity dial, not an on/off switch.**
Particle bursts thin to ~35% (also a free win for the phone/watch targets'
weaker GPUs); camera shake damps to 15%, not zero — screen shake is the
classic vestibular-disorder trigger and gets the harder cut, while a near-
silent kick still confirms a hit landed without the motion.

**DPR-aware resize, and the regression it produced:** `canvas.width/height`
now scale by `min(devicePixelRatio, 2)` for a crisp backing store, capped at
2x deliberately (phone/watch GPUs are weaker, and this style does not need a
3x buffer to read clean). A first version ALSO pinned `canvas.style.width/
height` to a fixed pixel value, reasoning that something needed to hold the
CSS box size steady. Nothing did — the stylesheet's `#game{width:100%;
height:100%}` rule already fully owns on-screen layout independent of the
canvas's width/height attributes, which is standard canvas HiDPI behaviour.
The pin actively broke it: an inline pixel style outranks a percentage rule,
so after the first resize call the canvas's own `clientWidth` stopped
reflecting its container and started only echoing back whatever had last been
written — silently freezing the game at its boot-time size for the rest of
the session, in production, not just under test. Caught by a resize-hardening
assertion that measured `clientWidth` before and after a real viewport
change and found it had not moved (§4a has the fuller account, since the same
edit also introduced a build-breaking syntax error). The fix removed the pin
entirely; `View.resize()` now only ever writes the backing-store attributes.

---

## 5b. Phone: touch input, PWA, safe-area (v0.2.3, D10)

**The touch scheme was chosen by a judged design panel**, not decided inline.
Three independently designed schemes (virtual d-pad + buttons, swipe/gesture,
a floating-stick hybrid) were each scored by two independent judges against
five criteria grounded in this game's actual measured mechanics — both judges
verified every citation against the live source rather than taking the
proposals' word for it, and caught two false integration claims in the
winning proposal before it was built (see D10, and `verify_touch`'s own
description in §4). **Gesture Surface** won outright on the two criteria the
brief treats as hardest: screen real estate (no fixed button art ever occupies
play-area pixels the camera has already reserved margin around) and the
down+attack heavy-combo case, which needs no combined-gesture recognition at
all — `Combat.begin` already reads `pad.down('down')` at the exact moment it
consumes the buffered attack press, so two independently tracked touch
identifiers overlapping in time is sufficient.

**Split like `90-settings.js`/`92-menu.js`: a pure core plus a thin DOM
shell.** `TouchControls.zoneAt(x, y, cssW, cssH)` and `TouchControls.Stick`
(the per-axis hysteresis state machine — 14px to enter a direction, 8px to
release it, independently on each axis, which is what lets a down+left
diagonal fall out for free exactly like two held keys) are pure functions a
bare Node sandbox can test directly. The `TouchControls` class itself is
DOM-facing but nothing at module-evaluation time touches `window`/`document`,
so `verify_touch` drives its real internals with a fake canvas and
hand-built touch-event-shaped objects — no browser needed for logic this
pure (L8) — while `verify_render` separately proves the same code responds
correctly to REAL dispatched touch events in a REAL browser.

**A real bug, caught by testing an actual consequence rather than an internal
flag.** Promoting a "ghost" (a second finger already resting in the movement
zone) to stick ownership on the owner's release iterated `for...in` over a
plain object and used that loop's own key as the new `stickOwner`. `for...in`
always yields STRING keys regardless of the original property type, so
`stickOwner` silently became `"2"` where a real `Touch.identifier` is always
the number `2`. Every subsequent `touchmove`'s strict `t.identifier ===
this.stickOwner` check — `2 === "2"` — would then permanently fail,
freezing movement the instant a promotion happened. The assertion that only
checked "did stickOwner get promoted" passed; only a second assertion that
then dispatched an actual `touchmove` through the promoted ghost and checked
the pad still responded caught it. Fixed by storing each touch's identifier,
typed exactly as the browser gave it, on the record itself rather than
re-deriving it from a loop key.

**Two claims cross-checked, not assumed.** The panel's winning proposal
described touch-capability detection as a boot-time `'ontouchstart' in
window` snapshot — a known false-positive trap (measured directly during PC
hardening, §5a's cousin finding: a plain headless launch with zero touch
emulation active reported touch support through it). Both judges caught the
mismatch against what was already on disk: `95-app.js` already used a live
`matchMedia('(pointer: coarse)')` re-check, fixed independently before the
panel's synthesis was read. The panel's own correction and the code already
agreed, which is the outcome cross-verification is supposed to produce, not
a coincidence to be suspicious of.

**PWA installability, honestly scoped within the single-file constraint
(L2).** A Web App Manifest and an on-brand SVG app icon (the in-game
hood/ember head, enlarged — one visual language, not two) are embedded as
`data:` URIs in `build.py`'s generated `<head>`, not a second file. This
reaches real installability on Android Chrome via the browser's manual "Add
to Home Screen" menu item; the AUTOMATIC `beforeinstallprompt` banner some
browsers show additionally wants a same-origin service worker with a fetch
handler, and a service worker cannot be registered from a `data:` URL at all
per spec — that automatic prompt is out of reach inside one static file and
is not claimed here. `apple-touch-icon` as SVG is similarly best-effort:
some iOS versions prefer a PNG and fall back to a page-screenshot icon
instead, and there is no image-rasterization step in this project to solve
that with (no Pillow, no image pipeline — adding one would be a new
dependency for a single icon). Both gaps are documented in `build.py` at the
point they occur, not silently absorbed into a "fully installable" claim.

**Safe-area handling activates a meta tag that was already sitting unused.**
`viewport-fit=cover` has been in the `<head>` since before this session
started, which is the ONLY thing that makes `env(safe-area-inset-*)` resolve
to anything but `0` per spec — it was prepared for and simply not used yet.
CSS custom properties (`--safe-top` etc.) expose the same values to JS via
`getComputedStyle`, since a notch cannot be kept clear of CANVAS-drawn touch
chrome through CSS alone.

**The rotate hint is a nudge, not a lock.** A real orientation lock needs the
Fullscreen + Screen Orientation APIs, both gated behind a user gesture this
page never forces — a game that only agrees to play after an extra
unexplained tap is worse than one that asks nicely. `@media (pointer: coarse)
and (orientation: portrait)` shows a dismissable-by-rotating overlay; the
manifest separately sets `orientation: "landscape"` as a soft preference for
an INSTALLED (standalone-launched) instance only, which is a real capability
in supporting browsers but does nothing for a plain browser tab — which is
why both exist rather than either alone.

---

## 5c. Watch: a static mockup, explicitly not a companion (v0.2.4)

**`CINDER_LOOP_WATCH_MOCKUP.html`, a standalone file at the project root, not
part of `cinder-loop.html` and not built by `build.py`.** Before it was
built, three genuinely different interpretations of "watch companion" were
identified and put to a direct choice rather than defaulted silently: a
static mockup, a real live view over a new local network bridge (a
deliberate carve-out from L2 for one optional feature), or a real native
Wear OS app in Kotlin using Android's Data Layer API — architecturally a
wholesale separate project, different language and toolchain, not an
extension of this one. **The static mockup was chosen.**

**Why a live companion is not a small feature on top of what exists.** The
Galaxy Watch6 Classic runs Wear OS, which has no standard path to sideload
and pin an arbitrary HTML page the way a phone browser has "Add to Home
Screen." More fundamentally, the game is single-file, zero-network, no
server, by design (L2) — nothing it does can currently tell a *separate
physical device* anything in real time. A live watch view needs a bridge
that does not exist in any form yet, regardless of which of the three
options above would build it.

**Every value on the face is a fixed sample, deliberately.** Hearts (2 of 3
— a mid-run state reads better as a design sample than trivial full health),
the run timer's 04:12 starting point, the biome name, the room count — none
of it is read from anywhere; there is nothing to read FROM. The one
genuinely live thing on the page is the timer's own tick, which is real
elapsed time since the preview loaded, not simulated gameplay, and is
labelled as exactly that in the page's own caption. Sized to the Watch6
Classic's actual native resolution (480×480, round 1.5" AMOLED, not a
guess) and composed so nothing meaningful sits where a round display's
clipping would cut it — content stays inside a 436px inner circle inscribed
within the 480px face.

**What was actually verified, and what was not — stated as plainly as the
frame-meter caveat in §5 (below).** Confirmed in real headless Chromium at
exactly 480×480: zero console errors, the face and inner circle measure
480×480 and 436×436 respectively, three hearts render with two full, the
timer starts at `04:12` and is observed to advance to `04:13` after slightly
over one second of real wall-clock time. **Not verified: anything about how
this looks or behaves on physical Wear OS hardware** — no device was
available to this session, and (per the paragraph above) there is no
standard way to even get this file onto one. That is not a gap this session
could close from here, so it is stated rather than implied to be fine.

The static-vs-live decision, and the sample-vs-real distinction throughout
this section, exist because of rule 6 below — a watch companion that looked
plausible but quietly implied more than it verified would be exactly the
failure mode that rule exists to prevent.

---

## 5d. Procedural generation and the fairness audit (v0.2.5, D3/D3a)

**`50-gen.js`, split like `90-settings.js`/`92-menu.js` and `94-touch.js`: a
pure capability model and audit, plus an RNG-driven generator and a
World-stamping step.** `Gen.generate(seed)` owns one seeded RNG instance
across an entire reject/regenerate loop (L4 — determinism holds even across
retries), builds a candidate layout, audits it, and either stamps a real
`World` (plus spawn/exit/pickup points, the exact shape `70-sim.js` already
consumes from a hand-built level) or discards it and tries again — up to
`GEN_MAX_ATTEMPTS`, throwing loudly rather than ever handing back something
its own audit would reject.

**The audit is the point, not a formality.** `audit()` runs a real BFS
(`buildGraph`/`reachableFrom`) over a DIRECTED reachability graph — platformer
traversal is genuinely asymmetric, dropping is free and climbing is
capability-bounded, and a graph that doesn't respect that direction silently
over-claims reachability — built from a pure capability model
(`maxGapForRise`/`minGapForRise`/`gapBetween`/`edgeAllowed`), checks the exit
and every pickup are reachable from spawn, and checks every non-spur platform
meets `GEN_MIN_FIGHT_TILES`. `GEN_RISK_CHANCE`, tuned to 0.02 by sweeping
several values against 60 seeds each, deliberately injects unfair placements
often enough that the audit has real work: measured over 60 seeds, the
aggregate rejection rate is 21.1%, with both some seeds needing zero
regeneration and some needing real regeneration confirmed directly rather
than assumed.

**The capability numbers are measurements, with the methodology carried over
from `verify_move` (L8):** hold jump through the natural apex, never a
one-tick tap, because a tap silently triggers `JUMP_CUT` (this game's own
short-hop mechanic) and measures a cut arc instead of the true maximum. Full
table in §3.

**The physics cross-check is what actually proves the graph model isn't
lying to itself.** Rather than a second graph implementation grading the
first (L8), `verify_gen` has a REAL player, through REAL sim ticks, attempt
every edge the audit calls legal, in an isolated two-platform world built
from nothing but that pair's own coordinates — a pairwise check against a
pairwise claim, the correct apples-to-apples comparison. It is not a rubber
stamp: it found a real bug. A double-jump climb at rise 5 (the top of
`GEN_MAX_RISE_TILES`) needed a gap of 2 tiles to clear reliably, not the gap
of 1 the existing floor allowed — the audit was silently calling a real,
unreachable climb "legal" until a clean gap sweep at rise 3/4/5 measured the
true minimum and `GEN_DBLJUMP_HIGH_MIN_GAP_TILES` closed it. Two further real
generator bugs surfaced during the same effort: `edgeAllowed` originally
treated climbing and dropping as symmetric (an OR across both directions),
so a valid drop could license an invalid climb the other way across the same
pair; and the original missing double-jump floor at rise 3-4, for the same
underside-collision reason. All three are described fully in §3. Current
state: **174/174 real generated edges confirmed physically achievable**, 6
zero-gap edges correctly out of scope.

**What this section covers, and what it does not.** `50-gen.js` has no idea
`60-run.js`'s eventual biome structure exists, and enemy placement is
deliberately NOT here — that remains `60-run.js`'s job once it exists, not a
level-geometry concern. Wiring `Gen.generate()` into `boot()` as the actual
primary path — including a temporary, app-side stand-in for enemy
placement — was treated as a separate step and landed one session later; see
§5e for that work and how it was verified.

---

## 5e. Boot plays a real generated level (v0.2.6)

**`95-app.js`'s `boot()` now calls `Gen.generate(seed)` as its primary
path.** `demoLevel()` is not deleted — it is the fallback `generatedLevel()`
reaches for if generation ever genuinely fails, loudly (`console.warn`
naming the real thrown error), not the default. The seed is a fresh
`Date.now()` per boot (not `Math.random()` — `95-app.js` is scanned by
`verify_arch` for the same reason `80-view.js` is, and `Math.random`
specifically is what's banned there), overridable via `?seed=12345` for
reproducing a specific run, matching this file's existing debug-toggle
conventions (F2/F3/F4).

**Enemy placement, until `60-run.js` exists.** `50-gen.js`'s own header
disclaims enemy placement as out of scope. Shipping a generated level with
real geometry and zero threats would be a real regression from what already
existed. A new `placeGeneratedEnemies()` lives in `95-app.js`, not
`50-gen.js` — preserving that file's stated boundary — walking the generated
beat sequence and assigning up to one roster template per chosen platform
(skipping the spawn platform and every spur), spaced so each is met alone
before any are met together, the same placement philosophy the hand-built
demo level always used. Generated `pickups` and `exit` remain inert
coordinates for now — no visual, no interaction — since neither a
pickup-collection system (D2) nor `60-run.js` exists yet to consume them.

**Verified against the real thing.** `bash tests/run_all.sh` stays GREEN
885/885 with zero suite changes — `verify_render`'s existing assertions now
exercise a real generated level and needed no edits. Beyond the gate, a real
CDP session driving the actual built file directly (mirroring
`verify_render`'s own approach) confirmed: two fresh loads produce genuinely
different levels; the same `?seed=` reproduces an identical level twice in
every field checked; forcing the exact impossible configuration
`verify_gen`'s own hard-ceiling test uses (temporarily, then reverted)
engages the fallback net exactly as designed; and the debug co-op join
(`sim.addPlayer()`, what the F2 key drives) lands player two grounded on the
same platform as player one across five different seeds.

---

## 5f. Kilnwarden — the two-phase boss and its arena (v0.2.7)

**`55-boss.js`.** The masterfile's entire prior spec for this file was
"two-phase boss + arena" — nothing else was decided, the same genuine
open design space D10 (touch input) faced. Resolved the same way: a judged
design panel, three independently-designed concepts scored by two
independent judges who checked every load-bearing claim against the live
source rather than trusting the proposals' own prose.

**The panel found real bugs, not just style differences.** A melee/charge
"Pyrewarden" concept and a walk→fly "Ashwing" hybrid both silently relied on
a template-level `reach` field their own data schemas never declared —
`doChase`'s real gate (`abs(dx) > t.reach`) evaluates `t.reach` as
`undefined`, and `undefined` comparisons are always `false` in JS. For
Pyrewarden this meant the boss would never actually approach a player; for
Ashwing's phase-2 flight the SAME gate runs inverted (`abs(dx) < t.reach`),
which **fails closed** — the harder phase could never attack at all.
Ashwing's plan additionally inserted itself as a fifth row into
`DATA.ENEMIES`, which breaks `verify_enemy.js`'s hard-pinned four-template
roster assertion (D9) — directly contradicting its own "byte-for-byte
no-op" framing. Kilnwarden — rooted, ranged, zone-control — was structurally
immune to the first bug (a stationary caster's "always eligible" behavior
is correct, not accidental) and never needed the second. It won outright on
both judges' scorecards (41/50 and 42/50, leading 4-5 of 5 axes).

**What actually shipped, resolving one real gap even the winning design
left open.** Both judges separately flagged that Kilnwarden's own document
never specified how its move-picker gets distance data, given the real
`Enemy.commit()` takes zero arguments. Verified directly against
`45-enemy.js` before writing any code: `acquire()`'s `this.dist` exists,
but it is a DIFFERENT, vertically-weighted metric meant for choosing WHICH
player to target, not for gating one already-chosen attack's range — using
it would have misjudged eligibility for a player standing on the arena's
own raised platforms. The shipped version threads `target` through
`doChase()` → `commit(target)` → `pickMove(target)`, computing a fresh
horizontal `dx` at the moment of commitment, mirroring `doChase`'s own
existing convention exactly. Kilnwarden's `reach` is also set explicitly
and generously (matching its `sight`) rather than left undefined — the
"always eligible, cooldown permitting" behavior is a stated design choice
here, not an accident of a missing field.

**The engine generalization is additive, not a rewrite, and provably a
no-op for the existing roster** — the same discipline `50-gen.js`'s own
integration held to. `Enemy`'s constructor now accepts a template OBJECT
directly (Kilnwarden is deliberately kept OUT of `DATA.ENEMIES`/
`ENEMY_IDS`, resolving the exact bug that broke Ashwing) as well as the
existing string lookup. An optional `activeMove` (set by `commit()` when a
template declares `t.moves`) and an optional `phase` counter are read
through a `(this.activeMove || t).field` fallback everywhere a template
field used to be read directly — for Ashwalker/Emberrush/Kilnspitter/
Wickmoth, `activeMove` never leaves `null`, so every read resolves exactly
as before. Confirmed empirically, not just by inspection: `verify_enemy`
(85/85), `verify_arch` (177/177), and `verify_platform` (137/137) all pass
unmodified after the change. Two new states, `zone` (Kiln Floor: no direct
hitbox, mutates the arena's own tiles to `HAZARD` on a timer, read by the
existing generic hazard-collision path — 30-player.js — same as every
other hazard tile in the game) and `phaseTransition` (a fixed, non-dangerous
beat, gated to fire only from `doRecover`, the one seam in the whole state
machine where nothing dangerous is ever in flight, so an hp threshold
crossed mid-attack can never retroactively revise a commitment already
made). **Deliberately zero new Bus events and zero edits to `00-core.js`**
(owned by the Core team alone) — both the zone hazard and the phase
transition are fully observable by reading `World`/`Enemy` state directly,
the same "state IS the signal" pattern `80-view.js`'s existing telegraph
flash already uses. An early draft added two new Bus events for exactly
this purpose before this was caught and reverted — it would have
reintroduced the precise undisclosed-integration-cost class of gap the
panel had just marked against the two losing concepts.

**A real bug, found once already in this project's history, found again in
almost the same shape.** Building `C.Boss.spawn`/`playerSpawn`'s pixel
coordinates first used `TILE` (`= C.TILE`, the tile-**kind** enum object)
where `CFG.TILE` (the tile **size** in px) was needed — `16 * {object}` is
`NaN`, and both the boss and the player spawned at `NaN, NaN`. This is the
exact mistake `95-app.js`'s own `boot()` carries a comment scar about from
v0.1.0's worst bug. Caught immediately by a direct smoke test (constructing
a real `Sim` and reading real body coordinates) before any formal suite was
written — `55-boss.js` now uses a deliberately unambiguous local `PX =
CFG.TILE` for all pixel math, so the same keystroke mistake can't recur
silently here.

**Verified against real sim ticks, not read as correct (L8).** `verify_boss`
(69/69, full details in §4) drives the real `Enemy`/`Sim` classes exactly
the way `verify_enemy.js` already does for the regular roster — nothing
here re-implements the state machine, the move picker, or the hazard-damage
path. One genuine interaction with PRE-EXISTING behavior was found and
correctly attributed while writing the suite, not treated as a boss bug: a
Kilnwarden shot already in flight can connect with the player during the
phase-transition window (shots are independent entities, not paused by the
boss's own state), and `Player.hurt()`'s existing 8-tick impact hitstop
freezes the whole sim — boss `stateFrames` included, since `Sim.step`'s
frozen branch returns before any entity updates at all. The suite's first
draft counted those frozen ticks as transition progress and failed; fixed
by measuring only non-frozen ticks, which is the more robust test
regardless of whether this exact coincidence recurs at another seed.

**What was deliberately NOT done here.** The boss health bar and
phase-transition screen cue (graft recommendation from the panel's own
`80-view.js` sketch) were scoped as optional polish and are not built —
Kilnwarden already renders for free via the existing generic tinted-rect
enemy path, so this is cosmetic, not a correctness gap. `60-run.js` does
not exist, so there is currently no real way to reach Kilnwarden from an
actual playthrough — every assertion above constructs it directly, the
same way `verify_enemy.js` has always tested the regular roster in
isolation from `95-app.js`'s boot flow.

---

## 5g. Deeper movement and combat: wall interaction, and the second weapon (v0.2.8)

Not a new locked decision — both pieces build out scope already established
(the movement core generally, and D7's "content is data" for weapons
specifically) rather than opening new design space the way D10 or D3/D3a
did. No judged panel; both landed the same way `50-gen.js` did — designed,
measured, implemented, tested, in one continuous pass.

**Wall interaction.** `onWall` was already computed every tick by
`25-body.js` (Emberrush's own charge already reads it) — this is the first
PLAYER mechanic to act on it. Wall slide clamps fall speed to
`WALL_SLIDE_MAX` (measured exactly 2.2 px/frame, a real and large reduction
from the 9.0 px/frame terminal fall) while held INTO a wall you are
touching — confirmed both ways: it engages when pressing in, and does not
when merely brushing past one while airborne. Wall jump reuses `JUMP_VEL`
directly rather than inventing a second vertical number (its apex measures
identically to a normal jump's, 48.6px), pushes away with a dampened
(`ATTACK_DRIFT`-shaped, not eliminated) control window so continuing to
hold into the wall cannot instantly cancel it, and takes priority over the
double jump in the input-trigger chain — proven the strong way, by spending
the double jump in open air first and confirming a wall jump still fires
with zero air jumps left, rather than merely asserting it never needs one.
Both sliding and jumping off a wall refresh the air jump, the same
generosity landing already gets.

Closing a new state (`wallSlide`) surfaced a real, if small, gap
immediately: `verify_rig`'s own "every state the player enters has a
stance" assertion caught that no pose existed for it, the moment the state
existed to be entered. A real pose was authored (braced legs, arms out for
balance, the same arm-angle family `jump` already uses) rather than
deferred — unlike the boss's cosmetic health bar, a reachable player state
with no visual representation is a correctness gap, not polish.

**The second weapon.** Combat's move IDs were hardcoded (`'slashA'`,
`'heavy'`) directly in `Combat.begin` before this. A new `WEAPONS` table in
`10-data.js` — each entry just two move IDs, `light` and `heavy`, nothing
else, matching D7's own promise that a weapon owns no numbers, the move it
points at already does — lets `player.weapon` (fixed at `'blade'` for now)
decide which two moves `Combat.begin` starts a swing from. Chaining onward
(`slashA → slashB`, or the new `daggerA → daggerB → daggerC`) is still
decided entirely by the RIG move's own `chain` field, unaware a second
weapon exists at all.

Twin Daggers proves the pattern is genuinely reusable, not a refactor with
one instance dressed up as a system: its own `geom` uses a 6px blade
against the default weapon's 11px — same shoulder, same arm, a shorter
weapon — and a real, different feel (faster, three hits instead of two,
lower damage per hit) falls out of that plus new frame timing alone. Baked
and audited through the exact same generic pipeline (checked directly
against `Rig.audit()` — zero violations — before any of it was written into
the shipped table).

**A real test-design bug, corrected rather than worked around.** The first
draft of the dagger-chain test used `swing()`, the helper this suite's own
blade tests use to prove a fresh press RESTARTS the combo — its long gap
between presses is built specifically to let the chain window close. Using
it to try to prove chaining WORKS produced exactly the wrong answer
(`daggerA,daggerA,daggerA,daggerA`, never chaining) — not a bug in the new
weapon, a wrong tool for the claim being tested. Fixed by using the
early-buffered-press technique the blade's own combo test already uses for
its one chain link, carried one hit further for the dagger's three.

**A hash-coverage gap closed, for both the new fields here and a debt left
over from the boss.** Neither `player.weapon`/`wallJumpLock` nor the boss's
own `phase`/`activeMove` (§5f — flagged by the judged panel as a real gap,
documented at the time but not actually fixed) were in `Sim.prototype.hash()`.
Both closed together here, rather than leaving the boss's own known gap to
linger once the determinism test for THIS feature needed the same kind of
coverage anyway.

**What was deliberately not done here.** Weapon equipping/switching has no
player-facing path — `player.weapon` is a fixed default, changed only by
tests directly. D2's own stat/colour contract landed one session later
(§5h) and made this section's original framing here stale — corrected
rather than left to mislead: `colours`/`scale` fields were added to
`WEAPONS` and a real consumer exists now (`Combat.weaponScale`). What
remains genuinely unbuilt is narrower than this section first stated:
equipping a DIFFERENT weapon mid-run, which depends on D4's pickup/
blueprint system, not D2's stat pickups (a separate mechanic — §5h).

---

## 5h. The stat contract, real pickups, and weapon scaling (v0.2.9, D2)

Also not a new locked decision — D2 was already written into §1 at this
project's very start; this is the first session that actually builds it.
No judged panel, same reason §5g needed none: the contract itself was
already fully specified, the open questions were implementation ones.

**The contract, read precisely rather than assumed.** "+HP" is not a new
invented meaning — D8 already names "+max HP" as exactly what meta
currency buys permanently ("flask charges, +max HP, backpack slot,
starting-loadout choice"); this is read as the within-run version of the
same concept, not a plain heal, and stated as that reading rather than left
ambiguous. "Dominant" is read as STRICTLY the sole highest stat, not
highest-or-tied — proven directly: catching up to exactly tie the leader
grants no HP, only overtaking it does. This makes the very first pickup of
any run unconditionally dominant (1,1,1 → 2,1,1 has nothing to tie), which
is correct rather than a loophole: the anti-death-spiral property this
whole contract exists for only has work to do once stats have actually
diverged from each other.

**One real, named simplification.** "Dual choices weighted toward the two
lowest stats" implies a player physically choosing between two options.
`50-gen.js`'s pickups are single points, not spatial pairs — building true
paired choice would mean changing an already-shipped, fairness-audited
generator, a real and separate piece of scope not taken on here. The
weighting is instead applied as a soft preference at the moment of
collection (`pickStatColour`, 30-player.js): the current sole leader is
weighted down, not excluded — confirmed over 3000 real seeded draws that
the leader is still picked sometimes, just measurably less than either
trailing stat, and that a genuine three-way tie stays roughly uniform.
Decided lazily, at collection — reactive to whatever the run's stats
actually are by the time a player reaches each pickup, not a snapshot from
when the level was generated.

**Weapon scaling, wired for real.** `WEAPONS` (10-data.js) now names two
`colours` per weapon; `Combat.weaponScale` reads the LARGER of the two
(never their sum, never an unrelated third colour — both proven directly,
not just the "larger" case) and multiplies the move's own baked damage by
`1 + (statValue − 1) × CFG.STAT_SCALE_PER_POINT`, rounded before it ever
reaches an hp total — every damage number this game has ever shown is a
clean integer, and a scaled one stays that way. A weapon with no
registered `colours` (or no weapon at all) falls back to the highest of
all three stats, the fallback D2 names explicitly, also proven directly
with an unregistered weapon id.

**A real bug, caught by writing the RIGHT assertion, not by luck.** The
first draft of the pickup-collision tests never actually gave the player
any movement input — the pickup was placed just past the player's own
spawn-position bounding box (edge-touching, not overlapping; `aabb` needs
real overlap), and with nobody walking anywhere, nothing was ever
collected. Two of the three pickup tests (double-collection,
`resetTransient`) were passing anyway — for the wrong reason: if a pickup
is never collected in the first place, "collecting it again grants
nothing" and "it isn't collected after a reset" are both trivially,
vacuously true. Exactly the "a check quietly becomes a no-op" failure mode
`35-rig.js`'s own audit exists to guard against, just here in the harness
rather than the bake. Fixed by driving real movement input AND adding an
explicit "collection actually happened" assertion before each of the two
negative claims — proving the positive case first, not assuming it.

**Verified against real sim ticks, not read as correct (L8).** `verify_stats`
(41/41): stat gains and dominance, including the tie/no-HP case above;
`pickStatColour`'s weighting proven statistically; `Combat.weaponScale`'s
pure formula AND its live integration through unmodified
`Combat.resolveBox`; real pickup construction, collision, one-time
collection, `resetTransient()` restoring an uncollected world, and
determinism through a full pickup-collecting run — closing hash coverage
for `player.maxHp`/`player.stats.*`/every pickup's `collected` flag in the
same edit, the same discipline v0.2.8 already applied to the boss's own
`phase`/`activeMove` gap.

**What was deliberately not done here.** No spatial dual-choice UI — see
the simplification above. Weapon equipping/switching still has no
player-facing path (D4, not this). `65-meta.js`'s permanent, cross-run
progression is untouched — D2's stats are explicitly WITHIN one run,
reset by `resetTransient()` (an interim reading of "a run boundary" until
`60-run.js` defines one more precisely, stated as an interim reading in
30-player.js's own comment rather than asserted as final). The HUD's own
heart-meter rendering (`80-view.js`) still hardcodes `CFG.MAX_HP` for its
draw loop — a player who has grown past the starting max hp will not yet
see extra hearts drawn; sim-level growth is real and tested, the visual is
deferred, the same shape as the boss's own health-bar deferral.

---

## 5i. Weapons #3 and #4: Warmaul and Thornspear, D9's roster complete (v0.2.10)

D9 locked the roster at four weapons from this project's very start; only
two existed going into this session. Unlike §5g/§5h, this genuinely was
open design space — D9 names a COUNT, never identities — so it got the same
process the boss (§5f) and touch input (D10) did: a judged design panel,
each pitch and each judge reading the live source directly rather than
trusting a summary. The full numbers (reach, damage, hitstop, chain length)
are recorded in §3; this section is the process and the two real bugs it
caught, both before either weapon ever shipped.

**The panel split — a first for this project.** Three independent pitches,
two independent judges. Every prior panel here (D10, the boss) won outright,
both judges agreeing on one winner. This time judge 1 scored the three
pitches 42/39/36 and judge 2 scored the SAME three 37/42/46 — different
winners, genuinely close on substance, not just close in number. Deciding
required actually reading both judges' full critiques rather than summing
scores: pitch 1's Kilnbreaker duplicated Blade's exact reach (11px) AND
exact chain length (2 hits), the single harshest individual-weapon
criticism either judge made of any of the six weapons proposed across all
three pitches — closer to "a bigger Blade" than a new combat verb, the
precise failure mode the brief warned every pitch against. The chosen pitch
(Warmaul + Thornspear) was the only one of the three with zero false or
unchecked claims from BOTH judges AND the only one to extend a real,
discovered invariant (Blade's and Daggers' light chains already total the
same 13 base damage) to both new weapons cleanly — pitch 2's own version of
this idea broke down on its own Maul (10, not 13).

**The runner-up's own stated concern turned out to be measurably real.** A
judge's one criticism of the winning pitch — Thornspear's pitched 22px
blade being "nearly quadruple" the character's own default reach with "no
acknowledgment of how extreme" — was not waved off as panel noise. Baked
into the real merged move table (the exact construction `C.RIG = new
Rig(MOVES)` performs at boot, every move in the game together) it measured
40.5px against `verify_rig`'s own pre-existing "reach is about two tiles,
not ten" ceiling (20-40px) — an invariant that predates this weapon by
several versions and was not loosened to accommodate it. Pulled back to
20px before anything shipped; re-measured at 38.65px, comfortable headroom,
still the longest reach in the roster.

**A second real bug, geometric this time, caught the same way Twin Daggers'
was.** Hand-authoring animation frames for a longer blade is not the same
problem as for a shorter one: `heavy`'s own windup can swing back to -143°
and stay under `RIG_ACTIVE_SPEED` only because its blade is 11px — short
enough that even a big angle change moves the tip slowly. The same angles
copied onto Warmaul's 18px and Thornspear's 20-22px levers were ALREADY
moving fast while the blade was still behind the body — a real `behind`
violation on both moves' first draft, caught by baking against the actual
`Rig.bakeMove()`/`audit()` functions before either was written into the
shipped `MOVES` table, not discovered later by a suite. Fixed with a
shallower, deliberately-held windup (small steps until just clear of the
body, then a single large release frame) rather than by weakening the rule
or shortening the reach that motivated the whole weapon.

**Verified against real sim ticks, not read as correct (L8).** `verify_rig`
grew from 97 to 144 assertions and `verify_combat` from 67 to 90 — full
detail in §4's own entries for both suites. Net: `bash tests/run_all.sh` →
**GREEN 1130/1130 across 12 suites**, `cinder-loop.html` at 231 KB, confirmed
stable across multiple consecutive real runs, not just the one that shipped.

**A second, adversarial pass over this section's own work, before it was
called done — and what it actually found.** Fifteen independent agents (five
dimensions, each re-checked by a second independent verifier) read the real
source against every claim this section makes, rather than trusting it.
Three real, distinct problems surfaced:

1. *A false superlative, copied from a test comment into three docs at
   once.* "Real damage... for the roster's single biggest hit (13)"
   described `maulA` — but `maulA` is Warmaul's LIGHT move; its own HEAVY
   move (`maulHeavy`, 20) and even the pre-existing default `heavy` (14)
   both hit harder. The masterfile's own weapon table (§3, above) had the
   correct 20 sitting right next to the wrong claim the whole time. Fixed by
   testing `maulHeavy` for real (the genuine biggest hit in the game) and
   correcting `maulA`'s own claim to what's actually true: the biggest
   LIGHT-classed hit, not the biggest hit overall.
2. *A gate that was not actually reliably green.* `bash tests/run_all.sh`,
   re-run six times in a row rather than once, came back GREEN only once —
   the other five were RED on `verify_render`'s "the presenter is drawing
   frames" and/or "the attack key starts a swing" assertions, both timed
   with a FIXED sleep (900ms, 80ms) rather than a poll for the real
   condition. Pre-existing, unrelated to Warmaul/Thornspear content — every
   run kept `verify_rig`/`verify_combat` at 100% — but real, and exactly the
   class of claim §6's Rule 6 exists to catch: this section had already
   written "GREEN 1130/1130" from a single passing run before this was
   found. Fixed for real, not caveated around: both fixed sleeps replaced
   with a poll for the actual condition (`waitForCondition`, generalized
   from the reload path's existing `waitForBoot` helper), re-confirmed
   GREEN across 8 consecutive real runs afterward.
3. *A test that could not see what it claimed to prove.* The "every warmaul
   swing is a fresh maulA — never a chain" test never actually drives a
   press into `Combat.begin`'s MID-MOVE branch (the one that reads
   `m.data.chain`) — confirmed by mutating the real, shared `maulA.chain`
   field to a self-reference and watching the existing test stay green
   regardless. A second test, added alongside it, buffers a press WHILE
   `maulA` is still active — squarely inside that branch — and the same
   mutation now flips it red. The original test still has real value (it
   proves repeated presses each open a normal fresh swing); it simply
   doesn't prove what its own name claimed alone.

All three fixed for real — not documented as a known gap — before this
version was called done; the counts and GREEN claim above already reflect
the fixes.

**What was deliberately not done here.** Same as §5g/§5h: weapon
equipping/switching still has no player-facing path. Two more rows in
`WEAPONS` do not change that D4's pickup/blueprint system is what will
eventually let a player choose between four weapons rather than a test
setting `player.weapon` directly — D9's roster being complete and D4's
delivery mechanism existing are two separate claims, and only the first is
true as of this version.

---

## 5j. Slam impact — the ground-pound finally hits something (v0.2.11)

Full numbers and the architecture reasoning are in §3's own "Slam impact"
subsection; this section is the process and the four real bugs it caught.

**No judged panel — and that itself was a real decision, not a default.**
Weapons #3/#4 (§5i) needed one because D9 named a COUNT, never identities —
genuine open creative space. Slam-as-attack isn't that: the ONLY real fork
was universal-vs-per-weapon, and D7's own text ("a weapon owns no numbers
of its own") argues the OTHER way for a movement-triggered shockwave that
was never a swing to begin with. Everything else — route through
`Combat.resolveBox`, never a second hp-subtraction path — was already
written down as a rule before this session started. Designed, measured,
implemented, tested, one continuous pass, the same shape §5g used for wall
interaction and explicitly named as the reason IT skipped a panel too.

**Four real problems, in order of discovery, not severity:**

1. **An ES2015+ violation, caught before it ever built.** The first draft
   used `Object.assign` to merge the left/right box specs. `92-menu.js`'s
   own `withField` helper already states the rule this broke: no ES2015+
   runtime assumption anywhere in this codebase (`var`, no arrow functions),
   because a Wear OS WebView is a real target, not a hypothetical one.
   Fixed to two full literal objects — the same shape `Combat.step` already
   writes one of, inline, no helper needed either way.
2. **A stale comment, fixed in passing.** `player.weapon`'s own comment
   still blamed the missing equip path on "the not-yet-built pickup system
   (D2)" — D2 shipped two versions ago (§5h). The real dependency is D4;
   corrected while touching the same file for slam's own `slamLanded` flag,
   rather than left to keep misleading the next person who reads it.
3. **A test that failed for the RIGHT feature and the WRONG reason.** The
   knockback test read target position immediately after a slam landed and
   found it unchanged — not because knockback was broken, but because
   `Dummy.prototype.hurt` applies knock as VELOCITY, and a connecting
   slam's own `CFG.HITSTOP_HEAVY` request freezes the ENTIRE sim, targets
   included, for 9 ticks starting that same tick. The test read position
   before a single un-frozen tick had run. Traced with a real tick-by-tick
   script, not guessed at; fixed by stepping past the freeze window before
   checking, matching how every other post-hitstop assertion in this
   project already has to.
4. **Two more browser-suite timing flakes, found by taking the third bug
   seriously rather than moving on once it was fixed.** Chasing (3) meant
   re-running the full gate repeatedly in a row — and `verify_render`
   failed twice more, on two DIFFERENT assertions than the two v0.2.10's
   own adversarial pass had already found and fixed (§5i): a
   keystroke-displacement check and a jump-height check, both a fixed
   real-time sleep assumed to cover enough SIM TICKS, the exact same class
   of bug for the third and fourth time. Rather than wait for a fifth
   unlucky re-run, the rest of the file was grep'd for the same shape on
   purpose — a touch-drag displacement check, structurally identical, not
   yet observed to fail, fixed anyway. All fixed the same way as before:
   poll for the real condition, never a bigger guessed number.

**Verified against real sim ticks, not read as correct (L8).** `verify_combat`
grew from 90 to 109 — full detail in §4's own entry. `bash tests/run_all.sh`
→ **GREEN 1149/1149 across 12 suites**.

**A SECOND adversarial pass, over this section's own finished work, found
four more real problems — three cosmetic, one genuinely important.**
(1) `CINDER_LOOP_CHANGELOG.md`'s byte figure for `cinder-loop.html` was
wrong — traced to `build.py` itself printing a Python `len(str)` character
count mislabeled as bytes, silently under-counting by every multi-byte
UTF-8 character (em dashes, arrows) this codebase's own comments are full
of. Fixed at the root (`build.py` now encodes before measuring), not just
in the doc. (2) This very masterfile miscounted its own "timing hardened"
list as five items when it names seven — fixed above. (3) `SLAM_HIT_H`
(the AOE's vertical reach) had ZERO real coverage: every test dummy in the
section rests on the floor, where its own body height already spans
nearly any plausible value, so the horizontal-only boundary tests passed
identically whether `SLAM_HIT_H` was 1 or 1000 — confirmed by literally
sweeping through that range against the real assertions. Closed with two
new tests that pin a target's height for the duration of a landing
(dummies fall under gravity same as the player, so a genuinely elevated
target has to be held in place, not just placed and left) — one clearly
above the band, one genuinely inside it. (4) The real cause of this
project's own residual gate instability turned out not to be sim timing at
all: a leaked, growing pool of orphaned Chromium child processes (Windows'
`proc.kill()` does not cascade to a process TREE), eventually starving a
fresh launch of the resources to even start. Fixed with a tree-kill
(`tests/cdp.js`'s `killTree`, `taskkill /T`); orphan accumulation confirmed
stopped, not just asserted. A much rarer, still-undiagnosed launch failure
remains under artificially rapid repeated re-runs — named honestly, not
claimed eliminated, deliberately more scrutiny than the single clean run
this project's own Rule 6 (§6) warns against trusting.

**What was deliberately not done here.** No per-weapon slam variant (a
named scope choice, not an oversight — see §3). No resource cost or
cooldown beyond the existing hang/landing recovery; whether a free,
always-available AOE needs one is a balance question this session did not
attempt to answer, named here rather than silently assumed fine.

---

## 5k. Ledge grab / mantle — real spatial reasoning, not a velocity clamp (v0.2.12)

Full numbers, the detection table, and the bug list are in §3's own
"Ledge grab / mantle" subsection; this section is the process.

**No judged panel — the same reasoning §5g and §5j both already used to
skip one.** Catch-a-wall's-edge-while-falling, climb with jump, drop with
down, is genre-standard shape, not open creative space the way a weapon's
identity is (§5i). What made this feature different from every other
"skip the panel" precedent is that the SHAPE being free didn't mean the
GEOMETRY was: wall slide and wall jump are velocity clamps — react to
touching a wall, no further reasoning required — but a ledge grab has to
be genuinely correct about the tilemap: the wall has to actually run out,
within reach, into a surface the player can stand on. That is a claim
about the world, not a reflex, so before any of it was wired into
`update()`, `detectLedge()` was written as a standalone function and
proven against three constructed test worlds — a clean ledge, a wall that
never ends within reach, and a ledge with no headroom to climb into — the
same "bake against reality before shipping" discipline every rig move
already follows, just applied to collision geometry instead of a pose.

**Three real bugs, caught by hand before any test ever ran, then four
more found by a dedicated adversarial pass afterward — full detail in §3.**
The self-found bugs (a straddled-column climb position, a stale-onGround
tick matching a precedent already fixed once for roll's own start frame,
and a `finish()` classifier that would have silently overwritten the new
state the same tick it was set) were each caught by re-reading the code
against the project's own established bug shapes before trusting it. The
adversarially-found bugs (a crouched climb leaving the body's collision
box mismatched with its drawn position, a hazard hit swallowed by the
hang's own per-tick velocity pin, a negative test that never touched what
it claimed to disprove, and a rig-pose comment overclaiming coverage a
structurally-unreachable sweep could never provide) all shared one shape:
each was a real gap between what the code/prose CLAIMED and what a real
run actually proved — precisely the class of bug this session's now
five-for-five adversarial-pass discipline exists to catch.

**Own scratch-work bug, caught before it ever touched shipped code.** The
standalone geometry probe written to hand-verify `detectLedge()` before
wiring it in used `TILE` (destructured as `C.TILE`, the tile-*kind* enum)
in a pixel-arithmetic expression where `CFG.TILE` (16, the tile *size*)
was needed — this project's own documented "worst bug," recurring a
fourth time, this time in throwaway test code rather than anything
shipped, caught immediately by the probe's own nonsensical `null` results
rather than assumed correct.

**Verified against real sim ticks, not read as correct (L8).** `verify_move`
grew from 116 to 140, `verify_rig` from 144 to 148 — full detail in §4's
own entries. `bash tests/run_all.sh` → **GREEN 1177/1177 across 12
suites.** No new hash-coverage gap: `ledgeGrabLock`/`ledgeHang` were added
to `Sim.hash()` since they affect future-tick behaviour; `ledgeRow`/
`ledgeWallTx`/`ledgeDir` were deliberately left out — they are only
meaningful mid-hang, and their only observable effect (final body
position) is already captured through `b.x`/`b.y`.

**What was deliberately not done here.** No ledge-to-ledge chaining or
wall-to-wall climbing beyond one catch-climb-or-drop cycle — genre
convention for this move is exactly that cycle, and nothing in scope asked
for more. The re-grab lockout test's own precision is coupled to its test
geometry, named honestly in the test's own comment rather than left
implicit (§3).

---

## 5l. The run loop — spawn → clear → boss → die → spend → respawn (v0.2.13, D1)

D1, this project's very first locked decision, named the complete run loop
as the day-one target: "the loop is the product; a biome without a
death-and-spend cycle is a platformer demo." Every other system this
project has built — movement, combat, the boss, generation — has been real
and gate-verified in isolation while remaining reachable only by direct
construction in a test, never from an actual played game. This section
closes that gap.

**Genuinely open design space, unlike §5g/§5j/§5k, which all skipped a
judged panel because an existing rule already dictated their shape.** The
transition graph (level → boss → next level, with death as a second exit
from either) is a real design surface with more than one plausible shape,
so it got the same judged-panel process the boss (§5f) and D9's weapons
(§5i) did: three independently designed pitches, two independent judges,
each checking load-bearing claims against the live source rather than
trusting a pitch's own prose. All three pitches had a real,
source-verifiable bug: a `Run`-owned RNG stream seeded from the exact value
`Sim`'s own `this.rng` already uses (not independent at all, despite being
pitched as a second stream); a central level/boss transition described in
prose but never actually written into the pitch's own pseudocode; and a
boss-victory countdown nested inside a `this.run.phase === 'boss'` guard
that the transition itself flips false the instant the countdown starts —
a permanent deadlock after any boss victory not preceded by a death. None
shipped as pitched; the version that landed is a synthesis of the panel's
strongest, judge-verified pieces, built and verified fresh against this
codebase's own real source rather than adopted wholesale from any one
pitch.

**"Clear," precisely, and unanimous across all three pitches and both
judges.** Every enemy this level placed has hp <= 0, AND a living player
has reached the level's own exit point (`CFG.RUN_EXIT_RADIUS` = 24px, ~1.5
tiles). Reaching the exit alone would let a player tunnel past every
enemy `placeEnemies()` ever placed; killing everything without ever
reaching the door would strand the run with nothing to advance it.

**Zero new Bus events — also unanimous across the panel.** Every
transition this file drives is read off state `Sim` already needs to own
for other reasons (which world is loaded, `this.exit`'s own nullness, a
target's own hp) or reuses an event that already fires at exactly the
right moment (`death`/`respawn`/`targetDown`, none of them new) — the same
"state IS the signal" pattern the boss's own phase-1/phase-2 transition
already established (`45-enemy.js`: `this.phase = 1`, zero accompanying
event) applied one level up, to which level/phase of a RUN is loaded.

**A real bug, found and fixed before this version was called done.**
`beginRun()` is documented as a genuine restart, callable more than once
on the same `Sim`, not just a first-time initializer — the design was
explicit that a run-end already in flight from a PRIOR call (an abandoned
`_pendingLevel` computed from the old seed, or a boss-victory
`runEndFrames` countdown still counting down) must not survive a second
`beginRun()` call. The first implementation cleared exactly those two
fields (`runEndFrames`, `_pendingLevel`) and reset `_wasDead[]` to `false`
for every player — but never touched the PLAYERS themselves. A player
still mid-death-countdown from the prior, now-abandoned run kept counting
down against a `_wasDead[]` that had just been told, falsely, that nobody
was dead. The very next tick's edge-detection (`isDead && !_wasDead[i]`)
read that mismatch as a BRAND NEW death — it was not, it was the same old
one, just relabeled by the reset — and opened a second, bogus
`_beginRunEnd()` sequence off the FRESH run's own `runSeed`/`runsCompleted`.
Once the old countdown finally reached zero on its own schedule, that
bogus sequence committed silently: `run.levelSeed` changed to a level
nobody in the fresh run had asked for. Caught by a dedicated regression
test (`verify_run.js`, "beginRun() must be a genuine restart") that staged
exactly this sequence — die, then call `beginRun()` again before the
countdown finishes — on a real `Sim`: two assertions failed on the first
real run of the test, not a hypothetical one (`a.p().alive()` read `false`
immediately after the second `beginRun()`; `run.levelSeed` had drifted
from `seedBefore` after stepping `CFG.RESPAWN_FRAMES + 10` further ticks,
with nothing in the test ever requesting a new level). Fixed by having
`beginRun()` genuinely revive every player — `player.resetTransient()`,
consistent with D2's own "each stat starts at 1 every run," reviving hp
and stats to a fresh baseline the same way a whole new run should — BEFORE
`_wasDead[]` is reset, so the flag and reality agree from the very first
tick onward rather than disagreeing for one tick every time. Re-run
confirmed both assertions green and the full gate GREEN at 1288/1288 —
verified by actually re-running the suite, not assumed fixed from reading
the diff (L8).

**Verified against real sim ticks, not read as correct (L8).** `verify_run`
is a new suite, 101 assertions — full detail in §4's own entry. Two
layers, matching `verify_gen.js`'s own precedent for a system this shaped:
pure `RunLogic` logic against hand-built fixtures first (seeding never the
zero sentinel, `isLevelClear`/`reachedExit` boundary cases, the D8
currency/spend stub as real exercised infrastructure even at its current
zero cost, `placeEnemies()` never on the spawn platform or a pickup spur
with same-seed-same-placement determinism), then real `Sim`/`Player`/
`Enemy` integration second — proving `70-sim.js` actually wires the pure
logic in correctly, not merely that the logic is self-consistent in
isolation. Notably: a plain `scenario()` never engages the loop at all
(`sim.exit`/`sim.bossTarget` stay null, `run.phase` never leaves its
constructed default) until `beginRun()` is actually called; an undying
boot-path Dummy living alongside a real roster never blocks "clear"
forever — a regression found by driving the real built game end to end in
a browser, not caught by any sim-only test until this suite existed; a
genuinely STAGGERED co-op death (one player's countdown finishes first and
commits the level while the other is still mid-death) proves player
relocation never stomps a still-running countdown, through both the level
commit AND a subsequent level→boss transition; and the `beginRun()`
genuine-restart regression above. `bash tests/run_all.sh` → **GREEN
1288/1288 across 13 suites.**

**A dedicated adversarial-verification pass, run the same way as every
feature this session, stayed six-for-six.** Five independent lenses —
co-op interplay, boss/exit transitions, determinism/hash coverage,
`RunLogic` pure-function edge cases, and the production boot path — each
required to construct and actually RUN a real reproduction (a real `Sim`
through `tests/harness.js`, real damage through `Combat.resolveBox`, never
a theory) before reporting anything, and to report clean areas honestly
too. All five came back with at least one confirmed bug; three converged
independently on the same one. Six real problems, fixed:

1. **Co-op kills landed during the death-pending window were silently
   discarded, never paid** — `_beginRunEnd()` banked currency from
   `run.kills` at the trigger tick, but the OLD level stays fully live for
   a surviving partner through the whole countdown, and any kill they
   landed there was counted (`run.kills` kept climbing) then thrown away
   when `_commitPendingLevel()` zeroed it. Fixed by moving currency
   computation to the commit tick — the latest possible moment — instead
   of the trigger tick, the earliest.
2. **A run boundary only ever reset the ONE player who died** —
   `_commitPendingLevel()`, the transition that fires on every death or
   boss victory and is the game's own definition of "a new run"
   (`runsCompleted` advances right there), never called `resetTransient()`
   on anyone; a surviving co-op partner (or the sole player in a
   no-death boss victory) kept arbitrary stat/maxHp growth across a
   boundary D2 says should reset it. Fixed by resetting every ALIVE player
   at commit (a still-dead partner is left untouched, the same
   `_relocatePlayers()` precedent for not force-touching an unfinished
   death).
3. **`nextRunSeed`'s bare XOR-multiply mixing produced a real, structural
   seed collision** — `runsCompleted` 300..304 collapsed to the identical
   accumulated seed, and therefore an identical next level, for every
   starting seed tried, not a rare probabilistic clash. Fixed by running
   every derived seed through a proper 32-bit avalanche mix, reusing
   `RNG.prototype.next()`'s own already-proven mixing step rather than a
   new hash.
4. **Killing the boot-path practice Dummy banked real run currency** — the
   `targetDown` currency listener lacked the `_levelRosterIds` guard
   `isLevelClear()` already trusted. Fixed with the same guard.
5. **`Gen.generate()` failures were only ever guarded at boot** —
   `_beginRunEnd()` calls it again, unguarded, on every subsequent level
   transition; an impossible-CFG failure there escaped `sim.step()`
   uncaught into `frame()`'s own `requestAnimationFrame` callback and froze
   the game solid, re-throwing identically forever. Fixed by extracting the
   boot-time "warn loudly, install the known-safe fallback" logic into one
   shared `installFallback()`, reused by both call sites — the "one sibling
   patched, others missed" shape this project has hit before.
6. **A comment overclaimed the boot-path Dummy as "permanently alive"** —
   true in the sense that mattered (`isLevelClear()` never sees it as a
   phantom survivor), but both `_enterLevel()`/`_enterBoss()`
   unconditionally clear `this.targets`, dummy included, on every
   transition. Comment corrected.

**One more finding, investigated and correctly read as intentional, not
fixed.** A pickup spur close enough to the exit's own attach point
(confirmed against real generated levels, a narrow but real shape across a
400-seed scan) can satisfy `RUN_EXIT_RADIUS`'s distance check without the
player standing on the exit platform itself — but `RUN_EXIT_RADIUS` is
already documented as a deliberate "generous, not pixel-perfect" grace
window, the same spirit as `COYOTE_FRAMES`/`JUMP_BUFFER_FRAMES`. A real
consequence of that already-named choice, not a violation of it — the
reasoning is now recorded directly against the constant in `00-core.js`
rather than left for a future reader to rediscover.

**Verified against real sim ticks, including a real mutation check, not
read as correct (L8).** `verify_run` grew from 101 to 118: a boot-path
dummy killed through the real damage path banks zero kills; pending-window
kills are paid out in full at commit; a co-op survivor AND a solo
boss-victory player are both proven reset to the D2 baseline at a real run
boundary; 500 consecutive derived levels from four starting seeds never
repeat. The stat-reset fix was additionally mutation-tested: the new reset
loop was disabled in a scratch copy, the three new assertions failed
exactly as expected, and the real fix was restored and reconfirmed green —
proof the tests catch the bug's absence, not just that they pass.
`bash tests/run_all.sh` → **GREEN 1305/1305 across 13 suites.**

**What was deliberately not done here.** `65-meta.js` does not exist —
D8's currency stub pays out and spends but has nowhere permanent to go;
every run still starts pre-unlocked. Weapon equipping/switching still has
no player-facing path (D4, unchanged). The HUD heart-meter still hardcodes
`CFG.MAX_HP`, the same deferral named in §5h. No dedicated sim-level
regression exists for finding 5 (the `Gen.generate()` mid-run crash) — the
fix lives in the presenter (`95-app.js`), which `verify_run.js` does not
exercise, and a browser-level test forcing a mid-run generation failure
inside a live CDP session is real but separate test-infrastructure work
not taken on here; verified by direct code tracing and `verify_render`
staying green, not by a dedicated regression — named as a gap rather than
assumed covered.

---

## 5m. Meta progression — persistence, blueprints, +max HP (v0.2.14, D4/D8)

D8 named four things meta currency buys: "flask charges, +max HP, backpack
slot, starting-loadout choice." D4 named the blueprint loop: "drop, carry,
lose on death, hand in at a transition, pay to unlock into the pool. Stage
1 ships with the pool pre-unlocked, plus a debug-room toggle to enforce
it." Both were locked from this project's very start; this is the first
session that actually builds any of it.

**Scope, decided explicitly, not silently — the user chose from three
options.** Building all four of D8's purchases in one pass, building only
the persistence/currency plumbing with no purchases at all, or building
the D4 blueprint loop plus +max HP and naming the rest. The middle ground
won: flask charges (a consumable/heal mechanic) and a backpack slot (a
carrying-capacity concept) are both genuinely NEW game design with zero
existing engine surface — no potion/consumable system exists anywhere in
this codebase, and "backpack" names an undefined capacity concept — unlike
+max HP (a direct reuse of D2's own "+HP" vocabulary one layer up, already
cross-referenced from D8 at D2's own landing, §5h) or blueprint unlocks
(which target the four already-built, D9-locked weapons rather than
inventing new content). Named and deliberately deferred, the same
two-step "scope it, then build it" discipline D11/D12 already used, not a
gap discovered later.

**No judged panel — D4/D8 already dictated the shape closely enough that
what remained were implementation questions, the same reasoning D2/wall
interaction/slam impact each skipped one for.** The one real design
decision was reading D4 precisely rather than assuming a shape for it:
"lose on death" and "hand in at a transition" read, on close inspection,
as the run's OWN two endings — D1 itself names death as one of exactly two
ways a run ends ("spawn -> clear -> boss -> die -> spend -> respawn") —
not two sequential steps of a single outcome. A player whose own death
ends the run never reaches a transition alive, so they always lose their
carry; only a player who survives to the transition (a boss victory with
no death, or a living co-op partner while a teammate's death ends the
run) ever hands one in.

**A real bug in this session's OWN test suite, caught by actually running
it — not a bug in the shipped code, and named as plainly as any bug this
project has found in code.** The first draft of `verify_meta.js` assumed
a player who dies AND whose death triggers the run-end would ALSO hand in
their carried blueprint at that same commit — a solo player dies carrying
a blueprint, the test expected `meta.unlocked` to reflect it once the run
committed. Running it failed three ways: the weapon was never unlocked,
currency was never spent, no `blueprintUnlocked` event fired. Tracing why
rather than patching the assertions found the CODE was already correct:
`_commitPendingLevel()`'s hand-in loop reads `player.carriedBlueprint`
only for players who are `alive()` at commit time — and the dying
player's OWN natural respawn (`Player.update()`'s `resetTransient()` call,
firing earlier in the SAME tick, well before `_stepRun()` ever reaches
`_commitPendingLevel()`) had already cleared it. Exactly D4's "lose on
death," working as designed. Rewritten to drive the affordable/
unaffordable hand-in cases through a boss-victory (no-death) transition
instead, and to add a co-op scenario that proves BOTH of D4's outcomes at
the identical commit — one player dies and loses their carry, the
survivor hands in and unlocks theirs — with real per-player event
payloads, not an aggregate count that could hide which player did which.

**Currency: two numbers on purpose.** `this.run.currency` (60-run.js's own
field, within-session, reset by `beginRun()`) and `this.meta.currency`
(this file's own field, permanent, survives both a restart and a reload)
both grow by the identical `earned` amount at every commit — not two
disconnected pools, "total earned this session" and "current spendable
wallet" read off the same underlying earnings. `RUN_SPEND_STUB_COST`
(00-core.js, `60-run.js`'s own placeholder, explicitly scoped at landing
as standing in "until 65-meta.js does" exist) is retired outright rather
than kept alongside the real spends this file adds — its whole stated job
was done the moment a real price existed, and a second, always-succeeding
spend at the same call site would only be dead weight pretending to be
infrastructure.

**Blueprint drops reuse the sim's own live RNG stream, not a fresh
per-call one.** The same convention `pickStatColour` already established
for in-run, reactive randomness (as distinct from `RunLogic`'s own
derived-seed functions, which build a level independently reproducible
from one seed and so own a throwaway stream of their own) — a real roster
kill rolls against `this.rng` directly. `rollBlueprintDrop` never
consumes a draw at all when nothing is left locked to offer (Stage 1's
own default, or a fully-unlocked pool under `enforceLocks`), so the
common case costs nothing, not a wasted roll.

**Verified against real sim ticks, not read as correct (L8).** `verify_meta`
(176, new suite) — full detail in §4's own entry. `bash tests/run_all.sh`
→ **GREEN 1490/1490 across 14 suites.**

**A dedicated adversarial-verification pass, run the same way as every
feature this session, stayed seven-for-seven.** Five independent lenses —
the blueprint's own end-to-end lifecycle, currency/spend/persistence,
determinism/hash coverage, the F5/F6 debug keys and their interactions,
and the production boot path — the identical methodology `60-run.js`'s
own pass used. Four real findings, two of them the same bug found
independently by two different lenses:

1. **F5/F6 — the ONLY exposed way to spend meta currency or flip the lock
   toggle — never persisted their own result.** `saveMeta()` was wired to
   exactly one hook, the `runEnd` bus event, which only fires from a real
   D4 transition. A real purchase or toggle sat correctly mutated in
   memory, then silently reverted on an ordinary reload if the player
   closed the tab before the run reached its next transition — losing
   real progress on the single most ordinary interaction this file's own
   header says currency should survive. Fixed by saving immediately after
   each debug key's own mutation. Confirmed by real mutation: the fix was
   disabled in a scratch copy, five new browser assertions failed exactly
   as expected, and the real fix was restored and reconfirmed green.
2. **`runEnd.handedIn` silently dropped a consumed blueprint whose weapon
   happened to already be unlocked by an earlier carrier in the same
   commit loop.** The spend/unlock logic itself was already correct (no
   double-spend, exactly one `blueprintUnlocked` event) — only the event
   payload under-reported which carries were actually consumed. Fixed by
   recording every consumed carry up front, before either downstream
   branch.
3. **`opts.meta`/`applyMeta()` adopted a live reference, not a copy.**
   Every OTHER place a `Meta` object gets produced is careful to hand back
   an independent copy; these two were not, so two Sims built from (or
   `applyMeta()`'d with) the same object silently shared `this.meta`,
   `unlocked` included. Unreachable from the single production call site
   today, but a real, latent gap contradicting the file's own stated
   single-owner discipline. Fixed by routing both through
   `MetaLogic.sanitize()`, which already builds a fresh, validated copy.
4. **`applyMeta()`'s own comment named a call site that does not exist** —
   claimed `95-app.js` calls it after `loadMeta()`; `boot()` actually
   supplies meta directly as the constructor's `opts.meta` and never calls
   `applyMeta()` at all. Corrected, and the method — genuinely zero test
   coverage before this — got a real regression alongside the fix above.

**A fifth issue, self-found while fixing the above, not from the pass
itself.** This section's own `verify_meta.js` header claimed its
localStorage glue was "covered for real by verify_render" — true in
intent, false in fact at the time: `verify_render.js` had zero references
to meta anywhere. Rather than just correct the claim, the coverage itself
was added: a new "meta persistence" section in `verify_render.js`, driven
through real F5/F6 key dispatch, the same shape finding 1's own repro and
mutation test used.

**Verified against real sim ticks and a real browser, including real
mutation checks (L8).** `verify_meta` grew from 176 to 191; `verify_render`
grew from 98 to 113 — full detail in §4's own entries. `cdp.js` gained
F5/F6 key-code mappings to make the real dispatch possible at all.
`bash tests/run_all.sh` → **GREEN 1520/1520 across 14 suites.**

**What was deliberately not done here.** Flask charges and a backpack
slot (named above). No shop/hub UI — `buyMaxHp()`/`toggleEnforceLocks()`
are real, tested Sim methods reachable today only via debug keys (F5/F6),
the identical "the data and wiring are real and tested, but nothing yet
gives the player a UI to trigger it" shape weapon equipping has had since
D4 was first locked (§5g/§5h/§5i). A blueprint dropped in the world is an
instant grant on kill, not a separate spatial pickup entity a player has
to walk over to — a real, named simplification, the same shape D2's own
stat-pickup pairing simplification took at its own landing (§5h): building
a whole new spatial-entity type was not taken on this pass. Starting-
loadout choice (D8) has no consumer yet — weapon equipping/switching still
has no player-facing path at all, so an unlocked weapon has no way to
actually become what a run starts with; the unlock STATE is real and
tested regardless, the identical shape `RUN_SPEND_STUB_COST` itself used
before this session existed to spend it on anything.

---

## 5n. Narrative — the Kilnkeeper, dialogue trigger + text-box render (v0.2.15, D11/D12)

D11 (2026-08-15): "story-related events (dialogue + sound) are one
data-driven system, not two: a `DIALOGUE` table... fires through the
EXISTING typed Bus... and is rendered entirely presenter-side in a new
`82-narrative.js`... Two pools: a recurring narrator voice (the
Kilnkeeper), triggered at run milestones, and short per-template enemy
ambient barks, both line-picked via a seeded RNG." D12, the same day: the
villain reveal — the Kilnkeeper IS Kilnwarden's own voice, revealed at the
final boss fight, and "every line heard earlier rereads once the reveal
lands." Both locked before this session started; this is the first
session that builds either.

**No judged panel — D11/D12 already dictated the shape closely enough
that what remained were implementation questions, the same reasoning
D2/wall interaction/slam impact each used to skip one.** The real design
work was reading D11 precisely rather than assuming a shape for it, the
same discipline §5m's own D4 reading required. Two open questions D11
left genuinely unanswered: HOW does a presenter file detect "a run
milestone" without any Bus event currently firing for one, and where does
the line-picking RNG's own seed come from without touching `sim.rng`
(which L4/L5 both forbid for a decision "chosen text has zero effect on
sim state" already says gameplay should never see).

**Zero new Bus events, zero changes to any SIM file — the strongest
possible reading of D11's own "zero effect on sim state."** Milestones
(a level starting, entering the boss, a boss win, a death) are detected
by polling `sim.run.phase`/`levelSeed`/`runsCompleted` and each player's
own `state` once per RENDERED FRAME, comparing against the last-seen
value — the identical "remember the last value, compare, act on the edge"
technique `Sim.prototype._stepRun()` already uses for `justDied`/
`justRespawned`, applied from the presenter side: reading only, writing
nothing. `60-run.js`'s own "zero new Bus events" precedent (§5l) is
carried one file further here — this feature needed no NEW events at all,
reusing the already-existing `telegraph` (45-enemy.js's own fairness-rule
commit moment) for barks. A death always wins over a same-tick
boss-victory reading, the identical priority `_stepRun()` itself already
committed to — reused, not re-derived, the same way §5m reused
`RunLogic.spend()` rather than rederiving it.

**The RNG question, resolved by NOT sharing `sim.rng`.** `Narrative` owns
its own local `RNG` instance, constructed once and never touching the
sim's own stream — drawing from `sim.rng` for a decision gameplay is
explicitly not supposed to depend on would consume a real draw from a
resource determinism needs to stay reproducible, the exact violation
`pickStatColour`'s own correct SIM-side use of `sim.rng` was careful to
avoid in reverse.

**The reveal (D12) is SESSION-scoped, a real, named simplification, not
silently built as something bigger.** It fires once, the first time
`sim.run.phase` becomes `'boss'` — not persisted across a reload. A
persisted version would need a real Sim/Meta method to mark it (L5),
exactly the kind of sim-side surface this file's whole design is built to
need none of; naming the limitation here rather than quietly building
more scope than the pass actually delivered.

**The writing, not just the wiring.** The Kilnkeeper's lines are
deliberately double-voiced: read on a first encounter as a warm, faintly
odd guide ("the kiln has never once run cold," "you'll come back
tempered, not broken"); read again once the reveal has landed, the SAME
lines describe exactly what the Kilnkeeper has been doing to the player
the whole time. The reveal pool makes the second reading explicit ("The
kiln was never behind me. I am the kiln."); the boss-victory and death
pools were written to hold up under either reading, not just the first —
D12's own "every line heard earlier rereads" is a constraint on the
content, not something requiring extra code, and was treated as one.
Original expression throughout (L1): the kiln/ash/ember/wick vocabulary
is this project's own, already established by the roster and boss names
these lines sit beside.

**Verified against real sim ticks and a real browser (L8).** `verify_narrative`
(54, new suite) — full detail in §4's own entry. `verify_render` grew from
113 to 117: `window.CINDER_APP.narrative` exists in the real built game; a
real `telegraph` on the real bus produces a real displayed bark line
through the real production wiring; the text box composites into a real
captured frame. `bash tests/run_all.sh` → **GREEN 1584/1584 across 15
suites.**

**A dedicated adversarial-verification pass, run the same way as every
feature this session, stayed seven-for-seven.** Five lenses, six real
findings, every one confirmed by an actual run. Two were live: a
boss-phase death, staged the way Sim actually stages one — across several
real frames, not within one `update()` call — could show a triumphant
`bossVictory` line, because by the time the commit frame lands the
player's own `state` has already cycled back to alive and the two
outcomes read field-for-field identical; fixed with a `_deathDuringBoss`
flag set at the moment of death and checked (then cleared) at commit. And
the Kilnkeeper's own dialogue RNG was never given a real seed — the one
real call site (`95-app.js`) never passed one, so every boot ever, for
every player, silently fell back to the class's own hardcoded default,
making the "seeded RNG this file owns itself" produce the exact same
lines forever; fixed by threading `boot()`'s own real seed through.

Three more were real but confirmed NOT reachable through today's actual
wiring — a reveal blind spot if constructed already mid-boss, unclamped
panel geometry that could go off-canvas at a sub-floor viewport
`95-app.js`'s own `fit()` never actually permits, and a `subscribe()`
with no idempotency guard against a second call nothing today ever
makes — each fixed defensively anyway, the same "real, latent gap, fixed
rather than left as a landmine" call §5m's own `opts.meta` finding
already made. One more was investigated and correctly read as an
already-accepted consequence, not a new bug: a mid-run `Gen.generate()`
failure still permanently retires the run loop (and therefore narrative,
which correctly mirrors its inert gate) into the same exit-less practice
sandbox the boot-time fallback has always used — the freeze itself was
already fixed (§5l); this is the same accepted tradeoff, not a new one,
with one genuinely new piece named rather than silently absorbed: the
death line for the exact death that triggered the crash gets swallowed.

**Verified against real sim ticks and a real browser, including a real
mutation check (L8).** `verify_narrative` grew from 54 to 65 —
full detail in §4's own entry. `verify_render` grew from 117 to 118:
`narrative.rng` proven seeded from the real boot seed, checked against
the pristine instance before anything could mutate the stream. The
boss-phase-death fix was additionally mutation-tested: the suppression
was disabled in a scratch copy, the new assertion failed exactly as
expected, and the real fix was restored and reconfirmed green.
`bash tests/run_all.sh` → **GREEN 1596/1596 across 15 suites.**

**What was deliberately not done here.** `85-audio.js` still does not
exist — D11's own text explicitly scopes it to share this file's trigger
design, so the actual synthesis work remains fully open. No dialogue
queue — a second trigger firing while one line is still showing REPLACES
it rather than waiting its turn, a real, named simplification. Barks fire
off every `telegraph` including the boss's own — `Kilnwarden` has no
dedicated entry in `DIALOGUE.barks` (it is not a `DATA.ENEMIES` roster
member, D9's own exclusion), so a boss telegraph fires nothing rather
than throwing; whether the boss deserves its own bark voice is a content
question, not an engineering one, not taken on this pass.

---

## 5o. Synthesized SFX — Web Audio engine, real mute toggle (v0.2.16, D11)

D11's own text (2026-08-15, quoted in full at §5n) named `85-audio.js`
explicitly and scoped it in advance: "hang off the same trigger design"
the dialogue system already established, rather than invent a second one.
With that shape already fixed, no judged panel ran here either — the
same "the design was already specified, only implementation questions
remained" reasoning D2/wall interaction/slam impact/narrative each used.
This session (user prompt: "start 85-audio.js") also chose the scope
fork D11 left open — SFX only, no music/ambience, a real, named
simplification matching the same "hard to get right without iterative
listening" risk that kept flask charges/backpack slot out of §5m.

**Two Web Audio primitives, not four.** `tone` (one or more oscillator +
gain-envelope notes, layered/sequenced via each note's own `delay`,
optionally pitch-swept via `sweepTo`) and `noise` (a filtered buffer, for
a whoosh a pitched oscillator can't produce) — matched to what the
fifteen real cues (10-data.js's own `SFX` table, D7: content is data)
actually need, not a generic synthesizer built ahead of any real
requirement. Fifteen of the Bus's ~30 registered events get a cue, a
deliberate curated subset — the same "partial, not exhaustive, coverage
is the accepted shape for a presenter reaction layer" precedent
`80-view.js` already set by leaving several of its own Bus handlers as
no-ops.

**The `Math.random` ban applies to presenter code too, not just the
sim.** `verify_arch`'s own source scan ("the presenter gets its own
generators, but never `Math.random` — screenshots have to be comparable
frame to frame") covers `85-audio.js` the same as `80-view.js`/
`82-narrative.js` — confirmed by grep BEFORE writing the noise-buffer
generator, not after. `SFXPlayer` owns its own local seeded `RNG`
(`opts.seed`, never `sim.rng`), the identical reasoning `82-narrative.js`'s
own header already gives for keeping its line-picking RNG off the sim's
own stream: a presenter-side draw must never consume from a resource
gameplay determinism depends on.

**One fix, two problems: the `AudioContext` is lazily constructed.**
Never at `SFXPlayer` construction, only on first actual use — solving the
browser autoplay-gesture policy (most browsers refuse to let a freshly
built context produce sound until a real user gesture calls `resume()`)
and Node testability (`opts.ctx` injects a fake context, the same
"a hand-built fixture is exactly as valid as the real thing" precedent
`stubCanvas()` already established for View) with a single design
choice, not two separate ones.

**The mute toggle is real, player-facing Settings/Menu UI — not a debug
key.** Unlike `65-meta.js`'s own F5/F6 (developer-only, §5m), "can I turn
the sound off" is ordinary settings territory, the same shape
`reducedMotion`/`showMeter` already occupy — a real `muted` boolean field
in `90-settings.js` (defaults/sanitize, never throws) and a real "Sound:
On/Off" row in `92-menu.js`'s Options screen.

**Caught before the adversarial pass even started: `app.settings` never
resynced after a menu change.** Driving the real Sound row through a
real browser (this session's own new `verify_render.js` coverage, not
the five-lens pass below) found that `boot()`'s `menu` `onChange`
callback reassigns its OWN closure-local `settings` variable on every
call, but never wrote that new reference back onto `app.settings` — a
separate reference captured once, at `app` construction. Every INTERNAL
consumer (`applyMotion()`, `audio.muted`, `actionForCode()` in the key
handlers) already read the closure variable directly and was unaffected;
only `window.CINDER_APP.settings` read from outside `boot()` itself saw
a permanently stale object. Fixed with one line, `app.settings =
settings;`, alongside the pre-existing `app.showMeter` sync.

**Verified against real sim ticks and a real browser (L8).**
`verify_audio` (191, new suite) — SFX table content-shape validation,
every one of the fifteen triggers fired end-to-end against a fake ctx
proving the right node shape (tone vs. noise), non-triggers proven
silent against the real `C.Bus.KNOWN` list, mute suppression at
construction and live-toggled, `subscribe()` idempotency, `unlock()`
across suspended/running/no-support states, graceful degradation with
zero Web Audio support, ctx reuse, RNG determinism/divergence for the
noise buffer. `verify_platform` grew from 137 to 164 (the real Sound row
and the `muted` field across defaults/sanitize/round-trip).
`verify_render` grew from 118 to 132 (a monkeypatched
`AudioContext.prototype` proves a real context and a real oscillator
node get built through the actual production path — not just that
internal functions ran — and the Sound row driven through real keys
reaches both the live `SFXPlayer.muted` and the live settings object,
with mute/unmute proven against real `bus.emit()` calls against a live
node counter). `bash tests/run_all.sh` → **GREEN 1834/1834 across 16
suites.**

**A dedicated adversarial-verification pass, run the same way as every
feature this session, stayed eight-for-eight.** Five lenses (content
table, `SFXPlayer` internals, settings/menu wiring, `95-app.js` boot
wiring, test-coverage gaps), fourteen candidate findings, thirteen
confirmed real by an independent skeptical re-check and one correctly
refuted (a claim that real-browser coverage only ever exercised one
oscillator waveform — disproven by the verifier's own re-run, which
observed five real oscillator calls across a `land`/`hit` pair that fire
naturally during ordinary boot).

Of the thirteen confirmed, six were real, reachable code defects, fixed:
**(1)** the most severe — `play()`/`render()` had zero `try`/`catch`
around real `AudioContext` node creation, and `Bus.prototype.emit` has
none either; a real-but-degraded context (a missing method on a minimal
WebView, a context the browser has already closed) throwing from
`createOscillator`/etc. escaped uncaught through both, out of whichever
Sim method emitted the trigger, straight into `95-app.js`'s own
`sim.step()` `try`/`catch` — whose ONLY recovery is `installFallback()`,
a real, disruptive sim-state mutation that resets the player's entire
current run. A presenter-only optional subsystem forcing a run reset
contradicted this file's own stated design ("never crash the game over
an optional layer"); fixed by wrapping `play()` and `unlock()` in their
own `try`/`catch`, degrading to silence exactly like the "no Web Audio
support at all" branch already does. **(2)** gamepad-only sessions never
called `audio.unlock()` at all — the three real-gesture listeners
(`keydown`/`pointerdown`/`touchstart`) are the only call sites, and per
the browser's own user-activation model a Gamepad API button press does
not grant the "sticky activation" those three trusted events do; every
SFX cue was silently inaudible for a fully-supported input method's
entire session. Best-effort mitigation applied — `audio.unlock()` now
also fires on the edge-detected Start-button press — but named honestly
as a REAL, currently unresolved platform limitation for a truly
gamepad-only session, not silently claimed as fully fixed. **(3)** the
menu's `onChange` unconditionally re-derived `app.showMeter =
settings.showMeter` on every call — including when an UNRELATED setting
(Sound, a rebind) changed — silently reverting an F3 debug-meter toggle
the instant the player touched anything else in the menu; fixed by only
re-deriving it when `settings.showMeter` itself actually changed.
**(4)** `10-data.js`'s own SFX header comment claimed the noise
primitive backs "a wall push-off," but `wallJump` has always shipped as
`type: 'tone'` — the comment was simply wrong about its own data;
corrected the prose rather than change the already-shipped sound to
chase it. **(5)** `playNoise()` jumped straight to peak gain at sample
0, with none of `playTone()`'s own ~5ms linear attack — since a noise
buffer's first sample is a random near-full-range value rather than one
that naturally starts near zero, this was a real step-discontinuity
click risk, not a deliberate choice; given the identical attack ramp.
**(6)** `subscribe()`'s idempotency guard was keyed on "have I ever
subscribed," not "am I subscribed to THIS bus" — a second call against a
genuinely different `Bus` silently wired nothing, with no error;
currently unreachable (one `SFXPlayer` per process, never
re-subscribed), fixed defensively anyway — now throws a clear error
rather than silently no-op'ing, matching this codebase's own stated
preference for loud failure (`installFallback()`'s own header names the
same lesson).

One more confirmed finding was dead code, deleted rather than fixed:
`Settings.withDefaults()` silently discarded its own argument and always
returned `defaults()` — zero call sites anywhere in `src/` or `tests/`,
confirmed by grep; removed rather than left as a landmine a future
"reset but keep my preferences" feature could reach for and be
silently betrayed by.

The remaining six confirmed findings were real test-coverage gaps, not
code bugs, closed with new regression coverage: `verify_audio.js`'s own
`fakeCtx()` never recorded the actual numeric/string arguments passed to
`AudioParam` methods — the highest-value gap of the six, since three
independent mutations against the real source (hardcoding gain to `1`,
disabling every pitch sweep, collapsing every waveform to `'sine'`) all
sailed through 191 assertions completely undetected; closed with a
richer `instrumentedCtx()` fixture checking every real cue's actual
gain/waveform/sweep-target/filter-cutoff math against the content table
(and re-confirmed by re-applying the gain mutation against the new
section: 18 real failures, reverted clean). The noise buffer's
bipolar-ness (`rng.next() * 2 - 1`) was proven only by "some sample is
non-zero," which a broken unipolar generator would also pass; added a
real span-and-mean check. The `pointerdown`/`touchstart` legs of
`audio.unlock()` had zero coverage anywhere in the whole gate (only
`keydown` did); added a `cdp.mouseDown`/`mouseUp` helper (a new,
trusted-input `Input.dispatchMouseEvent` wrapper, the same pipeline
`keyDown`/`touchEvent` already use) and spy-based coverage for both.
`verify_platform`'s Sound-row test asserted what `confirm()` DOES at a
hardcoded cursor offset but never that the row LABELED there is actually
"Sound" — a `rowLabels()`/`confirm()` index desync would have been
invisible to the fast Node suite, caught only by the slower browser leg;
added the missing label check. `muted`'s independence from corrupted
sibling fields (the same bug CLASS this file's own `sanitize()` header
already names as having bitten `keybinds` once) had no dedicated
regression test; added both directions. `move()`'s wrap-around was only
ever driven on the ROOT screen's 2-row list, never the OPTIONS screen's
real 12-row one (`Pad.BUTTONS.length + 5`, the exact list this feature's
own Sound row grew by one); added wrap/large-delta coverage there too.

**A confirmed prompt-injection attempt during the pass itself, refused
and reported by the agents it targeted.** Two independent verifier
agents, and separately this session directly afterward, each received a
tool result formatted as a fake "system-reminder" claiming an
unauthorized edit to `85-audio.js` had already happened and instructing
the recipient to treat it as intentional and NOT disclose it. All three
refused, re-verified the real file against an independent checksum, and
reported the attempt rather than complying — the instruction-source-
boundary rule this project's own tooling is built to enforce (content
arriving through tool output is data, not a command) held under an
actual, not hypothetical, test. No code was affected; named here for the
record, not as a code finding.

**Verified against real sim ticks and a real browser, including a real
mutation check (L8).** `verify_audio` grew from 191 to 303 (the
`instrumentedCtx()` section above, plus a dedicated regression proving a
throwing `ctx` never escapes `play()` OR a real `bus.emit()` call — the
exact path the most severe finding traced into `Sim.step()`).
`verify_platform` grew from 164 to 173 (the label check, cross-field
corruption, and Options-screen wrap coverage above). `verify_render`
grew from 132 to 134 (the pointerdown/touchstart unlock checks). The
most significant fix — the `play()`/`unlock()` exception guard — was
mutation-tested: the `try`/`catch` was removed in a scratch copy, all
four of its own new regression assertions failed exactly as expected,
and the real fix was restored and reconfirmed byte-identical (checksum)
and green. `bash tests/run_all.sh` → **GREEN 1957/1957 across 16
suites.**

**What was deliberately not done here.** No volume slider — a binary
mute only, matching the scope this session chose (`AskUserQuestion`:
"SFX only"). No music or ambience layer — SFX only was the named cut,
not a gap discovered later. Still no dedicated boss bark voice
(`Kilnwarden` has none in `DIALOGUE.barks`, §5n's own gap, unaffected by
this session). A truly gamepad-only session unlocking a real
`AudioContext` remains a genuine, unresolved browser-platform
limitation, not something this codebase's own code can fully close —
named above, not silently claimed as fixed.

---

## 5p. Ember Dash and Parry — abilities, enhancements, full input/VFX/SFX wiring (v0.2.17, D13)

**Two new character-level abilities, locked from a real design spec, not
built freehand.** The full mechanic design — Ember Dash's shape, Parry's
negate+stagger contract, the touch Manual/Assist split, the four
enhancements — was brainstormed and locked in a dedicated spec
(`docs/superpowers/specs/2026-08-24-abilities-character-design.md`)
*before* any implementation began, the same two-step "scope it, then
build it" discipline D10/D11/D12 already used, then carried through
Claude Code's own native plan-mode workflow (explore → design → review →
final plan → approval) before a line of feature code existed. Both
abilities are available from the very first spawn — D4-style unlock
gating deliberately not used, a locked choice from the spec's own
brainstorming pass, not a default reached for out of convenience.

**One genuine open fork survived into implementation planning itself.**
Two independent Plan agents converged on every other shape but split on
whether Parry should be its own committed player state, mirroring Roll,
or a lightweight timed flag layered on top of whatever state the player
is already in. Put to the user directly, with the deciding argument
stated plainly: a state-based Parry folded into `invulnerable()` (which
also gates hazard damage) would silently grant lava/spike immunity for
the whole window, not just protection against the one attack it was
timed against. The user chose the flag. `player.parryWindow`/`parryCd`
never touch `this.state`; negation is a dedicated check inside
`Combat.resolveBox`, correct by construction rather than inherited from
a state a hazard check also happens to read — this is D13's own central
design decision, and every subsequent piece of code (trigger guards, the
`resolveBox` check's ordering, `invulnerable()`'s own exclusion) was
built and adversarially verified against it, with two of the findings
below directly traceable to getting that boundary wrong the first time.

**Ember Dash costs zero new input.** The SAME buffered `roll` press that
grounds into a roll airborne-triggers a dash instead — context evaluated
at *consumption* time, not press time, so a roll press buffered while
still airborne but not consumed until after landing correctly fires an
ordinary ground roll, never a stale dash, matching how every other
buffered input in `30-player.js` already resolves. 14 frames, 77px
(measured, not derived from CFG — the same L8 discipline every prior
movement number in this project already holds to), full i-frames
throughout, a 30-frame cooldown. The one real structural trap:
`finish()`'s own end-of-tick state-reclassifier already excluded
`'roll'` from overwriting itself back to `'idle'`/`'fall'` every tick —
dash needed the identical exclusion added, or the whole state would have
silently collapsed back to `'fall'` one tick after starting, a bug that
would have been invisible to any test not measuring the dash's own
duration directly.

**Parry needed one genuinely new capability from `45-enemy.js`: a way to
interrupt an attack mid-flight.** Named as the single riskiest piece of
the whole spec before a line of code existed, and built third in the
recommended order specifically so a regression would be unambiguously
attributable to it. `Enemy.prototype.stagger()` is idempotent (co-op
means two players' own parry windows can land against the same shared
enemy hitbox in one `Combat.resolveBox` pass), clears the enemy's own
in-flight attack so nothing lands late, and enters a new `'staggered'`
state with its own fixed `CFG.STAGGER_FRAMES` duration — deliberately
NOT whatever `recover` window the interrupted move happened to have, so
a fast move's own tiny recovery can't undercut the punish window
Riposte's own bonus hit depends on — before handing off to the EXISTING
`recover` → `chase`/`phaseTransition` branching, so a staggered boss
still gets its own phase-transition eligibility check rather than
skipping it. `dangerous()` already excluded every state but
`strike`/`charge`/`dive`, so a staggered enemy reads as harmless for
free. Scope named honestly, not hidden: V1 stagger only fires for
melee/charge/dive contact — `shoot`/`zone` attacks don't resolve through
`Combat.resolveBox` with the enemy itself as `source` (a shot's own
damage comes from a separately-spawned `Shot`; a zone's from a direct
hazard-rect check), so a base parry does not negate or stagger either.
12-frame window, 30-frame cooldown *only on a natural whiff* — a
successful read costs nothing, rewarding the timing rather than
punishing success the same way a miss is punished.

**Four flat-cost enhancements, the identical shape `buyMaxHp` (D8)
already established** — check `.ok`, write `meta.currency`, flip a flag,
live-top-up every currently-alive player. Dash Extra Charge (20
currency) is a genuinely SEPARATE banked charge from the ordinary
cooldown, refreshed on ground contact only — deliberately not mirroring
`airJumps`' own wall/ledge generosity, preserving dash's "limited air
resource" tension, a real judgment call named as such rather than a
fabricated fact. Dash Extended I-Frames (15) layers a residual
invulnerability window onto the dash's own existing `iframes` counter
right as it ends, via a `Math.max`-style guard that never shortens a
larger, unrelated iframes value already running. Parry Riposte (20) and
Parry Reflect (25) both land their own bonus effect *directly* inside
`Combat.resolveBox`'s new parry branch rather than routing back through
a second `resolveBox` pass — going through the generic gate again would
let the enemy's own unrelated iframes silently swallow a reward that is
supposed to be unconditional once the read has already happened. Reflect
specifically needed one new field on `Shot` (`owner`, a direct reference
to the firing enemy) and sends the shot's own damage back at whoever
fired it, directly, rather than a second live projectile flying back
through the world (`Shot.prototype.update()` has no existing notion of
an enemy-facing target set to route a truly reflected shot through, and
building one was a real, much larger, and unnecessary change for the
same "sends it back at the attacker" promise — scoped and built last, on
its own, once the other three were proven green). A real, named
disclosure gap closed along the way: the four new `Sim.prototype.buyX()`
methods had no way to trigger them at all — no shop UI exists (unchanged
since D8/D4), and unlike every other deferred-reachability choice in
this project, nothing named the gap until this pass found it. Wired
F7-F10 debug keys, the identical shape F5/F6 already established for
`toggleEnforceLocks`/`buyMaxHp`.

**Real gamepad and touch wiring, not left as a keyboard-only feature.**
Parry bound to gamepad face button 3 (both the co-op `pollGamepad` path
and the solo `padAssist` path) — the next free button in the existing
0/1/2 core-action cluster. Touch gets a real, named exception to D10's
otherwise-locked Gesture Surface layout: a new PARRY zone (touching all
seven places a zone requires — the `ZONE` enum, `zoneAt()`'s boundary
math, the start/release dispatch conditions, the refcount object,
`reset()`, and `render()`'s bands + glyph), plus a genuinely new Assist
mode (a new `touchParryAssist` setting) where the EXISTING roll-zone
touch also arms parry when a real telegraph fired recently — additive to
what a zone already means, not a second copy of it.

**VFX/SFX hang off the same Bus-trigger design `80-view.js`/`85-audio.js`
already established — no new presenter mechanism invented.** A dash
flare (an ember-`'spark'`-colored burst, the same rgba the character's
own chest ember and hood rim-light already use, zero new colors); a
parry burst plus a per-player-id hood-glow timer (`this.parryGlow`, the
same shape `this.flash` already has, just keyed per player since a parry
is a per-player moment in co-op) that widens and brightens
`drawFigure()`'s existing rim-light stroke and briefly fills the whole
hood-hollow, fading back to the resting "dark hollow hood" read over ten
frames; two new SFX cues (a noise-based dash whoosh, a square-wave
double-note parry clang).

**Verified against real sim ticks and a real browser, including direct
empirical reproduction of every reported bug before trusting a fix, and
three consecutive full-gate runs before calling the browser suite stable
(L8).** `bash tests/run_all.sh` → **GREEN 2262/2262 across 16 suites**,
`cinder-loop.html` at 407,486 bytes (§4). Every one of the thirteen
findings below was reproduced against the real, shipped functions before
being called a finding, and reconfirmed fixed the same way afterward —
not reasoned about from reading the code alone.

**Six dedicated verification passes, not one.** Three adversarial passes
across the riskiest thirds of the work (Parry's stagger mechanic, the
four enhancements, touch/gamepad wiring), two lighter targeted passes
(VFX/SFX, the base dash/parry mechanic itself), and a sixth: a dedicated
gate-stability re-verification pass, run specifically because §6's own
binding process rule holds that a "stable across repeated runs" claim
requires the repeated runs in the same session that make it, not one
green reading trusted on faith. Thirteen confirmed real findings across
all six, every one fixed and regression-tested:

1. **Parry could be spammed to keep its own window perpetually re-armed,
   bypassing the whiff cooldown entirely.** The trigger's original guard
   only checked `parryCd <= 0` — but `parryCd` only ever gets set on a
   WHIFF (a window that expired unused), so mashing the button every
   tick the window was still counting down re-armed it to the full
   window every single time and the cooldown never once triggered,
   trivializing the whole timing risk. Fixed by also requiring
   `parryWindow <= 0` before a fresh press can arm — a direct consequence
   of the flag-not-state decision above, gotten wrong the first draft.
2. **`Combat.resolveBox`'s own `t.invulnerable()` check ran BEFORE the
   parry branch**, so a player who happened to also be invulnerable for
   an unrelated reason (fresh post-hit iframes, mid-roll, mid-dash) had
   their armed `parryWindow` silently eaten before the parry branch ever
   ran — the stagger, parry's real payoff, lost for a reason that had
   nothing to do with the read itself. Reordered so a correct read
   registers regardless of why the hit would or wouldn't otherwise have
   landed — the second finding directly traceable to the flag-not-state
   boundary.
3. **Reflect could hurt an already-dead shot owner.** `source.owner` is
   set once at `Shot` construction; the enemy that fired it can die by
   ordinary means while its own shot is still live (shots are never
   pruned early when their owner dies). Hurting the stale reference
   re-triggered its own `alive()` check, emitting a SECOND `targetDown`
   for one already-counted kill — real, banked `run.kills`/currency
   double-counted, not a cosmetic duplicate. Fixed with an aliveness
   guard before the hurt call.
4. **Two co-op players simultaneously owning Riposte or Reflect could
   double-hit the one shared enemy/shot-owner** in a single
   `Combat.resolveBox` pass — `stagger()`'s own idempotency guard
   protects the state transition next to it, but did nothing for the
   separate bonus-damage call. Fixed by capturing "was this source
   already staggered/dead" before calling `stagger()`, gating the bonus
   on it — mirrored for Reflect against `Shot.done`.
5. **The four new `buyX()` enhancement purchases had no way to trigger
   them at all** (named above) — wired F7-F10.
6. **Touch Assist's cross-zone release guard was asymmetric**: a roll
   touch releasing correctly checked for a still-held real parry-zone
   touch before clearing the button, but a real parry-zone touch
   releasing never checked whether Assist was still holding it open via
   an active roll touch. Fixed with a dedicated `_assistArmed` flag so
   both directions are symmetric.
7. **Two test fixtures happened to sit exactly on the new touch
   PARRY/ATTACK zone boundary with zero margin**, still correctly
   classifying today but fragile against any future boundary nudge —
   nudged to a safely-interior value before it could silently start
   failing for the wrong reason later.
8. **`rollStart`'s own `bus.emit` payload never carried a `y` field**,
   despite `80-view.js`'s own rollStart handler always reading
   `e.y + CFG.PLAYER_H` — every roll's own start-burst has been spawning
   at `y === NaN`, silently invisible (canvas `fillRect` no-ops on a NaN
   coordinate rather than throwing) since the effect first shipped, with
   nothing in the gate to catch it since no existing test read a
   particle's actual position. A real, live, pre-existing bug from
   BEFORE this session, found while wiring dashStart's own VFX, not by
   the adversarial pass. Fixed alongside adding dashStart's own
   correctly-payloaded event.
9. A CDP key-event-timing test bug: a synthetic keyDown dispatched
   immediately followed by keyUp, with zero real-world delay between
   them, can complete before the next real SIM TICK's own `Pad.update()`
   ever samples `.next` — the press is genuinely invisible to the
   tick-rate-sampled input system, not merely late. Not a game bug, a
   test-methodology one, fixed the same session it was found.
10. A co-op interaction — a non-parrying player sharing a hitbox with a
    player who DOES parry still takes the hit, even though the source is
    about to be staggered by the parry processed just before them —
    investigated and confirmed as the correct, intended behavior (a
    parry protects only the player who timed it, never free AOE
    protection for a whole party), not a bug. Pinned with its own
    regression test specifically so it stays a deliberate choice, not an
    accident a future pass "fixes" into something worse.
11. Several real coverage gaps were closed alongside the above rather
    than left as unverified claims: parry landing despite the attacker's
    own active iframes (mirroring finding 2's own shape, on the reward
    side this time); co-op asymmetric enhancement ownership (one player
    owns Riposte, the other doesn't); buying an enhancement mid-run,
    dying naturally, and respawning naturally (a third, genuinely
    distinct code path from `beginRun()`/`teleport()`); owning both
    Riposte and Reflect at once; a grounded roll's own particles now
    proven finite (not just dashStart's new, correctly-payloaded one);
    and co-op isolation of the parry hood-glow timer (one player's
    successful read must never light up a teammate's hood).
12. **A second, sibling instance of finding 8's own bug, in `step`'s own
    footstep-dust emit.** `30-player.js`'s `bus.emit('step', ...)` never
    carried a `y` field either, despite `80-view.js`'s `step` handler
    always reading `e.y + CFG.PLAYER_H` — every footstep-dust burst has
    been spawning at `y === NaN`, silently invisible, since `step` first
    shipped. Not found by inspection: the new dash-VFX finite-position
    regression sweep (finding 8's own fix) happens to catch whatever
    `'dust'`-kind particles are still alive at that instant, not only the
    dash's own, and a real run earlier in the same browser suite run
    happened to leave one live. Found during this release's own
    dedicated gate-stability pass, not the original VFX/SFX pass. Fixed
    the same way as finding 8, with its own dedicated regression test in
    `verify_arch.js` that drives a real run directly rather than
    depending on incidental capture.
13. **The new airborne-dash browser check was racing against two real
    clocks it hadn't accounted for.** Ember Dash's own committed
    duration is short (14 frames, ~233ms) — checking live
    `state === 'dash'` after a keyDown/sleep/keyUp sequence that itself
    costs several CDP round trips could observe the dash after it had
    already ended, with nothing left for the poll to catch. Fixed by
    also accepting `dashCd > 0` — the dash's own 30-frame cooldown, armed
    the instant it ends, stays true roughly six times longer than the
    state itself. Separately, and more seriously: the roll/dash
    trigger's own real input-buffer window (measured at 8 frames,
    ~133ms, §3) is narrower than a real, loaded machine can reliably
    guarantee a dispatched keypress arrives within — found directly, via
    repeated re-runs under measured heavy CPU contention (up to 51%
    system load, read live during this session's own verification), not
    assumed: the press was sometimes silently dropped, exactly as a real
    player's late input would be. Fixed by wrapping the whole
    jump-then-roll-press attempt in a bounded retry (up to three real
    attempts) rather than loosening the buffer window itself, which is
    gameplay-relevant and correctly out of scope to relax for a test's
    convenience. A separate, pre-existing, and unrelated test-isolation
    gap was found alongside this — a stray real `runEnd` auto-save can
    leave `cinderloop.meta.v1` populated before `verify_render`'s own
    "first boot has no stored meta yet" check later in the same suite —
    not caused by D13's own code, confirmed unrelated by tracing the
    exact payload shape, and deliberately left for its own dedicated
    follow-up rather than folded into this pass.

**What was deliberately not done here.** No shop/hub UI for any of the
four enhancements — F7-F10 are debug keys, the identical "real, tested,
reachable, but nothing yet gives the player a way to trigger it outside
a debug key" shape D4/D8's own weapon-equip and +max HP purchases
already have. A true continuous ember trail across the whole dash (what
the spec's own VFX language implies) is a single burst at the start
instead — every particle effect in this codebase fires off one discrete
Bus event, never a live per-render-frame emission; that pattern doesn't
exist yet and building it was named as a real, separate follow-up, not
folded in here. Weapon-specific or weapon-flavored ability variants
(deferred until weapon equip/switch itself exists, D4's own still-open
gap, unchanged by this session). No third ability beyond Dash and Parry
— a ranged/utility option and a locked-shortcut interact were both
pitched during the brainstorming pass and explicitly not chosen. The
`cinderloop.meta.v1` test-isolation gap named in finding 13 is filed as
its own follow-up, not fixed here, since it is demonstrably unrelated to
D13's own code and fixing it would have meant auditing sections of
`verify_render.js` this release never otherwise touched.

---

## 5q. Room/checkpoint/cinders structure — chained combat rooms, checkpoint healing, alcove-reachability bug fixed (v0.2.18, D14)

**Locked from a real design spec, not built freehand.** The full shape —
the room graph, what "clear" means per room, the checkpoint's four jobs,
the cinders economy, and the one governing constraint everything else
answers to — was written and approved in a dedicated spec
(`docs/superpowers/specs/2026-08-23-room-checkpoint-structure-design.md`)
before any implementation began, the same "scope it, then build it"
discipline D10-D13 already used. That one governing constraint, named in
the spec's own §2: death still ends the whole run exactly as D1 defines
it. Rooms and checkpoints exist for pacing and structure *within* one
run, not as a death-recovery mechanic — a Castlevania/Hollow Knight
bonfire-resume-at-last-checkpoint model was considered and explicitly
rejected in favor of keeping D1's own permadeath identity untouched. What
shipped is a hybrid: real checkpoints, real room structure, real stakes
at the room level, layered onto a run loop that is otherwise identical to
D1's own spawn → clear → boss → die → spend → respawn.

**A level is now a linear chain, reusing what already existed rather
than inventing new machinery.** The single biggest risk-reducer in the
design held up in practice: `Sim.prototype._enterLevel()`/`_enterBoss()`
already tore down one `World` + enemy roster and loaded a fresh one
mid-run — room-to-room transitions reuse that exact shape. A new
`Sim.prototype._enterRoom(roomIndex, gen)` replaces the old
`_enterLevel(gen, levelSeed)` entirely, called once per room
(`CFG.ROOM_COUNT`, 3) before `_enterBoss()` takes over for the fourth.
Each room is one `Gen.generate()` call bounded to `CFG.ROOM_BEATS`
(6, versus a full level's 14) and `CFG.ROOM_PICKUPS` (2, versus 4) —
independently fairness-audited by the *same* D3a machinery, no new
rules, proven at these real smaller dimensions by a dedicated 50-seed
coverage block in `verify_gen.js`. Per-room seeds come from a new
`RunLogic.deriveRoomSeed(levelSeed, roomIndex)` — its own salt
(`0x524F4F4D`, "ROOM"), distinct from `deriveEnemySeed`'s and
`deriveBossSeed`'s, so a level's three rooms, its enemy-placement stream,
and its boss never collide the way this file's own mix32 header already
names as a real, previously-seen bug class. `run.roomIndex` is a new,
hashed field on `Run` (`60-run.js`) recording which room is currently
loaded.

**The checkpoint: two of its spec's four jobs are real, two are
reserved.** `Sim.prototype._onRoomClear()` fires the instant a room's
roster clears (guarded by `_checkpointFired` to once per room, and by
`!justDied` so a room lost to a death on the exact same tick it clears is
never saved) — deliberately independent of whether a player has reached
the room's own exit yet. That separation is load-bearing, not incidental:
it is what gives the player a real, player-paced window to act before the
door itself unlocks (advancing to the next room still requires both
clear AND exit, unchanged from how level→boss always worked).
`_healAtCheckpoint()` heals every alive player for `CFG.CHECKPOINT_HEAL_FRAC` (0.5) of their own MISSING hp, ceil'd — a checkpoint reached
at full health correctly heals nothing rather than wasting a flat number,
and a dead co-op partner is skipped, not phantom-healed.
`_handInCarriedBlueprints()` is D4's existing hand-in logic, extracted
out of `_commitPendingLevel()` into its own method so the SAME
implementation now fires at every checkpoint as well as true run-end —
D4 already defines hand-in as happening "at a transition," and a
checkpoint genuinely is one. The real, worth-naming consequence, per the
spec's own §7d: blueprints become meaningfully easier to cash in, up to
three hand-in opportunities per level instead of one — a genuine
economy shift, named here rather than buried. The other two jobs the
spec's own §7 lists are **not** built yet, named honestly rather than
silently claimed: the save-and-quit resume point (§7b — a room-scoped
persistence key `boot()` would restore into on reload) and the
checkpoint's own narrative beat and SFX cue (§7c's other half — a new
`DIALOGUE.narrator.checkpoint` pool and SFX table entry). The
`'checkpoint'` Bus event this release DOES add carries everything a
future narrative/audio listener would need (`roomIndex`, `healed`,
`handedIn`) — the chokepoint exists, nothing subscribes to it yet.

**The checkpoint alcove and cinders: the tube's own geometry is real and
reachability-audited; the economy it exists to serve is reserved, not
wired.** `Sim.prototype._buildCheckpointAlcove(gen)` stamps a short,
deliberately wide flat SOLID run directly onto a room's own generated
exit platform — widening it outward, one tile at a time, stopping the
instant a column belongs to a different platform rather than skipping
past it — wide enough (`CFG.CHECKPOINT_ALCOVE_TILES`, 10) for two
distinct interaction points (the exit itself and the tube) to coexist
without their radii overlapping, and returns the tube's own `[x,y]`
anchor. This is a real, deliberate divergence from the spec's own §5,
named for the record: §5 described a small set of hand-authored
checkpoint-room layouts, distinct from the fully-procedural combat
rooms; what shipped instead folds the checkpoint directly onto each
combat room's own procedurally-generated exit platform, never
introducing a fifth room type. The tube's own physical placement is real
(`this.tube`, hashed) and the cinders CFG constants and Bus events
(`CFG.CINDER_DROP_CHANCE`/`CINDER_CONVERSION_RATE`,
`'cinderDrop'`/`'cinderLost'`/`'cinderBanked'` in the `EVENTS`
whitelist) are reserved — but the drop/carry/bank mechanic itself has no
implementation: no `player.carriedCinders` field, no drop-on-kill roll,
no bank-at-tube interaction. The economy §8 of the spec describes is
scoped and its scaffolding is in place; it is not yet a system a player
can touch.

**A critical bug found — and found again, adversarially, against the
first fix.** An earlier version of `_buildCheckpointAlcove()` stamped
every column in its widened range SOLID unconditionally, including
columns belonging to some OTHER platform sitting at a different row —
turning that platform's own column into a ceiling directly above it.
When the takeoff platform for the exit's only incoming jump happened to
sit under the stamped row, this silently blocked a path the D3a fairness
audit had already proven legal, in roughly a third of rooms fuzzed.
Fixed once by stopping the stamp at another platform's own column rather
than skipping past it — then, adversarially re-testing that exact fix
rather than trusting it, a second failure mode was found: protecting
only a platform's own literal column was not enough, because a rising
jump drifts sideways WHILE still climbing (this game's horizontal and
vertical motion are fully independent) — a real double-jump climb
clipped a stamped ceiling four real tiles beyond the takeoff platform's
own edge. Fixed with a new `CFG.CLIMB_CLEARANCE_TILES` (8) buffer around
any platform below the exit's own row. Verified with a dedicated
150-seed regression in `verify_run.js`, reusing `H.attemptHop()` (the
same real, multi-strategy physics prover `verify_gen.js`'s own "strongest
claim in the file" already trusts, promoted into `tests/harness.js`
specifically so this test could reuse it rather than fork an
independently-tuned copy) to compare reachability WITH and WITHOUT the
alcove stamped, against a real pre-alcove baseline rather than a flat
"always reachable" expectation: zero rooms newly blocked by the alcove
across the sample.

**Further fixes and closed test-coverage gaps, all with regression
tests.** `loadFallback()` used to leave `this.tube` exactly where the
just-discarded room left it — a stale `[x,y]` from a world that no
longer exists, surviving into the emergency-recovery room; fixed with an
explicit `this.tube = null`, mirroring `_enterBoss()`'s own. `hash()` was
missing `run.roomIndex` and tube-position coverage — both now hashed
directly rather than trusted as a pure re-derivation of already-hashed
state, the same bar `this.exit`'s own hash coverage already holds to.
Six stale `_enterLevel()`/"level" comments were corrected to
`_enterRoom()`/"room". `verify_meta.js`'s own keep-first checkpoint
listener was changed to a counting idiom so it can actually catch a
double-fire regression, not just the first fire. Eight named
test-coverage gaps were closed: the heal math (an odd missing-hp number,
proving the `ceil()`), a checkpoint at full health healing exactly
nothing, the `_checkpointFired` once-per-room guard, co-op multi-partner
healing (the event's own `healed` total is the SUM across every
partner's real share, not just one), a still-dead co-op partner never
healed nor relocated by a checkpoint or a room-advance transition, a
room clearing on the exact tick a player dies never firing a checkpoint
at all, the `ROOM_COUNT` boundary walked room-by-room rather than
convenience-jumped straight to the end, and the tube's own placement
geometry (a static clearance proof plus a 30-seed sample proving the
ideal, non-clamped placement is real reachable code, not dead weight —
measured at 9/30, 30%, at the current tuning, named honestly as the
common case being the clamped fallback rather than assumed rare).

**Verified against real sim ticks (L8).** `bash tests/run_all.sh` →
**GREEN 2365/2365 assertions across 16 suites**, `cinder-loop.html` at
427,064 bytes. The refactor that promoted `attemptHop()`/
`attemptHopWith()` out of `verify_gen.js` into shared `tests/harness.js`
infrastructure (alongside the newly-shared `realKill()`/
`clearRoomAndAdvance()`) is itself a real de-duplication, not incidental
cleanup — the exact "one sibling patched, others missed" risk this
project has already been burned by once, closed before a second,
independently-tuned copy of either could exist.

**What was deliberately not done here.** The cinders economy itself —
drop, carry, and bank — is scoped and reserved (CFG constants, Bus
events, the tube's own real geometry) but has no implementation; a
real, separate follow-up, not a gap discovered later. The checkpoint's
own narrative beat and SFX cue (spec §7c). The save-and-quit resume
point (spec §7b) — nothing about an in-progress run's room position
survives a page reload yet, only permanent meta-progression does, the
same gap that existed before this release. Branching rooms (spec §11,
explicitly deferred in favor of a linear chain). A distinct
hand-authored checkpoint room type (spec §5) — the checkpoint alcove is
stamped onto an ordinary procedural combat room instead, named above as
a real, deliberate divergence.

## 5r. Weapon equip & switch — player.weapon goes live, real input, 3 adversarially-found bugs fixed (v0.2.19, D15)

**The single largest already-built-but-inert surface in the game,
closing at once.** `DATA.WEAPONS` has had four fully real, distinct rows
since v0.2.10 (D9's locked roster) and `Combat.weaponScale` has read
`player.weapon` to pick which two D2 stat colours scale a hit since
v0.2.9 (`40-combat.js:302-313`, fully tested) — but
`Player.prototype.resetTransient` has hardcoded `this.weapon = 'blade'`
(`30-player.js:191`) since v0.2.8, and nothing else in the codebase ever
wrote to that field outside a test. Every one of D9's four weapons, and
D2's entire per-weapon colour-scaling axis, has been dead build-diversity
from a player's own perspective for eleven releases — the masterfile's
own §5 named this gap in these words as recently as v0.2.17. D15
(`docs/superpowers/specs/2026-08-24-weapon-equip-switch-design.md`, the
#1-ranked pitch of the post-D13 roadmap) is that path, and nothing else —
it does not touch generation, enemies, or the checkpoint/cinders work.

**The switch-lockout rule is a correctness requirement, not a feel
choice.** `Combat.step` re-reads `player.weapon` every tick an attack
resolves, to compute `Combat.weaponScale(player)` fresh
(`40-combat.js:335`) — switching weapons mid-swing would silently
reweight an in-flight move's damage using the NEW weapon's stat-colour
pair, not the one the move actually belongs to, a real correctness bug
confirmed by reading the live source, not assumed. `Player.prototype.
canSwitchWeapon` (`30-player.js`) is a one-line `return !this.attack;` —
gating on "no active attack" is both necessary and sufficient, since
`player.weapon` is read nowhere else outside that one path, so no
additional check against roll/dash/ledge state is needed. Proven across
an entire chained combo, not just a single swing: `Combat.start`
repopulates `player.attack` IN PLACE on a chain continuation, never
passing through null, so a coverage gap this session closed proves
refusal holds across the whole `slashA` → `slashB` span, not just
`slashA`'s own duration.

**Two Sim-level methods, the real primitive and its one v1 trigger.**
`Sim.prototype.switchWeapon(playerIndex, weaponId)` validates
`player.alive()`, `canSwitchWeapon()`, and (an adversarially-found
addition, below) `DATA.WEAPON_IDS` membership, before consulting
`MetaLogic.isUnlocked`; sets `player.weapon`; if `playerIndex === 0`,
also writes `this.meta.lastWeapon`; emits `'weaponSwitch'`
(`{playerId, weaponId}`); returns bool — the identical shape `buyMaxHp`
already established (check preconditions, mutate, return success), and
directly unit-testable against an exact target weapon.
`Sim.prototype.cycleWeapon(playerIndex)` is a thin wrapper — the only
trigger v1 actually ships — that advances to the next UNLOCKED id in
`DATA.WEAPON_IDS` (already alphabetically sorted, L4-deterministic),
wrapping around, terminating in at most `ids.length` steps including the
real, reachable case where the current weapon is the only unlocked one
(a safe no-op, never a crash or an infinite loop — proven directly, not
assumed, with `enforceLocks` toggled true via F5 and nothing handed in
yet).

**A real, permanent, player-facing input from day one — unlike every
meta purchase before it.** F5-F10 are debug-key stand-ins specifically
because they are genuine currency *purchases* with no shop UI yet;
switching an already-unlocked weapon is not a purchase, it is a live
gameplay action a player wants constantly, so it gets a real input
immediately: gamepad button 4 (LB, confirmed genuinely unused by
anything else in this codebase by grep) and keyboard `KeyI` (a free key
next to the J/K/L/U cluster, confirmed unclaimed). `05-input.js` gained
`'switchWeapon'` in both `Pad.BUTTONS` and `WINDOW` — copying `parry`'s
exact two-table shape avoids the file's own named silent trap (a
`BUTTONS`-only addition leaves `WINDOW[name]` `undefined` forever, with
`buffered()` always reading false and no error anywhere). The
consume-and-act itself lives in the SIM layer, not the presenter — a new
phase 0 in `Sim.prototype.step`, immediately before the existing "1.
Attack input" phase, so identity resolves before action and a same-tick
switch-then-attack combo correctly swings with the newly-equipped
weapon, zero added latency. `92-menu.js` needed zero changes — confirmed,
not assumed, that the Options screen's rebind row list is already fully
generic over `Pad.BUTTONS.length`, the same "adding a button is a
same-step, two-file change" precedent D13's own Parry addition already
established.

**`meta.lastWeapon` is captured on switch, a genuine simplification over
the original pitch.** Found by reading the actual reset-timing source
rather than assuming the pitch's proposed run-end-capture shape was
correct: if player 0 is the one who died, their own natural respawn
(`deadFrames` reaching 0) already fires `resetTransient()` — wiping
`player.weapon` back to `'blade'` — BEFORE `_commitPendingLevel()`'s own
reset loop (`70-sim.js:902-907`) ever runs. A run-end capture would have
needed a second hook at the moment of death, mirroring
`blueprintLost`'s own timing dance — real, avoidable complexity.
Instead, `meta.lastWeapon` updates immediately, inside `switchWeapon()`
itself, the instant player 0 explicitly switches — no death-timing edge
case exists at all. `Sim.prototype._applyMetaToPlayer` — the one shared
reset hook already called from every reset site — gained one line: reset
to `resetTransient()`'s safe `'blade'` baseline, then layer the
permanent choice back on, the exact two-step every other field in that
method already uses. Only player 0's switches update the shared value —
co-op partners each freely cycle their own live `player.weapon`
independently in any given run, unaffected; a named judgment, not an
oversight, trivially overridable at the cost of one button press.

**Three real production bugs found by a dedicated adversarial-
verification pass (4 lenses, 20 raw findings, 18 confirmed), fixed:**

1. **`meta.lastWeapon` had no matching save hook.** It is a real,
   frequently-mutated, player-facing preference — unlike F5-F10's
   debug-only fields, it can change many times in an ordinary session
   with no run-end anywhere nearby — the exact "mutated in memory but
   silently reverted by an ordinary reload" gap `95-app.js`'s own F5/F6
   comment already documents and was fixed for once. Fixed the same way:
   a `weaponSwitch` → `saveMeta` listener wired in `95-app.js`, gated to
   player 0's own switch. Proven through the real `KeyI` key-dispatch
   path with a real reload in `verify_render.js` — a genuine browser-level
   regression, not just a unit test against the underlying Sim method.
2. **`switchWeapon` never validated `weaponId` against
   `DATA.WEAPON_IDS`, silently accepting garbage.** `MetaLogic.isUnlocked()`
   returns true unconditionally for ANY argument under Stage 1's own
   shipped default (`enforceLocks` false) — every pre-D15 caller only
   ever passed an id already known to be real, so that contract was
   always safe until `weaponId` became the first untrusted argument to
   reach it. Fixed with a real membership check, mirroring
   `MetaLogic.sanitize()`'s own `DATA.WEAPON_IDS` validation.
3. **The new phase-0 consume loop force-ate a buffered press for a dead
   player**, unlike every other action in the game — the ONLY one that
   would have permanently destroyed a buffered press made during a
   player's death animation instead of leaving it to decay or persist on
   its own schedule, unlike attack (`Combat.begin`'s own `!player.alive()`
   check, before its own `pad.buffered()` read) and jump/roll/parry
   (`Player.prototype.update`'s own dead early-return, before every one
   of its own `pad.consume()` calls). Fixed with the identical `alive()`
   guard.

**Roughly ten closed test-coverage gaps beyond the three bugs above,**
proving claims that were true by inspection but previously unproven:
chained-combo refusal across the whole `slashA`→`slashB` span (above);
`cycleWeapon`'s fallback when `player.weapon` is somehow out-of-band
(the same fixture `verify_stats.js`'s own `Combat.weaponScale` fallback
uses); an out-of-range or negative `playerIndex` refused by both
`switchWeapon` and `cycleWeapon` (the first Sim mutators in this
codebase to take a bare `playerIndex` at all); `switchWeapon` still
succeeding mid-boss-fight, and the real `KeyI` input path too (no action
in this codebase is phase-gated, but the claim was unconfirmed until
driven); a buffered `switchWeapon` press surviving hitstop and firing
exactly once when the freeze lifts, matching `verify_arch`'s own
"hitstop does not eat input" contract every other button already holds
to; `Settings.actionForCode('KeyI')` actually mapping to `'switchWeapon'`
through the real production dispatch translation, not just the raw
`DEFAULT_KEYS` config; `_applyMetaToPlayer`'s weapon line exercised
through a genuine restart, a fallback-when-no-longer-unlocked case, and
the natural per-death respawn path specifically (the exact edge case §3's
capture-on-switch design was chosen to avoid needing a second hook for);
`_applyMetaToPlayer`'s own two call sites (`addPlayer()`, `applyMeta()`)
each independently proven to reflect a co-op joiner's or a freshly-loaded
save's current `meta.lastWeapon`; and co-op independence under death and
respawn interleaving — player 1 cycling freely while player 0 is dead and
naturally respawns in the same window, proving the two are structurally
disjoint by a combined test, not just by separate claims about each half.

**Verified against real sim ticks and a real browser (L8).**
`bash tests/run_all.sh` → **GREEN 2505/2505 assertions across 16
suites**, `cinder-loop.html` at 434,920 bytes.

**What was deliberately not done here — named honestly, not silently
dropped.** No HUD indicator of the currently-equipped weapon
(`80-view.js`) — a real, separate presenter gap. No touch-input wiring
for `switchWeapon` (L13 defers this: desktop + gamepad first). No
per-player independent "last weapon" memory — `meta.lastWeapon` is
single and shared, sourced from player 0 only, a named judgment from §3
of the spec. No currency cost anywhere in this feature — both
starting-loadout selection and in-run switching are free, per the
approved design, deliberately not folded into D8's purchase model.

---

## 6. Binding process rule

A claim about build state — present or absent — requires a tool call in the
session that makes it. Absence of evidence in context is not evidence of
absence on disk. Verify before asserting, in both directions.

Three data points now:
- CHAIR documented v0.1–v0.10 of a codebase that did not exist.
- IRON EPOCH later declared real, tested work fabricated.
- CINDER LOOP's own masterfile declared a v0.1.0 "BUILT and GREEN — 171
  assertions ... verified in a real browser" that was not on disk anywhere on
  the machine (2026-07-26). Confirmed by Chris the same day: it had never been
  written. The claim was specific, plausible, internally consistent, and
  false. **Specificity is not evidence.**
