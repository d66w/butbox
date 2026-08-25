select 'RLS가 꺼진 테이블' as check_name,
       coalesce(string_agg(c.relname, ', '), '없음 (통과)') as result
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false;

select 'anon에 권한이 남은 객체' as check_name,
       coalesce(string_agg(distinct table_name, ', '), '없음 (통과)') as result
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon';

select 'authenticated에 쓰기 권한이 열린 테이블' as check_name,
       coalesce(string_agg(distinct table_name || ':' || privilege_type, ', '), '없음 (통과)') as result
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  and table_name not in ('boxes', 'profiles', 'upgrade_intents');

select 'RLS는 켜졌지만 정책이 없는 테이블' as check_name,
       coalesce(string_agg(c.relname, ', '), '없음 (통과)') as result
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
group by c.relname
having count(p.oid) = 0;

select 'security definer 함수 중 search_path 미고정' as check_name,
       coalesce(string_agg(p.proname, ', '), '없음 (통과)') as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
  and (p.proconfig is null or not exists (
    select 1 from unnest(p.proconfig) as cfg where cfg like 'search_path=%'
  ));

select 'anon이 실행 가능한 함수' as check_name,
       coalesce(string_agg(p.proname, ', '), '없음 (통과)') as result
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('anon', p.oid, 'EXECUTE');

select 'boxes 정책 목록' as check_name,
       string_agg(polname || '(' || polcmd || ')', ', ') as result
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname = 'boxes';

select '텍스트 10KB 제약 존재' as check_name,
       case when count(*) > 0 then '있음 (통과)' else '없음 (실패)' end as result
from pg_constraint
where conname = 'boxes_text_size';

select '용량 트리거가 INSERT/UPDATE/DELETE 모두 거는지' as check_name,
       case when bool_and(flag) then '통과' else '실패' end as result
from (
  select (tgtype & 4) > 0 as flag from pg_trigger where tgname = 'boxes_sync_usage'
  union all
  select (tgtype & 16) > 0 from pg_trigger where tgname = 'boxes_sync_usage'
  union all
  select (tgtype & 8) > 0 from pg_trigger where tgname = 'boxes_sync_usage'
) t;

select 'boxes replica identity full (DELETE 실시간에 필요)' as check_name,
       case when relreplident = 'f' then '통과' else '실패: ' || relreplident end as result
from pg_class
where relname = 'boxes';

select 'realtime publication에 boxes 등록' as check_name,
       case when count(*) > 0 then '통과' else '실패' end as result
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'boxes';

select 'analytics_events가 허용 이벤트만 받는지' as check_name,
       case when count(*) > 0 then '통과 (CHECK 존재)' else '실패' end as result
from pg_constraint c
join pg_class t on t.oid = c.conrelid
where t.relname = 'analytics_events' and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%event%';

select 'profiles 자동 생성 트리거' as check_name,
       case when count(*) > 0 then '통과' else '실패' end as result
from pg_trigger
where tgname = 'on_auth_user_created';
