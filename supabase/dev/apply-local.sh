#!/usr/bin/env bash
# ⚠️ 로컬 검증 전용. 원격 Supabase 프로젝트에는 쓰지 마세요.
#
# Docker(따라서 `supabase start`)를 쓸 수 없는 환경에서 supabase/migrations/의 파일들을
# 맨몸 PostgreSQL 17에 순서대로 **실제로 적용해** 검증합니다.
#   1) 00_supabase_shim.sql 로 Supabase 기본 제공 객체를 재현
#   2) migrations/*.sql 을 파일명 순서대로 `psql -v ON_ERROR_STOP=1` 로 적용
#   3) 99_verify_rls.sql 의 5.4절 점검 쿼리 3개를 실행 (전부 0행이어야 통과)
#
# Docker가 있는 환경에서는 이 스크립트 대신 `supabase db reset`을 쓰세요.
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
PGDATA_DIR="${PGDATA_DIR:-/tmp/replai-pg/data}"
PGSOCK="${PGSOCK:-/tmp/replai-pg/sock}"
PGPORT="${PGPORT:-55432}"
DB="${DB:-replai}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export LC_ALL=C LANG=C

# supabase_vault 확장은 맨몸 PostgreSQL에 없습니다. 마이그레이션 #14를 **원문 그대로** 적용하기 위해
# 아무것도 만들지 않는 스텁 확장을 등록합니다(실제 vault 객체는 shim이 만듭니다).
EXTDIR="$("$PGBIN/pg_config" --sharedir)/extension"
if [ ! -f "$EXTDIR/supabase_vault.control" ]; then
  cat > "$EXTDIR/supabase_vault.control" <<'CTL'
# 로컬 검증용 스텁 (Replai supabase/dev/apply-local.sh). 실제 Supabase 확장이 아닙니다.
comment = 'local stub for supabase_vault'
default_version = '1.0'
relocatable = false
CTL
  echo "-- local stub: objects are provided by supabase/dev/00_supabase_shim.sql" \
    > "$EXTDIR/supabase_vault--1.0.sql"
fi

if ! "$PGBIN/pg_ctl" -D "$PGDATA_DIR" status >/dev/null 2>&1; then
  mkdir -p "$PGSOCK"
  "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -o "-p $PGPORT -k $PGSOCK" -l /tmp/replai-pg/pg.log start
fi

psql() { "$PGBIN/psql" -h "$PGSOCK" -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }

psql -d postgres -c "drop database if exists $DB;" >/dev/null
psql -d postgres -c "create database $DB;" >/dev/null

psql -d "$DB" -q -f "$ROOT/supabase/dev/00_supabase_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "==> $(basename "$f")"
  psql -d "$DB" -q -f "$f"
done

echo "==> 5.4절 점검 쿼리"
psql -d "$DB" -f "$ROOT/supabase/dev/99_verify_rls.sql"
