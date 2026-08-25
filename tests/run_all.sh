#!/usr/bin/env bash
# ============================================================================
# tests/run_all.sh  —  ONE command. If this is green, the build is shippable.
# ----------------------------------------------------------------------------
#   tests/run_all.sh              run everything
#   VERBOSE=1 tests/run_all.sh    print every assertion, not just failures
#   CINDER_CHROME=/path/to/chrome tests/run_all.sh
#
# Order is deliberate. The build runs first because a suite that passes
# against sources that cannot be built is measuring something nobody can
# play. verify_arch runs before the rest because when the architecture is
# broken every other failure is a symptom, not a cause.
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE="${NODE:-node}"
PYTHON="${PYTHON:-python}"
command -v "$PYTHON" >/dev/null 2>&1 || PYTHON=python3
command -v "$NODE"   >/dev/null 2>&1 || { echo "FATAL: no node on PATH" >&2; exit 127; }
command -v "$PYTHON" >/dev/null 2>&1 || { echo "FATAL: no python on PATH" >&2; exit 127; }

FAILED=0
TOTAL=0
PASSED=0
SUITES=0

echo "== node    $("$NODE" --version 2>&1)"
echo "== python  $("$PYTHON" --version 2>&1)"
echo

# ---------------------------------------------------------------- 0. build
echo "-- build ---------------------------------------------------------------"
if BUILD_OUT="$("$PYTHON" build.py 2>&1)"; then
  echo "$BUILD_OUT" | sed 's/^/  /'
  echo "  PASS  build                             cinder-loop.html"
else
  echo "$BUILD_OUT" | sed 's/^/  /'
  echo "  FAIL  build                             build.py refused"
  FAILED=1
fi
echo

# --------------------------------------------------------------- 1. suites
run_suite() {
  local name="$1"
  local out code line nums
  out="$("$NODE" "tests/$name.js" 2>&1)"
  code=$?

  if [ "${VERBOSE:-0}" = "1" ]; then
    echo "$out"
  else
    # Always surface failures; the passing detail is available with VERBOSE=1.
    echo "$out" | grep -E "^  FAIL" || true
    echo "$out" | grep -E "^  (PASS|FAIL)  $name " || true
  fi

  line="$(echo "$out" | grep -E "^  (PASS|FAIL)  $name .*assertions" | tail -1)"
  nums="$(echo "$line" | grep -oE '[0-9]+/[0-9]+ assertions' | head -1)"
  if [ -n "$nums" ]; then
    PASSED=$((PASSED + $(echo "$nums" | cut -d/ -f1)))
    TOTAL=$((TOTAL + $(echo "$nums" | cut -d/ -f2 | cut -d' ' -f1)))
    SUITES=$((SUITES + 1))
  else
    echo "  FAIL  $name                        produced no assertion count"
    FAILED=1
  fi

  [ "$code" -ne 0 ] && FAILED=1
  return 0
}

echo "-- sim -----------------------------------------------------------------"
run_suite verify_arch
run_suite verify_core
run_suite verify_move
run_suite verify_rig
run_suite verify_combat
run_suite verify_stats
run_suite verify_enemy
run_suite verify_boss
run_suite verify_caller
run_suite verify_gen
run_suite verify_run
run_suite verify_meta
run_suite verify_narrative
run_suite verify_audio
run_suite verify_platform
run_suite verify_touch
echo

echo "-- browser -------------------------------------------------------------"
run_suite verify_render
echo

# --------------------------------------------------------------- 2. verdict
echo "======================================================================"
if [ "$FAILED" -eq 0 ]; then
  echo "  GREEN   $PASSED/$TOTAL assertions across $SUITES suites"
else
  echo "  RED     $PASSED/$TOTAL assertions across $SUITES suites"
fi
echo "======================================================================"
exit "$FAILED"
