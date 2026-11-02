// Gera js/funnel-data.js, js/screens-data.js e js/offer-data.js a partir de:
//  - _src/funnel.json  (grafo do funil original: ids, ramificações, variáveis)
//  - _src/dom/*.html   (DOM renderizado do original em pt, capturado com Playwright)
// Uso: node _src/build.cjs
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "quiz-pt-br");
const j = require("./funnel.json");
const S = j.screens;

// ---------- imagens: URLs remotas -> assets locais ----------
function localImg(u) {
  let m = u.match(/^https?:\/\/wep2app\.fra1\.digitaloceanspaces\.com\/(?:flow|web2app)\/(.+)$/);
  if (m) return "assets/images/" + m[1].replace(/\//g, "_");
  m = u.match(/^https?:\/\/quiz\.musesacademy\.io\/(.+)$/);
  if (m) {
    const p = m[1];
    if (p === "Logo.svg") return "assets/offer/Logo.svg";
    if (p === "img/offer/payment.webp") return "assets/offer/payment.webp";
    if (p === "img/offer/popup/gift.webp") return "assets/offer/gift.webp";
    let b = p.match(/^img\/icons\/pay-brands\/(.+)$/);
    if (b) return "assets/offer/" + b[1];
    if (p === "img/marketingTest/scratch-promo/scratch-finish.webp") return "assets/misc/scratch-finish.webp";
    if (p === "funnel/info-pages-compliance/academic-research-seal.webp") return "assets/images/academic-research-seal.webp";
    if (p === "funnel-builder/custom/brain/circle-arrows.webp") return "assets/images/circle-arrows.webp";
    b = p.match(/^img\/marketingTest\/harvard\/(expert-\d\.webp)$/);
    if (b) return "assets/images/" + b[1];
  }
  return u;
}
function rewriteUrls(h) {
  return h
    .replace(/https?:\/\/(?:wep2app\.fra1\.digitaloceanspaces\.com|quiz\.musesacademy\.io)\/[^"'\s)<>&]+/g, (u) => localImg(u))
    .replace(/src="\/([^"]+)"/g, (m, p) => `src="${localImg("https://quiz.musesacademy.io/" + p)}"`)
    // páginas legais ficam no site original (em inglês); abrem em nova aba
    .replace(/href="\/(terms|privacy|subterms)"/g, 'href="https://therealintro.com/$1"');
}

// ---------- tradução: ajustes de português de Portugal -> pt-BR ----------
const FIX = [
  ["A criar o seu plano pessoal...", "Criando seu plano pessoal..."],
  ["Pretende receber mensagens de correio eletrónico com", "Deseja receber e-mails com"],
  ["amor vida dicas de crescimento", "dicas de crescimento para a vida amorosa"],
  ["e actualizações de produtos?", "e atualizações de produtos?"],
  ["Introduza o seu nome", "Digite seu nome"],
  ["O seu nível de preparação", "Seu nível de preparação"],
  ["Os utilizadores adoram os nossos planos", "Os usuários adoram nossos planos"],
  ["reembolsado a si.", "reembolsado a você."],
  ["O seu código promocional foi aplicado!", "Seu código promocional foi aplicado!"],
  ["Escolha o seu plano", "Escolha seu plano"],
  ["Ao continuar, concorda com", "Ao continuar, você concorda com"],
  ["fortalecer ainda mais a ligação.", "fortalecer ainda mais o vínculo."],
  [">Equipa<", ">Equipe<"],
  ["Resultados/p&gt;", "Resultados"],
  ["Sim, consigo me manter focado com facilidade", "Sim, consigo me manter focado com facilidade"],
  ["Para avançar, especificar", "Para continuar, responda"],
  ["no seu subscrição", "na sua assinatura"],
  ["Poupe ", "Poupe "],
  ["Suas conversas acabam desaparecendo?", "Suas conversas acabam morrendo?"],
];
// rótulos de acessibilidade (alt / aria-label) que no original estão em inglês
const ATTR_PT = {
  "select img": "imagem da opção", image: "imagem", Image: "Imagem", banner: "banner", "compare-image": "imagem de comparação",
  "image-banner": "banner", icon: "ícone", expert: "especialista", brain: "cérebro", arrows: "setas",
  "academic-research-seal": "selo de pesquisa acadêmica", "payment providers": "formas de pagamento", present: "presente",
  "Select a slide to show": "Selecione um slide para exibir", "Go to slide 1": "Ir para o slide 1", "Go to slide 2": "Ir para o slide 2",
  "Go to slide 3": "Ir para o slide 3", loader: "carregando"
};
function fixAttrs(h) {
  h = h.replace(/\b(alt|aria-label)="([^"]*)"/g, (m, a, v) => {
    if (ATTR_PT[v] !== undefined) return `${a}="${ATTR_PT[v]}"`;
    const n = v.match(/^(\d+) of (\d+)$/);
    if (n) return `${a}="${n[1]} de ${n[2]}"`;
    return m;
  });
  return h.replace(/aria-roledescription="carousel"/g, 'aria-roledescription="carrossel"');
}
function fixText(h) {
  h = fixAttrs(h);
  for (const [a, b] of FIX) h = h.split(a).join(b);
  h = h.replace(/>(\d+) críticas?</g, (m, n) => `>${n} ${+n === 1 ? "avaliação" : "avaliações"}<`);
  return h;
}

