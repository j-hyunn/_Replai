-- 04_data_layer.md 5.4절 — 트리거 함수 5종의 PUBLIC EXECUTE 회수 (심층 방어)
--
-- 발견 경위 (2026-09-11 라이브 검증, Supabase security advisor).
--   `security definer` 트리거 함수 5종이 **기본 PUBLIC EXECUTE를 그대로 달고 있어**
--   `anon`·`authenticated`가 `/rest/v1/rpc/<name>`으로 호출 가능한 것으로 잡혔습니다
--   (advisor 0028·0029, WARN × 각 5건).
--
-- **실제 악용 가능성은 없습니다 (실측 확인).** `returns trigger` 함수는 Postgres가
--   트리거 문맥 밖 호출을 "trigger functions can only be called as triggers"로 거부합니다.
--   authenticated로 직접 호출해 확인했습니다.
--
-- 그래도 회수하는 이유.
--   ① 3.14.1절이 세운 원칙("`security definer` 함수를 authenticated가 실행할 수 있으면
--      RLS 0개 정책이 무의미해진다")은 함수 종류를 가리지 않습니다.
--   ② 이 중 둘은 **파괴적**입니다 — `purge_user_api_key_secret`은 `vault.secrets`를 지우고,
--      `release_quota_before_delete`는 원장을 깎습니다. 훗날 누군가 이 함수들을
--      트리거가 아닌 일반 함수로 리팩터링하는 순간 방어막이 없는 채로 노출됩니다.
--   ③ advisor WARN을 0으로 만들어야 **새로 생기는 WARN이 신호로 보입니다.**
--
-- 5.4절의 회귀 쿼리가 이걸 놓친 이유도 함께 기록합니다 — 검사 대상이
-- **함수 이름 하드코딩 목록**이었기 때문입니다. 목록에 없는 함수는 영원히 안 보입니다.
-- 04_data_layer.md 5.4절의 쿼리를 카탈로그 전수 조회로 일반화했습니다(같은 커밋).

revoke execute on function public.handle_new_user()                from public, anon, authenticated;
revoke execute on function public.enqueue_storage_cleanup()        from public, anon, authenticated;
revoke execute on function public.enforce_session_funding_rules()  from public, anon, authenticated;
revoke execute on function public.release_quota_before_delete()    from public, anon, authenticated;
revoke execute on function public.purge_user_api_key_secret()      from public, anon, authenticated;

-- set_updated_at은 security definer가 아니지만(= 호출자 권한으로 돌아 위험이 없음)
-- 같은 이유로 노출할 까닭이 없으므로 함께 회수합니다.
revoke execute on function public.set_updated_at()                 from public, anon, authenticated;

-- 트리거는 **테이블 소유자 권한**으로 실행되므로 EXECUTE 회수는 트리거 동작에 영향이 없습니다.
-- (트리거 발화에는 함수 EXECUTE 권한이 필요하지 않습니다.)
