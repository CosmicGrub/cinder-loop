/* ===========================================================================
 * 10-data.js  —  content tables (D7)
 * ---------------------------------------------------------------------------
 * SIM layer. "Content is data. Adding content never means writing engine
 * code." Two tables so far: ENEMIES (read by 45-enemy.js) and WEAPONS (read
 * by 40-combat.js). Nothing here is behaviour, only description.
 *
 * The roster is FOUR (D9). Swapping one out is editing a row. The engine knows
 * four movement/attack primitives — walk+melee, walk+charge, walk+shoot,
 * fly+dive — and a template is a choice among them plus numbers. A fifth
 * archetype (shielded, burrowing, summoning) is the one case that costs engine
 * work, and it costs exactly one new primitive.
 *
 * WEAPONS are even thinner than enemy templates: two move IDs into
 * 35-rig.js's own MOVES table, nothing more. A weapon owns no numbers of
 * its own — the move it points at already owns damage/knock/timing/reach,
 * baked and audited exactly like every other move (L9).
 *
 * FAIRNESS. Every attacking template must declare a `telegraph` of at least
 * CFG.MIN_TELEGRAPH frames. An enemy that can hurt you without first showing
 * you it is about to is not difficulty, it is a bug, and verify_enemy fails
 * the build over it. This is the same instinct as D3a: turn "that felt bad"
 * into a number a test can hold.
 *
 * Owned by: Data team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CFG = C.CFG;

var ENEMIES = {

  /* The baseline. Patrols its ledge, closes when it sees you, plants itself,
   * winds up visibly, and swipes. Everything else in the roster is read
   * against this one, so it is the most generous: the longest telegraph and
   * the shortest reach. */
  ashwalker: {
    name: 'Ashwalker',
    hp: 18,
    w: 12, h: 24,
    mode: 'walk',
    attack: 'melee',
    move: 'clawA',            // baked from a pose like every other hitbox (L9)
    speed: 0.9,
    accel: 0.14,
    sight: 130,
    reach: 26,
    telegraph: 20,
    recover: 24,
    cooldown: 30,
    damage: 1,
    knock: [2.6, -1.6],
    contact: 0,               // it has to swing; walking into it is safe
    patrol: 48,
    tint: '#a08466',
    tintDark: '#5f4d3d',
    scale: 1.1
  },

  /* Commits to a straight line, overshoots, and is helpless afterwards.
   * Teaches you to roll THROUGH rather than away, which is the whole reason
   * the roll has i-frames for its entire duration. */
  emberrush: {
    name: 'Emberrush',
    hp: 14,
    w: 13, h: 18,
    mode: 'walk',
    attack: 'charge',
    move: null,               // the body IS the hitbox while charging
    speed: 0.7,
    chargeSpeed: 4.6,
    accel: 0.5,
    sight: 150,
    reach: 130,               // it commits from a long way out
    telegraph: 24,
    active: 34,               // frames of charge before it burns out
    recover: 40,              // long, and the whole point of the enemy
    cooldown: 36,
    damage: 1,
    knock: [3.6, -2.0],
    contact: 1,
    patrol: 30,
    tint: '#c4694a',
    tintDark: '#6e3626',
    scale: 0.95
  },

  /* Stationary. Lobs an arcing ember that dies on terrain. Punishes standing
   * still and gives the level's open ground a reason to be dangerous. */
  kilnspitter: {
    name: 'Kilnspitter',
    hp: 12,
    w: 14, h: 16,
    mode: 'walk',
    attack: 'shoot',
    move: null,
    speed: 0,
    accel: 0,
    sight: 210,
    reach: 200,
    telegraph: 26,
    recover: 20,
    cooldown: 74,
    damage: 1,
    knock: [2.0, -2.2],
    contact: 0,
    patrol: 0,
    projectile: {
      speed: 3.1,
      lift: -2.5,             // arcs; gravity brings it down
      gravity: 0.11,
      w: 5, h: 5,
      life: 150
    },
    tint: '#b8894e',
    tintDark: '#6b4c26',
    scale: 0.9
  },

  /* Ignores terrain entirely. Hovers above you, then dives. Gives the jump and
   * the double jump a combat purpose beyond traversal. */
  wickmoth: {
    name: 'Wickmoth',
    hp: 9,
    w: 11, h: 11,
    mode: 'fly',
    attack: 'dive',
    move: null,
    speed: 1.15,
    accel: 0.09,
    hover: 46,                // px it tries to sit above its target
    sight: 170,
    reach: 62,
    telegraph: 18,
    active: 26,
    diveSpeed: 4.2,
    recover: 26,
    cooldown: 40,
    damage: 1,
    knock: [2.2, -2.6],
    contact: 1,
    patrol: 34,
    tint: '#9d86b8',
    tintDark: '#54426b',
    scale: 0.85
  }
};

