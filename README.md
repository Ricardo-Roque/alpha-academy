# Quiz Conquista (Alpha Academy, pt-BR)

Funil de quiz em HTML, CSS e JavaScript puro, até a página de oferta.

- `quiz-pt-br/`: o quiz. Roda sozinho, sem dependências e sem `_src/`. Instruções, estrutura e pendências em [quiz-pt-br/README.md](quiz-pt-br/README.md).
- `supabase/`: registro das respostas do quiz (tabela `alpha_sessions`, Edge Function `track-alpha`). Ver [supabase/README.md](supabase/README.md).
- `_src/`: capturas do quiz de referência, grafo do funil e scripts que geram `quiz-pt-br/js/*-data.js` (`node _src/build.cjs`).

## Deploy

Vercel, conectada a este repositório. O `vercel.json` da raiz publica só a pasta `quiz-pt-br/` (sem build) e define o cache.

## Rodar

```
git clone https://github.com/Ricardo-Roque/alpha-academy.git
cd alpha-academy/quiz-pt-br
node serve.cjs 8080
```

Abra http://127.0.0.1:8080/ (precisa de Node.js).
