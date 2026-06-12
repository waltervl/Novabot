#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  echo "verify_oracle: $*" >&2
  exit 1
}

test -x "$ROOT/gen_oracle.sh" || fail "missing executable gen_oracle.sh"
test -f "$ROOT/cases/manifest.tsv" || fail "missing cases/manifest.tsv"
test -f "$ROOT/goldens/manifest.tsv" || fail "missing goldens/manifest.tsv"
test -f "$ROOT/goldens/world/manifest.tsv" || fail "missing world golden manifest"
test -f "$ROOT/missing-adversarial-cases.tsv" || fail "missing adversarial gap report"

case_count="$(find "$ROOT/cases" -maxdepth 1 -type f -name '*.pgm' | wc -l | tr -d ' ')"
test "$case_count" -ge 4 || fail "expected at least 4 pgm cases, found $case_count"

golden_count="$(find "$ROOT/goldens/grid" -type f -name '*.json' | wc -l | tr -d ' ')"
test "$golden_count" -ge 16 || fail "expected at least 16 grid goldens, found $golden_count"

adversarial_count="$(awk -F '\t' 'NR > 1 { count++ } END { print count + 0 }' "$ROOT/missing-adversarial-cases.tsv")"
test "$adversarial_count" -ge 4 || fail "expected at least 4 adversarial report rows"
awk -F '\t' 'NR == 1 { next } $2 != "missing" && $2 != "copied" { bad++ } END { exit bad ? 1 : 0 }' \
  "$ROOT/missing-adversarial-cases.tsv" || fail "adversarial report status must be missing or copied"

awk -F '\t' 'NR == 1 { next } NF != 8 { bad++ } END { exit bad ? 1 : 0 }' \
  "$ROOT/goldens/manifest.tsv" || fail "grid golden manifest must have 8 tab-separated columns"

echo "verify_oracle: ok ($case_count cases, $golden_count grid goldens)"
