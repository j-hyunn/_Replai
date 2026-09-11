#!/usr/bin/env bash
# ⚠️ 로컬 검증 전용 — Docker 없이 타입을 생성합니다.
#
# 정본 명령은 04_data_layer.md 11절입니다:
#     supabase gen types typescript --local  > src/lib/supabase/database.types.ts
#     supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts
#
# 다만 `supabase gen types --local|--db-url`은 내부적으로 postgres-meta **컨테이너**를 띄우므로
# Docker가 없으면 동작하지 않습니다. 이 스크립트는 같은 postgres-meta를 npm 패키지로 직접 실행해
# **동일한 생성기**에서 같은 출력을 받습니다(손으로 쓴 타입이 아닙니다).
#
# 전제: supabase/dev/apply-local.sh 로 스키마가 적용된 로컬 DB가 떠 있어야 합니다.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres@127.0.0.1:55432/replai}"
META_PORT="${META_PORT:-54999}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/src/lib/supabase/database.types.ts"
WORK="$(mktemp -d)"

cd "$WORK"
npm init -y >/dev/null 2>&1
npm i @supabase/postgres-meta@latest >/dev/null 2>&1

PG_META_PORT="$META_PORT" PG_META_DB_URL="$DB_URL" \
  node node_modules/@supabase/postgres-meta/dist/server/server.js >"$WORK/meta.log" 2>&1 &
META_PID=$!
trap 'kill "$META_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  sleep 1
  curl -sf "http://127.0.0.1:$META_PORT/health" >/dev/null 2>&1 && break
done

curl -sf "http://127.0.0.1:$META_PORT/generators/typescript?included_schemas=public&detect_one_to_one_relationships=true" \
  -o "$OUT"

echo "생성 완료: $OUT ($(wc -l < "$OUT") 줄)"
echo "※ 파일은 DB 그대로 snake_case입니다. camelCase 변환은 API 라우트에서만 합니다(11.1절)."
