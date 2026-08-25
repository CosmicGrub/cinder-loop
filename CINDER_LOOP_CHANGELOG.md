# CINDER LOOP — CHANGELOG

Newest first. Companion to `CINDER_LOOP_MASTERFILE.md` and
`CINDER_LOOP_VISUAL_MAP.html`.

---

## v0.2.20 — 2026-08-25 — The summon primitive: elite Caller, ctx.addEnemy bridge, 5 adversarially-found bugs fixed (D16)

**GREEN: 2600/2600 assertions across 17 suites (one NEW suite this
release — `verify_caller`, 86/86 assertions across 21 parts).
`cinder-loop.html`, 444,677 bytes.** A fifth enemy attack primitive,
`attack: 'summon'`, is real and reachable for the first time since D9
locked the regular four-template roster. D9's own framing already
priced this: "the engine knows four movement/attack primitives... a
fifth archetype costs one new primitive" (`45-enemy.js`'s own header).
D16 is that primitive, realized as exactly one elite template — the
Caller (`src/56-caller.js`, a new file numbered right after
`55-boss.js`) — kept OUT of `DATA.ENEMIES`/`ENEMY_IDS` the same way
Kilnwarden is (`verify_enemy.js:32` still asserts
`DATA.ENEMY_IDS.length === 4`).

**D16 (`docs/superpowers/specs/2026-08-24-summon-primitive-design.md`,
ranked #2 of the post-D13 roadmap, right behind D15), locked before a
line of code existed.** `Sim.prototype.addEnemy` (`70-sim.js`) already
existed, real and tested, producing a collision-safe, deterministic
per-instance seed from position — the primitive landed nearly free on
top of already-proven infrastructure, not new machinery.

**The mechanism: one new telegraph case, one new post-commit state, one
new ctx bridge.** `Enemy.prototype.doTelegraph`'s attack switch
(`45-enemy.js:396`) gains a sibling to the existing `'shoot'` case:
`case 'summon': this.callIn(ctx); this.enter('summon'); break;`.
`Enemy.prototype.callIn` (`45-enemy.js:452`) is the real primitive —
guarded by `this.summonsUsed >= m.summonMax` at entry, a safe no-op
once the Caller's lifetime cap is spent rather than a crash or a
re-summon past the cap. It calls `ctx.addEnemy(m.summonId, spawnX,
spawnY)` once per `m.summonCount`, incrementing `this.summonsUsed` — a
new field zeroed in `resetTransient()` (`45-enemy.js:147`) alongside
every other per-life field, enforcing a LIFETIME cap across the whole
encounter, not a per-cast budget. `ctx.addEnemy` (`70-sim.js:87`) is a
two-line mirror of the existing `ctx.addShot`, delegating to
`Sim.prototype.addEnemy` unchanged. `'summon'` gets its own real
post-commit state, `Enemy.prototype.doSummon` (`45-enemy.js:502`) — a
near-copy of `'shoot'`'s own `doShoot()` body — rather than skipping
straight to `'recover'`: a deliberate correction over the original
pitch, which proposed `this.enter('recover')` directly after the call
fires. Every OTHER primitive in the game gives the player a real
post-commit punish window; skipping it for `'summon'` would have made
the Caller the only primitive in the game with zero vulnerability the
instant it commits. Summoned adds are excluded from room-clear/kill-
currency by the SAME existing `_levelRosterIds` mechanism (`70-sim.js`)
that already excludes the boot-path practice Dummy — no new exclusion
logic needed. Reachable for v1 only via a new debug key, `F11`
(`95-app.js:533`, the next free slot after F2-F10) — real
procedural-generation placement (`50-gen.js`/`RunLogic.placeEnemies`)
stays explicitly out of scope, a larger follow-up that would touch
D3a's own fairness-audit pipeline. Manually playtested this session in
a real browser build: F11 spawns a real Caller, driven forward it
reaches telegraph then summon and spawns a real Ashwalker.

**A dedicated adversarial-verification pass (4 lenses, 17 raw findings,
21 confirmed after consolidating duplicates) found and fixed five real
production bugs:**

1. **The spawn offset was terrain-blind.** The original design's own
   claim — "no terrain-probing needed, gravity resolves it" — was false
   when the offset spawn point landed inside solid terrain, e.g. a
   room's own boundary walls, which span the full room height.
   `moveY()` (`25-body.js:77`) only snaps a falling body out of the
   TOPMOST solid row it overlaps; a deeply-embedded spawn re-triggers
   that same snap every tick and climbs upward through solid rock
   instead of falling, eventually clearing the top and free-falling
   back down — reproduced end-to-end against the real classes (climbed
   from y=586 to y=-24 over ~20 ticks in one repro). Fixed with a new
   `ctx.rectSolid` bridge (`70-sim.js:95`, delegating to
   `World.prototype.rectSolid`, `20-world.js:85`) that checks the REAL
   summoned template's own footprint, not a guess, and falls back to
   the Caller's own already-valid position when the offset spot is
   embedded.
2. **The per-index spawn spacing (`i * 12`) wasn't scaled by
   `lockFacing`.** Dead in practice since the shipped template ships
   `summonCount: 1`, but a real formula bug: for a Caller facing left,
   successive spawns would have folded back toward, and eventually
   past, the Caller instead of fanning further away. Fixed to scale
   both the base offset and the fan-out term by `this.lockFacing`
   symmetrically.
3. **`summonsUsed` was excluded from `Sim.prototype.hash()`**, directly
   contradicting its own `resetTransient()` comment's explicit claim of
   parity with `activeMove`/`phase` (both of which ARE hashed) — two
   sims differing only in that field would have hashed identically
   forever, defeating the exact class of desync `hash()` exists to
   catch. Fixed by adding it to the per-target hash tuple
   (`70-sim.js:1326`).
4. **`CFG.CALLER_SUMMON_OFFSET` was a permanently-dead fallback
   expression.** The CFG key was never actually defined anywhere in
   `00-core.js`, so the `|| 24` fallback always fired. Fixed by moving
   the offset onto the Caller template itself as `summonOffset: 24` —
   the same D7 "content is data" reasoning `summonId`/`summonCount`/
   `summonMax` already follow, since this is elite-specific placement,
   not an engine-wide tunable.
5. **F11 had no guard against repeated/held-key spawning.** Unlike F2's
   own guard on the identical shape (`sim.players.length < 2`) or
   F7-F10's self-guarding `buyX()` purchases, a held F11 (real OS
   key-repeat) could spawn an unbounded stream of full-hp Callers.
   Fixed with a live-count cap — `sim.targets.filter(...).length < 3` —
   mirroring F2's own guard pattern.

