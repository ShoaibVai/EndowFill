-- =====================================================================
-- 001_workspaces.sql
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- =====================================================================

-- ── profiles (auto-populated from auth.users) ────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles: own row"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: workspace members can see each other"
  on public.profiles for select
  using (
    exists (
      select 1 from public.workspace_members wm1
      join public.workspace_members wm2 on wm1.workspace_id = wm2.workspace_id
      where wm1.user_id = auth.uid()
        and wm2.user_id = profiles.id
    )
  );

-- trigger: create profile row automatically when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── workspaces ───────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.workspaces enable row level security;

-- read: must be a member
create policy "workspaces: members can read"
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspaces.id
        and user_id = auth.uid()
    )
  );

-- insert: any authenticated user can create (they become owner via app logic)
create policy "workspaces: authed can create"
  on public.workspaces for insert
  with check (auth.uid() is not null);

-- update/delete: owner only
create policy "workspaces: owner can update"
  on public.workspaces for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspaces.id
        and user_id = auth.uid()
        and role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspaces.id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

create policy "workspaces: owner can delete"
  on public.workspaces for delete
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspaces.id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- ── workspace_members ────────────────────────────────────────────────
create table if not exists public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','editor','viewer')),
  invited_by   uuid references auth.users(id) on delete set null,
  joined_at    timestamptz default now(),
  unique(workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

-- read: members of the same workspace
create policy "workspace_members: members can read"
  on public.workspace_members for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- insert: owner or editor can add members
create policy "workspace_members: owner can add"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_members.workspace_id
        and user_id = auth.uid()
        and role in ('owner','editor')
    )
    or auth.uid() = workspace_members.user_id -- allow self-join via invite
  );

-- delete: owner can remove anyone, users can remove themselves
create policy "workspace_members: owner or self can remove"
  on public.workspace_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_members.workspace_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- update role: owner only
create policy "workspace_members: owner can update role"
  on public.workspace_members for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_members.workspace_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- ── workspace_invites ────────────────────────────────────────────────
create table if not exists public.workspace_invites (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  invited_email  text not null,
  role           text not null check (role in ('editor','viewer')),
  token          text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by     uuid references auth.users(id) on delete set null,
  expires_at     timestamptz default (now() + interval '7 days'),
  accepted_at    timestamptz
);

alter table public.workspace_invites enable row level security;

-- read: members of the workspace can see invites
create policy "workspace_invites: members can read"
  on public.workspace_invites for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_invites.workspace_id
        and user_id = auth.uid()
    )
    or invited_email = auth.email()
  );

-- insert: owner or editor
create policy "workspace_invites: owner/editor can create"
  on public.workspace_invites for insert
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_invites.workspace_id
        and user_id = auth.uid()
        and role in ('owner','editor')
    )
  );

-- update (accept): anyone with the token (enforced in app logic)
create policy "workspace_invites: anyone can accept"
  on public.workspace_invites for update
  using (true)
  with check (auth.uid() is not null);

-- delete: owner/editor can revoke
create policy "workspace_invites: owner/editor can delete"
  on public.workspace_invites for delete
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_invites.workspace_id
        and user_id = auth.uid()
        and role in ('owner','editor')
    )
  );

-- ── workspace_templates ──────────────────────────────────────────────
create table if not exists public.workspace_templates (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  name               text not null,
  description        text,
  pdf_file_name      text not null default '',
  base_pdf_b64       text,             -- base64-encoded PDF bytes
  template_schemas   jsonb default '[]',
  schema_fields      jsonb default '[]',
  field_bindings     jsonb default '[]',
  validation_rules   jsonb default '[]',
  conditional_rules  jsonb default '[]',
  snapshots          jsonb default '[]',
  thumbnail_b64      text,
  created_by         uuid references auth.users(id) on delete set null,
  last_modified_by   uuid references auth.users(id) on delete set null,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index on public.workspace_templates(workspace_id);
create index on public.workspace_templates(updated_at desc);

alter table public.workspace_templates enable row level security;

-- read: any workspace member
create policy "workspace_templates: members can read"
  on public.workspace_templates for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_templates.workspace_id
        and user_id = auth.uid()
    )
  );

-- insert: editor or owner
create policy "workspace_templates: editors can insert"
  on public.workspace_templates for insert
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_templates.workspace_id
        and user_id = auth.uid()
        and role in ('owner','editor')
    )
  );

-- update: editor or owner
create policy "workspace_templates: editors can update"
  on public.workspace_templates for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_templates.workspace_id
        and user_id = auth.uid()
        and role in ('owner','editor')
    )
  );

-- delete: owner only
create policy "workspace_templates: owner can delete"
  on public.workspace_templates for delete
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_templates.workspace_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists workspace_templates_updated_at on public.workspace_templates;
create trigger workspace_templates_updated_at
  before update on public.workspace_templates
  for each row execute function public.set_updated_at();

drop trigger if exists workspaces_updated_at on public.workspaces;
create trigger workspaces_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();
