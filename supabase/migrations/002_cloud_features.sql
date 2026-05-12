-- =====================================================================
-- 002_cloud_features.sql
-- Cloud-native features: user preferences, generation history, Excel uploads
-- =====================================================================

-- ── user_preferences ─────────────────────────────────────────────────────
-- Stores user UI preferences (theme, sidebar state, etc.) with cloud sync
create table if not exists public.user_preferences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users(id) on delete cascade,
  theme           text default 'system' check (theme in ('light', 'dark', 'system')),
  last_active_tab text default 'projects' check (last_active_tab in ('projects', 'editor', 'bulk')),
  sidebar_collapsed boolean default false,
  notifications_enabled boolean default true,
  ui_state        jsonb default '{}', -- flexible JSON for future UI state
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

create index on public.user_preferences(user_id);

alter table public.user_preferences enable row level security;

-- read: users can read their own preferences
create policy "user_preferences: own row"
  on public.user_preferences for select
  using (auth.uid() = user_id);

-- insert: users can insert their own preferences
create policy "user_preferences: own insert"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

-- update: users can update their own preferences
create policy "user_preferences: own update"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- trigger: auto-update updated_at
drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ── excel_uploads ───────────────────────────────────────────────────────
-- Stores metadata about uploaded Excel files for reuse and history
create table if not exists public.excel_uploads (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete set null,
  filename        text not null,
  file_url        text,                -- path/URL to file in Supabase Storage
  column_headers  jsonb default '[]',  -- array of column names from first row
  row_count       integer default 0,   -- number of data rows
  file_size_kb    integer,             -- size for display purposes
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index on public.excel_uploads(workspace_id);
create index on public.excel_uploads(created_at desc);

alter table public.excel_uploads enable row level security;

-- read: workspace members can read
create policy "excel_uploads: members can read"
  on public.excel_uploads for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = excel_uploads.workspace_id
        and user_id = auth.uid()
    )
  );

-- insert: editors can insert
create policy "excel_uploads: editors can insert"
  on public.excel_uploads for insert
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = excel_uploads.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'editor')
    )
  );

-- delete: owner can delete
create policy "excel_uploads: owner can delete"
  on public.excel_uploads for delete
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = excel_uploads.workspace_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- trigger: auto-update updated_at
drop trigger if exists excel_uploads_updated_at on public.excel_uploads;
create trigger excel_uploads_updated_at
  before update on public.excel_uploads
  for each row execute function public.set_updated_at();

-- ── generation_jobs ──────────────────────────────────────────────────────
-- Tracks PDF generation jobs (history, status, progress)
create table if not exists public.generation_jobs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  template_id     uuid not null references public.workspace_templates(id) on delete cascade,
  excel_upload_id uuid references public.excel_uploads(id) on delete set null,
  user_id         uuid not null references auth.users(id) on delete set null,
  
  -- Job metadata
  status          text default 'pending' check (status in ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  total_count     integer not null default 1,
  completed_count integer default 0,
  failed_count    integer default 0,
  
  -- File naming and output
  filename_pattern text default 'document_{row_number}.pdf',
  output_zip_url  text,           -- signed URL to generated ZIP in Storage
  
  -- Error tracking
  error_message   text,
  
  -- Timestamps
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index on public.generation_jobs(workspace_id);
create index on public.generation_jobs(template_id);
create index on public.generation_jobs(user_id);
create index on public.generation_jobs(created_at desc);

alter table public.generation_jobs enable row level security;

-- read: workspace members can read
create policy "generation_jobs: members can read"
  on public.generation_jobs for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = generation_jobs.workspace_id
        and user_id = auth.uid()
    )
  );

-- insert: editors can create
create policy "generation_jobs: editors can create"
  on public.generation_jobs for insert
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = generation_jobs.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'editor')
    )
  );

-- update: creator can update their own jobs
create policy "generation_jobs: creator can update"
  on public.generation_jobs for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- delete: owner can delete
create policy "generation_jobs: owner can delete"
  on public.generation_jobs for delete
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = generation_jobs.workspace_id
        and user_id = auth.uid()
        and role = 'owner'
    )
  );

-- trigger: auto-update updated_at
drop trigger if exists generation_jobs_updated_at on public.generation_jobs;
create trigger generation_jobs_updated_at
  before update on public.generation_jobs
  for each row execute function public.set_updated_at();

-- ── generation_outputs ───────────────────────────────────────────────────
-- Detailed output tracking for individual generated PDFs (optional, for error reporting)
create table if not exists public.generation_outputs (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.generation_jobs(id) on delete cascade,
  output_name     text not null,      -- filename of generated PDF
  row_index       integer not null,   -- which Excel row was used (0-based)
  status          text default 'generated' check (status in ('generated', 'failed', 'skipped')),
  error_message   text,               -- if failed
  created_at      timestamptz default now()
);

create index on public.generation_outputs(job_id);
create index on public.generation_outputs(created_at desc);

alter table public.generation_outputs enable row level security;

-- read: workspace members via job_id can read
create policy "generation_outputs: members can read"
  on public.generation_outputs for select
  using (
    exists (
      select 1 from public.generation_jobs gj
      join public.workspace_members wm
        on gj.workspace_id = wm.workspace_id
      where gj.id = generation_outputs.job_id
        and wm.user_id = auth.uid()
    )
  );

-- insert: only via trigger or service function (restrict direct inserts)
create policy "generation_outputs: service only"
  on public.generation_outputs for insert
  with check (false);

-- ── Extend workspace_templates ───────────────────────────────────────────
-- Link templates to generation jobs for quick history lookup
-- Note: This uses a JSON array in the template to avoid adding a separate junction table
-- Alternative: create a separate workspace_template_jobs table if normalization needed

-- If you prefer a normalized approach, uncomment this:
/*
create table if not exists public.workspace_template_jobs (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.workspace_templates(id) on delete cascade,
  job_id          uuid not null references public.generation_jobs(id) on delete cascade,
  unique(template_id, job_id)
);

create index on public.workspace_template_jobs(template_id);
create index on public.workspace_template_jobs(job_id);
*/

-- =====================================================================
-- Function: sync user profile on auth.users change
-- This is an update to the existing function if it exists
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Create profile
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  
  -- Create default user preferences
  insert into public.user_preferences (user_id, theme, last_active_tab)
  values (new.id, 'system', 'projects')
  on conflict (user_id) do nothing;
  
  return new;
end;
$$ language plpgsql security definer;
