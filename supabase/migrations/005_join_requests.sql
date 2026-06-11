-- =====================================================================
-- 005_join_requests.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- =====================================================================

-- ── workspace_join_requests ───────────────────────────────────────
create table if not exists public.workspace_join_requests (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  message         text,
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  requested_at    timestamptz default now(),
  processed_at    timestamptz,
  processed_by    uuid references auth.users(id) on delete set null,
  unique(workspace_id, user_id)
);

create index on public.workspace_join_requests(workspace_id);
create index on public.workspace_join_requests(user_id);
create index on public.workspace_join_requests(status);

alter table public.workspace_join_requests enable row level security;

-- read: users can see their own requests
create policy "workspace_join_requests: users can read own"
  on public.workspace_join_requests for select
  using (auth.uid() = user_id);

-- read: owners/editors can see requests for their workspaces
create policy "workspace_join_requests: owners/editors can read"
  on public.workspace_join_requests for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_join_requests.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'editor')
    )
  );

-- insert: any authenticated user can create a request for themselves
create policy "workspace_join_requests: users can create own"
  on public.workspace_join_requests for insert
  with check (auth.uid() = user_id);

-- update: owners can accept/reject requests
create policy "workspace_join_requests: owners can update"
  on public.workspace_join_requests for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_join_requests.workspace_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- delete: users can cancel their own pending requests
create policy "workspace_join_requests: users can delete own pending"
  on public.workspace_join_requests for delete
  using (
    auth.uid() = user_id
    and status = 'pending'
  );

-- delete: owners can delete any request for their workspaces
create policy "workspace_join_requests: owners can delete"
  on public.workspace_join_requests for delete
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_join_requests.workspace_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );
