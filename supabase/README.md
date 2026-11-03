# Registro das respostas do quiz (Supabase)

Uma linha por visita em `public.alpha_sessions`, atualizada a cada resposta. Os nomes são próprios deste funil (`alpha_sessions`, `apply_alpha_session_events`, `alpha_funnel_by_step`, função `track-alpha`), então ficam no mesmo projeto Supabase do CalmKids, GoodKids e dos outros sem conflito.

## Como funciona
- `quiz-pt-br/js/track.js` guarda cada evento numa fila em `localStorage` e envia em lotes, em segundo plano, para a Edge Function `track-alpha`. Só tira da fila depois de resposta 2xx; falha de rede tenta de novo com espera crescente e ao sair da página (`keepalive`).
- `quiz-pt-br/js/script.js` chama `track(...)` ao responder, ao abrir cada tela, ao abrir a oferta e ao clicar no checkout.
- `supabase/functions/track-alpha` valida o payload campo a campo e chama `apply_alpha_session_events`.
- `apply_alpha_session_events` aplica só eventos com `seq` maior que `last_seq`: reenvio não duplica e lote atrasado não volta o progresso.
- Tabela com RLS ligado e sem policies: só a Edge Function (service role) escreve e lê.
- Em `localhost`, `127.0.0.1` e `file://` nada é enviado (testes locais não sujam o banco).

## Status
Ativo no projeto **Grupo RME** (`bionetfauvpcwlhqvvum`): tabela, função, view e Edge Function `track-alpha` (sem verificação de JWT, como as dos outros funis).

## Eventos
- `landing`: UTMs (`utm_*`, `fbclid`, `gclid`, `src`, `sck`, `xcod`) e referrer, na primeira tela da aba.
- `step`: tela aberta. `last_step` = posição da tela no funil (`QUIZ_FUNNEL.screens[id].i`; oferta = 200), `last_step_id` = nome da tela (`quizChooseAge`, `offer`...).
- `answer`: resposta. Chave = variável do funil (`goal`, `age`, `name`, `crush_name`, `relationship_status`...) ou, nas perguntas sem variável, o nome da tela (`quizDoYourConversationsFadeOut`). Valor = o `value` da opção (em inglês, estável), lista na múltipla escolha, texto nos campos de nome. Também `loader_answer_1..n` (sim/não do carregamento) e `confidence_score` / `confidence_level`.
- `offer`: oferta aberta (`offer_viewed_at`).
- `checkout`: clique em "Obter meu plano" (`checkout_clicked_at`).

## Consultas
```sql
select * from alpha_sessions order by created_at desc limit 50;
select * from alpha_funnel_by_step;
select answers->>'goal' goal, count(*), count(checkout_clicked_at) checkout
from alpha_sessions group by 1 order by 2 desc;
```

## Publicar de novo / outro projeto
1. `supabase link --project-ref <ref>` e `supabase db push` (aplica `migrations/`).
2. Opcional: `supabase secrets set ALPHA_ALLOWED_ORIGINS=https://seu-dominio.com` (vazio = qualquer origem).
3. `supabase functions deploy track-alpha --no-verify-jwt`
4. Em `quiz-pt-br/js/track.js`, `TRACK_URL` = `https://<ref>.supabase.co/functions/v1/track-alpha`. Vazio = registro desligado.

## Não guarda
IP, user-agent, país e e-mail. Guarda o nome digitado e o nome da parceira (`name`, `crush_name` em `answers`).
