# Quiz M Academy — versão pt-BR (HTML + CSS + JavaScript puro)

Reprodução do quiz `https://therealintro.com/` (funil "MissYou_men") em português brasileiro, até a página da oferta (antes do checkout).
Sem React/Vue/Tailwind/jQuery/Bootstrap e sem dependências: HTML5, CSS3 e JavaScript puro.

## Como executar

**Opção 1 — abrir direto:** dê dois cliques em `index.html` (funciona via `file://`; testado).

**Opção 2 — servidor local (recomendado):**

```
node serve.cjs 8080
```

e abra `http://127.0.0.1:8080/`. (Alternativa: `python -m http.server 8080` dentro desta pasta.)

Parâmetros de teste opcionais (o original usa IP/servidor para isso):

| URL | Efeito |
|---|---|
| `?geo=US` | força o ramo EUA/PR/VI/GU/MP/AS (telas que o Brasil não vê) |
| `?mt=quiz_money_question` / `?mt=new_goal_missu_men` | força as variantes de teste de marketing |
| `#/offer` | abre direto a página da oferta (depois de passar pelo quiz, para ter o nome) |
| `#/<id-da-tela>` | abre uma tela específica (ids em `js/funnel-data.js`) |

### Independência do `_src/`

A pasta `quiz-pt-br/` **roda sozinha**: não precisa de nada de `_src/` nem de `npm install`. Só precisa de Node.js (para o `serve.cjs`) ou de qualquer servidor estático.
Verificado numa cópia isolada, sem `_src/`: todas as telas e as 9 variantes da oferta resolvem os caminhos de `assets/`, sem erro no console e sem requisição fora do próprio servidor.
A pasta `_src/` só é necessária para **regenerar** `js/funnel-data.js`, `js/screens-data.js` e `js/offer-data.js` (`node _src/build.cjs`, a partir da raiz do repositório).

## Estrutura

```
index.html            página única (#app) — lang="pt-BR"
css/style.css         CSS do original (compilado), sem as regras que o quiz não usa (_src/purge-css.cjs)
css/fonts.css         @font-face das fontes locais (Poppins, Outfit)
css/app.css           loader global + ajustes mínimos
js/funnel-data.js     grafo do funil: telas, próximas telas, condições, variáveis   (gerado)
js/screens-data.js    markup de cada tela, em pt-BR                                (gerado)
js/offer-data.js      página da oferta + popups, em pt-BR; carregado sob demanda   (gerado)
js/script.js          motor: rotas por hash, condições, validação, loader, raspadinha, oferta
js/track.js           registro das respostas no Supabase (fila em segundo plano; desligado em localhost)
assets/images/        imagens das telas e da oferta (fotos em WebP, ícones pequenos em PNG)
assets/offer/ misc/   logo, selos de pagamento, imagens da raspadinha
assets/fonts/         fontes .woff2 (subsets latin e latin-ext)
QUIZ_AUDIT.md         inventário das 116 telas, ramificações, checklist de testes, diferenças
QUIZ_TRANSLATIONS.md  tabela de traduções (EN → pt-BR) e exceções
serve.cjs             servidor estático mínimo (opcional)
```

Os arquivos `js/*-data.js` são gerados por `../_src/build.cjs` a partir de `../_src/funnel.json` e do DOM capturado em `../_src/dom/`
(`node ../_src/build.cjs`; documentação em `QUIZ_AUDIT.md`). Edite textos no build/capturas e regenere; não edite os `*-data.js` à mão.

## Performance

Mesmo padrão do CalmKids/CalmBaby:

- Nenhuma fonte ou CSS de terceiros: fontes locais com `font-display: swap`; Poppins 400/600 com preload.
- `js/*.js` com `defer`. A oferta (`js/offer-data.js`, ~1,2 MB) fica fora do carregamento inicial: baixa em segundo plano 4 s depois da primeira tela, ou na hora da raspadinha/`#/offer` se ainda não tiver chegado.
- Fotos em WebP (qualidade 80, largura máxima de 686 px); as 4 fotos da primeira tela têm preload.
- Ao abrir cada tela, as imagens das próximas telas possíveis são baixadas em segundo plano.
- Pixel do Meta (`2261664578012228`) e UTMify no topo do `<head>`, antes de qualquer CSS, com `preconnect` para os dois domínios.

Deploy: Vercel, pelo `vercel.json` da raiz do repositório (publica só esta pasta, `outputDirectory: quiz-pt-br`, e define o cache por tipo de arquivo). No painel da Vercel o Root Directory fica vazio (raiz).

Depois de trocar imagens ou capturas, rode (na raiz do repositório): `python _src/optimize-images.py` (PNG pesado → WebP), `node _src/build.cjs` (passa a usar o `.webp` onde existir) e `node _src/purge-css.cjs` (se novas telas usarem classes CSS novas, rode o purge a partir do `css/style.css` original do git).

## Limites conhecidos

Resumo; detalhes em `QUIZ_AUDIT.md`:

- Sem captura de e-mail: o build remove as 6 telas de e-mail e a de assinatura de e-mails; depois do carregamento o funil vai direto para a tela do nome (o `QUIZ_AUDIT.md` ainda lista essas telas, do original).

- Respostas, telas vistas, oferta e clique no checkout vão para o Supabase (`alpha_sessions`), pelo `js/track.js`; detalhes em [../supabase/README.md](../supabase/README.md).
- Telemetria do original (`event.fx2.io`), geolocalização por IP, verificação de e-mail já cadastrado: não reproduzidos.
- Páginas legais (`/terms`, `/privacy`, `/subterms`) abrem no site original, que só as publica em inglês.
- Animação Lottie da raspadinha e animações do gráfico de plano: quadro estático / CSS.

## Pendências

- [ ] Deixar a oferta do caminho "Casado" igual à referência (hoje o card Status mostra "Complicado" e a copy foi ajustada à mão; revisar textos como "Reinicie a dinâmica" e "Ela te deseja de novo", que não fazem sentido para quem é casado).
- [x] Preço único de R$ 47,00 ("Plano de 4 semanas", card igual ao do CalmKids), pagamento único sem renovação; gerado pelo `_src/build.cjs` em todas as variantes da oferta.
- [ ] Aplicar a formatação do nome (primeira letra maiúscula) em todas as telas que exibem o nome. Hoje só a tela de pré-oferta formata; a oferta e o código promocional mostram o nome como foi digitado.
- [x] Checkout: os botões "Obter meu plano" levam à Payt (`CHECKOUT_URL` em `js/script.js`), repassando UTMs, `fbclid`, `gclid`, `src`, `sck` e `xcod` da URL de entrada.
- [ ] Revisar os depoimentos/avaliações antes de publicar (nomes, datas fixas como "20 de Junho de 2026" e textos vêm da captura).
