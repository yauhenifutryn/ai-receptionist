#!/usr/bin/env bash
# verify-rules.sh — mechanical guardrails for the hard rules in CLAUDE.md.
#
# Run as part of `pnpm verify` and CI. Fails (exit 1) on the first violation
# of any rule below. Each check operates on git-tracked source files only.
#
# Rules enforced:
#   R1. Audio storage must be OFF (no `save_audio: true`, etc.)
#   R2. consent_flag must default to false (no `=\s*true` / `:\s*true` default).
#   R3. EU-only regions (no us-east-N, us-west-N, ap-south-N, ap-northeast-N
#       in source — vercel.json, supabase configs, etc.)
#   R4. Caller PII fields must not appear inside console.log/info/debug calls
#       (use Pino logger.info with explicit allowlisted keys instead).
#
# Allowlisted paths:
#   - apps/backend/ontology/**  — narrative docs of the rules
#   - **/test/**, **/*.test.ts  — tests exercising the rules legitimately
#   - docs/**                   — strategy + research docs
#   - AUDIT.md, REVIEW.md       — audit artifacts

set -uo pipefail

cd "$(dirname "$0")/.."

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

fail_count=0

# Source files only, gitignore-respecting, with allowlist excludes.
source_files() {
  git ls-files \
    'apps/**/*.ts' 'apps/**/*.tsx' 'apps/**/*.mjs' \
    'packages/**/*.ts' \
    '*.json' '*.mjs' \
    | grep -vE '(/test/|\.test\.ts$|/ontology/|^docs/|^AUDIT\.md$|^REVIEW\.md$|/dist/|/\.next/)' \
    || true
}

check() {
  local rule="$1"
  local description="$2"
  local pattern="$3"
  local hits
  hits=$(source_files | xargs -I{} grep -EHn "$pattern" {} 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    red "FAIL  $rule  $description"
    echo "$hits" | sed 's/^/    /'
    fail_count=$((fail_count + 1))
  else
    green "PASS  $rule  $description"
  fi
}

bold "verify-rules.sh — checking CLAUDE.md hard rules"
echo

check "R1" "Audio storage must be OFF" \
  '(save_audio|audio_storage|record_audio|enableAudioRecording|save_recording)\s*[:=]\s*true'

check "R2" "consent_flag default must be false" \
  '(consent_flag|consentFlag)\s*[:=]\s*true'

check "R3" "EU-only regions (no us-*, ap-*)" \
  '("|'\'')(us-(east|west)-[0-9]+|ap-(south|northeast|southeast)-[0-9]+)("|'\'')'

check "R4" "No raw caller PII fields inside console.log/info/debug" \
  'console\.(log|info|debug)[^;]*\b(patient_phone|patientPhone|caller_phone|callerPhone|patient_name|patientName|patient_birth|patientBirth|patient_pesel|patientPesel|pesel)\b'

echo
if [[ "$fail_count" -gt 0 ]]; then
  red "verify-rules.sh: $fail_count rule(s) failed"
  exit 1
fi
green "verify-rules.sh: all rules passed"
exit 0
