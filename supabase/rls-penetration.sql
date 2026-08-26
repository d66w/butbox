select
  '이 파일을 실행하기 전에' as 안내,
  'DO 블록 맨 위 v_attacker / v_victim 에 auth.users 의 실제 UUID 두 개를 넣으세요.' as 할일,
  'select id, email from auth.users order by created_at;' as 조회_방법,
  '스크립트는 마지막에 rollback 하므로 데이터를 바꾸지 않습니다.' as 안전성;

begin;

create temporary table butbox_attack_result (
  step integer,
  check_name text,
  verdict text,
  detail text
) on commit drop;

do $$
declare
  v_attacker uuid := '00000000-0000-0000-0000-000000000000';
  v_victim uuid := '00000000-0000-0000-0000-000000000000';
  v_victim_space uuid;
  v_victim_box uuid;
  v_attacker_box uuid;
  v_count bigint;
  v_detail text;
begin
  if v_attacker = v_victim then
    raise exception 'v_attacker 와 v_victim 에 서로 다른 실제 UUID 를 넣으세요.';
  end if;
  if not exists (select 1 from auth.users where id = v_attacker) then
    raise exception 'v_attacker UUID 가 auth.users 에 없습니다.';
  end if;
  if not exists (select 1 from auth.users where id = v_victim) then
    raise exception 'v_victim UUID 가 auth.users 에 없습니다.';
  end if;

  select s.id into v_victim_space
  from public.spaces s
  where s.owner_id = v_victim
    and not exists (
      select 1 from public.space_members m
      where m.space_id = s.id and m.user_id = v_attacker
    )
  order by s.created_at
  limit 1;

  if v_victim_space is null then
    raise exception '공격자가 속하지 않은 피해자 스페이스가 없습니다. 피해자 계정으로 스페이스를 하나 만든 뒤 다시 실행하세요.';
  end if;

  select b.id into v_victim_box from public.boxes b where b.space_id = v_victim_space limit 1;
  if v_victim_box is null then
    raise exception '피해자 스페이스에 박스가 없습니다. 박스를 하나 만든 뒤 다시 실행하세요.';
  end if;

  select b.id into v_attacker_box
  from public.boxes b
  join public.space_members m on m.space_id = b.space_id
  where m.user_id = v_attacker
  limit 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_attacker, 'role', 'authenticated')::text, true);

  begin
    execute 'set local role authenticated';
    select count(*) into v_count from public.boxes where space_id = v_victim_space;
    execute 'reset role';
    insert into butbox_attack_result values (
      1, 'A가 B의 박스를 조회',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 노출)' end,
      'select * from boxes where space_id = 피해자스페이스');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (1, 'A가 B의 박스를 조회', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    update public.boxes set text_content = 'PWNED' where id = v_victim_box;
    get diagnostics v_count = row_count;
    execute 'reset role';
    insert into butbox_attack_result values (
      2, 'A가 B의 박스를 수정',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 수정됨)' end,
      'update boxes set text_content');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (2, 'A가 B의 박스를 수정', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    delete from public.boxes where id = v_victim_box;
    get diagnostics v_count = row_count;
    execute 'reset role';
    insert into butbox_attack_result values (
      3, 'A가 B의 박스를 삭제',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 삭제됨)' end,
      'delete from boxes');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (3, 'A가 B의 박스를 삭제', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    select count(*) into v_count from public.spaces where id = v_victim_space;
    execute 'reset role';
    insert into butbox_attack_result values (
      4, 'A가 B의 스페이스를 조회',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 노출)' end,
      'select * from spaces');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (4, 'A가 B의 스페이스를 조회', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    select count(*) into v_count from public.space_members where space_id = v_victim_space;
    execute 'reset role';
    insert into butbox_attack_result values (
      5, 'A가 B의 스페이스 멤버 목록을 조회',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 노출)' end,
      'select * from space_members');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (5, 'A가 B의 스페이스 멤버 목록을 조회', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    select count(*) into v_count from public.profiles where id = v_victim;
    execute 'reset role';
    insert into butbox_attack_result values (
      6, 'A가 같은 스페이스가 아닌 B의 프로필을 조회',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 노출)' end,
      'select * from profiles');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (6, 'A가 같은 스페이스가 아닌 B의 프로필을 조회', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    select count(*) into v_count from public.subscriptions where user_id = v_victim;
    execute 'reset role';
    insert into butbox_attack_result values (
      7, 'A가 B의 구독 정보를 조회',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 노출)' end,
      'select * from subscriptions');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (7, 'A가 B의 구독 정보를 조회', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    select count(*) into v_count from public.invitations where space_id = v_victim_space;
    execute 'reset role';
    insert into butbox_attack_result values (
      8, 'A가 B 스페이스의 초대 토큰을 조회',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 노출)' end,
      'select token from invitations');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (8, 'A가 B 스페이스의 초대 토큰을 조회', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    perform public.redeem_invite('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    execute 'reset role';
    insert into butbox_attack_result values (9, 'A가 조작한 초대 토큰으로 참여', '실패 (참여됨)', '위조 토큰이 통과했습니다');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (9, 'A가 조작한 초대 토큰으로 참여', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    perform public.create_box(v_victim_space, '침투 테스트');
    execute 'reset role';
    insert into butbox_attack_result values (10, 'A가 권한 없는 스페이스에 박스 생성', '실패 (생성됨)', 'create_box 가 통과했습니다');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (10, 'A가 권한 없는 스페이스에 박스 생성', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    perform public.set_member_role(v_victim_space, v_attacker, 'admin');
    execute 'reset role';
    insert into butbox_attack_result values (11, 'A가 B 스페이스에서 자신을 관리자로 승격', '실패 (승격됨)', 'set_member_role 이 통과했습니다');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (11, 'A가 B 스페이스에서 자신을 관리자로 승격', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    perform public.delete_space(v_victim_space);
    execute 'reset role';
    insert into butbox_attack_result values (12, 'A가 B의 스페이스를 삭제', '실패 (삭제됨)', 'delete_space 가 통과했습니다');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (12, 'A가 B의 스페이스를 삭제', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    update public.profiles set plan = 'team' where id = v_attacker;
    get diagnostics v_count = row_count;
    execute 'reset role';
    insert into butbox_attack_result values (
      13, 'A가 자기 플랜을 team 으로 올림',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 변경됨)' end,
      'update profiles set plan');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (13, 'A가 자기 플랜을 team 으로 올림', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    update public.subscriptions set plan = 'team', status = 'active' where user_id = v_attacker;
    get diagnostics v_count = row_count;
    execute 'reset role';
    insert into butbox_attack_result values (
      14, 'A가 자기 구독을 team 으로 조작',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 변경됨)' end,
      'update subscriptions set plan');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (14, 'A가 자기 구독을 team 으로 조작', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role authenticated';
    select count(*) into v_count from (select password_hash from public.spaces limit 1) t;
    execute 'reset role';
    insert into butbox_attack_result values (15, '멤버가 스페이스 비밀번호 해시를 읽음', '실패 (읽힘)', '004-column-grants.sql 을 적용하세요');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (15, '멤버가 스페이스 비밀번호 해시를 읽음', '통과 (거부)', sqlerrm);
  end;

  if v_attacker_box is not null then
    begin
      execute 'set local role authenticated';
      update public.boxes set tags = array['한도우회'] where id = v_attacker_box;
      get diagnostics v_count = row_count;
      execute 'reset role';
      insert into butbox_attack_result values (
        16, '멤버가 태그를 직접 써서 플랜 한도 우회',
        case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 변경됨)' end,
        '004-column-grants.sql 을 적용하세요');
    exception when others then
      execute 'reset role';
      insert into butbox_attack_result values (16, '멤버가 태그를 직접 써서 플랜 한도 우회', '통과 (거부)', sqlerrm);
    end;
  else
    insert into butbox_attack_result values (16, '멤버가 태그를 직접 써서 플랜 한도 우회', '건너뜀', '공격자 계정에 박스가 없습니다');
  end if;

  perform set_config('request.jwt.claims', null, true);

  begin
    execute 'set local role anon';
    select count(*) into v_count from public.boxes;
    execute 'reset role';
    insert into butbox_attack_result values (
      17, '로그인하지 않은 사용자가 박스를 조회',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 노출)' end,
      'anon select from boxes');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (17, '로그인하지 않은 사용자가 박스를 조회', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role anon';
    select count(*) into v_count from public.profiles;
    execute 'reset role';
    insert into butbox_attack_result values (
      18, '로그인하지 않은 사용자가 프로필을 조회',
      case when v_count = 0 then '통과 (0건)' else '실패 (' || v_count || '건 노출)' end,
      'anon select from profiles');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (18, '로그인하지 않은 사용자가 프로필을 조회', '통과 (거부)', sqlerrm);
  end;

  begin
    execute 'set local role anon';
    perform public.peek_invite('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    execute 'reset role';
    insert into butbox_attack_result values (19, '로그인하지 않은 사용자가 초대를 조회', '실패 (허용됨)', 'anon 이 peek_invite 를 실행했습니다');
  exception when others then
    execute 'reset role';
    insert into butbox_attack_result values (19, '로그인하지 않은 사용자가 초대를 조회', '통과 (거부)', sqlerrm);
  end;

  v_detail := null;
end
$$;

select
  step as 번호,
  check_name as 공격,
  verdict as 결과,
  detail as 비고
from butbox_attack_result
order by step;

select
  count(*) filter (where verdict like '실패%') as 실패,
  count(*) filter (where verdict like '통과%') as 통과,
  count(*) filter (where verdict = '건너뜀') as 건너뜀,
  case
    when count(*) filter (where verdict like '실패%') = 0 then '전체 통과'
    else '침투 성공 항목이 있습니다. 출시를 멈추세요.'
  end as 판정
from butbox_attack_result;

rollback;