function toXhtml(h) {
  h = h.split("&nbsp;").join("&#160;");
  h = h.replace(/<svg(?![^>]*\bxmlns=)/g, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (/xlink:/.test(h)) h = h.replace(/<svg([^>]*)>/g, (m, a) => (/xmlns:xlink=/.test(a) || !/xlink:/.test(h) ? m : '<svg xmlns:xlink="http://www.w3.org/1999/xlink"' + a + ">"));
  return h.replace(/<(img|input|br|hr)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g, (m, t, a) => "<" + t + a.replace(/\s*\/$/, "") + "/>");
}
// marca: "M Academy" + logo -> "Alpha Academy" + logo enviado pelo cliente
function brand(h) {
  // nomes dos depoimentos (lista de clientes): Asab Mahmood -> Roberto, Michael -> João, Petar -> Pedro; iniciais do avatar acompanham
  h = h.split("Asab Mahmood").join("Roberto").split("Michael").join("João").split("Petar").join("Pedro");
  // localização dos depoimentos (lista de clientes): Roberto = SP, João = SC, Pedro = RN (antes: GB, EUA, EM)
  h = h.split(">GB<").join(">SP<").split(">EUA<").join(">SC<").split(">EM<").join(">RN<");
  h = h.split('class="initials">AM<').join('class="initials">R<').split('class="initials">M<').join('class="initials">J<');
  // assinatura da tela de popularidade: "<b>M Academy</b> Equipa" -> "<b>Equipe Alpha Academy</b>"
  h = h.replace(/(<b[^>]*>)(?:M|Alpha) Academy<\/b>\s*Equip[ae]/g, "$1Equipe Alpha Academy</b>");
  h = h.replace(/<svg[^>]*class="logo [^"]*"[^>]*>[\s\S]*?<\/svg>/g, '<img src="assets/offer/logo-alpha-crop.png" alt="Alpha Academy" class="logo object-cover size-6"/>');
  return h.replace(/\bM Academy\b/g, "Alpha Academy").replace(/\bMuses Academy\b/g, "Alpha Academy");
}
function baseClean(h) {
  h = h.replace(/<!---->/g, "").replace(/ data-v-app=""/, "");
  h = h.replace(/<script[\s\S]*?<\/script>/g, "");
  return toXhtml(brand(rewriteUrls(fixText(h))));
}

// ---------- telas ----------
const screensHtml = {};
const files = fs.readdirSync(path.join(__dirname, "dom")).filter((f) => /^s\d{3}-/.test(f));
for (const f of files) {
  const i = +f.slice(1, 4);
  let h = baseClean(fs.readFileSync(path.join(__dirname, "dom", f), "utf8"));
  // overlay transitório do loader global capturado junto com a tela (não faz parte da tela)
  h = h.replace(/<div[^>]*class="global-loader[^"]*"[^>]*>\s*<svg[\s\S]*?<\/svg>\s*<\/div>/g, "");
  // tira #app wrapper: guarda o conteúdo interno
  h = h.replace(/^<div id="app"[^>]*>/, "").replace(/<\/div>\s*$/, "");
  // telas 36 e 107: "fazer a {nome} sentir sua falta" (artigo + nome formatado; sem nome -> "ela")
  if ((i === 36 || i === 107) && S[i].type === "preofferScreen") h = h.replace(/\ba Ana\b/g, '<span data-var="crush_name_art">ela</span>');
  // nome dela na tela de pré-oferta
  if (S[i].type === "preofferScreen") h =h.replace(/\bAna\b/g, '<span data-var="crush_name">ela</span>');
  // datas do gráfico do plano
  if (S[i].type === "planScreen") {
    // telas 28 e 105: data-alvo com mês em minúscula ("dezembro de 2026", pt-BR)
    const lowerFmt = i === 28 || i === 105 ? ' data-date-fmt="lower"' : "";
    h = h.replace(/>Dezembro de 2026</, '><span data-date="target"' + lowerFmt + ">Dezembro de 2026</span><");
    // meses sob as barras: o atributo vai no próprio <text> do SVG; nas telas 27 e 104 ("Fazê-la Ficar Obcecada por Você")
    // o formato é "Out" (maiúscula, sem ponto) e o selo da barra 3 vira "Mestre da Conquista"
    const capFmt = i === 27 || i === 104 ? ' data-date-fmt="cap"' : "";
    ["out.", "nov.", "dez.", "jan."].forEach((m, k) => {
      h = h.replace(new RegExp("(<text[^>]*class=\"axis-text\"[^>]*)>" + m.replace(".", "\\.") + "</text>"), `$1 data-date="m${k}"${capFmt}>${m}</text>`);
    });
    if (i === 27 || i === 104) h = h.split("Amor Vida Mestre").join("Mestre da Conquista");
    // centraliza cada mês sob a sua barra (barras em x = 40, 117.333, 194.667, 272, largura 32; mesma linha de base)
    if (i === 27 || i === 104) {
      [["52", "170", "56"], ["131", "171", "133.333"], ["211", "171", "210.667"], ["292", "171", "288"]].forEach(([x, y, novo]) => {
        h = h.split('x="' + x + '" y="' + y + '" class="axis-text"').join('x="' + novo + '" y="171" class="axis-text"');
      });
    }
  }
  // rodapé legal das telas de e-mail (no original vem de event.fx2.io/api/landing/terms?filter=legal_copyright)
  if (S[i].type === "emailScreen") {
    h = h.replace(
      /<div([^>]*)class="min-h-\[32px\] mt-auto"([^>]*)><\/div>/,
      '<div$1class="min-h-[32px] mt-auto"$2><div class="m-0 flex flex-col text-center font-outfit text-xs font-normal -tracking-036 text-black/30">© 2026 AppStar Inc, Office 402, 1435 Vine Street, Cincinnati, Ohio, 45202, USA. All rights reserved.</div></div>'
    );
  }
  // personalização: opção "É complicado" (status de relacionamento, etapa 3) -> "Enrolado"
  if (i === 41) h = h.split("<p>É complicado</p>").join("<p>Enrolado</p>");
  // personalização: tela "Nós cuidamos de você!" (telas 5 e 57); texto novo na tela 5
  if (i === 5 || i === 57) h = h.split("Nós cuidamos de você!").join("Pode contar com a gente!");
  if (i === 5) h = h.split("Nosso plano mostra como mudar a dinâmica — para que ela comece a pensar mais em você.").join("Nosso plano mostra como mudar a dinâmica, para que ela comece a pensar mais em você.");
  // telas de mensagem: classe de padronização (texto equilibrado em css/app.css); 5 e 57 com título em uma linha
  if (S[i].type === "interstitial") h = h.replace(/<main /, '<main data-msg="1"' + (i === 5 || i === 57 ? ' data-oneline="1"' : "") + " ");
  // personalização: etapa 5, variante "Fazer ela me desejar" (tela 23)
  if (i === 23) {
    h = h
      .split("Nós podemos ajudar a tornar isso realidade!")
      .join("Nós podemos fazer isso acontecer!")
      .split("Muitos homens têm dificuldade em gerar atração, mas a abordagem certa faz ela se sentir atraída por você.")
      .join("A maioria dos homens não sabe despertar atração, mas com a estratégia certa, ela vai se sentir atraída por você.");
  }
  // personalização: pergunta "Quão sério você está…" (tela 94); só o texto exibido, os valores internos (perfect/moderate/low) não mudam
  if (i === 94) {
    h = h
      .split("<p>Quão sério você está em mudar a dinâmica entre vocês dois?</p>").join("<p>O quanto você está decidido a mudar a situação entre vocês?</p>")
      .split("<p>Muito sério</p>").join("<p>Totalmente decidido</p>")
      .split("<p>Só explorando</p>").join("<p>Só estou explorando</p>");
  }
  // personalização: opções do objetivo principal (etapa 4); as demais já têm o texto pedido
  if (i === 0 || i === 115) h = h.split("<p>Fazer ela ficar obcecada</p>").join("<p>Deixá-la obcecada por mim</p>");
  screensHtml[S[i].id] = h;
}

// ---------- grafo ----------
const slug = (v) => String(v).replace(/<[^>]+>/g, "");
const funnel = { start: S.find((s) => s.type === "landing").id, config: { progressBar: j.config.progressBar }, screens: {} };
S.forEach((s, i) => {
  const o = { i, type: s.type, next: s.nextScreenId || null, prev: s.previousScreenId || null };
  if (s.progressBar) o.progress = s.progressBar;
  if (s.screenName && s.screenName.name) o.name = s.screenName.name;
  if (s.variableId) o.variable = s.variableId;
  if (s.answers) {
    o.variable = s.answers.variableId || null;
    o.options = (s.answers.options || []).map((a) => ({ id: a.id, value: a.variableValue ?? slug(a.value), next: a.nextScreenId || null }));
  }
  if (s.type === "condition") {
    o.source = s.conditionSource || "variable";
    o.variable = s.variableId || null;
    o.variants = s.variants.map((v) => ({ value: v.conditionValue, next: v.nextScreenId }));
  }
  if (s.type === "loader") {
    o.duration = s.duration;
    o.questionsEnabled = !!s.questionsEnabled;
    o.showContinueButton = !!s.showContinueButton;
  }
  funnel.screens[s.id] = o;
});

// Sem captura de e-mail: saem as telas de e-mail (6 variantes) e a de assinatura de e-mails ("Deseja receber e-mails...?").
// Quem apontava para elas passa a apontar para a tela seguinte (a do nome).
const removed = (id) => funnel.screens[id] && (funnel.screens[id].type === "emailScreen" || funnel.screens[id].name === "subscribePage");
const skip = (id) => { while (id && removed(id)) id = funnel.screens[id].next; return id; };
for (const o of Object.values(funnel.screens)) {
  o.next = skip(o.next);
  (o.options || []).forEach((a) => (a.next = skip(a.next)));
  (o.variants || []).forEach((v) => (v.next = skip(v.next)));
}
for (const id of Object.keys(funnel.screens)) if (removed(id)) { delete funnel.screens[id]; delete screensHtml[id]; }

// ---------- oferta ----------
let offer = baseClean(fs.readFileSync(path.join(__dirname, "dom", "offer-app.html"), "utf8"));
offer = offer.replace(/^<div id="app"[^>]*>/, "").replace(/<\/div>\s*$/, "");
offer = offer.replace(/João_oct26/g, '<span data-var="promo_code">Nome_oct26</span>').replace(/João, desbloqueie/g, '<span data-var="name">Você</span>, desbloqueie');
offer = offer.split(">Ela entra em contato<").join(">Ela te procura<").split(">Confiança calma<").join(">Confiança tranquila<").split(">Fazer Ela Sentir Saudade de Você<").join(">Fazer Ela Sentir Sua Falta<");

// variantes da oferta por objetivo (goal) x status (relationship_status), capturadas do original com variáveis forçadas
const offerVariants = {};
for (const goal of ["make_her_obsessed", "make_her_choose_me", "make_her_want_me"]) {
  offerVariants[goal] = {};
  for (const st of ["single", "complicated", "in_relationship", "married"]) {
    let v = baseClean(fs.readFileSync(path.join(__dirname, "dom", "offer-v-" + goal + "-" + st + ".html"), "utf8"));
    v = v.replace(/^<div id="app"[^>]*>/, "").replace(/<\/div>\s*$/, "");
    v = v.replace(/João_oct26/g, '<span data-var="promo_code">Nome_oct26</span>').replace(/João, desbloqueie/g, '<span data-var="name">Você</span>, desbloqueie');
    if (st === "complicated") v = v.split(">Complicado<").join(">Enrolado<"); // alinhado à opção renomeada na etapa 3
    if (st === "in_relationship") v = v.split(">Em relacionamento<").join(">Complicado<"); // card "Status" da oferta mostra "Complicado" (valor salvo continua in_relationship)
    if (st === "married") v = v.split(">Casado<").join(">Complicado<"); // card "Status" da oferta mostra "Complicado" (valor salvo continua married)
    v = v.split(">Ela entra em contato<").join(">Ela te procura<").split(">Confiança calma<").join(">Confiança tranquila<").split(">Fazer Ela Sentir Saudade de Você<").join(">Fazer Ela Sentir Sua Falta<");
    offerVariants[goal][st] = v;
  }
}
// foto principal da oferta por faixa etária (a variante capturada usa a de 18-29)
const offerAgeImg = {
  "18-29": "assets/images/image_20260506_latam-18-29-offer-0181a9c3.png",
  "30-39": "assets/images/image_20260506_latam-30-39-offer-5d4d4bbd.png",
  "40-49": "assets/images/image_20260506_latam-40-49-offer-18689afb.png",
  "50+": "assets/images/image_20260506_latam-50-offer-089d2113.png"
};

// popups capturados do original (raspadinha concluída e "ainda está pensando?" da oferta)
const extra = {};
{
  const a = baseClean(fs.readFileSync(path.join(__dirname, "dom", "scratch-after.html"), "utf8"));
  const i = a.search(/<div[^>]*class="fixed inset-0/);
  extra.scratchPopup = a.slice(i).replace(/<\/div>\s*$/, "").replace(/User_oct26/g, '<span data-var="promo_code">Nome_oct26</span>');
  const o = baseClean(fs.readFileSync(path.join(__dirname, "dom", "offer-desktop.html"), "utf8"));
  const k = o.lastIndexOf('class="relative m-auto');
  const st = o.lastIndexOf("<div", o.lastIndexOf('class="fixed inset-0', k));
  const endTag = "</div></div></div></div>";
  const en = o.indexOf(endTag, k) + endTag.length;
  extra.extraTimePopup = o
    .slice(st, en)
    .replace("Ainda está a pensar?", "Ainda está pensando?")
    .replace("Aqui está <b>7 minutos extras</b>", "Aqui estão <b>7 minutos extras</b>")
    .replace("Use o meu tempo extra", "Usar meu tempo extra");
}

// Oferta com preço único (mesmo card do CalmKids): os dois seletores de 3 planos (headlessui-radiogroup-*)
// viram um card só, "Plano de 4 semanas — R$ 47,00". Visual em css/app.css (.plan-card).
const SINGLE_PLAN =
  '<div class="plan-options"><div class="plan-card plan-card--popular is-selected" id="product-single">' +
  '<span class="plan-card__ribbon"><span>★</span>Mais popular</span>' +
  '<span class="plan-card__info"><strong>Plano de 4 semanas</strong></span>' +
  '<span class="plan-card__price-full">R$ 47,00</span></div></div>';
function singlePlan(h) {
  const re = /<div[^>]*id="headlessui-radiogroup-\d+"[^>]*>/g;
  let m, out = "", last = 0;
  while ((m = re.exec(h))) {
    // fim do bloco: o </div> que fecha a div aberta em m.index
    let depth = 0, i = m.index;
    const tag = /<(\/?)div\b[^>]*>/g;
    tag.lastIndex = i;
    let t;
    while ((t = tag.exec(h))) { depth += t[1] ? -1 : 1; if (!depth) break; }
    out += h.slice(last, m.index) + SINGLE_PLAN;
    last = tag.lastIndex;
    re.lastIndex = last;
  }
  out += h.slice(last);
  // As variantes foram capturadas com o botão de compra ainda "carregando" (disabled + ícone girando):
  // volta ao estado normal, igual à oferta padrão (dourado, com pulso).
  out = out
    .replace(/(<button[^>]*id="qz-button-continue"[^>]*?)( !h-\[56px\] w-full)" disabled="">/g, '$1$2 btn_pulse">')
    .replace(/<svg aria-hidden="true" role="status"[^>]*animate-spin[^>]*>[\s\S]*?<\/svg>/g, "");
  // texto legal: sai a assinatura com renovação (e o e-mail de suporte do site original), entra o pagamento único
  return out.replace(
    /(<div[^>]*class="payment-text-block[^"]*"[^>]*>)[\s\S]*?(<\/div>)/g,
    "$1<span>Pagamento único de R$ 47,00, sem renovação automática. Garantia de reembolso de 30 dias.</span>$2"
  );
}
offer = singlePlan(offer);
for (const goal in offerVariants) for (const st in offerVariants[goal]) offerVariants[goal][st] = singlePlan(offerVariants[goal][st]);

// .png -> .webp quando existir a versão WebP (gerada por _src/optimize-images.py)
const preferWebp = (s) =>
  s.replace(/assets\/[\w./-]+\.png/g, (p) => (fs.existsSync(path.join(root, p.slice(0, -4) + ".webp")) ? p.slice(0, -4) + ".webp" : p));
// \r\n das capturas (checkout no Windows) vira \n: o build gera a mesma saída em qualquer sistema
const out = (name, varName, obj) =>
  fs.writeFileSync(
    path.join(root, "js", name),
    `/* Gerado por _src/build.cjs — não editar à mão */\nwindow.${varName} = ${preferWebp(JSON.stringify(obj).replace(/\\r\\n/g, "\\n"))};\n`
  );
out("funnel-data.js", "QUIZ_FUNNEL", funnel);
out("screens-data.js", "QUIZ_SCREENS", screensHtml);
out("offer-data.js", "QUIZ_OFFER", { html: offer, variants: offerVariants, ageImg: offerAgeImg, scratchPopup: extra.scratchPopup, extraTimePopup: extra.extraTimePopup });
console.log("telas:", Object.keys(screensHtml).length, "grafo:", Object.keys(funnel.screens).length, "oferta KB:", (offer.length / 1024).toFixed(1));
