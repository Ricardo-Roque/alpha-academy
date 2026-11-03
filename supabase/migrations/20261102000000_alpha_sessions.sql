-- Uma linha por visita ao quiz Alpha Academy. Escrita só pela Edge Function (service role).

create table public.alpha_sessions (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_step int not null default 0,
  last_step_id text,
  last_seq int not null default 0,
  answers jsonb not null default '{}'::jsonb,
  utm jsonb not null default '{}'::jsonb,
  fbclid text,
  referrer text,
  offer_viewed_at timestamptz,
  checkout_clicked_at timestamptz
) with (fillfactor = 70);

-- Só o necessário: colunas que mudam a cada resposta ficam sem índice
-- para o Postgres poder atualizar a linha no mesmo bloco (HOT update).
create index alpha_sessions_created_at_idx on public.alpha_sessions using brin (created_at);

-- RLS ligado e sem policies: anon e authenticated não leem nem escrevem.
alter table public.alpha_sessions enable row level security;

-- Aplica um lote de eventos de uma sessão. Idempotente e ordenado:
-- só eventos com seq maior que last_seq são aplicados, então reenvio
-- (retry, keepalive duplicado) não duplica nem volta o progresso.
create or replace function public.apply_alpha_session_events(
  p_id uuid,
  p_meta jsonb,
  p_events jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev jsonb;
  v_last_seq int;
  v_seq int;
  v_step int;
  v_step_id text;
  v_answers jsonb := '{}'::jsonb;
  v_offer_at timestamptz;
  v_checkout_at timestamptz;
  v_max_seq int;
begin
  insert into alpha_sessions (id, utm, fbclid, referrer)
  values (
    p_id,
    coalesce(p_meta->'utm', '{}'::jsonb),
    nullif(p_meta->'utm'->>'fbclid', ''),
    nullif(p_meta->>'referrer', '')
  )
  on conflict (id) do nothing;

  select last_seq into v_last_seq from alpha_sessions where id = p_id for update;
  v_max_seq := v_last_seq;

  for ev in select value from jsonb_array_elements(p_events) loop
    v_seq := (ev->>'seq')::int;
    continue when v_seq is null or v_seq <= v_last_seq;
    v_max_seq := greatest(v_max_seq, v_seq);

    case ev->>'type'
      when 'step' then
        if v_step is null or (ev->>'idx')::int >= v_step then
          v_step := (ev->>'idx')::int;
          v_step_id := ev->>'id';
        end if;
      when 'answer' then
        v_answers := v_answers || jsonb_build_object(ev->>'key', ev->'value');
      when 'offer' then
        v_offer_at := coalesce(v_offer_at, now());
      when 'checkout' then
        v_checkout_at := now();
      else null;
    end case;
  end loop;

  update alpha_sessions set
    last_step = case when v_step is not null and v_step >= last_step then v_step else last_step end,
    last_step_id = case when v_step is not null and v_step >= last_step then v_step_id else last_step_id end,
    answers = answers || v_answers,
    offer_viewed_at = coalesce(offer_viewed_at, v_offer_at),
    checkout_clicked_at = coalesce(v_checkout_at, checkout_clicked_at),
    last_seq = v_max_seq,
    updated_at = now()
  where id = p_id;
end;
$$;

revoke all on function public.apply_alpha_session_events(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_alpha_session_events(uuid, jsonb, jsonb) to service_role;

-- Funil por passo: sessões que pararam em cada passo e quantas chegaram até ele.
-- last_step é a posição da tela no funil (QUIZ_FUNNEL.screens[id].i; oferta = 200).
create or replace view public.alpha_funnel_by_step as
select
  last_step,
  last_step_id,
  count(*) as stopped_here,
  sum(count(*)) over (order by last_step desc) as reached
from public.alpha_sessions
group by 1, 2
order by 1;
alter view public.alpha_funnel_by_step set (security_invoker = true);
