# CINDER LOOP — UNREAL 5.8 PORT SPEC

Working document, not canonical. The canonical three remain
`CINDER_LOOP_MASTERFILE.md`, `CINDER_LOOP_CHANGELOG.md`,
`CINDER_LOOP_VISUAL_MAP.html` (L14).

Written 2026-07-26 against the JS build at **v0.2.1, GREEN 431/431**. No
Unreal editor was reachable (`127.0.0.1:30010` refused — RemoteControl plugin
not running), so **nothing here is verified against your installed 5.8.0**.
Every API-surface claim below should be checked against the engine headers
before it is relied on.

---

## 0. Verdict

This is a **rewrite in another language against another runtime**, not a
modification. Nothing in `src/` compiles, transpiles, or shims into Unreal.
The valuable thing that crosses over is the *design and the measured numbers* —
which is roughly where the real cost of this project has gone, so the crossing
is worth more than it sounds.

| Invariant | Today | Under Unreal |
|---|---|---|
| L1 original IP | holds | holds |
| L2 single offline HTML, zero network | the deliverable | **retires** — packaged binary |
| L3 fixed 1/60, never scaled dt | `Sim.step()` owns its loop | **the hard part** — see §3 |
| L4 per-instance seeded RNG | holds | holds, `FRandomStream` |
| L5 sim/presenter split | convention + source scan | **strengthens** — enforced by the build system (§4) |
| L6 `build.py` from numbered `src/` | 11 modules → 1 file | **retires** — UBT |
| L7 one command gate | `run_all.sh`, 431 assertions | re-expressed as Automation Specs (§6) |
| L8 harness never reimplements | holds | holds |
| L9 hitboxes baked from animation | baked from procedural FK | **improves** — baked from real AnimSequences (§5) |
| L10 one `resetTransient()` | holds | holds |
| L11 determinism within-build, one machine | holds | holds — do not widen it |
| L12 composited screenshot | CDP | UE Automation screenshot comparison |
| L13 desktop + gamepad first | holds | holds, Enhanced Input |

**All 431 assertions die.** They test JavaScript objects. The *behaviours* they
pin are re-asserted in §6.

---

## 1. Unit conversion

The sim thinks in **pixels and frames**. Unreal thinks in **centimetres and
seconds**. Pick `1 tile = 100 cm`, giving **`SCALE = 6.25 cm/px`**.

Conversion rules:
- `px → cm` : `× 6.25`
- `px/frame → cm/s` : `× 6.25 × 60` = `× 375`
- `px/frame² → cm/s²` : `× 6.25 × 3600` = `× 22500`

| Quantity | Sim | Unreal |
|---|---|---|
| Tile | 16 px | 100 cm |
| Player box | 10 × 22 px | 62.5 × 137.5 cm |
| Run speed | 2.5 px/f | **937.5 cm/s** |
| Gravity | 0.3 px/f² | **6750 cm/s²** |
| Jump impulse | −5.55 px/f | **−2081.25 cm/s** |
| Double jump | −4.95 px/f | −1856.25 cm/s |
| Jump apex | 48.6 px | **303.75 cm** |
| Terminal fall | 9 px/f | 3375 cm/s |
| Slam | 11 px/f | 4125 cm/s |
| Roll speed | 4.75 px/f | 1781.25 cm/s |
| Roll distance | 85.5 px | 534.4 cm |
| Blade reach | 30.4 px | 190 cm |
| Sub-step cap | 4 px | 25 cm |

**Every frame count ports unchanged** — and these are the numbers that
actually define the feel:

> coyote 5 · jump buffer 5 · pending hold 8 · rise 18 · airtime 36 · roll 18 ·
> roll cooldown 24 · hurt i-frames 60 · hit i-frames 24 · respawn 30 ·
> hitstop 5 / 9 / 3 · telegraph floor 14 · slam hang 4

**Gravity is ~6.9× Earth (UE default is −980 cm/s²).** That is correct and
deliberate — the genre runs heavy gravity against large impulses. It is also
the first thing that will look like a bug to anyone reading the project cold,
so it belongs in a comment at the definition site.