**Also fixed (comment-accuracy, no behavior change):** `45-enemy.js`'s
own file header still said "four primitives" and didn't name `'summon'`
even though this diff added it in that very file — updated to five.
`56-caller.js`'s own header, in an earlier draft, falsely claimed
`45-enemy.js`'s header already named `'summon'` — corrected once the
header fix above landed. `doRecover()`'s predecessor-state comment
(`45-enemy.js:609`) omitted `'summon'` from its enumerated list of
states that must have "fully resolved" before a transition is
requested — added. The `summonId: 'ashwalker'` rationale ("shortest
reach/telegraph of the four") was only half true against the real data
in `10-data.js` — ashwalker genuinely has the shortest reach (26px, vs.
emberrush's 130 / kilnspitter's 200 / wickmoth's 62) but NOT the
shortest telegraph (wickmoth's 18 is lower than ashwalker's 20) —
corrected in both the source comment and the design spec.

**Roughly nine closed test-coverage gaps beyond the five bugs above,**
all with regression tests in the new `tests/verify_caller.js` (mirrors
`verify_boss.js`'s shape at smaller scale, 86 assertions across 21
parts): two-player fairness for the Caller's own commit AND,
independently, for a freshly-summoned add (named as risk #5 in the
implementation plan, shipped unaddressed in the first pass — proving
the add runs its own `acquire()`, not an inherited copy of the Caller's
target, by moving the Caller's own target out of the add's much shorter
sight range); the `callIn()` missing-ctx defensive guard branch;
killing the Caller after it has already summoned leaves the summoned
add alive and fully functional (the "no parent/child link" claim,
previously asserted only in prose, now proven directly in the opposite
kill order from the existing roster-exclusion coverage); the
`summonCount > 1` loop body (both facing directions' spacing, and the
mid-loop `summonMax` cap-break when the cap isn't a multiple of the
count); the summoned Ashwalker proven to be a real, fully-functional
enemy — it can acquire, telegraph, and actually land a hit through
`Combat.resolveBox`, not just tid-match; `dangerous()` stays false
during `'recover'` too, not just `'telegraph'`/`'summon'`; the
hash-coverage regression for `summonsUsed` itself (doubles as bug 3's
own regression test); and a near-ledge spawn-safety sanity check — the
other half of "no terrain-probing needed," proving an open-air offset
spawn falls and settles sanely with no NaN/stuck physics.

**Verified against real sim ticks and a real browser (L8).**
`bash tests/run_all.sh` → **GREEN 2600/2600 across 17 suites**.

**What was deliberately not done here — named honestly, not silently
dropped (spec §9, unchanged).** No real procedural-generation placement
(`50-gen.js`/`RunLogic.placeEnemies`) — debug-key-only for v1. No
re-summoning after a summoned add dies — `summonMax` is a lifetime cap
on the Caller's own casts, not a "keep N alive" budget. No parent/child
lifecycle link between the Caller and its summons — killing the Caller
does not despawn what it already summoned. No spawn-in VFX/SFX for the
summoned add appearing. The `'summon'` verb is not retrofitted onto any
regular `DATA.ENEMIES` template. No second elite reusing this same
primitive with different numbers — this spec covers exactly one
template, the Caller.

---

## v0.2.19 — 2026-08-24 — Weapon equip & switch: player.weapon goes live, real input, 3 adversarially-found bugs fixed (D15)

**GREEN: 2505/2505 assertions across 16 suites (no new suite this
release — every gain landed inside existing files: verify_meta,
verify_platform, and verify_render all grew).
`cinder-loop.html`, 434,920 bytes.** `player.weapon` goes live for the
first time since v0.2.8 — `Sim.prototype.switchWeapon` is the real,
validated primitive and `Sim.prototype.cycleWeapon` is the real
input-facing wrapper a permanent gamepad-button-4/`KeyI` binding drives
from day one, consumed in the SIM layer, not the presenter. D9's four
weapons and D2's entire per-weapon colour-scaling axis have been dead
build-diversity from a player's own perspective for eleven releases —
this is that gap, closed.

**D15 (`docs/superpowers/specs/2026-08-24-weapon-equip-switch-design.md`,
the #1-ranked pitch of the post-D13 roadmap), locked before a line of
code existed.** The switch-lockout rule is a correctness requirement,
not a feel choice: `Combat.step` re-reads `player.weapon` every tick an
attack resolves, to compute `Combat.weaponScale(player)` fresh
(`40-combat.js:335`) — switching mid-swing would silently reweight an
in-flight move's damage using the NEW weapon's stat-colour pair, not the
one the move actually belongs to, confirmed by reading the live source,
not assumed. `Player.prototype.canSwitchWeapon` is a one-line
`return !this.attack;` — gating on "no active attack" is both necessary
and sufficient, since `player.weapon` is read nowhere else outside that
one path. Proven across an entire chained combo, not just a single
swing: `Combat.start` repopulates `player.attack` IN PLACE on a chain
continuation, never passing through null, so refusal must hold — and now
provably does — across the whole `slashA` → `slashB` span, not just
`slashA`'s own duration.

**Two Sim-level methods, the real primitive and its one v1 trigger.**
`Sim.prototype.switchWeapon(playerIndex, weaponId)` validates
`player.alive()`, `canSwitchWeapon()`, and (an adversarially-found
addition, below) `DATA.WEAPON_IDS` membership, before consulting
`MetaLogic.isUnlocked`; sets `player.weapon`; if `playerIndex === 0`,
also writes `meta.lastWeapon`; emits `'weaponSwitch'`
(`{playerId, weaponId}`); returns bool — the identical shape `buyMaxHp`
already established. `Sim.prototype.cycleWeapon(playerIndex)` is a thin
wrapper — the only trigger v1 ships — advancing to the next UNLOCKED id
in `DATA.WEAPON_IDS` (already alphabetically sorted, L4-deterministic),
wrapping around, terminating in at most `ids.length` steps including the
real, reachable case where the current weapon is the only unlocked one
(a safe no-op, never a crash or infinite loop — proven directly with
`enforceLocks` toggled true via F5 and nothing handed in yet, not
assumed safe).

**A real, permanent, player-facing input from day one — unlike every
meta purchase before it.** F5-F10 are debug-key stand-ins specifically
because they are genuine currency *purchases* with no shop UI yet;
switching an already-unlocked weapon is not a purchase, it is a live
gameplay action, so it gets a real input immediately: gamepad button 4
(LB, confirmed genuinely unused anywhere in this codebase by grep) and
keyboard `KeyI` (a free key next to the J/K/L/U cluster, confirmed
unclaimed). `05-input.js` gained `'switchWeapon'` in both `Pad.BUTTONS`
and `WINDOW` — copying `parry`'s exact two-table shape avoids the file's
own named silent trap (a `BUTTONS`-only addition leaves `WINDOW[name]`
`undefined` forever, `buffered()` always reading false, no error
anywhere). The consume-and-act itself lives in the SIM layer, not the
presenter — a new phase 0 in `Sim.prototype.step`, immediately before the
existing "1. Attack input" phase, so identity resolves before action and
a same-tick switch-then-attack combo correctly swings with the
newly-equipped weapon, zero added latency. `92-menu.js` needed zero
changes — confirmed, not assumed, that the Options screen's rebind row
list is already fully generic over `Pad.BUTTONS.length`, the same
"adding a button is a same-step, two-file change" precedent D13's own
Parry addition already established.

**`meta.lastWeapon` is captured on switch, a genuine simplification over
the original pitch.** Found by reading the actual reset-timing source
rather than assuming the pitch's proposed run-end-capture shape was
correct: if player 0 is the one who died, their own natural respawn
(`deadFrames` reaching 0) already fires `resetTransient()` — wiping
`player.weapon` back to `'blade'` — BEFORE `_commitPendingLevel()`'s own
reset loop (`70-sim.js:902-907`) ever runs. A run-end capture would have
needed a second hook at the moment of death, mirroring `blueprintLost`'s
own timing dance — real, avoidable complexity. Instead, `meta.lastWeapon`
updates immediately, inside `switchWeapon()` itself, the instant player 0
explicitly switches — no death-timing edge case exists at all.
`Sim.prototype._applyMetaToPlayer` gained one line: reset to
`resetTransient()`'s safe `'blade'` baseline, then layer the permanent
choice back on, the exact two-step every other field in that method
already uses. Only player 0's switches update the shared value — co-op
partners each freely cycle their own live `player.weapon` independently
in any given run, unaffected; a named judgment, not an oversight,
trivially overridable at the cost of one button press.

**A dedicated adversarial-verification pass (4 lenses, 20 raw findings,
18 confirmed) found and fixed three real production bugs:**

1. **`meta.lastWeapon` had no matching save hook.** It is a real,
   frequently-mutated, player-facing preference — unlike F5-F10's
   debug-only fields, it can change many times in an ordinary session
   with no run-end anywhere nearby — the exact "mutated in memory but
   silently reverted by an ordinary reload" gap `95-app.js`'s own F5/F6
   comment already documents and was fixed for once. Fixed the same way:
   a `weaponSwitch` → `saveMeta` listener wired in `95-app.js`, gated to
   player 0's own switch. Proven through the real `KeyI` key-dispatch
   path with a real reload in `verify_render.js` — a genuine
   browser-level regression, not just a unit test against the underlying
   Sim method.
2. **`switchWeapon` never validated `weaponId` against
   `DATA.WEAPON_IDS`, silently accepting garbage.** `MetaLogic.
   isUnlocked()` returns true unconditionally for ANY argument under
   Stage 1's own shipped default (`enforceLocks` false) — every pre-D15
   caller only ever passed an id already known to be real, so that
   contract was always safe until `weaponId` became the first untrusted
   argument to reach it. Fixed with a real membership check, mirroring
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
chained-combo refusal across the whole `slashA`→`slashB` span (named
above); `cycleWeapon`'s fallback when `player.weapon` is somehow
out-of-band (the same fixture `verify_stats.js`'s own `Combat.
weaponScale` fallback uses); an out-of-range or negative `playerIndex`
refused by both `switchWeapon` and `cycleWeapon` (the first Sim mutators
in this codebase to take a bare `playerIndex` at all); `switchWeapon`
still succeeding mid-boss-fight, and the real `KeyI` input path too (no
action in this codebase is phase-gated, but the claim was unconfirmed
until driven); a buffered `switchWeapon` press surviving hitstop and
firing exactly once when the freeze lifts, matching `verify_arch`'s own
"hitstop does not eat input" contract every other button already holds
to; `Settings.actionForCode('KeyI')` actually mapping to `'switchWeapon'`
through the real production dispatch translation, not just the raw
`DEFAULT_KEYS` config; `_applyMetaToPlayer`'s weapon line exercised
through a genuine restart, a fallback-when-no-longer-unlocked case, and
the natural per-death respawn path specifically (the exact edge case the
capture-on-switch design was chosen to avoid needing a second hook for);
`_applyMetaToPlayer`'s own two call sites (`addPlayer()`, `applyMeta()`)
each independently proven to reflect a co-op joiner's or a
freshly-loaded save's current `meta.lastWeapon`; and co-op independence
under death and respawn interleaving — player 1 cycling freely while
player 0 is dead and naturally respawns in the same window, proving the
two are structurally disjoint by a combined test, not just by separate
claims about each half.

**Verified against real sim ticks and a real browser (L8).**
`bash tests/run_all.sh` → **GREEN 2505/2505 across 16 suites**.

**What was deliberately not done here — named honestly, not silently
dropped.** No HUD indicator of the currently-equipped weapon
(`80-view.js`) — a real, separate presenter gap. No touch-input wiring
for `switchWeapon` (L13 defers this: desktop + gamepad first). No
per-player independent "last weapon" memory — `meta.lastWeapon` is
single and shared, sourced from player 0 only, a named judgment from the
spec. No currency cost anywhere in this feature — both starting-loadout
selection and in-run switching are free, per the approved design,
deliberately not folded into D8's purchase model.

---

## v0.2.18 — 2026-08-23 — Room/checkpoint/cinders structure: chained combat rooms, checkpoint healing, alcove-reachability bug fixed (D14)

**GREEN: 2365/2365 assertions across 16 suites (no new suite this
release — every gain landed inside existing files: verify_gen,
verify_run, and verify_meta all grew).
`cinder-loop.html`, 427,064 bytes.** A level is now a chain of
`CFG.ROOM_COUNT` (3) procedurally-generated combat rooms plus the
existing boss room, each entered through a new
`Sim.prototype._enterRoom(i)` modeled directly on `_enterLevel()`/
`_enterBoss()`. A checkpoint fires the instant a room's roster clears —
independent of reaching the room's own exit — and really heals and hands
in carried blueprints on the spot. A critical bug that could make an
audited-fair room's own exit physically unreachable was found and fixed
in two rounds, verified across 150 seeds.

**Locked from a real design spec, not built freehand**
(`docs/superpowers/specs/2026-08-23-room-checkpoint-structure-design.md`).
The one governing constraint the whole feature answers to, named in the
spec's own §2: death still ends the whole run exactly as D1 defines it.
Rooms and checkpoints exist for pacing and structure *within* one run,
not as a death-recovery mechanic — a Castlevania/Hollow Knight
bonfire-resume model was considered and explicitly rejected in favor of
keeping D1's own permadeath identity untouched.

**A level is now a linear chain, reusing what already existed rather
than inventing new machinery.** `Sim.prototype._enterLevel()`/
`_enterBoss()` already tore down one `World` + enemy roster and loaded a
fresh one mid-run — room-to-room transitions reuse that exact shape. The
new `_enterRoom(roomIndex, gen)` replaces `_enterLevel()` entirely,
called once per room before `_enterBoss()` takes over for the fourth.
Each room is one `Gen.generate()` call bounded to `CFG.ROOM_BEATS` (6,
versus a level's 14) and `CFG.ROOM_PICKUPS` (2, versus 4) —
independently fairness-audited by the *same* D3a machinery, proven at
these real smaller dimensions by a dedicated 50-seed coverage block.
Per-room seeds come from a new `RunLogic.deriveRoomSeed`, its own salt
distinct from `deriveEnemySeed`'s and `deriveBossSeed`'s so a level's
three rooms, its enemy-placement stream, and its boss never collide.

**The checkpoint: two of its spec's four jobs are real, two are
reserved.** `Sim.prototype._onRoomClear()` fires the instant a room's
roster clears (guarded to once per room, and against a room clearing on
the exact tick a player dies), deliberately independent of reaching the
exit — that separation is load-bearing: it gives the player a real,
player-paced window to act before the door unlocks.
`_healAtCheckpoint()` heals every alive player for half their own
MISSING hp, ceil'd — full health heals nothing, a dead partner is
skipped, not phantom-healed. `_handInCarriedBlueprints()` is D4's
existing hand-in logic, extracted so the SAME implementation now fires
at every checkpoint as well as true run-end — up to three hand-in
opportunities per level instead of one, a genuine economy shift named
here rather than buried. Not built yet, named honestly: the
save-and-quit resume point (spec §7b) and the checkpoint's own narrative
beat and SFX cue (spec §7c's other half). The `'checkpoint'` Bus event
this release adds carries everything a future listener would need
(`roomIndex`, `healed`, `handedIn`) — the chokepoint exists, nothing
subscribes to it yet.

**Cinders: the tube's own geometry is real and reachability-audited; the
economy it exists to serve is reserved, not wired.**
`Sim.prototype._buildCheckpointAlcove(gen)` stamps a wide flat SOLID run
onto a room's own generated exit platform, wide enough for the exit and
the tube to coexist without their interaction radii overlapping, and
returns the tube's own `[x,y]` anchor — a real, deliberate divergence
from the spec's own §5, named for the record: §5 described hand-authored
checkpoint-room layouts; what shipped folds the checkpoint onto each
combat room's own generated exit platform instead, never introducing a
fifth room type. The tube's own physical placement is real and hashed;
`CFG.CINDER_DROP_CHANCE`/`CINDER_CONVERSION_RATE` and the
`cinderDrop`/`cinderLost`/`cinderBanked` Bus events are reserved — but
the drop/carry/bank mechanic itself has no implementation: no
`player.carriedCinders` field, no drop-on-kill roll, no bank-at-tube
interaction.

**A critical bug found — and found again, adversarially, against the
first fix.** An earlier version of `_buildCheckpointAlcove()` stamped
every column in its widened range SOLID unconditionally, including
columns belonging to some OTHER platform at a different row — turning
that platform's own column into a ceiling directly above it, silently
blocking a path the D3a fairness audit had already proven legal in
roughly a third of rooms fuzzed. Fixed once by stopping the stamp at
another platform's own column — then, adversarially re-testing that
exact fix, a second failure mode was found: protecting only a platform's
own literal column was not enough, because a rising jump drifts sideways
WHILE still climbing (this game's horizontal and vertical motion are
fully independent) — a real double-jump climb clipped a stamped ceiling
four real tiles beyond the takeoff platform's own edge. Fixed with a new
`CFG.CLIMB_CLEARANCE_TILES` (8) buffer. Verified with a dedicated
150-seed regression, reusing the same real, multi-strategy physics
prover `verify_gen.js`'s own "strongest claim in the file" already
trusts (promoted into shared `tests/harness.js` so this test could reuse
it rather than fork an independently-tuned copy) to compare reachability
WITH and WITHOUT the alcove stamped, against a real pre-alcove baseline:
zero rooms newly blocked by the alcove across the sample.

**Further fixes and closed test-coverage gaps, all with regression
tests.** `loadFallback()` used to leave a stale `this.tube` from a
world that no longer exists surviving into the emergency-recovery room;
fixed with an explicit null, mirroring `_enterBoss()`'s own. `hash()`
was missing `run.roomIndex` and tube-position coverage; both now hashed
directly. Six stale `_enterLevel()`/"level" comments corrected to
`_enterRoom()`/"room". `verify_meta.js`'s own keep-first checkpoint
listener changed to a counting idiom so it can catch a double-fire
regression. Eight named test-coverage gaps closed: the heal math, a
full-health checkpoint healing nothing, the once-per-room guard, co-op
multi-partner healing (the event's own `healed` total is the SUM across
every partner's real share), a still-dead partner never healed nor
relocated, a room clearing on the exact tick a player dies never firing
a checkpoint, the `ROOM_COUNT` boundary walked room-by-room rather than
convenience-jumped, and the tube's own placement geometry (a static
clearance proof plus a 30-seed sample proving the ideal placement is
real reachable code, not dead weight).

**Verified against real sim ticks (L8).** `bash tests/run_all.sh` →
**GREEN 2365/2365 across 16 suites**. The refactor that promoted
`attemptHop()`/`attemptHopWith()` out of `verify_gen.js` into shared
`tests/harness.js` infrastructure (alongside newly-shared `realKill()`/
`clearRoomAndAdvance()`) is itself a real de-duplication — the exact
"one sibling patched, others missed" risk this project has already been
burned by once, closed before a second, independently-tuned copy of
either could exist.

**What was deliberately not done here.** The cinders economy itself —
drop, carry, and bank — is scoped and reserved but has no
implementation; a real, separate follow-up, not a gap discovered later.
The checkpoint's own narrative beat and SFX cue (spec §7c). The
save-and-quit resume point (spec §7b) — nothing about an in-progress
run's room position survives a page reload yet. Branching rooms (spec
§11, explicitly deferred in favor of a linear chain). A distinct
hand-authored checkpoint room type (spec §5) — the checkpoint alcove is
stamped onto an ordinary procedural combat room instead.

---

## v0.2.17 — 2026-08-23 — Ember Dash and Parry: abilities, enhancements, full input/VFX/SFX wiring (D13)

**GREEN: 2262/2262 assertions across 16 suites (no new suite this
release — every gain landed inside existing files: verify_move,
verify_combat, verify_enemy, verify_boss, verify_meta, verify_platform,
verify_touch, verify_audio, verify_render, and verify_arch all grew).
`cinder-loop.html`, 407,486 bytes.** Two new character-level abilities —
Ember Dash (an airborne reuse of the Roll button) and Parry (a new
input that negates an incoming hit and staggers the attacker) — plus
four flat-cost meta-currency enhancements, real gamepad/touch wiring for
both, and VFX/SFX reacting to all of it. Both abilities are available
from the very first spawn, D4-style unlock gating deliberately not used
(a locked choice from the spec's own brainstorming pass, not a default).

**D13, locked from a real design spec, not built freehand.** The full
mechanic design — Ember Dash's shape, Parry's negate+stagger contract,
the touch Manual/Assist split, the four enhancements — was brainstormed
and locked in a dedicated spec
(`docs/superpowers/specs/2026-08-24-abilities-character-design.md`)
*before* any implementation began, the same two-step "scope it, then
build it" discipline D10/D11/D12 already used. One genuine open fork
survived into implementation planning itself: two independent Plan
agents converged on every other shape but split on whether Parry should
be its own committed player state (mirroring Roll) or a lightweight
timed flag layered on top of whatever state the player is already in.
Put to the user directly, with the deciding argument stated plainly — a
state-based Parry folded into `invulnerable()` (which also gates hazard
damage) would silently grant lava/spike immunity for the whole window,
not just protection against the one attack it was timed against — and
the user chose the flag. `player.parryWindow`/`parryCd` never touch
`this.state`; negation is a dedicated check inside `Combat.resolveBox`,
correct by construction rather than inherited from a state a hazard
check also happens to read.

**Ember Dash costs zero new input.** The SAME buffered `roll` press
that grounds into a roll airborne-triggers a dash instead — context
evaluated at *consumption* time, not press time, so a roll press
buffered while still airborne but not consumed until after landing
correctly fires an ordinary ground roll, never a stale dash. 14 frames,
77px (measured, not derived from CFG — the same L8 discipline every
prior movement number in this project already holds to), full i-frames
throughout, a 30-frame cooldown. The one real structural trap: `finish()`'s
own end-of-tick state-reclassifier already excluded `'roll'` from
overwriting itself back to `'idle'`/`'fall'` every tick — dash needed
the identical exclusion added, or the whole state would have silently
collapsed back to `'fall'` one tick after starting.

**Parry needed one real new capability from `45-enemy.js`: a way to
interrupt an attack mid-flight.** Named as the single riskiest piece of
the whole spec before a line of code existed. `Enemy.prototype.stagger()`
is idempotent (co-op means two players' own parry windows can land
against the same shared enemy hitbox in one `Combat.resolveBox` pass),
clears the enemy's own in-flight attack so nothing lands late, and
enters a new `'staggered'` state with its own fixed `CFG.STAGGER_FRAMES`
duration — deliberately NOT whatever `recover` window the interrupted
move happened to have, so a fast move's own tiny recovery can't
undercut the punish window Riposte's own bonus hit depends on — before
handing off to the EXISTING `recover` → `chase`/`phaseTransition`
branching, so a staggered boss still gets its own phase-transition
eligibility check rather than skipping it. `dangerous()` already
excluded every state but `strike`/`charge`/`dive`, so a staggered enemy
reads as harmless for free. Scope named honestly, not hidden: V1 stagger
only fires for melee/charge/dive contact — `shoot`/`zone` attacks don't
resolve through `Combat.resolveBox` with the enemy itself as `source`
(a shot's own damage comes from a separately-spawned `Shot`; a zone's
from a direct hazard-rect check), so a base parry does not negate or
stagger either. 12-frame window, 30-frame cooldown *only on a natural
whiff* — a successful read costs nothing, rewarding the timing rather
than punishing success the same way a miss is punished.

**Four flat-cost enhancements, the identical shape `buyMaxHp` (D8)
already established — check `.ok`, write `meta.currency`, flip a flag,
live-top-up every currently-alive player.** Dash Extra Charge (20
currency) is a genuinely SEPARATE banked charge from the ordinary
cooldown, refreshed on ground contact only — deliberately not mirroring
`airJumps`' own wall/ledge generosity, preserving dash's "limited air
resource" tension. Dash Extended I-Frames (15) layers a residual
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
fired it — deliberately NOT a second live projectile flying back through
the world (`Shot.prototype.update()` has no existing notion of an
enemy-facing target set to route a truly reflected shot through, and
building one was a real, much larger, and unnecessary change for the
same "sends it back at the attacker" promise). A real, named disclosure
gap closed along the way: the four new `Sim.prototype.buyX()` methods
had no way to trigger them at all — no shop UI exists (unchanged since
D8/D4), and unlike every other deferred-reachability choice in this
project, nothing named the gap. Wired F7–F10 debug keys, the identical
shape F5/F6 already established for `toggleEnforceLocks`/`buyMaxHp`.

**Real gamepad and touch wiring, not left as a keyboard-only feature.**
Parry bound to gamepad face button 3 (both the co-op `pollGamepad` path
and the solo `padAssist` path) — the next free button in the existing
0/1/2 core-action cluster. Touch gets a real, named exception to D10's
otherwise-locked Gesture Surface layout: a new PARRY zone (touching all
seven places a zone requires — the `ZONE` enum, `zoneAt()`'s boundary
math, the start/release dispatch conditions, the refcount object,
`reset()`, and `render()`'s bands + glyph), plus a genuinely new
Assist mode (a new `touchParryAssist` setting) where the EXISTING
roll-zone touch also arms parry when a real telegraph fired recently —
additive to what a zone already means, not a second copy of it. The one
real cross-zone bug an adversarial pass caught here: the Assist-armed
parry's own release guard only protected one direction (a roll touch
releasing correctly checked for a still-held real parry-zone touch
before clearing the button, but a real parry-zone touch releasing never
checked whether Assist was still holding it open via an active roll
touch) — fixed with a dedicated `_assistArmed` flag so both directions
are symmetric.

**VFX/SFX hang off the same Bus-trigger design 80-view.js/85-audio.js
already established — no new presenter mechanism invented.** A dash
flare (an ember-`'spark'`-colored burst, the same rgba the character's
own chest ember and hood rim-light already use, zero new colors); a
parry burst plus a per-player-id hood-glow timer (`this.parryGlow`, the
same shape `this.flash` already has, just keyed per player since a
parry is a per-player moment in co-op) that widens and brightens
`drawFigure()`'s existing rim-light stroke and briefly fills the whole
hood-hollow, fading back to the resting "dark hollow hood" read over ten
frames; two new SFX cues (a noise-based dash whoosh, a square-wave
double-note parry clang). A real, live, pre-existing bug was found
*while wiring this*, not by the adversarial pass: `rollStart`'s own
`bus.emit` payload had never carried a `y` field, despite `80-view.js`'s
own rollStart handler always reading `e.y + CFG.PLAYER_H` — every roll's
own start-burst has been spawning at `y === NaN`, silently invisible
(canvas `fillRect` no-ops on a NaN coordinate rather than throwing)
since the effect first shipped, with nothing in the gate to catch it
since no existing test read a particle's actual position. Fixed
alongside adding dashStart's own correctly-payloaded event. A second,
unrelated bug surfaced in the test *infrastructure* while proving the
fix: a synthetic CDP keyDown dispatched immediately followed by keyUp,
with zero real-world delay between them, can complete before the next
real SIM TICK's own `Pad.update()` ever samples `.next` — the press is
genuinely invisible to the tick-rate-sampled input system, not merely
late. Every other real key press already elsewhere in that suite happens
to have a natural gap around it (a poll loop, an existing sleep); this
was the first one dispatched back-to-back with nothing else in between,
which is what surfaced it.

**Three dedicated adversarial-verification passes, run the same way as
every feature this project ships, across the riskiest thirds of this
work (Parry's stagger mechanic, the four enhancements, and touch/gamepad
wiring), plus two lighter targeted passes (VFX/SFX, and the base
dash/parry mechanic itself), plus a sixth: a dedicated gate-stability
re-verification pass, run specifically because the masterfile's own §6
binding process rule holds that a "stable across repeated runs" claim
requires the repeated runs in the same session that make it, not one
green reading trusted on faith — thirteen confirmed real findings
across all six, every one fixed and regression-tested, not just
reasoned about:**

1. **Parry could be spammed to keep its own window perpetually re-armed,
   bypassing the whiff cooldown entirely.** The trigger's original guard
   only checked `parryCd <= 0` — but `parryCd` only ever gets set on a
   WHIFF (a window that expired unused), so mashing the button every
   tick the window was still counting down re-armed it to the full
   window every single time and the cooldown never once triggered,
   trivializing the whole timing risk. Fixed by also requiring
   `parryWindow <= 0` before a fresh press can arm.
2. **`Combat.resolveBox`'s own `t.invulnerable()` check ran BEFORE the
   parry branch**, so a player who happened to also be invulnerable for
   an unrelated reason (fresh post-hit iframes, mid-roll, mid-dash) had
   their armed `parryWindow` silently eaten before the parry branch ever
   ran — the stagger, parry's real payoff, lost for a reason that had
   nothing to do with the read itself. Reordered so a correct read
   registers regardless of why the hit would or wouldn't otherwise have
   landed.
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
   them at all** (named above) — wired F7–F10.
6. **Touch Assist's cross-zone release guard was asymmetric** (named
   above) — fixed with `_assistArmed`.
7. **Two test fixtures happened to sit exactly on the new touch
   PARRY/ATTACK zone boundary with zero margin**, still correctly
   classifying today but fragile against any future boundary nudge —
   nudged to a safely-interior value before it could silently start
   failing for the wrong reason later.
8. **`rollStart`'s missing `y` payload field** (named above).
9. A CDP key-event-timing test bug (named above) — not a game bug, a
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
    than left as unverified claims: parry landing despite the
    attacker's own active iframes (mirroring finding 2's own shape, on
    the reward side this time); co-op asymmetric enhancement ownership
    (one player owns Riposte, the other doesn't); buying an enhancement
    mid-run, dying naturally, and respawning naturally (a third,
    genuinely distinct code path from `beginRun()`/`teleport()`); owning
    both Riposte and Reflect at once; a grounded roll's own particles
    now proven finite (not just dashStart's new, correctly-payloaded
    one); and co-op isolation of the parry hood-glow timer (one
    player's successful read must never light up a teammate's hood).
12. **A second, sibling instance of finding 8's own bug, in `step`'s own
    footstep-dust emit.** `30-player.js`'s `bus.emit('step', ...)` never
    carried a `y` field either, despite `80-view.js`'s `step` handler
    always reading `e.y + CFG.PLAYER_H` — every footstep-dust burst has
    been spawning at `y === NaN`, silently invisible, since `step` first
    shipped. Not found by inspection: the new dash-VFX finite-position
    regression sweep (finding 8's own fix) happens to catch whatever
    `'dust'`-kind particles are still alive at that instant, not only
    the dash's own, and a real run earlier in the same browser suite run
    happened to leave one live. Fixed the same way as finding 8, with
    its own dedicated regression test that drives a real run directly
    rather than depending on incidental capture.
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
    leave `cinderloop.meta.v1` populated before the "first boot has no
    stored meta yet" check later in the same suite — not caused by D13's
    own code, and deliberately left for its own dedicated follow-up
    rather than folded into this pass.

**Verified against real sim ticks and a real browser, including direct
empirical reproduction of every reported bug before trusting a fix
(L8).** Every one of the thirteen findings above was reproduced against
the real, shipped functions before being called a finding, and
reconfirmed fixed the same way afterward — not reasoned about from
reading the code alone. `bash tests/run_all.sh` → **GREEN 2262/2262
across 16 suites**, confirmed stable across three consecutive full-gate
runs taken back to back at the end of this release, the browser suite
included — not a single green reading taken on faith, and not claimed
until the two real timing findings above (12 and 13) were both traced to
root cause and fixed, not papered over with a longer sleep.

**What was deliberately not done here.** No shop/hub UI for any of the
four enhancements — F7–F10 are debug keys, the identical "real, tested,
reachable, but nothing yet gives the player a way to trigger it outside
a debug key" shape D4/D8's own weapon-equip and +max HP purchases
already have. A true continuous ember trail across the whole dash (what
the spec's own VFX language implies) is a single burst at the start
instead — every particle effect in this codebase fires off one discrete
Bus event, never a live per-render-frame emission; that pattern doesn't
exist yet and building it was named as a real, separate follow-up, not
folded in here. Weapon-specific or weapon-flavored ability variants
(deferred until weapon equip/switch itself exists, D4's own still-open
gap, unchanged by this session). No third ability beyond Dash and
Parry — a ranged/utility option and a locked-shortcut interact were both
pitched during the brainstorming pass and explicitly not chosen.

---

## v0.2.16 — 2026-08-17 — Synthesized SFX: Web Audio engine, real mute toggle (D11)

**GREEN: 1957/1957 assertions across 16 suites (verify_audio is a new
suite, 303 assertions — 191 from the initial build, +108 from the
adversarial pass's own numeric-synthesis-math coverage, +4 from a
mutation-tested regression against the pass's most severe finding;
verify_arch +6, registering `85-audio.js` into `APP_FILES`, the identical
mechanism `82-narrative.js` used at v0.2.15; verify_platform +36 (the
real Sound row and `muted` field, plus the pass's own label/cross-field/
wrap-around coverage); verify_render +16, then +2 more from the pass).
`cinder-loop.html`, 360,611 bytes.** `85-audio.js` exists: a synthesized
Web Audio SFX engine — fifteen cues, two synthesis primitives (`tone` and
`noise`), off the same Bus trigger design narrative (v0.2.15) already
established, per D11's own explicit scoping — plus a real, player-facing
mute toggle in Settings/Menu.

**No judged panel — D11 already scoped this file precisely enough that
what remained were implementation questions, the identical shape
D2/wall interaction/slam impact/narrative each used.** This session
(user prompt: "start 85-audio.js") chose the one real fork D11 left
open: SFX only, no music/ambience — a real, named simplification, the
same "hard to get right without iterative listening" risk that kept
flask charges/backpack slot out of v0.2.14.

**Two synthesis primitives, matched to what the content table actually
needs, not a generic synthesizer.** `tone` — one or more oscillator +
gain-envelope notes, each with its own `delay`, optionally pitch-swept
via `sweepTo` — and `noise` — a filtered buffer, for a whoosh a pitched
oscillator can't produce. Fifteen of the Bus's ~30 registered events get
a cue, a deliberate curated subset, the same partial-coverage precedent
`80-view.js` already set for a presenter reaction layer.

**The `Math.random` ban applies to presenter code too — confirmed by
grep before writing the noise generator, not after.** `verify_arch`'s own
source scan ("screenshots have to be comparable frame to frame") covers
this file the same as `80-view.js`/`82-narrative.js`. `SFXPlayer` owns
its own local seeded RNG, never `sim.rng` — the identical reasoning
narrative's own line-picking RNG already uses.

**One design choice closes two problems: the `AudioContext` is lazily
constructed, never at boot.** Solves the browser autoplay-gesture policy
(a context built eagerly would just start suspended) and Node
testability (`opts.ctx` injects a fake context, the same precedent
`stubCanvas()` set for View) at once.

**The mute toggle is real Settings/Menu UI, not a debug key — unlike
v0.2.14's own F5/F6.** "Can I turn the sound off" is ordinary settings
territory, the same shape `reducedMotion`/`showMeter` already occupy.

**Caught before the adversarial pass even started, by this session's own
new browser coverage:** `boot()`'s menu `onChange` callback reassigned
its own closure-local `settings` on every change but never wrote it back
onto `app.settings` — a stale `window.CINDER_APP.settings` for anyone
reading it from outside `boot()` itself. Fixed with one line alongside
the pre-existing `app.showMeter` sync.

**A dedicated adversarial pass, run the same way as every feature this
session, stayed eight-for-eight.** Five lenses, fourteen candidate
findings, thirteen confirmed by an independent skeptical re-check, one
correctly refuted. Six were real code defects, fixed: **(1)** the most
severe — `play()`/`unlock()` had zero `try`/`catch` around real
`AudioContext` node creation, and `Bus.emit` has none either; a
real-but-degraded context throwing from `createOscillator`/etc. escaped
uncaught into `95-app.js`'s own `sim.step()` crash-recovery path,
silently resetting the player's ENTIRE CURRENT RUN over what should have
been an optional presenter-layer failure. Fixed with `try`/`catch`
around both, degrading to silence exactly like the "no Web Audio support
at all" branch already does. **(2)** gamepad-only sessions never called
`audio.unlock()` at all — every SFX cue silently inaudible for a fully-
supported input method's whole session, since a Gamepad API button press
does not grant the browser's own "sticky activation" the way
keydown/pointerdown/touchstart do. Best-effort mitigation applied (fires
on the edge-detected Start-button press too), named honestly as a real,
currently unresolved PLATFORM limitation for a truly gamepad-only
session, not silently claimed as fully fixed. **(3)** the menu's
`onChange` unconditionally reverted an F3 debug-meter toggle the instant
the player changed any UNRELATED setting — fixed by only re-deriving
`app.showMeter` when it actually changed. **(4)** a stale doc comment
claiming the noise primitive backs `wallJump` (it has always shipped as
`type: 'tone'`) — corrected the prose. **(5)** `playNoise()` had no
attack ramp, unlike `playTone()` — a real step-discontinuity click risk
on every noise cue's first sample; given the same ~5ms linear attack.
**(6)** `subscribe()`'s idempotency guard was keyed on "have I ever
subscribed," not "to THIS bus" — a second call against a different `Bus`
silently wired nothing; currently unreachable, fixed defensively anyway
to fail loudly instead. One more confirmed finding, `Settings.
withDefaults()` (dead code that silently discarded its own argument),
was deleted rather than fixed.

**Six more confirmed findings were real test-coverage gaps, not code
bugs, closed with new regression coverage.** The highest-value one:
`verify_audio.js`'s own fake `AudioContext` never recorded the actual
numeric/string arguments passed to it, so three independent mutations
(a hardcoded gain, a disabled pitch sweep, a flattened waveform) all
sailed through 191 assertions completely undetected — closed with a
richer `instrumentedCtx()` fixture checking every real cue's actual
synthesis math against the content table. Also closed: the noise
buffer's bipolar-ness was only proven by "some sample is non-zero";
`pointerdown`/`touchstart` (two of `unlock()`'s three real-gesture
entries) had zero coverage anywhere in the gate; the Sound row's cursor
position was never checked against its own label; `muted`'s independence
from corrupted sibling fields was untested; `move()`'s wrap-around was
only ever driven on the 2-row root screen, never the real 12-row Options
one.

**A confirmed prompt-injection attempt during the pass itself, refused
and reported.** Two independent verifier agents, and this session
directly afterward, each received a tool result formatted as a fake
"system-reminder" claiming an unauthorized file edit had already
happened and instructing silence about it. All three refused, re-
verified the real file against an independent checksum, and reported the
attempt — an actual, not hypothetical, test of this project's
instruction-source-boundary rule. No code was affected.

**Verified against real sim ticks and a real browser, including a real
mutation check (L8).** `verify_audio` grew from 191 to 303 across the
build and the pass — full detail in §4/§5o. `verify_platform` grew from
137 to 173. `verify_render` grew from 118 to 134. The most significant
fix (the `play()`/`unlock()` exception guard) was mutation-tested: the
`try`/`catch` removed in a scratch copy, all four of its own new
regression assertions failed exactly as expected, the real fix restored
and reconfirmed byte-identical and green. `bash tests/run_all.sh` →
**GREEN 1957/1957 across 16 suites.**

**What was deliberately not done here.** No volume slider, a binary mute
only. No music or ambience layer. Still no dedicated boss bark voice
(v0.2.15's own named gap, unaffected). A truly gamepad-only session
unlocking a real `AudioContext` remains a genuine, unresolved browser-
platform limitation.

---

## v0.2.15 — 2026-08-17 — Narrative: the Kilnkeeper, dialogue trigger + text-box render (D11/D12)

**GREEN: 1596/1596 assertions across 15 suites (verify_narrative is a new
suite, 65 assertions — 54 from the initial build, +11 from the dedicated
adversarial pass below; verify_arch +6 from registering `82-narrative.js`
into `APP_FILES`'s source-scanning purity check — a smaller, different
growth than a `SIM_FILES` registration causes, since `APP_FILES` is
scanned, not loaded and purity-tested the same mechanical way; verify_render
+5, a real browser section proving a real `telegraph` on the real bus
produces a real displayed, composited line, plus one regression from the
pass below). `cinder-loop.html`, 339,424 bytes.** `82-narrative.js` exists:
the Kilnkeeper, a recurring narrator
voice heard at run milestones (a level starting, the boss door, a boss
win, a death), and short per-template enemy barks fired the instant an
attack telegraphs — both D11's own two named pools, both real and
rendering in the live game for the first time.

**Both D-series decisions were already fully locked (D11 2026-08-15, D12
the same day) — no judged panel, no new scoping question, the identical
"the design was already specified, only implementation questions
remained" shape D2/wall interaction/slam impact each used.** D11's own
dependency (`85-audio.js`, still not built) was named explicitly as
sharing this file's trigger design rather than inventing a second one
later — unaffected by this session, still open. D12's own dependencies
(`55-boss.js`, `60-run.js`) both existed already, closing the one real gap
D12 had named at scoping time ("depends on... what 'the final boss' and
'a run milestone' even mean").

**Zero new Bus events, zero sim-file changes — the strongest reading of
D11's own "chosen text has zero effect on sim state."** Milestones
(a level starting, entering the boss, a boss win, a death) are detected by
polling `sim.run.phase`/`levelSeed`/`runsCompleted` and each player's own
`state` once per RENDERED FRAME, comparing against the last-seen value —
the identical "remember, compare, act on the edge" technique
`Sim.prototype._stepRun()` already uses for `justDied`/`justRespawned`,
just applied from the presenter side, reading only, writing nothing. The
one Bus subscription this file needs (`telegraph`, for barks) already
existed — 45-enemy.js's own fairness-rule commit moment turns out to
already be the natural "an enemy is announcing itself" beat a bark
belongs on. Not one line of any SIM file changed to make this feature
exist — `60-run.js`, `70-sim.js`, `30-player.js`, `45-enemy.js` are all
byte-for-byte what they were before this session.

**A death always wins over a same-tick boss-victory reading — the
identical priority `_stepRun()` itself already committed to, reused
rather than re-derived.** A fatal boss trade (dying to Kilnwarden on the
exact tick that would otherwise read as a victory) correctly shows the
death line, never the hollow victory one.

**The reveal (D12) is SESSION-scoped, a real, named simplification, not
silently built as something bigger.** It fires once, the first time
`sim.run.phase` becomes `'boss'` — not persisted across a reload. A
persisted version would need a real Sim/Meta method to mark it (L5),
exactly the kind of sim-side surface this file is designed to need none
of; named here rather than quietly assumed away.

**The writing itself, not just the wiring.** The Kilnkeeper's lines are
deliberately double-voiced — read on a first encounter as a warm, faintly
odd guide ("the kiln has never once run cold," "you'll come back
tempered, not broken"); read again once the reveal has landed, the SAME
lines describe exactly what the Kilnkeeper has been doing to the player
the whole time. The reveal pool makes the second reading explicit ("The
kiln was never behind me. I am the kiln."), and the boss-victory/death
pools were written to still hold up under either reading, not just the
first one — the mechanism D12 asks for ("every line heard earlier
rereads") is a writing constraint on the content, not something requiring
extra code, and was treated as one. Original expression throughout (L1):
no line borrows a phrase, beat, or specific image from another work; the
kiln/ash/ember/wick vocabulary is this project's own, already established
by the roster and boss names these lines are written to sit beside.

**Verified against real sim ticks and a real browser (L8).** `verify_narrative`
(54, new suite): every narrator pool and every real enemy id's bark pool
is non-empty; a fresh `Narrative` shows nothing and fires nothing spurious
on the very next frame with nothing changed; inert until the run loop
itself is (mirrors `Sim`'s own gate exactly); a real levelSeed change
fires `levelStart`; the FIRST boss entry fires the reveal, not the
ordinary line, and flips `revealed`; a SECOND boss entry (already
revealed) fires the ordinary `bossEntry` line instead; a boss->level
transition with `runsCompleted` advancing fires `bossVictory`; a death
fires the death line; a same-tick fatal-boss-trade reads as death, never
victory; simultaneous multi-player deaths still fire exactly one line, not
one per player; a real `telegraph` fires a bark from the matching
template's own pool, tagged distinctly from a narrator line; an unknown
template id never throws and shows nothing; same-seed picks reproduce
identically (L4) while a different seed genuinely diverges; TTL counts
down by real elapsed ms and expires to null, never lingering negative;
`wrap()` proven against a real measured width (a dedicated fake ctx, not
the shared stub's own always-zero `measureText`) to actually split a long
line into more than one drawn call; `render()` draws nothing with nothing
to show and something real once a line is set. `verify_render` grew from
113 to 117: `window.CINDER_APP.narrative` exists in the real built game; a
real `telegraph` emitted on the real bus produces a real displayed bark
line through the real production wiring; the text box actually composites
into a real captured frame. `bash tests/run_all.sh` → **GREEN 1584/1584
across 15 suites** (this number describes the state before the dedicated
adversarial pass below; see its own tally for the final total).

**A dedicated adversarial-verification pass, run the same way as every
feature this session, stayed seven-for-seven — five lenses, six real
findings, every one confirmed by an actual run, not reasoned about.** Two
were live, currently-reachable production bugs; three were real but
confirmed NOT reachable through today's actual `95-app.js` wiring, fixed
defensively anyway (the same "real, latent gap, fixed rather than left as
a landmine" call §5m's own `opts.meta` finding already made); one was a
real, already-understood consequence of an existing, accepted design
tradeoff, documented rather than changed.

1. **A boss-phase death could be reported as a triumphant `bossVictory`
   line once the commit landed.** The file's own "a death always wins"
   priority only ever held WITHIN one `update()` call — but Sim actually
   stages a boss-phase death across several real frames (the death fires
   its own tick; the respawn countdown runs quietly; the commit — the
   tick `run.phase`/`levelSeed`/`runsCompleted` actually flip — lands
   several frames later, by which point the player's own `state` has
   already cycled back to alive). By the commit frame, a real boss-phase
   death and a real boss victory are field-for-field identical in
   everything this file is allowed to read. Fixed with a new
   `_deathDuringBoss` flag, set the moment a death happens while
   `run.phase === 'boss'` and checked (then cleared) at the commit —
   suppressing the victory line for an encounter a death already
   explained, without touching a genuine no-death victory.
2. **The Kilnkeeper's own dialogue RNG was never given a real seed in
   production.** `new Narrative(sim)` — the one and only real call site,
   in `95-app.js` — never passed a second argument, so every real boot,
   ever, silently fell back to the class's own hardcoded default (`1`).
   Every player, every launch, heard the exact same first bark and the
   exact same first narrator line, forever — the opposite of what "a
   seeded RNG this file owns itself" was supposed to deliver. Fixed by
   passing `{ seed: seed }`, reusing `boot()`'s own real (`Date.now()`- or
   `?seed=`-derived) value — which also means a debug session now
   reproduces its dialogue alongside its level, a genuine bonus, not just
   a fix.
3. **The reveal could be skipped if `Narrative` were ever constructed
   already mid-boss.** Confirmed NOT reachable through the real
   `95-app.js` ordering (which always constructs it fresh, in level phase)
   — but nothing in the class itself prevented a future caller from doing
   so, and the constructor's own baseline would have erased the
   "entering boss" edge the reveal depends on entirely. Fixed by
   baselining as not-boss whenever construction happens mid-boss, so the
   very next `update()` still reads it as a fresh entry.
4. **`render()`'s panel geometry had no defensive clamping.** A sub-floor
   `cssW` could drive a negative width straight into `fillRect()`; a tall
   enough panel at a short `cssH` could push the whole box off-canvas —
   worst case, invisibly swallowing the one line this system exists to
   land. Confirmed NOT reachable today (`95-app.js`'s own `fit()`
   unconditionally floors the real viewport to 320×240 before every
   frame, and every real `DIALOGUE` line stays comfortably inside that
   floor's own bounds) — clamped anyway.
5. **`subscribe()` had no idempotency guard.** A second call on the same
   instance/bus would have registered a second closure, making one real
   `telegraph` fire the bark logic — and consume the RNG stream — twice.
   Confirmed the constructor is the only real call site today; guarded
   anyway.

**A sixth finding, investigated and correctly read as an already-accepted
consequence, not a new bug.** A `Gen.generate()` failure mid-run (the
exact class §5l's own finding 5 already fixed the FREEZE for) still
permanently retires the run loop into `60-run.js`'s own exit-less,
boss-less practice sandbox — the same shape the BOOT-time fallback has
always had, deliberately. Since `82-narrative.js` correctly mirrors the
run loop's own inert gate, it goes quiet for the rest of the session too,
including swallowing the death line for the exact death that triggered
the crash. Not fixed: this is the same tradeoff already made and accepted
when the freeze itself was fixed (a permanently-safe sandbox, not a
crash), and the one genuinely new piece — the swallowed death line — is a
single missed flavor moment in what `95-app.js`'s own comment already
frames as a rare, defensive-only path ("if some future CFG edit ever
pushes generation somewhere genuinely impossible"). Named here rather than
silently left for a future reader to rediscover.

**Verified against real sim ticks and a real browser, including a real
mutation check (L8).** `verify_narrative` grew from 54 to 65: the
multi-frame boss-phase-death sequence above no longer shows `bossVictory`
(and a genuine no-death victory still does, and a clean SECOND encounter
after a suppressed first one still fires normally — proving the fix
didn't overcorrect); a `Narrative` constructed already mid-boss still
delivers the reveal on that same encounter; a second `subscribe()` call
never double-registers; sub-floor dimensions never produce a negative
panel width or an off-canvas panel. `verify_render` grew from 117 to 118:
`narrative.rng` is proven seeded from the real boot seed, not the class
default, checked against the PRISTINE instance before anything could
mutate the stream. The boss-phase-death fix was additionally
mutation-tested: the suppression was disabled in a scratch copy, the new
assertion failed exactly as expected, and the real fix was restored and
reconfirmed green. `bash tests/run_all.sh` → **GREEN 1596/1596 across 15
suites.**

**What was deliberately not done here.** `85-audio.js` still does not
exist — D11's own text explicitly scopes it to share this file's trigger
design rather than invent a second one, so the actual synthesis work
remains fully open. The reveal is session-scoped, not persisted (named
above). No dialogue queue — a second trigger firing while one line is
still showing REPLACES it rather than waiting its turn, a real, named
simplification (a queue would need its own timing/priority rules this
pass did not take on). Barks fire off every `telegraph`, including the
boss's own — `Kilnwarden` currently has no dedicated entry in
`DIALOGUE.barks` (it is not a `DATA.ENEMIES` roster member, D9's own
exclusion), so a boss telegraph fires nothing rather than throwing;
whether the boss deserves its own bark voice is a content question, not
an engineering one, and was not taken on this pass.

---

## v0.2.14 — 2026-08-17 — Meta progression: persistence, blueprints, +max HP (D4/D8)

**GREEN: 1520/1520 assertions across 14 suites (verify_meta is a new suite,
191 assertions — 176 from the initial build, +15 from the dedicated
adversarial pass below; verify_arch +9 from registering `65-meta.js` into
`harness.js`'s `SIM_FILES`, the same mechanical growth every prior module
registration has caused; verify_render +15, real F5/F6 key-dispatch
persistence coverage added by the same pass). `cinder-loop.html`, 319,430
bytes.** `65-meta.js`
exists: currency now survives a page reload, blueprints drop from real
kills, carry the same "lose on death, hand in at a transition" risk D4
always named, and a real +max HP purchase (D8) permanently grows a
player's health pool across every future run.

**Scope, decided explicitly, not silently — the user chose "core loop
only" from three options.** D8 names four things meta currency buys:
"flask charges, +max HP, backpack slot, starting-loadout choice." Only
+max HP and D4's own blueprint-unlock loop are built here. Flask charges
and a backpack slot are real, named parts of D8's list and are
deliberately NOT built — both are genuinely new mechanics with zero
existing engine surface to hang off (no potion/consumable system exists
anywhere in this codebase, and "backpack" names an undefined capacity
concept), unlike +max HP (a direct reuse of D2's own "+HP" vocabulary one
layer up) or blueprint unlocks (which map onto the four already-built,
D9-locked weapons rather than inventing new content). The same two-step
"scope it, then build it" discipline D11/D12 already used, not a silent
narrowing.

**No judged panel — D4/D8 already dictated the shape closely enough that
the open questions were implementation ones, the same reasoning D2/wall
interaction/slam impact skipped one for.** The real design work was
reading D4 precisely rather than assuming: "lose on death" and "hand in at
a transition" are the run's own TWO endings (D1 itself names death as one
of exactly two ways a run ends), not two sequential steps of one outcome.
A player whose OWN death ends the run never reaches a transition alive —
so they always lose their carried blueprint, never hand it in. Only a
SURVIVING player (a boss victory with no death, or a living co-op partner
while a teammate's death ends the run) ever hands one in. This reading
was caught by writing the test suite itself, not derived on paper first —
see below.

**A real bug in this session's OWN test suite, caught by actually running
it — not a bug in the shipped code.** The test suite's first draft assumed
a player who dies AND whose death triggers the run-end would ALSO hand in
their carried blueprint at that same commit. Running it showed otherwise:
`_commitPendingLevel()`'s hand-in loop correctly found nothing to hand in,
because the dying player's OWN natural respawn (`Player.update()`'s
`resetTransient()` call, which fires earlier in the SAME tick) had already
cleared `carriedBlueprint` — exactly D4's own "lose on death," working as
designed. The CODE was right; three tests' own assumptions were wrong.
Rewritten to use a boss-victory (no-death) transition for the "does an
affordable/unaffordable hand-in resolve correctly" cases, and a co-op
scenario that tests BOTH outcomes at once — one player dies (loses
theirs), the survivor hands in (unlocks theirs) — at the identical commit,
proving the asymmetry directly rather than assuming it.

**Currency: two numbers on purpose, not a bug.** `run.currency`
(within-session, reset by `beginRun()`) and `meta.currency` (permanent,
survives a restart AND a reload) both grow by the same `earned` amount at
every commit — "total earned this session" and "current spendable wallet"
are both legitimate, both real. `RUN_SPEND_STUB_COST`, D8's own
placeholder from `60-run.js`'s landing, is retired outright now that a
real price exists — keeping a second, always-succeeding spend at the same
call site once the real one lands would just be dead weight.

**Verified against real sim ticks, not read as correct (L8).** `verify_meta`
(176, new suite): `sanitize()` never throws across nineteen corrupted-
payload shapes (a bare string, wrong version, negative/NaN/Infinity
currency, an unknown weapon id smuggled into `unlocked`, a deeply nested
garbage blob) and always yields a currency/maxHpBonus that's a finite
non-negative number, an `enforceLocks` that's strictly boolean, and
`unlocked` entries that are only ever real, `true`-valued weapon ids;
`serialize`/`deserialize` round-trip every field, including malformed JSON
text falling back to defaults rather than throwing; `isUnlocked()` proven
both ways (Stage 1's default vs. a real `enforceLocks` gate);
`rollBlueprintDrop()` never drops when nothing is locked (zero RNG draws
consumed, not a wasted one), same-seed-same-sequence (L4), and narrows
correctly to exactly the one weapon still locked once the rest are marked
unlocked; both spend functions proven to reuse `RunLogic.spend` directly,
byte-identical output, not a re-derivation. Real Sim integration: a fresh
sim owns a real `Meta` instance with Stage 1's own default; `buyMaxHp()`
refuses when unaffordable, succeeds and grows the CURRENT player's hp AND
maxHp immediately when affordable, stacks across repeated purchases, and
survives a genuine `beginRun()` restart; a co-op joiner immediately
reflects whatever the current bonus already is; a real kill under
`enforceLocks` eventually drops a real, still-locked weapon id (found by
brute-forcing seeds, not asserted from the formula); carry capacity is
respected across many more real kills once already carrying; Stage 1's
default never drops anything across a full real roster clear; a hazard/
combat death fires `blueprintLost` at the exact moment of death (while the
field is still readable, before the natural respawn clears it several
ticks later) and never unlocks what was lost; a boss victory with no death
hands in an affordable blueprint (spending exactly the unlock cost on top
of that run's own real, roster-size-derived earnings) and correctly
refuses an unaffordable one (blueprint still consumed, currency left
exactly where the sweep-in put it, never negative, never charged); the
co-op asymmetry above, proven with real per-player event payloads, not
just aggregate counts; `hash()` coverage confirmed by direct divergence
checks for `meta.currency`/`maxHpBonus`/`enforceLocks`/`carriedBlueprint`;
determinism (L4) across a full scripted clear/boss/blueprint-drop/hand-in
loop hashes byte-identical between two identically-seeded runs.
`bash tests/run_all.sh` → **GREEN 1490/1490 across 14 suites** (this
number, and every number above, describes the state before the dedicated
adversarial pass below; see its own tally for the final total).

**A dedicated adversarial-verification pass, run the same way as every
feature this session, stayed seven-for-seven.** Five independent lenses
(the blueprint's own end-to-end lifecycle, currency/spend/persistence,
determinism/hash coverage, the F5/F6 debug keys and their interactions,
and the production boot path) — the identical methodology `60-run.js`'s
own pass used (construct and actually RUN a real reproduction before
reporting anything, report clean areas honestly too). Four real findings,
two of them the same bug found independently by two different lenses —
strong convergent evidence, not a coincidence:

1. **F5/F6 — currently the ONLY exposed way to spend meta currency or
   flip the lock toggle — never persisted their own result.** `saveMeta()`
   was wired to exactly one hook, the `runEnd` bus event, which only fires
   from a real D4 transition. `buyMaxHp()`/`toggleEnforceLocks()` (95-app.js's
   F5/F6 handlers) mutate `this.meta` directly through real, tested Sim
   methods but never triggered a save — a real purchase or toggle sat
   correctly mutated in memory, then silently reverted on an ordinary
   reload if the player closed the tab before the run happened to reach
   its next transition. Given no shop UI exists, this was the ONLY
   currently-reachable path a player spends currency through at all, and
   it lost real progress on the single most ordinary interaction (reload)
   this file's own header says currency should survive. Fixed by saving
   immediately after each debug key's own mutation, not deferring to the
   next incidental transition. Caught with a real, driven browser
   repro — real F6 key dispatch via CDP, a real reload, reading the actual
   post-reload state — and confirmed by real mutation: the fix was
   disabled in a scratch copy, five new browser assertions failed exactly
   as expected, the real fix was restored and reconfirmed green.
2. **The `runEnd` event's own `handedIn` list silently dropped a consumed
   blueprint when its weapon happened to already be unlocked by an earlier
   carrier in the same commit loop.** Two surviving players carrying a
   blueprint for the identical still-locked weapon at one transition: the
   spend/unlock logic itself was already correct (no double-spend, exactly
   one `blueprintUnlocked` event, both carry slots correctly emptied) —
   but `handedIn.push(weaponId)` only fired inside the two branches that
   actually touched currency, silently omitting the second carrier's own
   consumed blueprint from the event payload. Fixed by recording every
   consumed carry up front, before either branch, matching what the loop's
   own comment already committed to for the unaffordable-spend case.
3. **`opts.meta`/`applyMeta()` adopted a live reference, not a copy.**
   Every other place a `Meta` object gets produced (`sanitize()`/
   `defaults()`) is careful to hand back an independent copy — `verify_meta.js`
   itself already asserted this for `defaults()`. The Sim constructor and
   `applyMeta()` did not: two Sims constructed from (or `applyMeta()`'d
   with) the identical object ended up sharing `this.meta`, `unlocked`
   included, so a purchase through one Sim's real API silently mutated the
   other's future ticks. Unreachable from the single production call site
   today (`boot()` calls `loadMeta()` fresh every time), but a real,
   latent API-shape gap contradicting the file's own stated single-owner
   discipline. Fixed by routing both through `MetaLogic.sanitize()`, which
   already builds a fresh copy (and validates it) from whatever it's
   handed.
4. **`applyMeta()`'s own comment named a call site that does not exist.**
   It claimed `95-app.js` calls it after `loadMeta()` at boot; `boot()`
   actually supplies the loaded meta directly as the constructor's
   `opts.meta` and never calls `applyMeta()` anywhere — the exact "a
   comment that overclaims coverage" shape this project's adversarial
   passes keep finding, just aimed at a call site instead of a test.
   Corrected, and the method itself — genuinely zero test coverage before
   this — got a real regression alongside the reference-copy fix above.

**A fifth issue, self-found while fixing the above, not from the
adversarial pass itself.** `verify_meta.js`'s own header comment claimed
95-app.js's localStorage glue was "covered for real by verify_render" —
true in intent, false in fact: `verify_render.js` had zero references to
meta or its storage key anywhere. Rather than just correct the claim, the
coverage itself was added — a new "meta persistence" section in
`verify_render.js`, the identical shape the existing Settings-persistence
section already uses, driven through real F5/F6 key dispatch (not a
direct `sim.meta` poke) so it proves the actual player-facing path finding
1 was found through, not just the underlying spend logic. This is also
what finding 1's own mutation test ran against.

**Verified against real sim ticks and a real browser, including real
mutation checks, not read as correct (L8).** `verify_meta` grew from 176
to 191: two Sims constructed from the same caller-supplied object no
longer share it (or its `unlocked` object); a purchase through one never
touches the other's independent copy; `applyMeta()` itself is now
exercised directly, including that mutating the caller's own object
afterward does not reach back into the sim; two surviving co-op partners
carrying the identical still-locked weapon correctly unlock it exactly
once while `runEnd.handedIn` now reports both consumed carries.
`verify_render` grew from 98 to 113: a first boot has no stored meta; a
real F6 key press spends real currency and grants the permanent bonus
immediately, saves to localStorage immediately (not on the next `runEnd`),
and survives a real reload, with a freshly booted player actually
reflecting it; F5 proven the identical way; a corrupted meta payload does
not prevent boot and falls back to a fresh, zeroed state. `cdp.js` gained
F5/F6 key-code mappings (`vk` 116/117, matching F4's own established
shape) to make the real key dispatch possible at all. `bash tests/run_all.sh`
→ **GREEN 1520/1520 across 14 suites.**

**What was deliberately not done here.** Flask charges and a backpack slot
(named above). No shop/hub UI exists — `buyMaxHp()`/`toggleEnforceLocks()`
are real, tested Sim methods reachable today only via debug keys (F5/F6),
the same "the data and wiring are real and tested, but nothing yet gives
the player a UI to trigger it" shape weapon equipping has had since D4 was
first locked. A blueprint dropped in the world is an instant grant on
kill, not a separate spatial pickup entity a player has to walk over — a
real, named simplification (the same shape D2's own stat-pickup pairing
simplification took in §5h): building a whole new spatial-entity type for
this pass's own scope was not taken on. Starting-loadout choice (D8) has
no consumer yet either — weapon equipping/switching still has no
player-facing path at all (D4, unchanged by this session), so an unlocked
weapon has no way to actually become what a run starts with; the unlock
STATE is real and tested regardless, the identical shape
`RUN_SPEND_STUB_COST` itself used before this session ("real and
exercised, just nothing to spend on yet").

---

## v0.2.13 — 2026-08-17 — The run loop: spawn -> clear -> boss -> die -> spend -> respawn

**GREEN: 1305/1305 assertions across 13 suites (verify_run is a new
suite, 118 assertions — 101 from the initial build, +17 from the dedicated
adversarial pass below; verify_arch +9 from registering `60-run.js` into
`harness.js`'s `SIM_FILES`, the same mechanical growth `50-gen.js` and
`55-boss.js` each caused on landing; verify_render +1, a dummy-by-id
lookup — see below). `cinder-loop.html`, 291,260 bytes.** D1's day-one
target — the boss existing but reachable only by direct construction in a
test, not from a real run (§5f's own honest gap) — is closed. `boot()` now
calls a real `sim.beginRun()`; a level generates, a roster places, killing
it and reaching the exit opens the boss door, killing the boss (or dying
anywhere along the way) pays out D8's currency stub and rolls a genuinely
new level.

**Genuinely open design space, unlike wall interaction/slam impact/ledge
grab, which all skipped a judged panel because an existing rule already
dictated their shape (§5g/§5j/§5k).** `60-run.js`'s own header records a
judged 3-pitch panel, two independent judges, synthesized rather than
adopted from any single pitch: two independent judges found real,
source-verifiable bugs in all three competing pitches — a self-contradicting
RNG stream in one (a private `Run`-owned RNG seeded from the exact value
`Sim`'s own `this.rng` already uses, so the two streams were never actually
independent), a central transition that was promised in prose but never
actually written in another, and a nested-guard deadlock in the third
(its own boss-victory countdown nested inside a `phase === 'boss'` check,
which the transition itself flips false the instant the countdown starts,
permanently freezing the game after any boss victory not preceded by a
death). None shipped as pitched. "Clear," precisely: every enemy this
level placed has hp <= 0 AND a living player has reached the exit
(`CFG.RUN_EXIT_RADIUS` = 24px, ~1.5 tiles) — unanimous across all three
pitches and both judges; reaching the exit alone would let a player tunnel
past every placed enemy, and killing everything without ever reaching the
door would strand the run with nothing to advance it. Zero new Bus events
— every transition reads state Sim already owns for other reasons (which
world is loaded, `this.exit`'s own nullness, a target's own hp) or reuses
an existing event that already fires at the right moment
(`death`/`respawn`/`targetDown`), extending the same "state IS the signal"
precedent the boss's own phase-1/phase-2 transition already set
(`45-enemy.js`: `this.phase = 1`, zero accompanying event).

**A real bug, found and fixed before this version was called done.**
`beginRun()` is documented as a genuine restart, callable more than once on
the same Sim, not just a first-time initializer — but the first version
only cleared the RUN-level bookkeeping (`runEndFrames`, `_pendingLevel`,
`_wasDead`), never the players themselves. A player still mid-death-
countdown from a PRIOR, now-abandoned run kept counting down against a
`_wasDead[]` freshly reset to `false` underneath them: the very next tick
read "isDead && !wasDead" as a BRAND NEW death — it was not, it was the
same old one, just relabeled — and opened a second, bogus
`_beginRunEnd()` sequence off the FRESH run's own state, which later
silently committed a stale level swap nobody asked for once the old
countdown finally reached zero. Caught by a dedicated regression test
(`verify_run.js`'s own "beginRun() must be a genuine restart" section) that
called `beginRun()` twice on one Sim with a death staged in between — two
assertions failed on the first real run: the player read as still dead
immediately after the second `beginRun()`, and `run.levelSeed` changed on
its own several ticks later with nothing in the test ever asking for a new
level. Fixed by having `beginRun()` genuinely revive every player
(`player.resetTransient()`, consistent with D2's "each stat starts at 1
every run") before `_wasDead` is reset, so the flag and reality agree from
the first tick onward. Re-run confirmed both assertions green and the full
gate GREEN at 1288/1288 — not assumed fixed from reading the diff.

**Verified against real sim ticks, not read as correct (L8).** `verify_run`
(101, new suite, two layers matching `verify_gen.js`'s own precedent — pure
`RunLogic` logic against hand-built fixtures first, real Sim/Player/Enemy
integration second, so a pass proves the wiring, not just that the pure
functions are self-consistent): seeding (`deriveLevelSeed`/`nextRunSeed`/
`deriveEnemySeed`/`deriveBossSeed`, all real per-instance multiplicative
mixes, none ever the zero sentinel); the `Run` data holder's own
construction defaults; `isLevelClear`/`reachedExit` boundary cases,
including the null-exit (boss arena) case; D8's currency/spend stub,
exercised as real infrastructure even at its current zero cost;
`placeEnemies()` — one per roster template, never on the spawn platform or
a pickup spur, each carrying its own distinct per-instance seed, same seed
reproducing identical placement (L4); then real Sim integration: a plain
`scenario()` never engages the loop at all (`sim.exit`/`sim.bossTarget`
both stay null, `run.phase` never leaves its constructed default) —
proving the whole system is inert until `beginRun()` is actually called,
exactly as `70-sim.js`'s own comment promises; `beginRun()` loads a real
level, places a real audited-fair roster, and a co-op joiner lands at the
real current spawn, not a stale construction-time point; killing
everything without reaching the exit, or reaching the exit without
clearing everything, both correctly refuse the boss door; an undying
boot-path Dummy living alongside a real roster never blocks "clear"
forever (a regression found by driving the real built game end to end in
a browser, not caught by any sim-only test until this suite existed);
every real kill through `Combat.resolveBox` is banked, boss kills never
double-counted; a full clear opens the boss door, swaps in the real
arena, and carries hp through with no free heal at the threshold; a boss
victory with no death anywhere starts a `CFG.RESPAWN_FRAMES`-frame pause
before committing the next level, timed exactly, never one tick early or
late; death mid-level reuses `Player`'s own existing `deadFrames`/
`resetTransient()` machinery entirely unmodified and still pays out
currency for kills already banked even without a clear; co-op (D5): the
run ends at the FIRST death and the survivor is never force-killed — the
exact bug an adversarial judge found in a losing panel pitch's own
force-death loop — and lands in the new level's real spawn once the run
commits; a genuinely STAGGERED co-op death (P0 dies, P1 dies independently
several ticks later, P0's own countdown finishes first and commits the
level while P1 is still mid-death) proves `_enterLevel()`'s player
relocation does not stomp P1's still-running countdown, through both the
level-commit AND a subsequent level->boss transition; determinism (L4)
across a full scripted clear/boss-death/respawn loop hashes byte-identical
between two identically-seeded runs; and the `beginRun()`-genuine-restart
regression above.

**A dedicated adversarial-verification pass, run the same way as every
feature this session, stayed six-for-six.** Five independent lenses (co-op
interplay, boss/exit transitions, determinism/hash coverage, `RunLogic`
pure-function edge cases, and the production boot path), each instructed
to construct and actually RUN a real reproduction — a real `Sim` driven
through `tests/harness.js`, real damage through `Combat.resolveBox`, never
a theory — before reporting anything, and to report clean areas honestly
too, not just findings. All five came back with at least one real,
confirmed bug; three lenses converged on the SAME bug independently. Six
real problems, fixed; one more, investigated and correctly read as an
already-intentional design tradeoff rather than a bug, documented instead
of changed:

1. **Kills landed by a surviving co-op partner during the death-pending
   window were silently discarded, never paid.** `_beginRunEnd()` banked
   currency from `this.run.kills` at the moment of the TRIGGER (the first
   death) — but the level itself does not actually end there; `_stepRun()`
   deliberately keeps the OLD world/roster fully live so a surviving
   partner can keep fighting through the whole countdown. Any kill they
   landed in that window kept incrementing `run.kills` (the listener's own
   gate never checked whether a run-end was already pending) but its
   currency was never computed, and `_commitPendingLevel()` later zeroed
   `run.kills` unconditionally — the kill was counted, then thrown away.
   Found independently by three of the five lenses. Fixed by moving the
   currency computation from the trigger tick to the commit tick, reading
   `this.run.kills` at the LATEST possible moment instead of the earliest
   — every real kill through the real damage path is now paid, whenever it
   lands, right up until the level actually swaps.
2. **A run boundary only ever reset the ONE player who happened to die.**
   D2's own contract ("each stat starts at 1 every run") is enforced
   entirely by `resetTransient()`, which before this only ever fired from
   `beginRun()`'s own explicit restart or a dying player's natural
   respawn. `_commitPendingLevel()` — the routine transition that fires on
   EVERY death or boss victory during real play, and the exact moment
   `runsCompleted` advances, i.e. the game's own definition of "a new
   run" — never called it on anyone. A co-op partner who never personally
   died kept arbitrary stat/maxHp growth straight through a boundary the
   game's own bookkeeping calls brand new; the same gap meant a SOLO
   boss-victory-with-no-death run never reset stats at all. Fixed by
   resetting every ALIVE player at commit time (a still-dead partner,
   mid-countdown on their own separate death, is deliberately left
   untouched — the same precedent `_relocatePlayers()` already set for not
   force-touching a player who is not done dying yet).
3. **`nextRunSeed`'s seed mixing was not a real avalanche, and it showed
   up as a real, structural collision.** Every seed-derivation function
   here did a bare `a ^ (b * constant)` — no further mixing. Harmless for
   the three functions freshly derived each time, but `nextRunSeed` is the
   one CHAINED many times across a play session, once per run, and a
   linearly growing salt XORed straight into an accumulator lets several
   consecutive salts cancel back to an earlier value: confirmed for real,
   `runsCompleted` = 300..304 produced the exact same accumulated seed —
   and therefore the exact same next level, platforms/spawn/exit/pickups/
   roster all byte-identical — for every starting seed tried, not a rare
   probabilistic collision. Fixed by running every derived seed through a
   proper 32-bit avalanche mix, reusing the exact mixing step already
   proven inside `RNG.prototype.next()` rather than inventing a second
   hash.
4. **Killing the boot-path practice Dummy banked real run currency.**
   `isLevelClear()`/`_roster()` were already guarded against this exact
   non-roster fixture via `_levelRosterIds` — the SEPARATE currency-banking
   `targetDown` listener was not, so a player swinging at the tutorial
   dummy near spawn mispaid the run by one kill's worth of currency, every
   time. Fixed with the same `_levelRosterIds` guard the clear-check
   already trusted.
5. **`Gen.generate()` failures were only ever guarded at boot.**
   `beginRunOrFallback()` wraps exactly the ONE call made at boot — but
   `_beginRunEnd()` calls `Gen.generate()` again, completely unguarded, on
   EVERY subsequent level transition for the rest of any playthrough. An
   impossible-CFG failure there escaped `sim.step()` uncaught, into
   `frame()`'s own `requestAnimationFrame` callback (no try/catch either)
   — freezing the game solid, unrecoverable without a reload, and worse,
   re-throwing identically on every following tick forever (the sim was
   left in a state that re-entered the exact same failing branch every
   time). Fixed by extracting the boot-time "warn loudly, install the
   known-safe fallback" logic into one shared `installFallback()` function
   and wrapping `frame()`'s own `sim.step()` call in the same net — the
   "one sibling patched, others missed" shape this project has hit before
   (`_relocatePlayers()`'s own comment names the same lesson).
6. **A comment overclaimed the boot-path Dummy as "permanently alive."**
   True in the sense that mattered (`isLevelClear()` never sees it as a
   phantom survivor) — but both `_enterLevel()` and `_enterBoss()`
   unconditionally clear `this.targets` on every transition, dummy
   included, and nothing ever re-adds it: it survives only until the very
   first exit. Comment corrected rather than left to mislead the next
   reader.

**One more finding, investigated and correctly read as intentional rather
than fixed.** A pickup spur close enough to the exit's own attach point
(confirmed against real generated levels, a narrow but real shape across a
400-seed scan) can satisfy `RUN_EXIT_RADIUS`'s distance check without the
player ever having set foot on the exit platform itself. `RUN_EXIT_RADIUS`
is already explicitly documented in `00-core.js` as a deliberate
"generous, not pixel-perfect" grace window, the same spirit as
`COYOTE_FRAMES`/`JUMP_BUFFER_FRAMES` — this is a real, if narrow,
consequence of that already-named choice, not a violation of it. Left
as-is; the reasoning is now recorded directly against the constant rather
than left for a future reader to rediscover.

**Verified against real sim ticks, not read as correct (L8), including a
real mutation check.** `verify_run` grew from 101 to 118: a boot-path
dummy killed through the real damage path banks zero kills; kills landed
by a surviving partner during a real pending window are paid out in full
at commit, not just the kills banked before the trigger; a co-op survivor
AND a solo boss-victory player are both proven reset to the D2 baseline at
a real run boundary; 500 consecutive derived levels from four different
starting seeds are swept and proven to never repeat. The stat-reset fix
was additionally verified by real mutation: the new reset loop was
disabled in a scratch copy, the three new stat-reset assertions failed
exactly as expected (`got 2, want 1`, `got 4, want 3`), and the real fix
was restored and reconfirmed green — proof the new tests catch the bug's
absence, not just that they pass. `bash tests/run_all.sh` → **GREEN
1305/1305 across 13 suites.**

**What was deliberately not done here.** `65-meta.js` (persistence,
blueprint unlocks, permanent capability) still does not exist — D8's
currency stub pays out and gets spent at `RUN_SPEND_STUB_COST` (0 today)
but there is nowhere for it to go permanently; every run still starts from
the same pre-unlocked state. Weapon equipping/switching still has no
player-facing path (D4, unchanged by this session). The HUD heart-meter
still hardcodes `CFG.MAX_HP` for its draw loop, same deferral named in
§5h. No dedicated sim-level regression exists for finding 5 (the
`Gen.generate()` mid-run crash) — the fix lives in the presenter
(`95-app.js`), which `verify_run.js` does not exercise, and a browser-level
test would need to force a mid-run generation failure inside a live CDP
session, a real but separate piece of test-infrastructure work not taken
on here; the fix was verified by direct code tracing and the existing
`verify_render` suite staying green, not by a dedicated regression, named
honestly as a gap rather than silently assumed covered.

---

## v0.2.12 — 2026-08-16 — Ledge grab / mantle: real spatial reasoning, not a velocity clamp

**GREEN: 1177/1177 assertions across 12 suites. `cinder-loop.html`,
252,182 bytes.** Catch a wall's own top edge while falling into it,
climb up with jump or drop with down — genre-standard shape, so this
skipped a judged panel the same way wall interaction (v0.2.8) and slam
impact (v0.2.11) both did. What made it different from either precedent:
wall slide/jump are velocity clamps that need no world-knowledge beyond
"touching a wall right now," but a ledge grab is a real claim about the
tilemap — the wall has to actually run out, within reach, into a surface
the player can stand on. `detectLedge()` was written as its own function
and proven against three constructed test worlds (a clean ledge, a wall
that never ends within reach, a ledge with no headroom to climb into)
before it was ever wired into `update()` — the same bake-before-ship
discipline every rig move already follows, applied to collision geometry
instead of a pose.

### Three bugs caught by hand, before any test ran

1. **A straddled-column climb.** The first draft nudged the body a fixed
   6px off the wall face rather than anchoring to the tile grid — traced
   by hand that this left the body straddling two tile columns instead of
   standing fully on the ledge. Fixed by anchoring directly to the tile
   boundary `detectLedge()` had already proven has headroom.
2. **A stale `onGround` for one tick after climbing** — the same class of
   bug already fixed once for roll's own start frame: `move()`'s Y-step
   never runs at all when `vy` is exactly 0, so a body positioned
   correctly still read `fall`/`onGround: false` for a full tick. Fixed
   the same way, `b.vy += CFG.GRAVITY` on the transition tick.
3. **`finish()`'s own state classifier** would have silently overwritten
   `state = 'ledgeGrab'` back to `'wallSlide'` the same tick it was set,
   since its exclusion list didn't yet know the state existed — caught by
   re-reading `finish()` before ever running a test.

### A fourth adversarial pass this session, and it stayed five-for-five

Every feature built this session has now had a real bug found by an
independent adversarial verification pass, and this one was no exception
— four more real problems, three substantive:

1. **A crouched climb left the collision box mismatched with the drawn
   position.** A body that entered the hang while still crouched (rolled
   or crouch-walked into the wall) never stood up on climb: `b.h` stayed
   at the crouched 12px while `b.y` was computed for the standing 22px
   ledge position, leaving the feet ~10px above the real surface —
   `onGround` false, and `finish()`'s classifier silently overwrote the
   intended `idle` back to `fall` that same tick, self-healing only
   several ticks later once the ordinary in-air auto-uncrouch caught up.
   Fixed by standing the body up unconditionally on the climb transition;
   unlike the ground jump's own crouch-cancel (which asks permission via a
   real `canStand()` check), `detectLedge()` had already proven the
   clearance at the specific landing spot, so there was nothing left to
   ask.
2. **A hazard hit couldn't knock a hanging player free.** The `ledgeGrab`
   block's own per-tick "pin velocity to zero" ran again the very next
   tick, before `move()` ever applied the hurt knockback — a player caught
   by a hazard while hanging was permanently unable to be knocked free.
   Fixed in `Player.prototype.hurt()`: a hit now releases the hang
   immediately, the same way every other interruption in this game already
   takes priority over holding still.
3. **A vacuous negative test.** The "touching but not holding in never
   grabs" test never actually touched the wall — it proved a body released
   the wrong way for the right side effect, not the claimed behaviour.
   Rewritten to genuinely touch the wall first (`onWall === 1` proven),
   then release, before asserting no grab follows.
4. **An overclaiming comment.** `STANCE.ledgeGrab`'s own comment in
   `35-rig.js` claimed the existing 1500-tick figure-drive sweep in
   `verify_rig` validated the pose. It structurally cannot: that sweep
   runs against `flatWorld`, which has no wall that ever ends into a
   ledge, so `ledgeGrab` is unreachable there. Comment corrected; a
   dedicated test added that drives a real `ledgeGrab` on a real
   constructed world and poses it directly.

### A fourth recurrence of this project's own documented "worst bug" — caught in scratch work, not shipped code

The standalone probe script written to hand-verify `detectLedge()` before
wiring it in used `TILE` (`C.TILE`, the tile-*kind* enum) in a pixel
arithmetic expression where `CFG.TILE` (16, the tile *size*) was needed —
producing `NaN`. Caught immediately by the probe's own nonsensical `null`
results, not assumed correct. Never touched anything shipped, but named
here because it's the fourth time this exact confusion has hit this
project.

### Verified against real sim ticks, not read as correct (L8)

- `verify_move` 116 → 140: a falling body genuinely held into a real
  ledge catches it, positioned and event-fired exactly once; touching but
  not holding never grabs; a tall wall with no ledge anywhere reachable
  never grabs; a ledge with no headroom above it never grabs; climbing
  re-grounds the body the SAME tick, not one tick later, with the air
  jump refreshed; the auto-drop timeout and the re-grab lockout's real
  boundary both measured directly; determinism over a full
  grab-hang-climb sequence, hashed twice.
- `verify_rig` 144 → 148: a real `ledgeGrab` reached on a real constructed
  world, every joint finite, cloak present, `figure()` reporting the real
  state rather than a silent idle fallback.
- No new hash-coverage gap: `ledgeGrabLock`/`ledgeHang` added to
  `Sim.hash()` (they affect future-tick behaviour); `ledgeRow`/
  `ledgeWallTx`/`ledgeDir` deliberately left out — only meaningful
  mid-hang, and their only observable effect is already captured through
  `b.x`/`b.y`.
- `bash tests/run_all.sh` → **GREEN 1177/1177 across 12 suites**.

### Not done here

No ledge-to-ledge chaining or wall-to-wall climbing beyond one
catch-climb-or-drop cycle — genre convention for this move is exactly that
cycle. The re-grab lockout test's own precision is coupled to its test
geometry (a much larger `LEDGE_GRAB_LOCKOUT` could in principle let the
body fall past `detectLedge()`'s scan window before the lockout itself
expires) — not a concern at the current value, but named in the test's
own comment rather than assumed away.

---

## v0.2.11 — 2026-08-16 — Slam impact: the ground-pound finally hits something

**GREEN: 1149/1149 assertions across 12 suites. `cinder-loop.html`, 241,696
bytes.** The slam
has always had landing FX — 6 frames of hitstop, a screen shake, particles
— but never dealt damage: a false affordance, since it visibly LOOKS like
an attack and was not one. No judged panel this time, unlike Warmaul and
Thornspear (v0.2.10) — D9 named an open COUNT for weapons; slam-as-attack
has only one real fork (universal vs. per-weapon), and D7's own "a weapon
owns no numbers of its own" already argues against per-weapon for a
movement-triggered shockwave that was never a swing. Everything else was
already written down as a rule before this session started — route through
`Combat.resolveBox`, never a second hp-subtraction path — so this landed
designed, measured, implemented, tested, one continuous pass, the same
shape wall interaction (v0.2.8) used to skip a panel too.

### The numbers

Weapon-agnostic on purpose: 10 base damage (matches daggerHeavy's tier),
22px reach each side of the body, a 14px ground-level AOE band, mostly
horizontal knockback (a shove, not a swing's upward pop) — still scaled by
`Combat.weaponScale` off the player's current stats, so D2 stays coupled to
every damage source, not just standard swings. A connecting slam requests
`CFG.HITSTOP_HEAVY` (9) instead of the unconditional landing 6, the same
"biggest hits get the biggest freeze" rule every weapon's own heavy follows.

### The architecture question, decided by re-reading existing rules

A slam has no `facing` — it's a shockwave centred on the landing point —
but `Combat.resolveBox` always pushes every target in ONE shared direction.
Teaching it a second knockback model would be exactly the "two places that
subtract from hp" failure this project's own rule warns against. The fix:
two `resolveBox` calls, a LEFT box and a RIGHT box flanking the body,
sharing one dedupe list — the ONE shared resolver still resolves every hit,
just called twice.

### Four real problems, caught before this ever reached the gate

1. **An ES2015+ violation.** The first draft used `Object.assign`. This
   codebase makes NO ES2015+ runtime assumptions anywhere — stated
   explicitly in `92-menu.js`'s own `withField` comment, because a Wear OS
   WebView is a real target. Fixed to two full literal objects.
2. **A stale comment.** `player.weapon`'s own comment still blamed the
   missing equip path on "the not-yet-built pickup system (D2)" — D2
   shipped two versions ago. The real dependency is D4; corrected in
   passing.
3. **A test that failed for the right feature, wrong reason.** The
   knockback test read target position immediately after landing and found
   it unchanged. Not a broken mechanic: `Dummy.prototype.hurt` applies
   knock as VELOCITY, and a connecting slam's own hitstop request freezes
   the entire sim — targets included — for 9 ticks starting that same
   tick. Traced tick-by-tick with a real script, fixed by stepping past the
   freeze before checking.
4. **Two more browser-suite timing flakes**, found by taking #3 seriously
   rather than moving on once it was fixed. Repeated real re-runs of the
   full gate surfaced `verify_render` failing on two assertions this
   version's own earlier work hadn't touched — a keystroke-displacement
   check and a jump-height check, both a fixed real-time sleep assumed to
   cover enough SIM TICKS, the third and fourth instance of the exact class
   of bug v0.2.10 first found. Rather than wait for a fifth unlucky re-run,
   the rest of the file was grep'd for the same shape on purpose — a
   touch-drag displacement check, not yet observed to fail, fixed anyway.
   All fixed the same way: poll for the real condition, never a bigger
   guessed number.

### Verified against real sim ticks, not read as correct (L8)

- `bash tests/run_all.sh` → **GREEN 1149/1149 across 12 suites**.
- `verify_combat` 90 → 109: real damage on both AOE boxes independently; a
  target just past either box's outer edge takes none; the VERTICAL reach
  proven too, not just horizontal (see below); knockback proven to push
  each side AWAY from the landing point, not one shared direction; hitstop
  scales with whether the slam actually connected; weapon-scaling proven
  through a raised stat; the one-tick `slamLanded` flag proven not to
  re-fire; i-frames respected; determinism over 200 ticks including a real
  landed slam.
- No new hash-coverage gap: `slamLanded` is always false by the only points
  `hash()` could ever observe it (nothing outside the tick that sets AND
  consumes it can see it true).

### A SECOND adversarial pass, over this same work, found four more real problems

Run after the section above was already believed done — three cosmetic,
one genuinely important:

1. **A mislabeled byte count.** The `cinder-loop.html` figure this entry
   itself first reported was wrong — traced to `build.py` printing a Python
   `len(str)` CHARACTER count mislabeled as bytes, silently under-reporting
   by every multi-byte UTF-8 character (em dashes, arrows) this codebase's
   comments are full of. Fixed at the root (`build.py` now encodes before
   measuring), not just patched in this doc.
2. **A miscount in the masterfile's own prose** — "five" fixed timing
   assertions when the very next parenthetical names seven. Fixed there.
3. **A real, adversarially-found test-coverage gap.** `SLAM_HIT_H` (the
   AOE's vertical reach) had never actually been exercised — every test
   dummy in the section rests on the floor, where its own body height
   already spans nearly any plausible value, confirmed by literally
   sweeping `SLAM_HIT_H` from 1 to 1000 against the real assertions with no
   change in outcome. Closed with two new tests that pin a target's height
   for an entire landing (dummies fall under real gravity same as the
   player, so an elevated target has to be held in place, not just placed).
4. **The real cause of this project's own gate instability, and it was not
   sim timing.** Chasing repeated real gate re-runs (as this version's own
   §"Four real problems" above already had once) surfaced the SAME
   suite failing again, differently — and this time traced further: Chrome
   is a process TREE, and Windows' `proc.kill()` does not cascade to the
   GPU/renderer children it spawns. Every real run left orphans behind —
   37 observed accumulated in one sitting, 100+MB each — until a fresh
   launch failed outright with zero output, indistinguishable at first
   glance from more timing flakiness. Fixed with a real Windows tree-kill
   (`taskkill /T`, `tests/cdp.js`'s new `killTree`); orphan accumulation
   confirmed stopped by direct process-count measurement, not assumed. A
   much rarer, still-undiagnosed launch failure remains under artificially
   rapid repeated re-runs (the kind adversarial verification does, not
   normal use) — named honestly rather than claimed eliminated.

### Still open

No per-weapon slam variant (named scope choice, not an oversight). No
resource cost or cooldown beyond the existing hang/landing recovery —
whether a free, always-available AOE needs one is a balance question this
session did not attempt to answer. The dominant cause of `verify_render`
instability (the process leak) is fixed and verified stopped, but a much
rarer, still-undiagnosed launch failure survives under artificially rapid
repeated re-runs — named here rather than claimed gone. Everything named
still-open in v0.2.8–v0.2.10 (weapon equipping/switching, `60-run.js`,
`65-meta.js`, the HUD heart-meter, story events) remains exactly that.

---

## v0.2.10 — 2026-08-16 — Warmaul and Thornspear: D9's roster is complete

**GREEN: 1130/1130 assertions across 12 suites, confirmed stable across
multiple consecutive real runs. `cinder-loop.html`, 236,533 bytes.** D9
locked the roster at four weapons from this project's very
start; only `blade` and `daggers` existed going into this session. Unlike
the last two versions, this WAS genuine open design space — D9 names a
count, never identities — so it got a judged panel, the same process the
boss and touch input used: independent pitches and independent judges, both
reading the live source directly rather than trusting a summary.

### The panel split — a first for this project

Every prior panel here won outright, both judges agreeing on one winner.
This one didn't: judge 1 scored the three pitches 42/39/36, judge 2 scored
the SAME three 37/42/46 — different winners. Deciding meant reading both
judges' full critiques rather than summing scores. The runner-up's weaker
weapon (Kilnbreaker, pitch 1) duplicated Blade's exact reach AND exact
chain length — the single harshest individual-weapon criticism either judge
made of any of the six weapons proposed, closer to "a bigger Blade" than a
new combat verb, the precise failure mode the brief warned against. The
chosen pitch — **Warmaul** (umbral/verdant, 18px reach, one committed hit,
`chain: null`, no combo at all) and **Thornspear** (ember/verdant, 20px
reach, a four-hit chain, the roster's weakest heavy) — was the only one of
three with zero false or unchecked claims from BOTH judges, and the only
one to extend a real discovered invariant (Blade's and Daggers' light
chains already total the same 13 base damage) cleanly to both new weapons.
Both reuse the OTHER weapon-slot's conventional hitstop constant on
purpose: Warmaul's light hit freezes like a heavy, Thornspear's heavy stays
quick like a light — a real, legal reuse of two constants that already
existed, not new ones invented for the occasion.

### The runner-up's own concern turned out to be real — measured, not waved off

A judge's one real criticism of the winning pitch was that Thornspear's
pitched 22px blade was "nearly quadruple" the character's own default
reach. That wasn't dismissed as panel noise. Baked into the real merged
move table — the exact construction `C.RIG = new Rig(MOVES)` performs at
boot, every move in the game together — it measured the whole game's reach
envelope at 40.5px against `verify_rig`'s own pre-existing "reach is about
two tiles, not ten" ceiling (20-40px), an invariant that predates this
weapon by several versions and was not loosened to fit it. Pulled back to
20px before anything shipped; re-measured at 38.65px, real headroom, still
the longest reach in the roster.

### A second real bug, geometric this time, caught the same way Twin Daggers' was

Hand-authoring frames for a longer blade isn't the same problem as for a
shorter one. `heavy`'s own windup can swing back to -143° and stay under
`RIG_ACTIVE_SPEED` only because its blade is 11px — short enough that even
a big angle change moves the tip slowly. The same angles copied onto
Warmaul's 18px and Thornspear's 20-22px levers were already moving fast
while the blade was still behind the body — a real `behind` audit violation
on both moves' first draft, caught by baking against the actual
`Rig.bakeMove()`/`audit()` functions before either was ever written into
the shipped `MOVES` table. Fixed with a shallower, deliberately-held windup
(small steps until just clear of the body, then one large release frame),
not by weakening the rule or cutting the reach that motivated the weapon.

### Verified against the real bake, not read as correct (L8)

- `bash tests/run_all.sh` → **GREEN 1130/1130 across 12 suites**, re-run
  multiple times in a row to confirm it holds, not just once.
- `verify_rig` 97 → 144: frame counts and active windows pinned for all 7
  new moves; reach proven strictly ordered across the whole four-weapon
  roster (daggers < default < warmaul < thornspear); the 13-damage
  light-chain invariant proven for all four weapons, not assumed from
  three; the real merged-table envelope re-measured and proven still
  inside the pre-existing 20-40px ceiling — the assertion that caught
  Thornspear's first-draft overreach, not a new check added after the fact.
- `verify_combat` 67 → 90: equipping each new weapon changes both entry
  points; three repeated Warmaul swings prove `chain: null` behaves as a
  clean, repeatable single hit rather than silently eating a buffered
  second press; a second test drives a press buffered WHILE `maulA` is
  still active, the one the first test structurally cannot reach (below);
  Thornspear's four-hit chain proven with the same buffered-early-press
  technique Daggers' three-hit chain established, carried one hit further;
  real damage through the unmodified resolver for `maulA` (13, the biggest
  LIGHT-classed hit in the game) and separately `maulHeavy` (20, the
  biggest hit in the whole game); determinism with each new weapon
  equipped.
- No new hash-coverage gap: both weapons are pure `WEAPONS`/`MOVES` table
  rows, no new per-entity field, nothing for `Sim.prototype.hash()` to miss.

### A second, adversarial pass over this feature's own work — three real bugs

Fifteen independent agents (five dimensions, each re-checked by a second
independent verifier) re-read this feature's code and docs against the live
source rather than trusting the first pass. Three real problems, not
cosmetic ones:

1. **A false superlative, copied into three docs from one wrong test
   comment.** "The roster's single biggest hit (13)" described `maulA` —
   Warmaul's LIGHT move. Its own HEAVY move (`maulHeavy`, 20) and even the
   pre-existing default `heavy` (14) both hit harder; the masterfile's own
   weapon table had the correct 20 sitting right next to the wrong claim.
   Fixed by testing `maulHeavy` for real and correcting `maulA`'s own claim
   to what's true: the biggest LIGHT-classed hit, not the biggest overall.
2. **A gate that was not reliably green.** Re-run six times in a row rather
   than once, `bash tests/run_all.sh` came back GREEN only once — the other
   five failed inside `verify_render` on two assertions timed with a FIXED
   sleep (900ms boot settle, 80ms post-keydown) instead of a poll for the
   real condition. Pre-existing, unrelated to this feature's own content
   (`verify_rig`/`verify_combat` stayed 100% every single run) — but real,
   and this entry had already written "GREEN 1120/1120" off the back of one
   passing run before the flake was found. Fixed for real: both fixed
   sleeps replaced with a poll for the actual condition, re-confirmed GREEN
   across 8 consecutive runs afterward, not caveated around.
3. **A test that couldn't see what it claimed to prove.** The "never a
   chain" test for Warmaul never actually drives a press into
   `Combat.begin`'s mid-move branch — confirmed by mutating the real,
   shared `maulA.chain` field and watching the test stay green regardless.
   A second test, added alongside it, buffers a press while `maulA` is
   still active, squarely inside that branch; the same mutation now flips
   it red.

All three fixed for real before this entry was written, not left as a
documented gap — the numbers above already reflect the fixes.

### Still open

Weapon equipping/switching still has no player-facing path — D9's roster
being complete and D4's pickup/blueprint delivery mechanism existing are
two separate claims, and only the first is true as of this version.
Everything named as still-open in v0.2.8/v0.2.9 (dual-choice UI, `60-run.js`,
`65-meta.js`, the HUD heart-meter, story events) remains exactly that.

---

## v0.2.9 — 2026-08-16 — the stat contract, real pickups, and weapon scaling

**GREEN: 1060/1060 assertions across 12 suites. `cinder-loop.html`, 230,413
bytes.** D2 was locked at this project's very start ("Three-colour stat
contract with HP coupling... this is what turns loot into a build decision
rather than a bigger number, and it is the anti-death-spiral mechanism") —
this is the first session that actually builds it. No judged panel: the
contract itself was already fully specified in §1, the open questions were
implementation ones, the same shape as v0.2.8's wall interaction and second
weapon.

### The contract, read precisely rather than assumed

"+HP" is not a new invented meaning — D8 already names "+max HP" as exactly
what meta currency buys permanently; this is read as the within-run version
of the same concept, stated as that reading rather than left ambiguous.
"Dominant" is read as STRICTLY the sole highest stat, not highest-or-tied —
proven directly: catching up to exactly tie the leader grants no HP, only
overtaking it does. The very first pickup of any run is unconditionally
dominant (1,1,1 → 2,1,1 has nothing to tie against), which is correct
rather than a loophole: the anti-death-spiral property only has work to do
once stats have actually diverged.

### One real, named simplification

"Dual choices weighted toward the two lowest stats" implies a player
physically choosing between two options. `50-gen.js`'s pickups are single
points, not spatial pairs — building true paired choice would mean
changing an already-shipped, fairness-audited generator, real scope not
taken on here. The weighting is applied instead as a soft preference at
the moment of collection (`pickStatColour`, 30-player.js): the current sole
leader is weighted down, never excluded — confirmed over 3000 real seeded
draws that it's still picked sometimes, just measurably less than either
trailing stat, and that a genuine three-way tie stays roughly uniform.
Decided lazily, at collection, reactive to whatever the run's stats
actually are by then — not a snapshot from when the level was generated.

### Weapon scaling, wired for real

`WEAPONS` (10-data.js) now names two `colours` per weapon; a new
`Combat.weaponScale` reads the LARGER of the two (never their sum, never an
unrelated third colour — both proven directly) and multiplies the move's
own baked damage by `1 + (statValue − 1) × CFG.STAT_SCALE_PER_POINT`,
rounded before it ever reaches an hp total — every damage number this game
shows is a clean integer, and a scaled one stays that way. `STAT_SCALE_PER_POINT`
(0.15) is a design judgment, not a measurement — named as one, the same
discipline as `GEN_MIN_FIGHT_TILES`. A weapon with no registered `colours`
(or no weapon at all) falls back to the highest of all three stats, the
fallback D2 names explicitly, also proven directly with an unregistered id.

### A real bug, caught by writing the right assertion, not by luck

The first draft of the pickup-collision tests never actually gave the
player any movement input — the pickup was placed just past the player's
own spawn bounding box (edge-touching, not overlapping; `aabb` needs real
overlap), and with nobody walking anywhere, nothing was ever collected.
Two of the three pickup tests (double-collection, `resetTransient`) were
passing anyway — for the wrong reason: if a pickup is never collected in
the first place, "collecting it again grants nothing" and "it isn't
collected after a reset" are both trivially, vacuously true. Exactly the
"a check quietly becomes a no-op" failure mode `35-rig.js`'s own audit
exists to guard against, just in the harness this time rather than the
bake. Fixed by driving real movement input AND adding an explicit
"collection actually happened" assertion before each of the two negative
claims — proving the positive case first, not assuming it.

### Verified against real sim ticks, not read as correct (L8)

- `bash tests/run_all.sh` → **GREEN 1060/1060 across 12 suites**.
- New `verify_stats` (41/41): stat gains and dominance, including the
  tie/no-HP case above; `pickStatColour`'s weighting proven statistically;
  `Combat.weaponScale`'s pure formula AND its live integration through
  unmodified `Combat.resolveBox`; real pickup construction, collision,
  one-time collection, `resetTransient()` restoring an uncollected world,
  and determinism through a full pickup-collecting run.
- Closed hash coverage for `player.maxHp`/`player.stats.*`/every pickup's
  `collected` flag in the same edit — the same discipline v0.2.8 already
  applied to the boss's own `phase`/`activeMove` gap.
- `tests/harness.js`'s shared `scenario()` gained `spec.pickups`, matching
  the existing `spec.dummies`/`spec.enemies` pattern exactly, rather than
  every new test hand-constructing a `Sim` to get pickups into it.

### Still open

No spatial dual-choice UI — see the simplification above. Weapon
equipping/switching still has no player-facing path (D4, not D2). `65-meta.js`'s
permanent, cross-run progression is untouched — D2's stats are explicitly
WITHIN one run, reset by `resetTransient()` (an interim reading of "a run
boundary" until `60-run.js` defines one more precisely, stated as an
interim reading rather than asserted as final). The HUD's own heart-meter
rendering (`80-view.js`) still hardcodes `CFG.MAX_HP` for its draw loop — a
player who has grown past the starting max hp will not yet see extra
hearts drawn; sim-level growth is real and tested, the visual is deferred,
the same shape as the boss's own health-bar deferral. Economy,
meta-progression, `60-run.js`, and the story-events system (D11/D12)
remain designed and not built.

---

## v0.2.8 — 2026-08-15 — deeper movement and combat: wall interaction, and the second weapon

**GREEN: 1019/1019 assertions across 11 suites. `cinder-loop.html`, 221,716
bytes.** Not a new locked decision the way D3/D3a or D10 were — both pieces
build out scope already established (the movement core generally, and D7's
"content is data" for weapons specifically), so no judged panel here; both
landed the same way `50-gen.js` did — designed, measured, implemented,
tested, in one continuous pass.

### Wall interaction

`onWall` was already computed every tick by `25-body.js` (Emberrush's own
charge already reads it to end early) — this is the first PLAYER mechanic
to act on it. Wall slide clamps fall speed to `WALL_SLIDE_MAX` while held
INTO a wall you're touching — measured exactly 2.2 px/frame, a real,
large reduction from the 9.0 px/frame terminal fall — confirmed both ways:
engages when pressing in, does not when merely brushing past one while
airborne. Wall jump reuses `JUMP_VEL` directly rather than inventing a
second vertical number (apex measures identically to a normal jump's,
48.6px), pushes away with a dampened control window (`ATTACK_DRIFT`-shaped,
not eliminated, so continuing to hold into the wall can't instantly cancel
it), and outranks the double jump in the input-trigger chain — proven the
strong way: the double jump is spent in open air first, and a wall jump
still fires with zero air jumps left. Both sliding and jumping off a wall
refresh the air jump, the same generosity landing already gets.

Closing a new state (`wallSlide`) surfaced a real gap immediately:
`verify_rig`'s own "every state the player enters has a stance" assertion
caught that no pose existed for it the moment the state existed to be
entered. A real pose was authored — braced legs, arms out for balance, the
same arm-angle family `jump` already uses — rather than deferred; unlike
the boss's cosmetic health bar, a reachable player state with no visual
representation is a correctness gap, not polish.

### The second weapon

Combat's move IDs were hardcoded (`'slashA'`, `'heavy'`) directly in
`Combat.begin` before this. A new `WEAPONS` table in `10-data.js` — each
entry just two move IDs, `light` and `heavy`, nothing else, matching D7's
own promise that a weapon owns no numbers because the move it points at
already does — lets `player.weapon` (fixed at `'blade'` for now) decide
which two moves `Combat.begin` starts a swing from. Chaining onward
(`slashA → slashB`, or the new `daggerA → daggerB → daggerC`) is still
decided entirely by the RIG move's own `chain` field, unaware a second
weapon exists at all.

**Twin Daggers** proves the pattern is genuinely reusable, not a refactor
with one instance dressed up as a system: its own `geom` uses a 6px blade
against the default weapon's 11px — same shoulder, same arm, a shorter
weapon — and a real, different feel (faster, three hits instead of two,
lower damage per hit) falls out of that plus new frame timing alone. A
candidate bake was checked directly against `Rig.audit()` — zero
violations — before any of it was written into the shipped table.

### A real test-design bug, corrected rather than worked around

The first draft of the dagger-chain test used `swing()`, the helper
`verify_combat`'s own blade tests use to prove a fresh press RESTARTS the
combo — its long gap between presses is built specifically to let the
chain window close. Using it to try to prove chaining WORKS produced
exactly the wrong answer (`daggerA,daggerA,daggerA,daggerA`, never
chaining) — not a bug in the new weapon, a wrong tool for the claim being
tested. Fixed by using the early-buffered-press technique the blade's own
combo test already uses for its one chain link, carried one hit further
for the dagger's three.

### A hash-coverage gap closed — for the new fields here, and a debt left over from the boss

Neither `player.weapon`/`wallJumpLock` nor the boss's own `phase`/
`activeMove` (v0.2.7 — flagged by the judged design panel as a real gap,
documented at the time but not actually fixed) were in `Sim.prototype.hash()`.
Both closed together here, rather than leaving the boss's own known gap to
linger once this feature's own determinism test needed the same kind of
coverage anyway.

### Verified against real sim ticks, not read as correct (L8)

- `bash tests/run_all.sh` → **GREEN 1019/1019 across 11 suites**.
- `verify_move` (+21 assertions): the wall-interaction section described
  above, every claim driven through real ticks — including the negative
  case (no slide without holding in) and the priority case (wall jump over
  double jump, proven with the double jump already spent).
- `verify_rig` (+22): frame counts and active windows pinned for all four
  new dagger moves, exactly the same discipline as the default blade's own
  three moves; the second weapon's shorter geometry confirmed directly
  against `CFG.RIG_BLADE`; the `wallSlide` pose fix.
- `verify_combat` (+13): equipping daggers changes both the light AND
  crouch-attack heavy entry point; the three-hit chain: real damage through
  the unmodified `Combat.resolveBox`, for exactly the move's own declared
  amount; determinism with a second weapon equipped.

### Still open

Weapon equipping/switching has no player-facing path — `player.weapon` is a
fixed default, changed only by tests directly; it depends on the pickup
system D2 describes, which does not exist yet. D2's colour/scaling contract
itself is not touched — no `colours`/`scale` fields were added to
`WEAPONS` ahead of a real consumer for them: a field nothing reads is worse
than no field at all. Economy, meta-progression, `60-run.js`, and the
story-events system (D11/D12) remain designed and not built.

---

## v0.2.7 — 2026-08-15 — Kilnwarden: the two-phase boss and its arena

**GREEN: 963/963 assertions across 11 suites. `cinder-loop.html`, 213,239
bytes.** `55-boss.js` — the masterfile's only prior spec for this file was
"two-phase boss + arena," nothing else decided, the same genuine open
design space D10 (touch input) faced before it was resolved. Resolved the
same way here: a judged 3-concept design panel, two independent judges
scoring against this game's own real fairness rule and architecture,
checking every load-bearing claim against the live source rather than the
proposals' own prose.

### The panel found real bugs before a line of engine code was written

Three concepts, each grounded against the actual `45-enemy.js`/
`40-combat.js`/`35-rig.js`/`10-data.js` on disk: **Pyrewarden** (a melee/
charge brute), **Kilnwarden** (a rooted, ranged zone-control caster), and
**Ashwing** (a walk→fly mode-switch hybrid). Both judges independently
caught the same defect in the two losers: `doChase`'s real commit gate
reads a template-level `t.reach`, which neither Pyrewarden's nor Ashwing's
data schema ever declared (both only gave per-move reach) — `t.reach`
evaluates as `undefined`, and `abs(dx) > undefined` is always `false` in
JS. For Pyrewarden this meant the boss would never actually approach a
player. For Ashwing's phase-2 flight the same gate runs inverted
(`abs(dx) < t.reach`), which **fails closed** — the harder phase could
never attack at all. Ashwing's plan additionally inserted itself as a
fifth row into `DATA.ENEMIES`, breaking `verify_enemy.js`'s hard-pinned
four-template roster assertion (D9) — directly contradicting its own
"byte-for-byte no-op" framing. Kilnwarden was structurally immune to the
first bug (a rooted caster's "always eligible" behavior is correct by
design, not an accident) and never needed the second. It won outright,
41/50 and 42/50, leading 4-5 of 5 axes on both scorecards.

### One gap even the winning design left open, resolved before implementation

Both judges flagged that Kilnwarden's own document never specified how its
move-picker gets distance data, given the real `Enemy.commit()` takes zero
arguments. Verified directly before writing any code: `acquire()`'s
`this.dist` exists, but it's a different, vertically-weighted metric meant
for choosing WHICH player to target, not for gating one already-chosen
attack's range — reusing it would have misjudged eligibility for a player
standing on the arena's own raised platforms. The shipped version threads
`target` through `doChase() → commit(target) → pickMove(target)`, computing
a fresh horizontal `dx` at the moment of commitment — mirroring `doChase`'s
own existing convention exactly, not inventing a new one.

### The engine change is additive and provably a no-op for the existing roster

`Enemy`'s constructor now accepts a template OBJECT directly — Kilnwarden
is deliberately kept OUT of `DATA.ENEMIES`/`ENEMY_IDS` (resolving the exact
bug that broke Ashwing) — alongside the existing string lookup. An optional
`activeMove` and `phase` are read through a `(this.activeMove || t).field`
fallback everywhere a template field used to be read directly; for the
four regular templates `activeMove` never leaves `null`, so every read
resolves exactly as before. Confirmed empirically, not just by inspection:
`verify_enemy` (85/85), `verify_arch` (177/177 — +9 from registering
`55-boss.js` into `harness.js`'s `SIM_FILES`, the exact same mechanism
`50-gen.js` triggered in v0.2.5), and `verify_platform` (137/137) all pass
unmodified. Two new states: `zone` (Kiln Floor — no direct hitbox, mutates
arena tiles to `HAZARD` on a timer, read by the existing generic
hazard-collision path in `30-player.js`, same as every other hazard tile in
the game) and `phaseTransition` (a fixed, non-dangerous beat, gated to fire
only from `doRecover` — the one seam in the whole state machine where
nothing dangerous is ever in flight, so an hp threshold crossed mid-attack
can never retroactively revise a commitment already made).

**Deliberately zero new Bus events and zero edits to `00-core.js`** (Core
team's alone) — both the zone hazard and the phase transition are fully
observable by reading `World`/`Enemy` state directly, the same "state IS
the signal" pattern `80-view.js`'s existing telegraph flash already uses.
An early draft added two new Bus events for exactly this purpose before it
was caught and reverted — it would have reintroduced the precise
undisclosed-integration-cost class of gap the panel had just marked against
the two losing concepts.

### A bug found once already in this project's history, found again in nearly the same shape

Building `C.Boss.spawn`/`playerSpawn`'s pixel coordinates first used
`TILE` (`= C.TILE`, the tile-**kind** enum object) where `CFG.TILE` (the
tile **size** in px) was needed — `16 * {object}` is `NaN`, and both the
boss and the player spawned at `NaN, NaN`. This is the exact mistake
`95-app.js`'s own `boot()` still carries a comment scar about from v0.1.0's
worst bug. Caught immediately by a direct smoke test (a real `Sim`, real
body coordinates) before any formal suite existed. `55-boss.js` now uses a
deliberately unambiguous local `PX = CFG.TILE` for all pixel math.

### Verified against real sim ticks, not read as correct (L8)

- `bash tests/run_all.sh` → **GREEN 963/963 across 11 suites**.
- `verify_boss` (69/69): the moveset/phase data shape and fairness floor;
  Kilnwarden confirmed absent from `DATA.ENEMIES`/`ENEMY_IDS`; construction;
  the move-picker's eligible pool proven never empty by a real distance
  sweep across the whole arena, not by inspecting the authored ranges; the
  fairness dodge test against every move in both phases; the phase
  transition proven to trigger only at a safe point (forced mid-telegraph
  and confirmed the committed attack resolves unrevised), to run for
  exactly its declared length, and to never be dangerous; the arena hazard
  read off the real `World` directly — non-hazard before, `HAZARD` for
  exactly its declared window, reverted after — and a player standing in a
  live vent taking real damage through the same generic hazard path every
  other tile already uses; determinism through a full phase transition and
  zone attack; two-player fairness (aggro locks to the nearer player, the
  other takes zero damage from that commit).
- One real, genuinely useful discovery while writing the suite, correctly
  attributed rather than worked around blindly: a Kilnwarden shot already
  in flight can connect with the player mid-transition (shots are
  independent entities, not paused by the boss's own state), and
  `Player.hurt()`'s existing 8-tick impact hitstop then freezes the whole
  sim — boss `stateFrames` included, since `Sim.step`'s frozen branch
  returns before any entity updates at all. This is correct, pre-existing
  behavior, not a boss bug. The suite's first draft counted frozen ticks as
  transition progress and failed (28 vs. an expected 20); fixed by counting
  only non-frozen ticks, which is the more robust test regardless of
  whether this exact coincidence recurs at another seed.

### Still open

The boss health bar and phase-transition screen cue (a graft suggestion
from the losing Pyrewarden concept) were scoped as optional `80-view.js`
polish and are not built — Kilnwarden already renders for free through the
existing generic tinted-rect enemy path, so this is cosmetic, not a
correctness gap. `60-run.js` does not exist, so there is currently no way
to reach Kilnwarden from an actual playthrough — every assertion in
`verify_boss` constructs it directly, the same way `verify_enemy.js` has
always tested the regular roster in isolation from `95-app.js`'s boot flow.
Economy, meta-progression, weapons/grafts as data (D7), and the story-events
system (D11/D12, scoped the same session) remain designed and not built.

---

## v0.2.6 — 2026-08-11 — the demo level is replaced: boot plays a real generated level

**GREEN: 885/885 assertions across 10 suites (unchanged — this is a wiring
change, not a new suite).** `95-app.js`'s `boot()` now plays a real
`Gen.generate()` level as its primary path, closing the gap v0.2.5 explicitly
left open: "`95-app.js` still boots the hand-built demo level... that swap is
explicitly deferred." Asked directly which "continue" meant — wiring the
generator in, or starting the boss — before touching anything, since a wrong
guess here would have meant real wasted work in either direction.

### The seed

A fresh `Date.now()` on every boot, not `Math.random()` — `95-app.js` is
scanned by `verify_arch` for the same reason `80-view.js` is (presenter
screenshots must stay frame-to-frame comparable), and `Math.random` alone is
what's banned there; `Date.now()` read once at boot, not per frame, is fine
and already how the rest of the codebase treats the sim/presenter boundary.
A `?seed=12345` query param overrides it, matching this file's existing
debug-toggle conventions (F2 co-op join, F3 meter, F4 hitboxes) — without it,
a bug found in some run's generated shape is gone the instant the tab
reloads.

### The safety net demoLevel() didn't have before

`Gen.generate()` already guards its own fairness (D3a) and its own hard
ceiling — throws rather than ever handing back something unfair. A new
`generatedLevel()` wrapper adds a second, independent net around that: if
generation ever genuinely fails (an intentionally-impossible CFG in this
session's own testing, not something the shipped config can reach), it falls
back to `demoLevel()` — loudly, via `console.warn` naming the real error,
never silently. `demoLevel()` itself is not deleted; it keeps existing for
exactly this, and the masterfile's old framing ("deleted the day 50-gen.js
lands") was corrected rather than carried forward once it stopped being true.

### Enemy placement is not 50-gen.js's job — stated in its own header — so where does it live now?

`60-run.js` (spawn → clear → boss → death → spend, D1) doesn't exist yet.
Shipping a generated level with real geometry and zero threats until it does
would be a real regression from what already existed (the demo level's four
enemies + a dummy). A new `placeGeneratedEnemies()` in `95-app.js` — not
`50-gen.js`, preserving that file's stated architectural boundary — is
explicit, temporary scaffolding: it walks the generated beat sequence,
skips the spawn platform and every spur, and assigns up to one roster
template per chosen platform, roughly evenly spaced, so each is met alone
before any are met together — same placement philosophy the hand-built demo
level always used, just computed from real generated geometry instead of
typed by hand. A practice dummy is placed the same way, a short, safe walk
from spawn.

**What is generated but still goes nowhere.** `Gen.generate()`'s `pickups`
and `exit` are real data — coordinates, nothing more. Neither has a visual
marker or an interaction yet: there is no pickup-collection system (D2) and
no run loop (D1, `60-run.js`) to react to reaching the exit. Stated plainly
rather than left to be assumed from "the generator is wired in."

### Verified against the real thing, not just read as correct

- `bash tests/run_all.sh` → **GREEN 885/885 across 10 suites**, unchanged —
  this integration is a boot-path wiring change, and `verify_render`'s own
  existing assertions (spawn is finite, the player settles on the floor with
  full HP, a training dummy exists within melee range and takes real damage,
  a keystroke moves the character, the jump key lifts it) all now exercise a
  REAL generated level rather than the hand-built one, and stayed green
  without a single assertion needing to change.
- A real CDP session (mirroring `verify_render`'s own approach, not a new
  npm dependency) drove the actual built `cinder-loop.html` directly and
  confirmed, against real boots rather than by reading the code: two fresh
  loads with no seed override produce genuinely different levels (world
  dimensions, spawn, everything); the same `?seed=` reproduces an identical
  level twice, byte for byte in every field checked; two different `?seed=`
  values produce different levels; and — forcing `GEN_RISK_CHANCE` to 1.0 and
  `GEN_MAX_RISE_TILES` to 0 in a temporary, reverted edit, the same
  impossible configuration `verify_gen`'s own hard-ceiling test uses — the
  fallback net engages exactly as designed: a visible `console.warn` naming
  the real thrown error, then a fully playable `demoLevel()` boot, not a
  blank tab.
- Co-op spawn safety, across five different seeds (1, 2, 3, a fresh
  Date.now()-derived seed, and 999999): triggering the same debug co-op join
  the F2 key drives (`sim.addPlayer()`) lands player two `onGround`, on the
  same platform surface as player one, every time — the derived spawn offset
  (`+2 tiles` from player one, mirroring the demo level's own `+2 tile` gap)
  never lands anyone off the edge of the generated spawn platform, which is
  guaranteed wide enough by construction (`GEN_MIN_FIGHT_TILES` and up).

### Still open

`60-run.js` (the actual spawn → clear → boss → death → spend loop, D1) does
not exist, so the generated `exit` and `pickups` remain inert data — see
above. The boss, economy, meta-progression, and weapons/grafts as data (D7)
remain designed and not built.

---

## v0.2.5 — 2026-08-11 — 50-gen.js: procedural generation + the fairness audit (D3, D3a)

**GREEN: 885/885 assertions across 10 suites. `cinder-loop.html`, 189,708
bytes.** `50-gen.js` — pure-core-plus-generator, matching the
`90-settings.js`/`92-menu.js` and `94-touch.js` split — plus its own suite,
`verify_gen` (56 assertions), registered into `tests/run_all.sh`.

### What D3a actually is, not just what it's named

"Every generated level runs a reachability pass from spawn to exit and to
every pickup, asserts minimum fightable-platform widths, rejects and
regenerates any failing layout, and REPORTS the rejection rate" is the whole
spec. `Gen.generate(seed)` owns one seeded RNG instance across the entire
reject/regenerate loop (L4 — determinism holds even across retries), builds
a candidate, runs `audit()` against it, and either stamps a real `World` or
tries again — up to `GEN_MAX_ATTEMPTS` (200), which throws loudly rather
than ever handing back something its own audit would reject. The audit
itself is a DIRECTED reachability graph (`buildGraph`/`reachableFrom`, a
real BFS) built from a pure capability model (`maxGapForRise`/
`minGapForRise`/`gapBetween`/`edgeAllowed`) plus a per-platform width check
exempting spurs (bonus alcoves, allowed to be narrow — the rule is about the
PATH, not every surface).

`GEN_RISK_CHANCE` (tuned to 0.02 by sweeping several values against 60 seeds
each) deliberately injects unfair placements often enough that the audit has
real, non-vacuous work to do — confirmed directly rather than assumed: over
60 seeds, the aggregate rejection rate sits at 21.1%, 47/60 seeds needed zero
regeneration and 13/60 needed at least one, and the hard ceiling is proven
reachable by feeding a config so hostile every candidate is certain to fail
and confirming `generate()` throws rather than hanging or lying.

### The capability numbers are measured, not guessed (L8)

Every `GEN_*` gap ceiling in `00-core.js` is a real sim measurement with
margin subtracted below the true reliable maximum, using the SAME discipline
established for the original movement numbers in `verify_move`: hold jump
through the natural apex rather than tap-and-release, because a one-tick tap
silently triggers this game's own short-hop mechanic (`JUMP_CUT`) and
measures a cut arc instead of the true maximum — a mistake that already cost
real time once and was not repeated here.

### The bug the physics cross-check exists to have caught

D3a's justification is that an unfair layout "shows up as 'that run felt
bad,' the hardest bug class to chase, because nothing crashed." `verify_gen`
proves the audit's graph model isn't lying to itself the same way — not by
re-deriving a second graph implementation (L8 forbids grading your own
homework), but by having a REAL player, through REAL sim ticks, attempt
every edge the audit calls legal, in an isolated two-platform world built
from nothing but that pair's own coordinates.

It found a real one. A double-jump climb needs a FLOOR under the gap, not
just a ceiling — at gap 0 the rising arc's own horizontal drift can carry
the body under the target platform's footprint before it has climbed high
enough to clear it, hitting the target's own underside like a low ceiling.
`GEN_DBLJUMP_MIN_GAP_TILES: 1` already existed to prevent exactly that. But
the cross-check, exercising real generated rise-5 edges (the top of
`GEN_MAX_RISE_TILES`), kept finding edges the audit called legal that a real
held jump could not clear — traced directly, the same underside collision,
just needing more clearance at this tighter margin. A clean gap sweep at
rise 3, 4, and 5 (the canonical run-to-edge, hold-to-apex,
release-and-repress-at-apex technique) confirmed it precisely: gap 1 clears
reliably at rise 3-4, but fails every time at rise 5, where gap 2 is the
true minimum. `maxGapForRise` already split the double-jump range into two
sub-bands for exactly this reason (a tighter ceiling, `GEN_DBLJUMP_HIGH_GAP_TILES`,
for rise 5) — the floor just hadn't followed the same split. Fixed with a
new `GEN_DBLJUMP_HIGH_MIN_GAP_TILES: 2`, mirroring the existing boundary.
Before this fix, the audit was silently calling a real, unreachable climb
"legal."

### Getting the prover itself trustworthy took real iteration, stated plainly

Landing precisely on a specific nearby platform via momentum-based
platforming has no single universal "correct" input timing, and chasing one
was the wrong problem: a version that released at a target's leading edge
confirmed 164/174 real edges; switching to releasing at the target's CENTER
(reasoning that residual momentum needed room to land inside a narrow
platform) fixed some overshoots and broke others, regressing to 151/174. The
claim actually being checked is narrower — does THERE EXIST a real technique
that lands this hop — so the final prover tries five genuinely distinct
strategies (leading-edge release, center release, full-hold, and a genuine
short tap-and-release for each of the first two) and calls an edge confirmed
if any one of them lands.

Two more real prover bugs, both found by tracing a specific failure in full
tick-by-tick detail rather than guessing at another fix: a version that
never presses jump at all for a flat-or-descending hop assumed drops don't
need one, which is backwards — every non-zero gap is normally crossed by
jumping (that's what the flat/drop ceiling itself measures), and removing
the jump entirely regressed results from 167/174 to 115/174. And the
double-jump trigger fired blindly off "jump 1 reached its natural apex"
(`vy >= 0`) with no regard for whether the needed height had already been
reached — traced directly on a tight (gap 1) rise-3 climb, the rising body
clips the SIDE of the target platform and slides pinned against that wall
for many ticks while still rising, arriving at exactly the needed height for
free by the time it clears the top edge; the height-blind trigger pressed a
needless second jump anyway, launching a wildly overshooting extra arc. Both
fixed by checking real state (`b.y > targetY`) instead of assuming it.

One test-fixture bug, also real: a hand-built `edgeAllowed` boundary case in
`verify_gen`'s own section 1 repeated the exact off-by-one its neighbouring
fixture already carries a comment warning about (`gapBetween`'s `-1` means
landing one tile PAST a ceiling needs `+1` twice, not once) — silently
proving nothing until the physics cross-check's own churn surfaced it.

### Verified

- `bash tests/run_all.sh` → **GREEN 885/885 across 10 suites**, all nine
  prior suites unaffected by 50-gen.js's integration into `harness.js`'s
  `SIM_FILES` and `build.py`'s module list.
- `verify_gen` (56/56): the pure capability model against hand-derived
  boundaries; the directed graph/BFS against hand-built platform lists with
  a known right answer (never derived from the generator itself); the audit
  against hand-built fair and deliberately unfair candidates; the generator
  itself (determinism across the full reject/regenerate loop, structural
  sanity across 40 seeds, every generated level still passing a fresh audit
  of its own platform list, the non-vacuous rejection-rate band, the hard
  ceiling); and the physics cross-check — **174/174 real generated edges
  physically confirmed by a real held jump**, 6 zero-gap edges correctly
  out of scope.
- Two real product bugs found and fixed during this same D3a effort, not
  just the rise-5 floor above: `edgeAllowed` originally OR'd both directions
  of rise into one undirected edge, so a valid DROP could silently license
  an invalid CLIMB the other way — fixed by making the graph genuinely
  DIRECTED; and the original missing double-jump floor (`GEN_DBLJUMP_MIN_GAP_TILES`)
  itself, described above.

### Still open

The demo level in `95-app.js` is **not yet** replaced with a real
`Gen.generate()`-produced level — `50-gen.js` landing and that swap are
being treated as separate steps, and only the former is done here. Boss,
economy, meta-progression, weapons/grafts as data (D7) remain designed and
not built.

---

## v0.2.4 — 2026-07-26 — watch: a static mockup, not a companion

**A standalone file, `CINDER_LOOP_WATCH_MOCKUP.html`, at the project root —
not part of `cinder-loop.html`, not built by `build.py`, no gate/suite
entry.** Closes out the three-platform scope (PC, phone, watch) set at the
start of this 2026-07-26 session.

### The decision, made explicitly rather than defaulted

Before anything was built, three real interpretations of "watch companion"
were named and put to a direct choice: a static design mockup with sample
data; a genuinely live view over a new local network bridge (a deliberate,
scoped exception to the game's own zero-network stance, for this one
optional feature only); or a real native Wear OS app in Kotlin against
Android's Data Layer API — architecturally a wholesale separate project in a
different language and toolchain, not an extension of anything already
built. **The static mockup was chosen.**

This mattered enough to ask rather than assume: the game is single-file,
zero-network, no server, by design (L2), and Wear OS has no standard path to
sideload an arbitrary HTML page the way a phone browser can install a PWA —
so "show live run status on the watch" is not a small feature on top of what
exists, it is a data bridge that does not exist in any form yet, and the
three options above build three very differently-scoped versions of it.

### What was built

A single self-contained HTML page, sized to the Galaxy Watch6 Classic's
actual native resolution — 480×480, round 1.5" AMOLED, not a guess — with a
decorative bezel ring (evoking the Classic's signature physical rotating
bezel; not interactive, since real bezel input is a native rotary-input API
with no web equivalent) and a circular face reusing the game's established
visual language: the ember/cloth palette, the same heart-HUD colors
(`#d1495b` filled, `#3a2f36` empty) pulled directly from `95-app.js`'s own
meter, and a miniature version of the hood/ember icon motif already used for
the PWA app icon (v0.2.3) — one visual language across the whole project,
not a new one invented for this page.

Every value on the face — 2 of 3 hearts, a `04:12` run timer, "Ashfall
Reach," a room count — is a fixed sample. There is nothing for it to read
from. The one genuinely live element is the timer's own tick: real elapsed
wall-clock time since the page loaded, explicitly labelled in the page's own
caption as exactly that and nothing more. The disclosure ("STATIC MOCKUP —
NO LIVE DATA CHANNEL," plus a full explanation of what a real version would
need) sits in the page chrome surrounding the circular face, not inside it —
the face itself stays a clean, honest piece of UI design, the same way a
real watch-face-picker's own surrounding UI carries labels the face itself
never would.

### Verified, and explicitly not verified

Confirmed in real headless Chromium at exactly 480×480: zero console errors;
the face and inner circle measure 480×480 and 436×436; three hearts render
with two full; the timer starts at `04:12` and was observed advancing to
`04:13` after slightly over a second of real time. **Not verified: anything
about physical Wear OS hardware** — no device was available to this session,
and there is no standard way to get this specific file onto one in the first
place. Stated plainly rather than left implied, matching the project's own
frame-meter caveat in masterfile §5 ("cannot be measured from here").

### Still open

`50-gen.js` and D3a; the boss; weapons/grafts as data (D7). A genuinely live
watch companion, if ever wanted, needs one of the two real-infrastructure
paths named above and not chosen here.

---

## v0.2.3 — 2026-07-26 — phone: touch input (D10), PWA, safe-area

**GREEN: 820/820 assertions across 9 suites. `cinder-loop.html`, 168,472 bytes.**

Phone platform work, following PC hardening (v0.2.2) per the established
device order. Two parts: a judged design panel to pick the touch-control
scheme before writing implementation code, and the implementation itself —
`94-touch.js`, PWA installability, safe-area handling, all within the
single-file/zero-network constraint (L2).

### The design panel

Three independently designed touch-control schemes — a virtual d-pad +
buttons, a swipe/gesture surface, a floating-stick hybrid — were each scored
by two independent judges against five criteria grounded in this game's own
measured mechanics (0-frame input latency, the 5-frame jump buffer, roll as
a discrete press not a hold, the down+attack heavy combo, multi-touch
identifier tracking). Both judges checked every citation against the LIVE
source before scoring rather than trusting the proposals' own line
references, and caught two false integration claims in the eventual winner
before anything was built:

1. "Pause-menu navigation already routes through Pad" — it does not.
   `Pad.update()` only ever runs from `Sim.step()`, which is never called
   while `app.paused`. New menu-routing glue was needed, the same way
   keyboard and gamepad each already needed their own.
2. "Touch capability is detected via `'ontouchstart' in window`" — a known
   false-positive trap, independently measured during THIS SAME session's
   earlier PC-hardening pass: a plain headless launch with zero touch
   emulation active reported touch support through it. The codebase already
   used the correct signal (`matchMedia('(pointer: coarse)')`, fixed before
   the panel's synthesis was even read) — the panel's correction and the
   code already agreed, confirming rather than contradicting that earlier fix.

**Gesture Surface won outright** (39/50, 39/50 vs 34–37/50) on the two
criteria the brief treats as hardest: screen real estate (no fixed button art
ever occupies play-area pixels — the other two schemes' fixed overlays sat
directly over camera-framed gameplay space) and the heavy-attack solve (no
combined-gesture recognition needed at all — two independently tracked touch
identifiers overlapping in time is sufficient, because `Combat.begin` already
reads `pad.down('down')` at the moment it consumes the buffered attack press).

### Implementation — `94-touch.js`

Split like `90-settings.js`/`92-menu.js`: a pure core (`zoneAt`, the `Stick`
hysteresis state machine — 14px to enter a direction, 8px to release it,
independently per axis) that a bare Node sandbox tests directly, plus a thin
DOM-facing shell. Five zones: a dead strip across the top (except a
pause-tap corner), a movement half (floating stick, first-claim-wins,
excess fingers tracked as zone-tagged ghosts), and three refcounted action
bands (jump/roll/attack) on the right. No opaque button art, ever — faint
glyph outlines that fade further after the first several real touches.

Multi-touch bookkeeping runs unconditionally on every touch event regardless
of pause state (`Pad.set()` only writes to `.next`, consumed solely by the
sim-clocked `Pad.update()`, which never runs while paused — so this is safe,
not careless); while paused, the SAME zone transitions additionally drive
`menu.move()/confirm()/cancel()` through new glue functions, mirroring the
existing `pollMenuGamepad` pattern.

### The bug this whole feature's test suite exists to have caught

Ghost promotion (handing stick ownership to a second finger already resting
in the movement zone, once the first lifts) iterated `for...in` over a plain
object and used the loop's own key as the new `stickOwner`. **`for...in`
always yields STRING keys**, regardless of what type the original property
name was — so `stickOwner` silently became the string `"2"` where a real
`Touch.identifier` is always the number `2`. Every subsequent `touchmove`'s
strict `t.identifier === this.stickOwner` check (`2 === "2"`) would then
permanently fail, freezing movement the instant a promotion happened — a bug
invisible to any assertion that only checked "did a promotion occur," and
caught only by a second assertion that dispatched an actual `touchmove`
through the promoted ghost and confirmed the pad still responded. Fixed by
storing each touch's identifier, typed exactly as given, on the record
itself rather than re-deriving it from a `for...in` key.

The second property both judges flagged in the winning proposal's prose —
that a touch which started in a different zone (e.g. the jump band) could be
wrongly promoted to stick ownership — turned out to be structurally
impossible in this implementation by construction: zone is decided once at
`touchstart` and a ghost can only ever be drawn from touches whose own zone
is already `move`. A test proves this directly (a held jump-band touch is
never promoted when the real stick owner releases) rather than trusting the
structural argument alone.

### PWA and safe-area, honestly scoped within L2

A Web App Manifest and an on-brand SVG icon (the in-game hood/ember head,
enlarged — reusing the established visual language rather than inventing a
second one) are embedded as `data:` URIs in `build.py`'s generated `<head>`.
This reaches real installability via the browser's manual "Add to Home
Screen" — the automatic `beforeinstallprompt` banner additionally wants a
same-origin service worker, which cannot be registered from a `data:` URL at
all per spec and is not claimed here. `apple-touch-icon` as SVG is
best-effort; some iOS versions fall back to a page-screenshot icon instead,
and there is no image-rasterization step in this project to solve that with.

`viewport-fit=cover` — already present in the `<head>` before this session,
prepared for and simply unused — is what makes `env(safe-area-inset-*)`
resolve to anything but `0`. CSS custom properties expose the same values to
JS for canvas-drawn chrome, which CSS alone cannot keep clear of a notch.

The rotate hint (`@media (pointer: coarse) and (orientation: portrait)`) is
a nudge, not a lock — a real orientation lock needs the Fullscreen + Screen
Orientation APIs, both gated behind a user gesture this page never forces.
The manifest separately sets `orientation: "landscape"` as a soft preference
for an installed instance only, which does nothing for a plain browser tab —
why both exist rather than either alone.

### Verified

- `bash tests/run_all.sh` → **GREEN 820/820 across 9 suites**, confirmed
  across three consecutive full-gate runs after fixing a timing flake (below).
- Real dispatched touch input (`Input.dispatchTouchEvent`, not a mocked
  event) driving the actual pipeline end to end: a dispatched drag moves the
  live sim player's `x`; a dispatched jump-band tap produces real negative
  `vy`; two simultaneous dispatched touches produce a real `heavy` attack;
  a dispatched pause-corner tap opens and closes the real menu.
- One flaky assertion, found and fixed: the heavy-attack test passed
  standalone and failed inside the full gate (more contention, more
  scheduling jitter). Root cause: `pad.down('down')` reads `pad.cur.down`,
  which only advances from `.next` one sim tick after `Pad.set()` — a fixed
  sleep duration assumed enough real ticks had elapsed rather than confirming
  it. Fixed by polling the actual observable state (`pad.cur.down`) before
  proceeding, instead of trusting a timer; three consecutive full-gate runs
  green afterward.
- Screenshot at `tests/out/touch-overlay.png`: faint idle glyphs, a bright
  held stick, a highlighted active jump chevron — the play area stays
  completely dominant, matching the panel's judged rationale for why this
  scheme won.

### Still open

`50-gen.js` and D3a; the boss; weapons/grafts as data (D7); the Galaxy
Watch6 Classic companion status view (data-only, no gameplay, per this
session's scoping decision) — the remaining platform target.

---

## v0.2.2 — 2026-07-26 — enemy roster + PC platform hardening

**GREEN: 725/725 assertions across 8 suites. `cinder-loop.html`, 141,405 bytes.**

Two pieces of work in one pass, in the order they had to happen: the four
enemy templates (`10-data.js`, `45-enemy.js`) so there is something to fight,
then PC hardening (`90-settings.js`, `92-menu.js`, DPR-aware resize in
`80-view.js`/`95-app.js`) so the game is actually configurable and pausable on
the platform it already runs on, before phone touch input or a watch
companion view get built on top of it.

### Enemies: the fairness rule is the whole design

Four templates, D9's fixed roster: **Ashwalker** (walk+melee, the baseline),
**Emberrush** (walk+charge — roll THROUGH it, the long recovery after a whiff
is the punish window), **Kilnspitter** (stationary+shoot, an arcing ember that
dies on terrain or a timer), **Wickmoth** (fly+dive, gives the jump a combat
purpose). The engine now knows four movement/attack primitives; a fifth enemy
costs a data row, a fifth archetype costs one new primitive.

**The rule an attack must obey, everywhere:** an enemy commits its facing at
the start of its telegraph (`MIN_TELEGRAPH` = 14 frames, floor for every
template) and cannot revise it. `verify_enemy`'s dodge test runs this against
all four templates — commit, then run the other way, `lockFacing` must never
move — and the first draft of that test asserted something BROADER and wrong
("you can always walk away"), which failed three of four templates correctly,
because fleeing in a straight line does not beat a 4.6 px/frame charger and
was never supposed to. The test was rewritten to the actual invariant; the
code did not change.

One shared damage function, `Combat.resolveBox`, now serves both directions —
the player's blade and an enemy's claw resolve through the identical code,
because the moment there are two places that subtract from hp, neither of
them is the rule. `Combat.pointToWorld` was generalized to take each entity's
OWN pose box (`poseW`/`poseH`) rather than hard-coding the player's 10×22, so
Ashwalker's `clawA` bakes and overreach-audits on its own 12×24 proportions —
L9 was never a rule about the protagonist specifically, and now nothing in the
code assumes it is.

Contact damage is gated on `dangerous()` — an Emberrush merely patrolling is
safe to stand next to; only mid-charge does touching it hurt. Every enemy
carries its own seeded RNG (L4): two Ashwalkers at the same spot with
different seeds provably wander differently.

The telegraph pulses amber/dim in the presenter (`80-view.js`), because a
fairness rule nobody can see is not a fairness rule a player can use.

### PC hardening

- **Pause is presenter-owned; the sim never learns it exists.** The
  accumulator simply is not fed while paused — no burst of catch-up steps on
  resume, no matter how long the menu was open (L3 intact both ways).
- **`90-settings.js`** — pure sanitize/serialize/rebind, storage-agnostic,
  tested against the real functions in a bare sandbox (L8). **`92-menu.js`**
  — an in-canvas pause/options menu that is deliberately NOT part of
  `80-view.js`: it never touches the bus or reads sim state, so folding it in
  would have blurred the one boundary in the project a source scan can verify
  by itself.
- **Rebinding is live**, not a rebuild: `Settings.actionForCode` replaced the
  static `KEYMAP`.
- **Settings persist** to `localStorage['cinderloop.settings.v1']`, with
  exactly two lines in the whole project allowed to throw on storage access,
  both in `95-app.js`, both wrapped.
- **Reduced motion** thins particles to ~35% and damps camera shake to 15% —
  not the same cut for both, because shake is the vestibular trigger and
  particles are just density.
- **DPR-aware resize**, capped at 2x.

### Bugs found and fixed

1. **A stray closed comment broke the entire build.** An edit closed a `/*
   */` block one sentence early; the trailing prose fell out and became bare
   JavaScript — `Unexpected identifier 'button'`, a SyntaxError failing the
   WHOLE assembled script. All 654 sim-side assertions across 7 suites stayed
   green throughout, because none of them load the built HTML file — only
   `verify_render` does, and even there the first symptom was an opaque
   `Cannot read properties of undefined` several calls downstream. **Fixed
   permanently, not just this once:** `build.py` now runs `node --check`
   against the fully assembled script before writing it, treating a missing
   `node` as fatal rather than silently skipping the check.
2. **The same edit pass also broke real window resizing, in production, not
   just the test.** DPR support added `canvas.style.width/height = cssW +
   'px'` on the theory that something needed to pin the CSS box size. Nothing
   did: the stylesheet's `#game{width:100%;height:100%}` rule already fully
   controls on-screen layout independent of the canvas's width/height
   attributes. The pin actively broke it — an inline pixel style outranks a
   percentage rule, so after the FIRST resize call the canvas's own
   `clientWidth` stopped measuring its container and just echoed back
   whatever had last been written, silently freezing the game at its
   boot-time size for the rest of the session. A resize-hardening assertion
   that measured `clientWidth` before and after a REAL viewport change (via
   CDP `Emulation.setDeviceMetricsOverride`) caught it — an earlier version of
   that same assertion only checked "stays finite," which was vacuously true
   whether or not the resize was actually happening, and would not have
   caught this. Fixed by removing the pin entirely.
3. **`verify_render` used to die silently on any mid-run throw**, printing one
   bare error line and discarding every assertion that had already passed.
   Both bugs above were originally diagnosed through that same opaque
   failure. `s.done()` now always runs and reports partial results even after
   a throw, with the throw itself recorded as one more failing line.
4. Two smaller sanitizer bugs, both in the new code, both caught by
   `verify_platform` before they shipped: a single-pass keybind-collision
   resolver let an early action's INVALID request fall back to a default that
   stole a key a later action had validly and explicitly asked for (fixed by
   splitting sanitize into two passes — claim every valid explicit request
   first, fill defaults only after); and `tests/cdp.js`'s key map was missing
   `Escape`/`Enter`/`ArrowUp`/`ArrowDown`/`KeyP`, needed once the render suite
   started driving the pause menu for real.

### Verified

- `bash tests/run_all.sh` → **GREEN 725/725 across 8 suites**, including the
  new build-time syntax gate.
- Real browser: Escape opens/closes the pause menu and the sim tick provably
  stops and resumes; ArrowDown+Enter navigates into Options and back out;
  five device-metric overrides (narrow, wide, below the 320×240 floor,
  square, forced 3x DPR clamped to 2x) all leave the logical size and the
  canvas's real `clientWidth` in agreement; a real `localStorage` payload
  (built with the actual `Settings` module, not reimplemented) survives a
  page reload, and a deliberately corrupted payload does not prevent boot.
  Screenshots at `tests/out/menu-root.png`, `menu-options.png`,
  `menu-rebind.png`, `enemies.png`.

### Still open

`50-gen.js` and its D3a fairness audit; the boss; weapons/grafts as data (the
moves in `35-rig.js` still want to move to `10-data.js`, per D7); phone touch
input; the Galaxy Watch6 Classic companion status view (data-only, no
gameplay, per this session's scoping decision).

---

## v0.2.1 — 2026-07-26 — the player, redesigned

**GREEN: 416/416 assertions across 6 suites. `cinder-loop.html`, 93,111 bytes.**

The player was a 10×22 cream rectangle with a 3px facing pip. It is now a
hooded figure posed from a full skeleton: cloak, tapered torso, articulated
legs and arms, a hollow hood with an ember eye, and one hot ember at the chest
— the only saturated point on the character, so the eye finds the player in a
crowded frame.

### Where the skeleton lives, and why

In `35-rig.js`, beside the weapon poses, **because the two have to agree about
where the shoulder is**. `FIG` anchors the front shoulder at
`CFG.RIG_SHOULDER`, and both the body and the blade reach the screen through
`Combat.pointToWorld` — the same transform the sim tests hitboxes with. The arm
drawn on the body, the arm in a swing, and the box that swing tests are one
piece of geometry. Mid-swing the drawn hand *is* the baked hand: asserted by
object identity, not by comparing numbers.

### Decisions

- **Gait is driven by distance travelled, not a timer.** A time-driven cycle
  slides the feet the moment speed changes. Stride is 60px per two-step cycle,
  which puts a footfall every 12 frames at run speed — the same cadence as the
  `step` event. The roll is spun by distance for the same reason.
- **Poses are a table, not branches.** Everything a state needs to look
  different is a row in `STANCE`; a state with no row is a named failure rather
  than a silent fallback to idle.

### Five bugs, all mine, all caught by drawing it

The first draft looked wrong on screen, and each fix produced an assertion:

1. **Lollipop head.** A 3.1px radius on a 22px figure. Now 2.2 plus a 0.6 hood
   ring — about 25% of body height.
2. **Legs merged into the torso.** A 5.4px-wide uniform bone drew straight over
   them. The torso is now a tapered mass, shoulders wider than hips.
3. **Legs invisible against the cloth.** `limbNear` was within a few percent of
   `cloth`. The palette now uses four widely-separated values.
4. **Crouch floated 5px off the ground.** The stance dropped the hips to 18 and
   left the legs at standing angles. *Assertion added: feet land on y = 22 in
   every grounded stance.*
5. **The carried blade went through the floor.** The sword is 16px past the
   elbow, not 11 past the hand — I under-computed the reach. At rest it buried
   the tip; on the run back-swing it reached 25px deep. *Assertions added: the
   carried blade never crosses the ground line across a full gait sweep of
   every state, and stays inside the baked swing envelope — bounded against the
   envelope rather than a typed number, so the check survives re-proportioning
   the weapon.*

Bugs 4 and 5 were invisible to every other assertion in the project, because
nothing else looks at where the drawing puts things.

### Verified

- `bash tests/run_all.sh` → **GREEN 416/416 across 6 suites**.
- Composited close-ups at `tests/out/fig-run.png` and `tests/out/fig-swing.png`.
  The swing frame is `slashA#6` held still by hitstop: hot blade at the end of
  the arc, sparks, the struck dummy in its i-frame tint.

### Still open

The three moves remain in `35-rig.js`; they belong in `10-data.js` (D7). The
enemy roster is unchosen — the four templates are Chris's call and were not
guessed.

---

## v0.2.0 — 2026-07-26 — hitbox bake + combat

**GREEN: 389/389 assertions across 6 suites. `cinder-loop.html`, 81,441 bytes.**

### Built

| File | Contents |
|---|---|
| `src/35-rig.js` | forward-kinematic skeleton, three moves as pose data, hitbox bake at boot, the D6 overreach audit |
| `src/40-combat.js` | attack state machine, hit resolution, combo chaining, cancels, hitstop policy, the training `Dummy` |
| `tests/verify_rig.js` | 42 assertions — the bake, and the audit fired at poisoned bakes |
| `tests/verify_combat.js` | 54 assertions — hits, misses, facing, crouch anchoring, i-frames, hitstop, combos, cancels, determinism |

Also touched: `00-core.js` (rig/combat tunables, five new bus events),
`30-player.js` (`attack`/`actionLock` fields, attack drift, optional knockback
vector on `hurt`), `70-sim.js` (rig, targets, the four-phase step order),
`80-view.js` (blade, dummies, hit sparks, F4 hitbox overlay), `95-app.js`
(training dummies, F4), `verify_render.js` (+4 assertions: swing at a dummy in
the built file).

### Decisions

- **Active windows are derived, not authored.** A frame carries a hitbox when
  the blade tip travels ≥ 12px between ticks. Startup, active and recovery are
  consequences of the animation rather than numbers anyone types. Windup may
  legally swing the blade behind the character — it just moves too slowly to
  carry a box, which is why the rule is expressed as speed.
- **The attack state machine lives in `40-combat.js`, not `30-player.js`.** An
  attack needs the rig, and 30 sits below 35 in the one-way dependency. The
  player exposes `attack` and `actionLock`, reads them as its own fields, and
  never learns what a move is.
- **Hitstop is split.** Sim owns the counter because Sim owns the tick; Combat
  owns the policy — what a given hit is worth.
- **One transform, used by both sides.** `Combat.pointToWorld` is what the sim
  tests hits with AND what the presenter draws the blade from. If those two
  ever diverge the weapon hits somewhere it visibly is not, which is the exact
  complaint L9 exists to prevent.
- **Hitboxes anchor to the FEET, not the body top.** The body shrinks upward
  when crouching, so anchoring to `body.y` would drag every box 10px down and a
  crouched swing would hit the floor instead of the enemy.
- **One hit per target per move.** Without it a 3-frame active window is a
  3-hit move and every damage number in the game is a lie.
- **An early combo press is buffered, not eaten.** Pressing attack during
  startup leaves the press in the pending buffer so it fires the instant the
  chain window opens, instead of being silently discarded.

### On the audit being non-vacuous

Boxes derived from the animation are structurally hard to violate — which is
precisely the condition under which a check becomes a no-op nobody notices for
a year. So `verify_rig` fires every rule at a deliberately poisoned bake:
inflated box, one-pixel pad, box reaching behind the character, box lingering
on a still frame, a move that cannot hit anything, an authored hitbox smuggled
into the data, a malformed pose frame. Each must be caught, a pad within the
stated skin must be tolerated, and an untouched copy of the same shape must
stay clean.

The shipped moves passed the audit on the first run, and the derived active
windows (4–6, 3–5, 9–11) matched the frame-by-frame arithmetic done before the
code was written.

### Bugs found and fixed

No sim defects surfaced this round. Three test defects did:

1. **Off-by-one in the hitbox-window sample.** Sampling began after the opening
   tick, so `seen[i]` was move frame `i+1` and the assertion looked for one
   startup frame too many.
2. **The left-facing swing test walked the player out of position.** Holding
   the turn key for six frames moved the character 15px, so the mirrored box
   landed short of the dummy — the test was moving the swing rather than
   testing it. Turning now uses a one-tick tap, with an assertion that the
   player stayed put.
3. **The i-frame retry test used a tick budget.** Hitstop freezes the target's
   i-frame counter along with everything else, so any hand-counted "swing again
   in N ticks" is wrong the moment a hitstop value changes. It now drives off
   the target's own counter.

### Verified

- `bash tests/run_all.sh` → **GREEN 389/389 across 6 suites**.
- Headless Chromium: the attack key starts a `slashA`, the training dummy goes
  40 → 34 hp (exactly the documented light-slash damage), F4 toggles the
  overlay, zero console errors.
- Composited frame captured mid-swing with the overlay on: the drawn blade sits
  inside its tested hitbox, the struck dummy flashes its i-frame tint, sparks
  fly, hitstop is live. `tests/out/combat.png`.

---

## v0.1.0 — 2026-07-26 — movement core, rebuilt from the masterfile

**GREEN: 271/271 assertions across 4 suites. `cinder-loop.html`, 57,018 bytes,
one file, zero network.**

### Starting point

`Z:\CINDER LOOP` was empty. The masterfile's status line described a v0.1.0
with 171 assertions "verified in a real browser" that had never been written —
confirmed by a sweep of `Z:\`, `C:\Users\Obliv` to depth 4, `D:\` and
`G:\My Drive`, which found no CINDER LOOP artefact anywhere on the machine.
Chris confirmed the original never existed, so what is described below **is**
v0.1.0. The process lesson is recorded permanently in masterfile §6.

Two facts worth keeping from that sweep: the predecessor projects named in the
L-series are all present in `G:\My Drive` (`IRON CIRCUIT`, `CROSS CIRCUIT`,
`CROSSFLOW`, `IRON EPOCH`, `CHAIR`), and `C:\Users\Obliv\Downloads\bramble-and-pike`
is a working reference for the same process discipline in Godot — the method
transferred, none of the code did. The L14 three-document sync had never
happened for this project; it has now.

### Built

| File | Contents |
|---|---|
| `src/00-core.js` | CFG (every tunable), mulberry32 RNG with snapshot/restore, typed Bus, math helpers |
| `src/05-input.js` | `Pad`/`Pads`, N-player array, first-press-safe edges, per-button pending windows |
| `src/20-world.js` | tilemap, four tile kinds, half-open spans, stated out-of-bounds rule, text round-trip |
| `src/25-body.js` | AABB, axis-separated resolution, sub-stepping at `MAX_STEP`, one-way + drop-through |
| `src/30-player.js` | run, jump, jump-cut, double jump, coyote, roll, crouch, drop-through, slam, hazards, death, respawn |
| `src/70-sim.js` | `Sim.step()`, the tick loop; hitstop; `resetTransient()`; `hash()` |
| `src/80-view.js` | renderer, N-target pull-back camera (D5a stage 1), particles, the single event→effect table |
| `src/95-app.js` | boot, fixed-timestep accumulator, keyboard + gamepad, frame meter, demo level |
| `build.py` | concatenates `src/NN-*.js` into one offline HTML; refuses absolute URLs, `fetch`, XHR, dynamic `import`, `WebSocket`, `Math.random` |
| `tests/harness.js` | sandboxes, `scenario()` (L10), `Suite` |
| `tests/cdp.js` | dependency-free Chrome DevTools Protocol driver |
| `tests/verify_*.js` | the four suites |
| `tests/run_all.sh` | the one command (L7) |

### Decisions taken during the rebuild

- **`JUMP_VEL` is −5.55, not −5.4.** The continuous apex formula `v²/2g` does
  not describe a 60 Hz integrator that applies gravity on the same tick as the
  impulse. `-5.4` measures a 45.9 px apex — short of the three tiles the
  masterfile specifies. `-5.55` measures 48.6 px over an 18-frame rise with a
  symmetric 18-frame fall.
- **`verify_render` uses raw CDP, not Playwright.** Node ships a global
  `WebSocket` and Playwright's Chromium was already cached on disk, so the
  browser gate needs no `npm install` and no network. A gate that requires a
  package install is a gate that stops being run.
- **Source scans strip comments before matching banned identifiers.** A comment
  saying "no `Math.random` in the sim" is documentation, not a call. The first
  version failed the build on its own prose.
- **Hitstop freezes the world but never the hands.** Pads still latch edges and
  arm buffers while frozen; only the decay is paused. Asserted in `verify_arch`.

### Bugs found and fixed during the build

1. **Roll start skipped gravity** — `vy` stayed 0 for one tick, `moveY` never
   ran, the body lost `onGround`, and everything downstream saw a phantom
   takeoff and landing.
2. **Gamepad double-drove player one** — in solo play both the authoritative
   and additive poll ran on pad 0, so a neutral stick wrote `false` over a held
   key. Solo is now additive-only; co-op shifts every pad down one seat.
3. **Roll was 19 frames, not 18** — the start tick moved at roll speed without
   being counted, overshooting the distance to 90.25 px. Counting it gives
   exactly 18 frames and 85.5 px.
4. **Coyote measured 4, not 5** — the window was charged a frame on the tick the
   ground vanished, a tick that was decided while the player was still standing.
5. **`rollEnd` under-reported its distance** by one frame (80.75 px) because the
   event fired before the final tick's move. The roll now moves, then ends.
6. **`TILE * 3` in the demo spawn** — `C.TILE` is the tile-*kind* enum, `CFG.TILE`
   is the tile *size*. The spawn was `NaN`, so the player fell forever past a
   world he could never collide with. **Only `verify_render` caught this**; every
   sim suite was green, because the suites build their own worlds and never
   touch the demo level. This is the case for keeping a browser gate.

### Test bugs found and fixed

- The one-way platform test never stepped the sim after pressing jump, so it
  measured a player who had not jumped.
- The hazard i-frame test used a 5-tile spike strip; the player ran clear of it
  before the i-frames lapsed, so "no repeat damage" passed for the wrong reason.
  The strip is now 31 tiles and the test asserts the player is *still standing
  in the spikes* before checking.
- The roll cooldown test re-pressed the button without releasing it. The pending
  buffer arms on a press edge, so no second press ever occurred.
- The respawn test expected 30 frames and measured 38. The sim was right: dying
  triggers 8 frames of hitstop, which freezes the respawn timer along with
  everything else. Both halves are now pinned separately.

### Verified

- `python build.py` → `cinder-loop.html`, 57,018 bytes, 8 modules.
- `bash tests/run_all.sh` → **GREEN 271/271 across 4 suites**.
- Headless Chromium: canvas laid out 1254×564, 60–62 ticks/s, `D` moved the
  character 54 px right, `SPACE` lifted it 49 px (against 48.6 px measured in
  the sim), composited screenshot written to `tests/out/frame.png`, zero console
  errors.
- Renderer spot-checked by sampling canvas pixels at five columns × three rows:
  off-map columns render as background at every height, `#39323f` appears only
  where solid tiles actually are.

### Not built

Combat, weapons, enemies, boss, generation and its fairness audit, economy,
meta-progression, curses, grafts, audio, split/merge camera, options, hitbox
bake. `10-data.js`, `35-rig.js`, `40-combat.js`, `45-enemy.js`, `50-gen.js`,
`55-boss.js`, `60-run.js`, `65-meta.js` and `85-audio.js` do not exist.
