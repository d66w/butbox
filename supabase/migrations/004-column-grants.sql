create or replace function public.space_join_enabled(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.password_hash is not null
  );
$$;

revoke all on function public.space_join_enabled(uuid) from public, anon, authenticated;
grant execute on function public.space_join_enabled(uuid) to authenticated;

drop view if exists public.space_summaries;
create view public.space_summaries
with (security_invoker = true)
as
select
  s.id,
  s.name,
  s.space_code,
  s.owner_id,
  s.box_limit,
  s.quota_bytes,
  s.used_bytes,
  public.space_join_enabled(s.id) as join_enabled,
  m.role,
  m.joined_at,
  (select count(*) from public.boxes b where b.space_id = s.id) as box_count,
  (select count(*) from public.space_members mm where mm.space_id = s.id) as member_count,
  s.created_at,
  s.updated_at,
  s.description
from public.spaces s
join public.space_members m on m.space_id = s.id and m.user_id = auth.uid();

revoke all on public.space_summaries from anon, authenticated;
grant select on public.space_summaries to authenticated;

revoke all on public.spaces from anon, authenticated;
grant select (
  id, name, space_code, owner_id, box_limit, quota_bytes, used_bytes,
  description, created_at, updated_at
) on public.spaces to authenticated;

revoke all on public.boxes from anon, authenticated;
grant select, delete on public.boxes to authenticated;
grant update (name, text_content) on public.boxes to authenticated;

revoke execute on function public.effective_plan(uuid) from anon, authenticated;
