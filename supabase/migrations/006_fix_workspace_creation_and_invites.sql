-- =====================================================================
-- 006_fix_workspace_creation_and_invites.sql
-- Fixes:
--   1. Workspace creation RLS chicken-and-egg problem
--   2. Adds pending invites view for users
-- =====================================================================

-- ── RPC: add_workspace_owner (bypasses RLS) ────────────────────────
-- Allows the workspace creator to be added as owner without circular
-- RLS dependency (the creator isn't a member yet when we insert).
create or replace function public.add_workspace_owner(
  p_workspace_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (p_workspace_id, p_user_id, 'owner', p_user_id)
  on conflict (workspace_id, user_id) do nothing;
end;
$$;

-- ── View: pending invites for the current user ────────────────────
-- Returns all non-expired, unaccepted invites where the invited_email
-- matches the current user's email. Used by the app to show in-app
-- notifications.
create or replace function public.get_my_pending_invites()
returns table (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  role text,
  invited_by uuid,
  invited_by_name text,
  invited_by_email text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    wi.id,
    wi.workspace_id,
    w.name,
    wi.role,
    wi.invited_by,
    p.full_name,
    p.email,
    wi.expires_at - interval '7 days',
    wi.expires_at
  from public.workspace_invites wi
  join public.workspaces w on w.id = wi.workspace_id
  left join public.profiles p on p.id = wi.invited_by
  where wi.invited_email = auth.email()
    and wi.accepted_at is null
    and wi.expires_at > now()
  order by wi.expires_at desc;
$$;

-- ── RPC: accept an invite by ID (for in-app acceptance) ───────────
create or replace function public.accept_invite_by_id(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_workspace_id uuid;
  v_role text;
begin
  select workspace_id, role into v_workspace_id, v_role
  from public.workspace_invites
  where id = p_invite_id
    and invited_email = auth.email()
    and accepted_at is null
    and expires_at > now();

  if not found then
    raise exception 'Invite not found or expired';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (v_workspace_id, auth.uid(), v_role, auth.uid())
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
  set accepted_at = now()
  where id = p_invite_id;

  return v_workspace_id;
end;
$$;

-- ── RPC: decline an invite by ID ──────────────────────────────────
create or replace function public.decline_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from public.workspace_invites
  where id = p_invite_id
    and invited_email = auth.email()
    and accepted_at is null;
end;
$$;