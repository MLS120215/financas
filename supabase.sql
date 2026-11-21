-- Finanças: tabela de sincronização.
-- Cole tudo no Supabase em SQL Editor > New query e clique em Run.

create table if not exists public.fin_docs (
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  key        text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Cada pessoa só enxerga e altera os próprios dados
alter table public.fin_docs enable row level security;

drop policy if exists "dono le"     on public.fin_docs;
drop policy if exists "dono insere" on public.fin_docs;
drop policy if exists "dono altera" on public.fin_docs;
drop policy if exists "dono apaga"  on public.fin_docs;

create policy "dono le"     on public.fin_docs for select using (auth.uid() = user_id);
create policy "dono insere" on public.fin_docs for insert with check (auth.uid() = user_id);
create policy "dono altera" on public.fin_docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dono apaga"  on public.fin_docs for delete using (auth.uid() = user_id);