// Stable ordering, so anything that iterates the roster is deterministic (L4).
var ENEMY_IDS = Object.keys(ENEMIES).sort();

/* WEAPONS (D7). A weapon names its two entry points into 35-rig.js's own
 * MOVES table — `light` (the attack button from idle/run/etc, chaining
 * onward through whatever THAT move's own `chain` field says) and `heavy`
 * (crouch + attack) — and nothing else. It carries no numbers of its own:
 * damage, knock, hitstop, timing and reach are all already owned by the
 * baked move the weapon points at (L9 — a weapon cannot smuggle in an
 * authored hitbox any more than a template can). Swapping weapons is
 * therefore swapping which two move IDs `Combat.begin` starts a swing from;
 * the combat resolver, the chain machinery and the rig bake are completely
 * unaware a second weapon exists.
 *
 * D2, now real: `colours` names the two stats a weapon "scales off the
 * larger" of (40-combat.js's Combat.weaponScale reads this at hit time —
 * see that file for the actual formula, CFG.STAT_SCALE_PER_POINT for the
 * one number it's built from). Equipping/switching at runtime is still not
 * built: `player.weapon` defaults to `'blade'` in 30-player.js and nothing
 * currently changes it — that depends on the pickup/inventory system D4
 * describes, a separate piece from the weapon DATA (and now its stat
 * scaling) existing at all.
 *
 * D9 locks the roster at FOUR weapons. `warmaul` and `thornspear` fill the
 * two open slots — chosen by a judged 3-pitch design panel (source-verified
 * both ways, real split decision, not a clean sweep) over 35-rig.js's own
 * MOVES table, which is where the actual identity of each lives; see that
 * file's comments for the moves themselves. This table only ever needed one
 * more row per weapon, exactly D7's own claim. Final colour tally across all
 * four — ember: blade, daggers, thornspear (3); umbral: daggers, warmaul
 * (2); verdant: blade, warmaul, thornspear (3) — the best achievable split
 * across 4 weapons over 3 stats (pigeonhole forces at least one repeat). */
var WEAPONS = {
  blade: { name: 'Blade', light: 'slashA', heavy: 'heavy', colours: ['ember', 'verdant'] },
  daggers: { name: 'Twin Daggers', light: 'daggerA', heavy: 'daggerHeavy', colours: ['ember', 'umbral'] },
  warmaul: { name: 'Warmaul', light: 'maulA', heavy: 'maulHeavy', colours: ['umbral', 'verdant'] },
  thornspear: { name: 'Thornspear', light: 'spearA', heavy: 'spearHeavy', colours: ['ember', 'verdant'] }
};
var WEAPON_IDS = Object.keys(WEAPONS).sort();

/* DIALOGUE (D7, D11, D12). Content, not code — 82-narrative.js owns every
 * decision about WHEN a line fires and WHICH one gets picked; this table
 * only ever says WHAT the line is. Two pools, exactly as D11 names them:
 *
 * `narrator` — the Kilnkeeper, a recurring voice heard at run milestones.
 * Written deliberately double-voiced: read on a first run it is a warm,
 * slightly odd guide; read again once `reveal` has landed (D12: "every
 * line heard earlier rereads once the reveal lands") the same lines read
 * as a predator describing exactly what it has been doing to the player
 * the whole time — "the kiln," "shaping," "tempered," "the door" all carry
 * a second meaning the first read never needed. `reveal` itself is the one
 * pool that only ever fires once (82-narrative.js's own job, not this
 * table's) — the Kilnkeeper's guiding voice IS Kilnwarden's own, and the
 * boss fight is or channels its true form, per D12 exactly.
 *
 * `barks` — short, per-template ambient lines, keyed by ENEMY id (D9's own
 * four), fired off the same `telegraph` moment the fairness rule already
 * commits to (45-enemy.js) — an enemy about to swing is already announcing
 * itself to the sim; this announces it to the player too. Deliberately
 * short: these are barks, not narration, and every enemy here already has
 * a name and a tint; the bark is one more brushstroke of who they are
 * (Ashwalker territorial and patient, Emberrush reckless, Kilnspitter
 * distant and taunting, Wickmoth skittering and strange), not a second
 * copy of the same fairness telegraph the player's own eyes already read.
 *
 * Original expression throughout (L1) — no line here borrows a phrase,
 * beat, or specific image from another work; the kiln/ash/ember/wick
 * vocabulary is this project's own, already established by the roster and
 * boss names this table's own lines are written to sit beside. */