**Do not use `CharacterMovementComponent`.** It is built for variable-dt 3D
locomotion and ships its own opinions about jumping, air control, and ground
detection. Every measured number in the table above would be fought for rather
than set. Write a `UCinderBodyComponent` that does what `25-body.js` does:
axis-separated, sub-stepped AABB resolution. It is ~300 lines and it is the
only way the numbers survive.

---

## 2. Two modules, and why

```
CinderSim    depends on: Core            (NO Engine, NO CoreUObject rendering)
CinderGame   depends on: CinderSim, Engine, EnhancedInput
```

**The L5 boundary becomes a compile error.** `80-view.js` writing to sim state
is caught today by a source scan and a 900-tick determinism run; in Unreal, a
sim file that includes an Engine header simply does not build. That is a
straight upgrade and it is the single strongest argument for doing this port at
all.

Sim types are **plain structs (`F`-prefixed), not `UObject`s**: no GC pressure,
trivially copyable, snapshot/restore stays cheap, and determinism is far easier
to hold.

`CFG` becomes a `UCinderConfig : UDataAsset` — designer-editable tunables
without a recompile, which the JS build cannot offer.

---

## 3. L3 under a variable tick — the hard part

Unreal ticks on variable `DeltaTime`. L3 says the sim advances in fixed 1/60
steps and dt is never scaled. Reconciling those is the highest-risk item in
this whole document.

```cpp
// CinderGame
UCLASS()
class UCinderSimSubsystem : public UTickableWorldSubsystem
{
    void Tick(float DeltaTime) override
    {
        Accumulator += FMath::Min(DeltaTime, 0.25f);   // a hitch must not spiral
        int32 Steps = 0;
        while (Accumulator >= FIXED_STEP && Steps < MAX_STEPS)
        {
            Sim.Step();                                 // no argument. ever.
            Accumulator -= FIXED_STEP;
            ++Steps;
        }
        if (Steps == MAX_STEPS) { Accumulator = 0.f; }  // give up catching up
        Alpha = Accumulator / FIXED_STEP;               // for render interpolation
    }
};
```

This is the accumulator already in `95-app.js`; it ports line for line.

**What Unreal adds that the browser did not need: render interpolation.** At
120 or 144 Hz, presenting raw 60 Hz sim state reads as stutter. Presenter
actors must lerp between the previous and current sim transform by `Alpha`.
The sim stays at 60; only the *drawing* interpolates. Keep the previous
transform in the presenter, never in the sim.

**Enforcement:** `FCinderSim::Step()` takes no arguments and `CinderSim` never
sees `UWorld`, `DeltaTime`, or `FApp::GetDeltaTime()`. Add an Automation test
that greps the module source, mirroring `verify_arch`'s existing `dt` scan.

---

## 4. Module → type map

Strict one-way dependency, preserved:

| JS | C++ | Module |
|---|---|---|
| `00-core.js` | `FCinderRNG`, `FCinderBus`, `UCinderConfig`, math | CinderSim |
| `05-input.js` | `FCinderPad`, `FCinderPads` | CinderSim |
| `10-data.js` | `UCinderEnemyTable : UDataAsset` (or `UDataTable`) | CinderSim |
| `20-world.js` | `FCinderWorld` | CinderSim |
| `25-body.js` | `FCinderBody` | CinderSim |
| `30-player.js` | `FCinderPlayer` | CinderSim |
| `35-rig.js` | `FCinderRig` + bake + audit | CinderSim |
| `40-combat.js` | `FCinderCombat` | CinderSim |
| `45-enemy.js` | `FCinderEnemy` | CinderSim |
| `70-sim.js` | `FCinderSim` | CinderSim |
| — **boundary** — | | |
| `80-view.js` | `ACinderPresenter`, Niagara for particles | CinderGame |
| `85-audio.js` | MetaSounds | CinderGame |
| `95-app.js` | `UCinderSimSubsystem` | CinderGame |

`FCinderBus` keeps the typed-event design; a `TMulticastDelegate` per event
type, or a single event struct with a discriminator. The per-frame event log
that the presenter drains each tick ports unchanged.

