-- =====================================================================
-- 003_rls_workspace_fixes.sql
-- Replace recursive workspace RLS policies with security definer helpers.
-- =====================================================================

-- Helper: current user shares a workspace with the target profile/user.
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members other
      on mine.workspace_id = other.workspace_id
    where mine.user_id = auth.uid()
      and other.user_id = p_profile_id
  );
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_editor_or_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'owner'
  );
$$;

create or replace function public.can_self_join_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    exists (
      select 1
      from public.workspaces w
      where w.id = p_workspace_id
        and w.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.workspace_invites wi
      where wi.workspace_id = p_workspace_id
        and wi.accepted_at is null
        and wi.expires_at > now()
        and wi.invited_email = coalesce(auth.email(), '')
    );
$$;

-- =====================================================================
-- profiles
-- =====================================================================

drop policy if exists "profiles: workspace members can see each other" on public.profiles;

create policy "profiles: workspace members can see each other"
  on public.profiles for select
  using (
    auth.uid() = id
    or public.can_view_profile(id)
  );

-- =====================================================================
-- workspaces
-- =====================================================================

drop policy if exists "workspaces: members can read" on public.workspaces;
drop policy if exists "workspaces: owner can update" on public.workspaces;
drop policy if exists "workspaces: owner can delete" on public.workspaces;

create policy "workspaces: members can read"
  on public.workspaces for select
  using (public.is_workspace_member(id));

create policy "workspaces: owner can update"
  on public.workspaces for update
  using (public.is_workspace_owner(id))
  with check (public.is_workspace_owner(id));

create policy "workspaces: owner can delete"
  on public.workspaces for delete
  using (public.is_workspace_owner(id));

-- =====================================================================
-- workspace_members
-- =====================================================================

drop policy if exists "workspace_members: members can read" on public.workspace_members;
drop policy if exists "workspace_members: owner can add" on public.workspace_members;
drop policy if exists "workspace_members: owner or self can remove" on public.workspace_members;
drop policy if exists "workspace_members: owner can update role" on public.workspace_members;

create policy "workspace_members: members can read"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_members: owner can add"
  on public.workspace_members for insert
  with check (
    public.is_workspace_editor_or_owner(workspace_id)
    or (
      auth.uid() = user_id
      and public.can_self_join_workspace(workspace_id)
    )
  );

create policy "workspace_members: owner or self can remove"
  on public.workspace_members for delete
  using (
    user_id = auth.uid()
    or public.is_workspace_owner(workspace_id)
  );

create policy "workspace_members: owner can update role"
  on public.workspace_members for update
  using (public.is_workspace_owner(workspace_id));

-- =====================================================================
-- workspace_invites
-- =====================================================================

drop policy if exists "workspace_invites: members can read" on public.workspace_invites;
drop policy if exists "workspace_invites: owner/editor can create" on public.workspace_invites;
drop policy if exists "workspace_invites: anyone can accept" on public.workspace_invites;
drop policy if exists "workspace_invites: owner/editor can delete" on public.workspace_invites;

create policy "workspace_invites: members can read"
  on public.workspace_invites for select
  using (
    public.is_workspace_member(workspace_id)
    or invited_email = auth.email()
  );

create policy "workspace_invites: owner/editor can create"
  on public.workspace_invites for insert
  with check (public.is_workspace_editor_or_owner(workspace_id));

create policy "workspace_invites: anyone can accept"
  on public.workspace_invites for update
  using (true)
  with check (auth.uid() is not null);

create policy "workspace_invites: owner/editor can delete"
  on public.workspace_invites for delete
  using (public.is_workspace_editor_or_owner(workspace_id));

-- =====================================================================
-- workspace_templates
-- =====================================================================

drop policy if exists "workspace_templates: members can read" on public.workspace_templates;
drop policy if exists "workspace_templates: editors can insert" on public.workspace_templates;
drop policy if exists "workspace_templates: editors can update" on public.workspace_templates;
drop policy if exists "workspace_templates: owner can delete" on public.workspace_templates;

create policy "workspace_templates: members can read"
  on public.workspace_templates for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_templates: editors can insert"
  on public.workspace_templates for insert
  with check (public.is_workspace_editor_or_owner(workspace_id));

create policy "workspace_templates: editors can update"
  on public.workspace_templates for update
  using (public.is_workspace_editor_or_owner(workspace_id));

create policy "workspace_templates: owner can delete"
  on public.workspace_templates for delete
  using (public.is_workspace_owner(workspace_id));

-- =====================================================================
-- excel_uploads
-- =====================================================================

drop policy if exists "excel_uploads: members can read" on public.excel_uploads;
drop policy if exists "excel_uploads: editors can insert" on public.excel_uploads;
drop policy if exists "excel_uploads: owner can delete" on public.excel_uploads;

create policy "excel_uploads: members can read"
  on public.excel_uploads for select
  using (public.is_workspace_member(workspace_id));

create policy "excel_uploads: editors can insert"
  on public.excel_uploads for insert
  with check (public.is_workspace_editor_or_owner(workspace_id));

create policy "excel_uploads: owner can delete"
  on public.excel_uploads for delete
  using (public.is_workspace_owner(workspace_id));

-- =====================================================================
-- generation_jobs
-- =====================================================================

drop policy if exists "generation_jobs: members can read" on public.generation_jobs;
drop policy if exists "generation_jobs: editors can create" on public.generation_jobs;
drop policy if exists "generation_jobs: creator can update" on public.generation_jobs;
drop policy if exists "generation_jobs: owner can delete" on public.generation_jobs;

create policy "generation_jobs: members can read"
  on public.generation_jobs for select
  using (public.is_workspace_member(workspace_id));

create policy "generation_jobs: editors can create"
  on public.generation_jobs for insert
  with check (public.is_workspace_editor_or_owner(workspace_id));

create policy "generation_jobs: creator can update"
  on public.generation_jobs for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "generation_jobs: owner can delete"
  on public.generation_jobs for delete
  using (public.is_workspace_owner(workspace_id));

-- =====================================================================
-- generation_outputs
-- =====================================================================

drop policy if exists "generation_outputs: members can read" on public.generation_outputs;
drop policy if exists "generation_outputs: service only" on public.generation_outputs;

create policy "generation_outputs: members can read"
  on public.generation_outputs for select
  using (
    public.is_workspace_member(
      (select gj.workspace_id from public.generation_jobs gj where gj.id = generation_outputs.job_id)
    )
  );

create policy "generation_outputs: service only"
  on public.generation_outputs for insert
  with check (false);