var DIALOGUE = {
  narrator: {
    levelStart: [
      'Another door, another shape waiting to be found inside it.',
      'Walk it slow if you must. The kiln has never once run cold.',
      "Something in you keeps returning here. I only keep the door open.",
      "This hallway remembers you, even on the days you don't remember it.",
      'Every ember that goes out finds its way back to the same fire.'
    ],
    // D21: fires once per room clear (70-sim.js's own _onRoomClear()),
    // independent of the player's own position or which room this is —
    // calmer than bossEntry on purpose, a held breath rather than a
    // warning. Double-voiced like every other narrator pool: "tempered"
    // echoes death's own use of the word directly — first read, a small
    // mercy; reread post-reveal, the Kilnkeeper naming its own shaping
    // process out loud, the gentler twin of what death already confessed.
    checkpoint: [
      "Rest a moment. The shape holds better when it isn't rushed.",
      'Something here mends what the fight took. I keep it stocked, for you.',
      'Not every door needs walking through today. This one will wait.',
      'Tempered a little more, and no dying required this time.',
      'The fire banks low here, just enough to catch your breath by.'
    ],
    bossEntry: [
      'This is the last room before the last room. It always is.',
      'Kilnwarden keeps the deepest heat. Go carefully, or go anyway.',
      "You've been walking toward this door since the day you first died here."
    ],
    // Fires exactly once, the first time a player reaches the boss —
    // 82-narrative.js's own responsibility to enforce, not this table's.
    reveal: [
      "You asked, once, who tends this fire. I never answered. Look at what's answering now.",
      'Every door I opened for you opened onto the same room. This one. Always this one.',
      'The kiln was never behind me. I am the kiln. I have been shaping you the whole time.'
    ],
    bossVictory: [
      'You put the fire out. It will not stay out. It never has.',
      'Go on, then. Walk back through the door you think you opened yourself.',
      'I kept my promise. I told you the kiln never ran cold.'
    ],
    death: [
      "Rest. The shape isn't finished. It never minds waiting.",
      "This isn't an ending. I told you, the kiln remembers.",
      "Again, then. I'll have the door ready.",
      "You'll come back tempered, not broken. That's how this has always gone."
    ]
  },
  barks: {
    ashwalker: ['This is my ledge.', 'Hold still.', 'You again.'],
    emberrush: ['MOVE.', "Can't outrun this!", 'Burn already!'],
    kilnspitter: ['Come closer, then.', "Not going anywhere.", 'Watch the sky.'],
    wickmoth: ['Down you go.', 'Light draws us all.', 'No ground to catch you here.']
  }
};

/* SFX (D7, D11). Content, not code — 85-audio.js owns every decision about
 * WHEN a cue fires and HOW the node graph gets built from it; this table
 * only ever says WHAT the cue is. D11's own scope for this file: "hang off
 * the same trigger design" already established by 80-view.js (particles/
 * camera) and 82-narrative.js (dialogue) — real Bus events in, a real
 * presenter-side effect out, zero new sim-side signal invented. Seventeen
 * cues (fifteen at D11, plus dashStart/parry for the abilities pass), a
 * deliberate SUBSET of the Bus's own full event list, not full
 * coverage — the same restraint 80-view.js's own `subscribe()` already
 * shows (several of its own handlers are empty on purpose: "recorded; no
 * visual yet"). Chosen for the moments that most need audible feedback —
 * movement, combat, and progression — not every bookkeeping signal the bus
 * carries.
 *
 * Two synthesis shapes, not four — a "blip", "thud", and "chime" are all
 * the SAME node graph (an oscillator through a gain envelope) with
 * different parameters, not different code, matching this project's own
 * "don't invent more machinery than the content needs" instinct:
 *
 * `type: 'tone'` — one or more `notes` (each `{freq, dur, delay, wave,
 * sweepTo}`), an oscillator + gain-envelope voice per note, layered or
 * sequenced via each note's own `delay`. `sweepTo` optionally glides the
 * pitch across the note's own duration (used for death's own fall and
 * respawn's own rise).
 *
 * `type: 'noise'` — a short filtered noise burst (a whoosh, not a pitched
 * tone) for a roll — genuinely a different timbre a pitched oscillator
 * can't produce. (Adversarially found, v0.2.16: this comment previously
 * also named "a wall push-off" as a noise cue, but `wallJump` below has
 * always shipped as `type: 'tone'` — a two-note chirp, not a whoosh. The
 * comment was simply wrong about its own data; corrected here rather than
 * changing wallJump's actual, already-shipped sound to chase stale prose.)
 *
 * `gain` is each cue's own peak loudness (0-1), a named judgment relative
 * to the others (a slam should read as bigger than a footfall) — no
 * capture plate for "how loud should a jump sound" any more than one
 * exists for GEN_MIN_FIGHT_TILES. */
