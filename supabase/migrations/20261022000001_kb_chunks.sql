-- 챗봇 안내 자료(RAG): Upstage 임베딩(4096차원)으로 검색해요. 서비스 롤(Edge Function chat) 전용이에요.
create extension if not exists vector with schema extensions;

create table public.kb_chunks (
  id bigint generated always as identity primary key,
  -- builtin: chat 함수의 KNOWLEDGE에서 자동으로 맞춰요 / manual: 대시보드에서 직접 넣은 안내
  source text not null default 'manual' check (source in ('builtin', 'manual')),
  title text not null check (char_length(title) between 1 and 100),
  content text not null check (char_length(content) between 1 and 4000),
  checksum text,
  embedding extensions.vector(4096),
  updated_at timestamptz not null default now()
);
create unique index kb_chunks_builtin_checksum on public.kb_chunks (checksum) where source = 'builtin';

alter table public.kb_chunks enable row level security;
revoke all on public.kb_chunks from anon, authenticated;

-- 제목·내용을 고치면 임베딩을 비워서 다음 챗봇 요청 때 다시 만들게 해요.
create or replace function public.kb_chunks_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.content is distinct from old.content then
    new.embedding := null;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger kb_chunks_touch before update on public.kb_chunks
  for each row execute function public.kb_chunks_touch();

-- 질문 임베딩과 가까운(코사인) 안내 조각을 찾아요. 조각 수가 적어서 인덱스 없이 전체를 훑어요.
create or replace function public.match_kb(p_embedding extensions.vector(4096), p_count integer default 6)
returns table (id bigint, title text, content text, similarity double precision)
language sql stable
set search_path = ''
as $$
  select k.id, k.title, k.content, 1 - (k.embedding operator(extensions.<=>) p_embedding)
  from public.kb_chunks k
  where k.embedding is not null
  order by k.embedding operator(extensions.<=>) p_embedding
  limit least(greatest(p_count, 1), 10)
$$;
revoke execute on function public.match_kb(extensions.vector, integer) from public, anon, authenticated;
revoke execute on function public.kb_chunks_touch() from public, anon, authenticated;