---

## 5. L9 gets better, not harder

Today the bake derives hitboxes from procedural forward-kinematic poses,
because there is no animation asset. Unreal has one, so the bake gets its
proper source of truth:

1. At cook (or boot), for each move's `UAnimSequence`, sample the
   `weapon_root` and `weapon_tip` socket transforms **at every frame**.
2. Swept quad between consecutive frames = the hitbox.
3. Active when tip speed ≥ threshold — the same rule, unchanged.
4. Emit a generated data asset. Never hand-authored (L9).

The D6 overreach audit ports unchanged in spirit and **must keep its poison
tests** — box ⊆ swept geometry + skin, nothing behind, nothing on a still
frame, nothing authored — each fired at a deliberately corrupted bake. A bake
derived from real animation is even harder to violate structurally, which
makes the poison tests *more* necessary, not less.

**Gotcha that will silently ruin every active window:** set the AnimSequence
frame rate to exactly 60 and sample without interpolation. Any other rate and
the baked frame indices stop lining up with sim frames, and every telegraph and
active window shifts by an amount nobody will be able to see.

---

## 6. The gate → Automation Specs

| Suite | Unreal form |
|---|---|
| `verify_arch` (132) | Mostly becomes the `.Build.cs` dependency graph — a sim file touching Engine fails to compile. Keep as Specs: the 900-tick with/without-presenter hash comparison, hitstop-does-not-eat-input, `ResetTransient` equals fresh, the vacuity probe. |
| `verify_core` (55) | Plain Spec over the pure structs. Ports almost verbatim. |
| `verify_move` (95) | Plain Spec. Same method: drive the sim, measure, pin literals. Re-measure — do not copy the expected values across. |
| `verify_rig` (75) | Spec, plus the poison bakes. Add: baked frame count equals AnimSequence frame count. |
| `verify_combat` (54) | Spec. |
| `verify_render` (20) | Functional Test map + `AutomationScreenshot` (UE has tolerance-based comparison built in, better than the byte-difference check used today). |

One command:
```
RunUAT BuildCookRun -project=CinderLoop -ExecCmds="Automation RunTests Cinder"
```

**Re-measure every number rather than porting the expected values.** If the UE
build reports a 36-frame airtime and a 48.6 px apex on its own, the port is
correct. If the test asserts 36 because the JS build said so, it proves nothing.

---

## 7. Do not bring

The canvas renderer, `tests/cdp.js`, `build.py`, the single-file constraint,
and the demo level in `95-app.js`. All of it is scaffolding for a browser.

---

## 8. Risk register

1. **Variable dt leaking into the sim.** Highest risk by a distance. Presents
   as "it feels slightly different sometimes" and is miserable to chase.
   Mitigated by the module boundary and a source-scan Spec.
2. **Reaching for `CharacterMovementComponent`.** It will fight every number in
   §1. This is the most likely shortcut and the most expensive one.
3. **AnimSequence frame rate ≠ 60.** Silently shifts every active window.
4. **Float determinism.** L11 already scopes this to within-build on one
   machine. Keep it there — do not enable fast-math, do not promise
   cross-platform reproducibility.
5. **Restarting the clock.** The JS build took v0.1.0 → v0.2.1 to reach a
   posed character with audited hitboxes. A rewrite restarts *that* clock. It
   does not restart the design work, which is the expensive half and is done.

---

## 9. Recommended sequence

1. **Two-module skeleton + `UCinderSimSubsystem` + a hash test.** Prove L3
   holds under a variable tick before writing a line of gameplay. If this step
   fails, everything after it is built on sand.
2. **Port 00 / 05 / 20 / 25 / 30 and re-measure §3 of the masterfile.** Apex,
   airtime, coyote, buffer, roll — every number, measured fresh. They should
   land on the same frame counts. That is the port's acceptance test.
3. **Rig + combat**, with the bake reading real AnimSequences and the audit's
   poison tests intact.
4. **Enemies**, from the same four data rows already written in `10-data.js`.

Steps 1 and 2 are the whole gamble. If the numbers reproduce, the rest is
transcription.