var SFX = {
  jump:       { type: 'tone', wave: 'triangle', gain: 0.16,
                notes: [{ freq: 520, dur: 0.09 }] },
  doubleJump: { type: 'tone', wave: 'triangle', gain: 0.17,
                notes: [{ freq: 640, dur: 0.10 }] },
  land:       { type: 'tone', wave: 'sine', gain: 0.20,
                notes: [{ freq: 95, dur: 0.09 }] },
  rollStart:  { type: 'noise', dur: 0.14, filterFreq: 1400, gain: 0.13 },
  // Ember Dash — a brighter, sharper whoosh than roll's own (higher
  // filterFreq), reading as a burst rather than a tumble. Abilities spec
  // §6: "a dash whoosh," not scoped further than that — named judgment,
  // the same discipline every other gain/frequency value in this table
  // already stands on.
  dashStart:  { type: 'noise', dur: 0.16, filterFreq: 1800, gain: 0.15 },
  // Parry — a bright double-note "clang," distinct from hit's own single
  // low thud (square wave, matching hit's own percussive timbre, but
  // higher and rising rather than one flat note). Abilities spec §6:
  // "a parry clang."
  parry:      { type: 'tone', wave: 'square', gain: 0.20,
                notes: [{ freq: 780, dur: 0.05 }, { freq: 1040, dur: 0.08, delay: 0.03 }] },
  wallJump:   { type: 'tone', wave: 'triangle', gain: 0.16,
                notes: [{ freq: 360, dur: 0.06 }, { freq: 560, dur: 0.08, delay: 0.05 }] },
  slamLand:   { type: 'tone', wave: 'sine', gain: 0.32,
                notes: [{ freq: 60, dur: 0.24 }] },
  attackStart:{ type: 'noise', dur: 0.07, filterFreq: 2800, gain: 0.10 },
  hit:        { type: 'tone', wave: 'square', gain: 0.22,
                notes: [{ freq: 180, dur: 0.06 }] },
  targetDown: { type: 'tone', wave: 'triangle', gain: 0.20,
                notes: [{ freq: 660, dur: 0.07 }, { freq: 880, dur: 0.14, delay: 0.06 }] },
  hurt:       { type: 'tone', wave: 'sawtooth', gain: 0.24,
                notes: [{ freq: 220, dur: 0.14 }] },
  death:      { type: 'tone', wave: 'sawtooth', gain: 0.26,
                notes: [{ freq: 320, dur: 0.5, sweepTo: 55 }] },
  respawn:    { type: 'tone', wave: 'sine', gain: 0.15,
                notes: [{ freq: 280, dur: 0.14, sweepTo: 520 }] },
  pickup:     { type: 'tone', wave: 'triangle', gain: 0.17,
                notes: [{ freq: 520, dur: 0.05 }, { freq: 760, dur: 0.09, delay: 0.045 }] },
  telegraph:  { type: 'tone', wave: 'square', gain: 0.08,
                notes: [{ freq: 920, dur: 0.045 }] },
  blueprintUnlocked: { type: 'tone', wave: 'triangle', gain: 0.20,
                notes: [{ freq: 440, dur: 0.07 }, { freq: 660, dur: 0.07, delay: 0.065 },
                         { freq: 880, dur: 0.15, delay: 0.13 }] }
};
var SFX_IDS = Object.keys(SFX).sort();

C.DATA = {
  ENEMIES: ENEMIES,
  ENEMY_IDS: ENEMY_IDS,
  WEAPONS: WEAPONS,
  WEAPON_IDS: WEAPON_IDS,
  DIALOGUE: DIALOGUE,
  SFX: SFX,
  SFX_IDS: SFX_IDS
};

})(CINDER);
