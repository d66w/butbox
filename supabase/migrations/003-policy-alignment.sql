alter table public.plans add column if not exists member_limit integer;
alter table public.plans alter column member_limit drop not null;

update public.plans set
  box_limit = 10,
  space_limit = 1,
  member_limit = null,
  price_monthly_krw = 0,
  price_yearly_krw = 0
where code = 'free';

update public.plans set
  box_limit = 50,
  space_limit = 3,
  member_limit = null,
  price_monthly_krw = 0,
  price_yearly_krw = 0
where code = 'pro';

update public.plans set
  box_limit = 100,
  space_limit = 10,
  member_limit = null,
  price_monthly_krw = 0,
  price_yearly_krw = 0
where code = 'team';

update public.spaces s
set box_limit = p.box_limit + pr.extra_boxes,
    quota_bytes = p.quota_bytes,
    updated_at = now()
from public.profiles pr
join public.plans p on p.code = pr.plan
where s.owner_id = pr.id;

create or replace function public.log_event(p_event text, p_props jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_props jsonb;
begin
  if v_user is null then
    return;
  end if;
  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  into v_props
  from jsonb_each(coalesce(p_props, '{}'::jsonb)) item
  where item.key in ('surface', 'lever', 'plan', 'count', 'role', 'mode', 'reason')
    and (
      jsonb_typeof(item.value) in ('number', 'boolean')
      or (jsonb_typeof(item.value) = 'string' and char_length(item.value #>> '{}') <= 32)
    );
  insert into public.analytics_events (user_id, event, props)
  values (v_user, p_event, v_props);
exception
  when check_violation then
    return;
end;
$$;

create or replace function public.create_invite(p_space_id uuid, p_role text, p_days integer)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor_role text;
  v_token text;
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 30);
  v_role text := coalesce(p_role, 'member');
  attempts integer := 0;
begin
  select role into v_actor_role from public.space_members
  where space_id = p_space_id and user_id = auth.uid();
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'NOT_SPACE_ADMIN';
  end if;
  if v_role not in ('admin', 'member') then
    raise exception 'INVALID_ROLE';
  end if;
  if v_role = 'admin' and v_actor_role <> 'owner' then
    raise exception 'NOT_SPACE_OWNER';
  end if;

  loop
    v_token := encode(gen_random_bytes(18), 'hex');
    exit when not exists (select 1 from public.invitations where token = v_token);
    attempts := attempts + 1;
    if attempts > 30 then
      raise exception 'INVITE_TOKEN_EXHAUSTED';
    end if;
  end loop;

  insert into public.invitations (token, space_id, created_by, role, expires_at)
  values (v_token, p_space_id, auth.uid(), v_role, now() + make_interval(days => v_days));

  return v_token;
end;
$$;

create or replace function public.redeem_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_inv public.invitations;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  perform public.current_profile();

  select * into v_inv from public.invitations where token = btrim(coalesce(p_token, '')) for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'INVITE_EXPIRED';
  end if;
  if v_inv.uses >= v_inv.max_uses then
    raise exception 'INVITE_EXHAUSTED';
  end if;

  if exists (select 1 from public.space_members where space_id = v_inv.space_id and user_id = v_user) then
    return v_inv.space_id;
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (v_inv.space_id, v_user, v_inv.role)
  on conflict (space_id, user_id) do nothing;

  update public.invitations set uses = uses + 1 where token = v_inv.token;

  return v_inv.space_id;
end;
$$;

revoke all on function public.log_event(text, jsonb) from public, anon, authenticated;
revoke all on function public.create_invite(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.redeem_invite(text) from public, anon, authenticated;
revoke all on function public.effective_plan(uuid) from public, anon, authenticated;
revoke all on function public.current_subscription() from public, anon, authenticated;
revoke all on function public.set_box_favorite(uuid, boolean) from public, anon, authenticated;
revoke all on function public.touch_box(uuid) from public, anon, authenticated;
revoke all on function public.set_box_tags(uuid, text[]) from public, anon, authenticated;
revoke all on function public.duplicate_box(uuid) from public, anon, authenticated;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.peek_invite(text) from public, anon, authenticated;
revoke all on function public.revoke_invites(uuid) from public, anon, authenticated;
revoke all on function public.describe_space(uuid, text) from public, anon, authenticated;
grant execute on function public.log_event(text, jsonb) to authenticated;
grant execute on function public.create_invite(uuid, text, integer) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.effective_plan(uuid) to authenticated;
grant execute on function public.current_subscription() to authenticated;
grant execute on function public.set_box_favorite(uuid, boolean) to authenticated;
grant execute on function public.touch_box(uuid) to authenticated;
grant execute on function public.set_box_tags(uuid, text[]) to authenticated;
grant execute on function public.duplicate_box(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.peek_invite(text) to authenticated;
grant execute on function public.revoke_invites(uuid) to authenticated;
grant execute on function public.describe_space(uuid, text) to authenticated;
