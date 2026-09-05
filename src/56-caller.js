/* ===========================================================================
 * 56-caller.js  —  the Caller, an elite that calls in help mid-fight
 * ---------------------------------------------------------------------------
 * SIM layer. Realizes the 'summon' primitive this feature (D16) adds to
 * 45-enemy.js — exactly one elite template, kept OUT of DATA.ENEMIES/
 * ENEMY_IDS the same way Kilnwarden is (D9's roster stays hard-pinned to
 * four; verify_enemy.js). 45-enemy.js's Enemy constructor already accepts
 * a template OBJECT directly, so this file needs zero constructor changes
 * to exist — exactly like 55-boss.js before it.
 *
 * hp: 36 — 2x Ashwalker's 18 (10-data.js), the highest hp of the regular
 * four — an elite judgment, not a measurement, the same style as
 * CFG.GEN_MIN_FIGHT_TILES's own named guess.
 * reach: 190 — a ranged-commit distance, matching kilnspitter's own 200
 * (10-data.js) — the generic commit gate (45-enemy.js) reads t.reach
 * regardless of attack type, not just for melee.
 * summonId: 'ashwalker' — genuinely the shortest REACH of the regular
 * four (26, vs. emberrush's 130 / kilnspitter's 200 / wickmoth's 62), so
 * what it calls in is never itself a fairness regression; NOT the
 * shortest telegraph (its 20 is second-shortest — wickmoth's is 18). An
 * earlier version of this comment (and the design spec) overclaimed
 * "shortest reach/telegraph" — corrected here to what the real numbers in
 * 10-data.js actually say, chosen for the reach property, not both.
 * summonMax: 2 — a LIFETIME cap across the whole encounter (see
 * Enemy.prototype.callIn, 45-enemy.js), not a "keep N alive" budget.
 * summonOffset: 24 — how far in front of the Caller a call lands, before
 * lockFacing/terrain adjustment. Lives on the template rather than CFG or
 * an inline literal — the same D7 "content is data" reasoning
 * summonId/summonCount/summonMax already follow, since this is elite-
 * specific placement, not an engine-wide tunable any other template reads.
 * No summonCooldown field — the template's own `cooldown` already does that
 * job generically (doRecover()), the same field every other primitive uses.
 *
 * No damage/knock/projectile fields — the call itself deals no damage,
 * unlike kilnspitter's own 'shoot' template which needs them for its Shot.
 *
 * Owned by: Enemy team.
 * ======================================================================== */
;(function (C) {
'use strict';

var CALLER = {
  id: 'caller',
  name: 'Caller',
  hp: 36,
  w: 14, h: 26,
  mode: 'walk',
  attack: 'summon',
  move: null,
  speed: 0.8,
  accel: 0.13,
  sight: 220,
  reach: 190,
  telegraph: 24,            // >= CFG.MIN_TELEGRAPH (14)
  recover: 26,
  cooldown: 70,
  contact: 0,               // dangerous() is not extended for 'summon' —
                             // the call itself carries no body threat
  patrol: 40,
  summonId: 'ashwalker',
  summonCount: 1,
  summonMax: 2,
  summonOffset: 24,
  tint: '#7a4f9c', tintDark: '#3c2650',
  scale: 1.15
};

C.Caller = {
  template: CALLER
};

})(CINDER);
