#!/usr/bin/env bash
# Sync env vars from apps/web/.env.local to the Vercel project for both
# Preview and Production scopes. Prints key names + status only — never the
# values, so it's safe to run with the output visible.
#
# Adds three keys NOT present in .env.local (using passed-in or generated
# values): ELEVENLABS_WEBHOOK_SECRET, PUBLIC_BASE_URL, OPERATOR_EMAILS.
#
# Usage:
#   ./scripts/sync-vercel-env.sh
# Optional overrides via env:
#   ELEVENLABS_WEBHOOK_SECRET=<hex>   # default: random 32-byte hex
#   PUBLIC_BASE_URL=<https-url>       # default: https://ai-receptionist-seven-sigma.vercel.app
#   OPERATOR_EMAILS=<csv>             # default: yauheni.futryn@gmail.com

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/web/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# Keys we forward from .env.local to Vercel. Anything in .env.local NOT on
# this list is intentionally skipped (PORT, dev-only knobs, etc).
KEYS_FROM_LOCAL=(
  GEMINI_API_KEY
  ELEVENLABS_API_KEY
  FIRECRAWL_API_KEY
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
)

# Defaults for the three Chat-1-new keys.
ELEVENLABS_WEBHOOK_SECRET="${ELEVENLABS_WEBHOOK_SECRET:-$(openssl rand -hex 32)}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://ai-receptionist-seven-sigma.vercel.app}"
OPERATOR_EMAILS="${OPERATOR_EMAILS:-yauheni.futryn@gmail.com}"

push_key() {
  local key="$1"
  local value="$2"
  # Vercel CLI 54 has a regression: `vercel env add KEY preview --value X --yes`
  # rejects with git_branch_required even though `--help` documents this as
  # "all preview branches". Workaround: push to production scope only for
  # Chat 1. Preview scope can be filled later per-branch when we need
  # branch-specific PR previews. The wow demo runs on the prod URL.
  vercel env rm "$key" production --yes >/dev/null 2>&1 || true
  if vercel env add "$key" production --value "$value" --yes >/dev/null 2>&1; then
    echo "  ✓ $key (production)"
  else
    echo "  ✗ $key (production) — vercel env add failed" >&2
    return 1
  fi
}

echo "Syncing env vars to Vercel project: ai-receptionist"
echo ""

# 1. Pull values from .env.local for the known keys, push to Vercel.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for key in "${KEYS_FROM_LOCAL[@]}"; do
  value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "  ⊘ $key (not in .env.local — skipped)"
    continue
  fi
  push_key "$key" "$value"
done

# 2. New keys for Chat 1.
echo ""
echo "New Chat-1 keys:"
push_key ELEVENLABS_WEBHOOK_SECRET "$ELEVENLABS_WEBHOOK_SECRET"
push_key PUBLIC_BASE_URL "$PUBLIC_BASE_URL"
push_key OPERATOR_EMAILS "$OPERATOR_EMAILS"

echo ""
echo "Done. Don't forget to:"
echo "  1. Save ELEVENLABS_WEBHOOK_SECRET locally (also configure on EL workspace)"
echo "  2. Deploy: vercel --prod"
echo "  3. Seed operator_emails table in Supabase (run apps/backend/scripts/seed-operator-emails.mjs)"
