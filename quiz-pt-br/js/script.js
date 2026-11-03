/* Quiz Alpha Academy — versão pt-BR em JavaScript puro.
 * Dados: QUIZ_FUNNEL (grafo/variáveis), QUIZ_SCREENS (HTML por tela), QUIZ_OFFER (página da oferta).
 * Rotas por hash: #/ (landing), #/<id-da-tela>, #/offer. Estado em sessionStorage.
 */
(function () {
  "use strict";

  var FUNNEL = window.QUIZ_FUNNEL;
  var SCREENS = window.QUIZ_SCREENS;
  var OFFER = window.QUIZ_OFFER;
  var app = document.getElementById("app");
  var loaderEl = document.getElementById("global-loader");

  // ---------------------------------------------------------------- estado
  var STORE_KEY = "quiz-mac-state-v1";
  var state = { vars: {}, geo: null, marketingTest: "default" };
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    if (saved && saved.vars) state = saved;
  } catch (e) {}
  // Parâmetros de teste: ?geo=US força as ramificações por país (no original o país vem do IP, via servidor);
  // ?mt=quiz_money_question|new_goal_missu_men força as variantes de teste de marketing. Sem parâmetros: Brasil / "default".
  try {
    var qp = new URLSearchParams(location.search);
    if (qp.get("geo")) state.geo = qp.get("geo").toUpperCase();
    if (qp.get("mt")) state.marketingTest = qp.get("mt");
  } catch (e) {}
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function setVar(name, value) {
    if (!name) return;
    state.vars[name] = value;
    save();
  }

  // Envio das respostas ao Supabase (js/track.js). Sem o script (bloqueio, rede), o quiz segue sem registrar.
  function track(type, data, opts) {
    try { if (window.aaTrack) window.aaTrack(type, data, opts); } catch (e) {}
  }
  // Chave: a variável do funil (goal, age, name...) ou, nas perguntas sem variável, o nome da tela.
  function trackAnswer(s, value) { track("answer", { key: s.variable || s.name, value: value }); }
  var lastTracked = null;
  function trackStep(idx, id) {
    if (lastTracked === id) return; // mesma tela renderizada de novo (ex.: hashchange repetido)
    lastTracked = id;
    track("step", { idx: idx, id: id });
  }

  // timers/handlers da tela atual (limpos a cada troca de tela)
  var cleanups = [];
  function onCleanup(fn) { cleanups.push(fn); }
  function runCleanups() { while (cleanups.length) { try { cleanups.pop()(); } catch (e) {} } }

  // ---------------------------------------------------------------- utilitários
  function qs(sel, root) { return (root || app).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || app).querySelectorAll(sel)); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // O DOM original aninha elementos de bloco dentro de <p>, o que o parser HTML "conserta"; por isso o markup é XHTML
  // (gerado em build) e é lido com o parser XML, que preserva a árvore exata.
  function nodesFrom(str) {
    var doc = new DOMParser().parseFromString('<root xmlns="http://www.w3.org/1999/xhtml">' + str + "</root>", "application/xhtml+xml");
    if (doc.getElementsByTagName("parsererror").length) { console.error("Markup inválido", doc.getElementsByTagName("parsererror")[0].textContent); return []; }
    return Array.prototype.slice.call(document.importNode(doc.documentElement, true).childNodes);
  }
  function html(str) { return nodesFrom(str.trim())[0]; }
  function mount(el, str) { el.textContent = ""; nodesFrom(str).forEach(function (n) { el.appendChild(n); }); }
  function hideLoader() { if (loaderEl) loaderEl.hidden = true; }
  function showLoader() { if (loaderEl) loaderEl.hidden = false; }

  // ---------------------------------------------------------------- carregamento sob demanda
  // A oferta (~1,2 MB) não entra no carregamento inicial: baixa em segundo plano durante o quiz
  // e, se ainda não chegou, na hora em que for usada (raspadinha ou #/offer).
  var offerWaiters = [], offerLoading = false;
  function loadOffer(cb) {
    if (OFFER) { if (cb) cb(); return; }
    if (cb) offerWaiters.push(cb);
    if (offerLoading) return;
    offerLoading = true;
    var sc = document.createElement("script");
    sc.src = "js/offer-data.js";
    sc.onload = function () {
      OFFER = window.QUIZ_OFFER;
      offerWaiters.splice(0).forEach(function (fn) { fn(); });
    };
    sc.onerror = function () { offerLoading = false; sc.remove(); }; // tenta de novo no próximo pedido
    document.head.appendChild(sc);
  }
  function whenIdle(fn, delay) {
    setTimeout(function () {
      if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 3000 });
      else fn();
    }, delay || 0);
  }

  // Imagens das próximas telas possíveis baixam enquanto o usuário lê a atual: a troca de tela fica instantânea.
  var prefetched = {};
  function prefetchImages(markup) {
    var re = /src="(assets\/[^"]+)"/g, m;
    while ((m = re.exec(markup))) {
      if (prefetched[m[1]]) continue;
      prefetched[m[1]] = true;
      new Image().src = m[1];
    }
  }
  function prefetchNext(s) {
    var ids = [s.next];
    (s.options || []).forEach(function (o) { ids.push(o.next); });
    whenIdle(function () {
      ids.forEach(function (id) {
        var guard = 0;
        while (id && FUNNEL.screens[id] && FUNNEL.screens[id].type === "condition" && guard++ < 20) id = resolveCondition(FUNNEL.screens[id]);
        if (id && SCREENS[id]) prefetchImages(SCREENS[id]);
      });
    });
  }

  // ---------------------------------------------------------------- navegação
  function currentRoute() {
    var h = location.hash.replace(/^#\/?/, "");
    return h || "";
  }
  function goTo(id, opts) {
    var target = id === "offer" ? "#/offer" : "#/" + id;
    if (opts && opts.replace) location.replace(target);
    else location.hash = target;
  }
  function resolveCondition(s) {
    var v = s.variants || [];
    var fallback = null;
    var i, key;
    for (i = 0; i < v.length; i++) if (v[i].value === "fallback") fallback = v[i];
    if (s.source === "geo") {
      // Sem geolocalização no cliente: usa o ramo "fallback" (fora dos EUA/PR/VI/GU/MP/AS), como o original para o Brasil.
      key = state.geo;
      for (i = 0; i < v.length; i++) if (key && v[i].value === key) return v[i].next;
      return fallback ? fallback.next : null;
    }
    if (s.source === "marketingTest") {
      key = state.marketingTest;
      for (i = 0; i < v.length; i++) if (v[i].value === key) return v[i].next;
      for (i = 0; i < v.length; i++) if (v[i].value === "default") return v[i].next;
      return fallback ? fallback.next : null;
    }
    key = state.vars[s.variable];
    for (i = 0; i < v.length; i++) if (v[i].value === key) return v[i].next;
    // variável não definida (ex.: sessão nova, tela aberta direto): sem ramo "fallback" usa o 1º ramo, para o funil não parar
    return fallback ? fallback.next : (v.length ? v[0].next : null);
  }
  // Avança para o próximo id, atravessando telas de condição
  function navigate(nextId) {
    var guard = 0;
    while (nextId && FUNNEL.screens[nextId] && FUNNEL.screens[nextId].type === "condition" && guard++ < 20) {
      nextId = resolveCondition(FUNNEL.screens[nextId]);
    }
    if (!nextId) return;
    goTo(nextId);
  }
  function back() {
    if (window.history.length > 1) window.history.back();
  }

  // ---------------------------------------------------------------- variáveis dinâmicas
  // data atual (para teste, aceita ?now=AAAA-MM-DD na URL ou window.QUIZ_NOW)
  function currentDate() {
    var o = window.QUIZ_NOW;
    if (!o) { try { o = new URLSearchParams(location.search).get("now"); } catch (e) {} }
    if (o) { var p = String(o).split("-"); if (p.length >= 3) return new Date(+p[0], +p[1] - 1, +p[2]); }
    return new Date();
  }
  var MONTH_ABBR_CAP = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  // mês relativo ao atual (virada de ano tratada pelo Date, sempre no dia 1 para não estourar meses curtos)
  function monthAt(offset) {
    var now = currentDate();
    var d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { abbrCap: MONTH_ABBR_CAP[d.getMonth()], abbrDot: MONTHS_SHORT[d.getMonth()], long: cap(MONTHS_LONG[d.getMonth()]), year: d.getFullYear(), date: d };
  }
  var MONTHS_SHORT = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
  var MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  // nome para exibição: sem espaços extras, cada palavra com a inicial maiúscula (o valor salvo não muda)
  function displayName(n) {
    return String(n || "").trim().split(/\s+/).filter(Boolean).map(function (w) {
      return w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1).toLocaleLowerCase("pt-BR");
    }).join(" ");
  }
  function fillVars(root) {
    qsa("[data-var]", root).forEach(function (el) {
      var k = el.getAttribute("data-var");
      var name = state.vars.name || "";
      var val = {
        crush_name: state.vars.crush_name || "ela",
        crush_name_art: displayName(state.vars.crush_name) ? "a " + displayName(state.vars.crush_name) : "ela",
        name: name || "Você",
        promo_code: (name || "User") + "_" + ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][new Date().getMonth()] + String(new Date().getFullYear()).slice(2)
      }[k];
      if (val != null) el.textContent = val;
    });
    // datas do gráfico do plano: barras (mês atual + 0..3) e texto "até <mês + 2>" saem da MESMA função (monthAt)
    qsa("[data-date]", root).forEach(function (el) {
      var k = el.getAttribute("data-date");
      if (k === "target") {
        var t = monthAt(2);
        el.textContent = el.getAttribute("data-date-fmt") === "lower" ? t.date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : t.long + " de " + t.year;
      } else {
        var m = monthAt(+k.slice(1));
        el.textContent = el.getAttribute("data-date-fmt") === "cap" ? m.abbrCap : m.abbrDot;
      }
    });
  }

  // ---------------------------------------------------------------- render
  function render() {
    runCleanups();
    var route = currentRoute();
    if (route === "offer") return renderOffer();
    var id = route || FUNNEL.start;
    var s = FUNNEL.screens[id];
    if (!s) { return goTo(FUNNEL.start, { replace: true }); }
    if (s.type === "condition") { return navigate(id); }
    var markup = SCREENS[id];
    if (!markup) { return goTo(FUNNEL.start, { replace: true }); }
    document.documentElement.classList.remove("offer-page");
    document.body.style.overflow = "";
    trackStep(s.i || 0, s.name || id);
    mount(app, markup);
    window.scrollTo(0, 0);
    hideLoader();
    fillVars();
    bindCommon(s);
    var binder = {
      singleChoice: bindChoice, landing: bindChoice, multiChoice: bindMulti, textInput: bindText,
      loader: bindLoader, custom: bindCustom, summaryStatementScreen: bindSummary
    }[s.type];
    if (binder) binder(s, id);
    else bindContinue(s);
    prefetchNext(s);
  }

  function bindCommon() {
    var backBtn = qs(".--custom-rtl a");
    if (backBtn) backBtn.addEventListener("click", function (e) { e.preventDefault(); back(); });
  }

  // botão "Continuar" simples (interstitial, plan, summary, preoffer, proven, brain, popularity)
  function bindContinue(s) {
    var btn = qs("#qz-button-continue");
    // pré-oferta sem próxima tela (ramo EUA) segue direto para a oferta, como no original (path: "/offer")
    var target = s.next || (s.type === "preofferScreen" ? "offer" : null);
    if (btn) btn.addEventListener("click", function () { navigate(target); });
  }

  // ---------------------------------------------------------------- escolha única / landing
  function tiles() {
    return qsa('[id^="qz-button-"]').filter(function (el) { return el.id !== "qz-button-continue" && el.classList.contains("tile"); });
  }
  function bindChoice(s) {
    var list = tiles();
    list.forEach(function (tile, i) {
      tile.addEventListener("click", function () {
        var opt = s.options && s.options[i];
        if (!opt) return;
        list.forEach(function (t) { t.classList.remove("selected"); });
        tile.classList.add("selected");
        setVar(s.variable, opt.value);
        trackAnswer(s, opt.value);
        setTimeout(function () { navigate(opt.next || s.next); }, 150);
      });
    });
    bindContinue(s);
  }

  // ---------------------------------------------------------------- múltipla escolha
  function bindMulti(s) {
    var list = tiles();
    var btn = qs("#qz-button-continue");
    function isOther(t) { return t.id === "qz-button-other"; }
    function otherInput(t) { return qs("input", t); }
    function sync() {
      var sel = list.filter(function (t) { return t.classList.contains("selected"); });
      if (btn) btn.disabled = sel.length === 0;
      var vals = [];
      sel.forEach(function (t) {
        if (isOther(t)) { var v = otherInput(t).value.trim(); if (v) vals.push(v); }
        else if (s.options[list.indexOf(t)]) vals.push(s.options[list.indexOf(t)].value);
      });
      setVar(s.variable, vals);
      return vals;
    }
    list.forEach(function (tile) {
      if (isOther(tile)) {
        // alternativa livre ("Outra coisa"): digitar seleciona; clicar fora do campo alterna (se houver texto)
        var input = otherInput(tile);
        input.addEventListener("input", function () { tile.classList.toggle("selected", input.value.trim().length > 0); sync(); });
        tile.addEventListener("click", function (e) {
          if (e.target === input) return;
          if (input.value.trim().length) { tile.classList.toggle("selected"); sync(); if (tile.classList.contains("selected")) input.focus(); }
          else input.focus();
        });
        return;
      }
      tile.addEventListener("click", function () { tile.classList.toggle("selected"); sync(); });
    });
    if (btn) {
      btn.addEventListener("click", function () { if (!btn.disabled) { trackAnswer(s, sync()); navigate(s.next); } });
    }
    sync();
  }

  // ---------------------------------------------------------------- campo de texto (nome / nome dela)
  function bindText(s) {
    var input = qs("input");
    var btn = qs("#qz-button-continue");
    if (!input || !btn) return;
    input.value = state.vars[s.variable] || "";
    function sync() { btn.disabled = input.value.trim().length === 0; }
    function submit() {
      if (btn.disabled) return;
      setVar(s.variable, input.value.trim());
      trackAnswer(s, input.value.trim());
      navigate(s.next);
    }
    input.addEventListener("input", sync);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    btn.addEventListener("click", submit);
    sync();
    input.focus();
  }

  // ---------------------------------------------------------------- telas "custom": raspadinha
  function bindCustom(s) {
    if (s.name === "scratchPage") return bindScratch(s);
    bindContinue(s);
  }
  // ---- raspadinha ---------------------------------------------------------------------------------------
  // Animação de dica (mão + rastro): mesma animação do Lottie original (/lottie/scratch-pre-offer.json, 60 fps, laço de 119 quadros).
  // A mão segue 7 posições com a curva cubic-bezier(.5,.35,.15,1); o rastro é um "trim path" linear de 0 a 100% em 120,27 quadros.
  var HAND_KEYS = [[0.222, 4, 136.278], [21.222, 64, 56.28], [57.006, 62, 150.28], [78.396, 133, 89.28], [99.078, 86.0193, 179.2469], [99.936, 94, 156.28], [119.934, 166, 109.28]];
  var HAND_ROT = -53.8909 * Math.PI / 180;
  function bezierEase(x1, y1, x2, y2, t) {
    var lo = 0, hi = 1, u = t;
    for (var i = 0; i < 24; i++) {
      u = (lo + hi) / 2;
      var x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
      if (x < t) lo = u; else hi = u;
    }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  }
  function handAt(frame) {
    var k = HAND_KEYS, i;
    if (frame <= k[0][0]) return [k[0][1], k[0][2]];
    for (i = 0; i < k.length - 1; i++) {
      if (frame < k[i + 1][0]) {
        var t = (frame - k[i][0]) / (k[i + 1][0] - k[i][0]), e = bezierEase(0.5, 0.35, 0.15, 1, t);
        return [k[i][1] + (k[i + 1][1] - k[i][1]) * e, k[i][2] + (k[i + 1][2] - k[i][2]) * e];
      }
    }
    return [k[k.length - 1][1], k[k.length - 1][2]];
  }
  function startScratchHint(wrap) {
    var svg = wrap && qs("svg", wrap);
    if (!svg) return function () {};
    var groups = svg.querySelectorAll(":scope > g > g > g");
    var trail = groups[0], hand = groups[1];
    var stroke = trail && trail.querySelector("path[stroke]");
    var len = stroke ? stroke.getTotalLength() : 0;
    if (stroke) stroke.setAttribute("stroke-dasharray", len + " " + len);
    var t0 = null, raf = 0, alive = true;
    var cos = Math.cos(HAND_ROT), sin = Math.sin(HAND_ROT);
    function tick(now) {
      if (!alive) return;
      if (t0 === null) t0 = now;
      var frame = ((now - t0) / 1000 * 60) % 119;
      var p = handAt(frame);
      if (hand) hand.setAttribute("transform", "matrix(" + cos + "," + sin + "," + (-sin) + "," + cos + "," + p[0] + "," + p[1] + ")");
      if (stroke) {
        var end = Math.min(100, frame / 120.27 * 100);
        stroke.style.visibility = end < 0.4 ? "hidden" : "visible";
        stroke.setAttribute("stroke-dashoffset", len * (1 - end / 100));
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return function () { alive = false; cancelAnimationFrame(raf); };
  }

  // raspadinha: canvas 343x343, pincel circular de raio 40 (contínuo, sem falhas entre toques), toque/mouse/caneta.
  // Ao primeiro toque somem a mão e o texto de dica (como no original). Revela sozinha com ≥ 50% raspado, ou ao soltar
  // depois de raspar (como o original); a camada some com transição suave e o popup entra 175 ms depois.
  function bindScratch() {
    var canvas = qs("canvas.sc__canvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var wrap = qs(".lottie-wrapper"), tip = qs(".tutuorial-text");
    var stopHint = startScratchHint(wrap);
    var img = new Image();
    img.onload = function () { if (!finished) ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
    img.src = "assets/misc/scratch-start.webp";
    canvas.style.touchAction = "none"; // o dedo raspa; a página não rola junto
    var RADIUS = 40, AUTO_REVEAL = 50;
    var drawing = false, scratched = false, finished = false, last = null, lastCheck = 0;
    onCleanup(function () { stopHint(); document.removeEventListener("pointerup", end); document.removeEventListener("pointercancel", end); });

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
    }
    function hideHint() { stopHint(); if (wrap) { wrap.remove(); wrap = null; } if (tip) { tip.remove(); tip = null; } }
    function scratch(p) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = RADIUS * 2;
      ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      ctx.restore();
      last = p; scratched = true;
    }
    function clearedPercent() {
      var d = ctx.getImageData(0, 0, canvas.width, canvas.height).data, n = 0, total = 0;
      for (var y = 0; y < canvas.height; y += 4) for (var x = 0; x < canvas.width; x += 4) { total++; if (d[(y * canvas.width + x) * 4 + 3] < 20) n++; }
      return 100 * n / total;
    }
    function reveal() {
      if (finished) return;
      finished = true; drawing = false;
      canvas.style.pointerEvents = "none";
      canvas.classList.add("is-revealed");                      // some com transição suave (CSS)
      setTimeout(function () { ctx.clearRect(0, 0, canvas.width, canvas.height); }, 450);
      setTimeout(showScratchPopup, 175);                        // mesmo atraso do original
    }
    function start(e) {
      if (finished) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
      hideHint(); drawing = true;
      last = pos(e); scratch(last);
    }
    function move(e) {
      if (!drawing || finished) return;
      e.preventDefault();
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach(function (ce) { scratch(pos(ce)); });
      var now = performance.now();
      if (now - lastCheck > 80) { lastCheck = now; if (clearedPercent() >= AUTO_REVEAL) reveal(); }
    }
    function end() {
      if (!drawing) return;
      drawing = false;
      if (scratched) reveal();
    }
    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    canvas.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
  }
  function showScratchPopup() {
    if (!OFFER) return loadOffer(showScratchPopup);
    var pop = html(OFFER.scratchPopup);
    // entrada com fade (mesma classe de transição do original: opacity .1s)
    pop.classList.add("fadePopup-enter-from", "fadePopup-enter-active");
    app.appendChild(pop);
    fillVars(pop);
    void pop.offsetWidth;
    pop.classList.remove("fadePopup-enter-from");
    setTimeout(function () { pop.classList.remove("fadePopup-enter-active"); }, 200);
    var btn = qs("#qz-button-continue", pop);
    if (btn) btn.addEventListener("click", function () { goTo("offer"); });
  }

  // ---------------------------------------------------------------- resumo do perfil (pontuação única)
  // FONTE ÚNICA: uma pontuação de confiança (0–100) calculada das respostas. Selo, posição do marcador, cor,
  // mensagem de alerta e os 4 cards derivam dela (ou das mesmas respostas) — nada é fixo na tela.
  // Cada resposta vale pontos (alta = 100, média = 55, baixa = 15); resposta ausente = 55 (neutro).
  var POINTS = {
    knowledge: { high: 100, medium: 55, low: 15 },                  // "O quanto você entende as mulheres?"
    readiness_for_changes: { perfect: 100, moderate: 55, low: 15 }, // "O quanto você está decidido a mudar…?"
    chasing_level_men: { low: 100, medium: 55, high: 15 },          // "Você sente que está correndo atrás dela?" (muito = menos confiança)
    incosistent_level_men: { low: 100, medium: 55, high: 15 },      // "O comportamento dela é difícil de entender?" (muito = mais incerteza)
    focus: { broad: 100, moderate: 55, limited: 15 }                // "Você acha fácil manter o foco?"
  };
  var WEIGHTS = {
    confidence: { knowledge: 0.25, readiness_for_changes: 0.25, chasing_level_men: 0.20, incosistent_level_men: 0.15, focus: 0.15 },
    motivation: { readiness_for_changes: 0.60, focus: 0.40 },
    potential: { knowledge: 0.50, chasing_level_men: 0.30, incosistent_level_men: 0.20 },
    patience: { focus: 0.60, readiness_for_changes: 0.40 },
    strategy: { knowledge: 0.60, incosistent_level_men: 0.40 }
  };
  function pointsFor(vars, name) {
    var v = POINTS[name][vars[name]];
    return v === undefined ? 55 : v;
  }
  function weighted(vars, weights) {
    var total = 0;
    Object.keys(weights).forEach(function (k) { total += pointsFor(vars, k) * weights[k]; });
    return Math.round(total);
  }
  function band(score) { return score >= 67 ? "high" : score >= 34 ? "mid" : "low"; } // 0–33 Baixo · 34–66 Médio · 67–100 Alto
  var CARD_WORDS = {
    motivation: { high: "Alto", mid: "Moderado", low: "Baixo" },
    potential: { high: "Alto", mid: "Moderado", low: "Baixo" },
    patience: { high: "Amplo", mid: "Moderado", low: "Limitado" },
    strategy: { high: "Alto", mid: "Médio", low: "Baixo" }
  };
  var LEVEL_UI = {
    low: { badge: "Baixo", color: "#CF504B", box: "bg-token-danger-600/10", icon: "text-token-danger-600", iconBg: "bg-token-danger-600/20",
      title: "Calma — todo mundo começa de algum lugar!",
      text: "Hoje você ainda se sente inseguro com ela, e tudo bem. Com o plano certo, você ganha confiança — passo a passo." },
    mid: { badge: "Médio", color: "#FD740B", box: "bg-token-warning-600-2/10", icon: "text-token-warning-600-2", iconBg: "bg-token-warning-600-2/20",
      title: "Você está no caminho — só falta clareza no próximo passo!",
      text: "Você já tem uma boa base, mas ainda hesita em alguns pontos. Vamos te mostrar exatamente como avançar — passo a passo." },
    high: { badge: "Alto", color: "#53B65C", box: "bg-token-success-600/10", icon: "text-token-success-600", iconBg: "bg-token-success-600/20",
      title: "Você está pronto — só precisa do plano certo!",
      text: "Você sabe o que quer, mas precisa de uma estratégia clara. Vamos te mostrar exatamente como avançar — passo a passo." }
  };
  function computeProfile(vars) {
    var score = weighted(vars, WEIGHTS.confidence);
    var level = band(score);
    var cards = {
      motivation: weighted(vars, WEIGHTS.motivation),
      potential: weighted(vars, WEIGHTS.potential),
      patience: weighted(vars, WEIGHTS.patience),
      strategy: weighted(vars, WEIGHTS.strategy)
    };
    return {
      score: score, level: level, badge: LEVEL_UI[level].badge, markerPercent: score, ui: LEVEL_UI[level],
      cards: {
        motivation: { score: cards.motivation, label: CARD_WORDS.motivation[band(cards.motivation)] },
        potential: { score: cards.potential, label: CARD_WORDS.potential[band(cards.potential)] },
        patience: { score: cards.patience, label: CARD_WORDS.patience[band(cards.patience)] },
        strategy: { score: cards.strategy, label: CARD_WORDS.strategy[band(cards.strategy)] }
      }
    };
  }
  window.QuizProfile = { compute: computeProfile, weights: WEIGHTS, points: POINTS };

  function setNestedText(el, text) {
    var inner = el.querySelector("p") || el;
    inner.textContent = text;
  }
  function bindSummary(s) {
    var profile = computeProfile(state.vars);
    setVar("confidence_score", profile.score);
    setVar("confidence_level", profile.level);
    track("answer", { key: "confidence_score", value: profile.score });
    track("answer", { key: "confidence_level", value: profile.level });
    var ui = profile.ui;
    // selo
    var badge = qs('div[class*="rounded-[4px]"][class*="px-2"]');
    if (badge) { badge.textContent = ui.badge; badge.style.backgroundColor = ui.color; }
    // termômetro: gradiente vermelho (Baixo, à esquerda) → verde (Alto, à direita) e marcador proporcional à pontuação
    var gauge = qs("svg.h-\\[55px\\]");
    if (gauge) {
      var grad = gauge.querySelector("linearGradient");
      if (grad) { grad.setAttribute("x1", "0"); grad.setAttribute("x2", "1"); }
      var circles = qsa("circle", gauge);
      var flt = gauge.querySelector("filter");
      var target = Math.min(333, Math.max(21, 10 + 334 * profile.markerPercent / 100));
      var place = function (x) {
        circles.forEach(function (c) { c.setAttribute("cx", x); });
        if (flt) flt.setAttribute("x", x - 20);
      };
      place(21);
      var t0 = null, dur = 700;
      var step = function (t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        place(21 + (target - 21) * e);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    // mensagem de alerta (cor, ícone, título e texto) do nível
    var box = qs('div[class*="rounded-[16px] p-3"]');
    if (box) {
      box.className = box.className.replace(/bg-token-(?:danger|warning|success)-600(?:-2)?\/10/g, "").replace(/\s+/g, " ").trim() + " " + ui.box;
      var iconWrap = box.firstElementChild;
      if (iconWrap) {
        iconWrap.className = iconWrap.className.replace(/bg-token-(?:danger|warning|success)-600(?:-2)?\/20/g, "").replace(/\s+/g, " ").trim() + " " + ui.iconBg;
        var svg = iconWrap.querySelector("svg");
        if (svg) svg.setAttribute("class", ui.icon);
      }
      var title = qs('div[class*="font-bold"]', box), body = qs('div[class*="text-[10px]"]', box);
      if (title) setNestedText(title, ui.title);
      if (body) setNestedText(body, ui.text);
    }
    // 4 cards: Motivação, Potencial, Paciência, Estratégia (na ordem da tela)
    var order = ["motivation", "potential", "patience", "strategy"];
    qsa(".grid.grid-cols-2 > div").forEach(function (card, k) {
      var val = qs('div[class*="text-[12px]"][class*="font-semibold"]', card);
      if (val && order[k]) val.textContent = profile.cards[order[k]].label;
    });
    bindContinue(s);
  }

  // ---------------------------------------------------------------- loader com progresso e perguntas
  var LOADER_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" class="size-4 text-token-warning-500" filled=""><path fill-rule="evenodd" d="M8 16A8 8 0 1 0 8-.001 8 8 0 0 0 8 16m3.857-9.809a.75.75 0 1 0-1.214-.882l-3.483 4.79-1.88-1.88A.75.75 0 1 0 4.22 9.28l2.5 2.5a.75.75 0 0 0 1.137-.089z" clip-rule="evenodd"></path></svg>';
  var LOADER_QUESTIONS = ["Você costuma concluir o que começa?", "Você está familiarizado com técnicas de espelhamento?", "Você quer aprender como reconstruir sua confiança?"];
  var LOADER_DONE_TEXT = ["Objetivos", "Áreas de crescimento", "Conteúdo"];

  function bindLoader(s) {
    var wrap = qs(".flex.flex-col.gap-2");
    var items = qsa(".w-full.pb-\\[14px\\]", wrap);
    var duration = (s.duration || 5) * 1000 + 300;
    var step = duration / 100;
    var timers = [];
    var navigated = false;
    var carousel = initCarousel(qs(".splide"));
    onCleanup(function () { timers.forEach(clearTimeout); carousel && carousel.destroy(); var m = qs(".ui-modal"); if (m) m.remove(); });

    function setPct(item, n) {
      var line = qs(".progress-line", item), txt = qs("p.text-token-neutral-500-2", item);
      line.style.width = n + "%";
      if (txt) txt.textContent = n + "%";
    }
    function complete(idx) {
      var item = items[idx];
      var wrapEl = qs(".progress-line-wrapper", item);
      wrapEl.classList.add("--completed");
      setPct(item, 100);
      var label = qs("p.text-token-ink-50", item);
      label.textContent = "";
      var inner = document.createElement("p"); inner.textContent = LOADER_DONE_TEXT[idx]; label.appendChild(inner);
      var right = qs(".mb-1 > div", item);
      right.textContent = ""; right.appendChild(html(LOADER_CHECK));
      if (carousel) carousel.next();
      var last = idx + 1 >= items.length;
      timers.push(setTimeout(function () {
        if (!last) { items[idx + 1].classList.remove("hidden"); play(idx + 1, 0); }
        else finish();
      }, last ? 1000 : 300));
    }
    function play(idx, from) {
      var item = items[idx];
      var n = from;
      (function tick() {
        if (n === 48 && s.questionsEnabled && LOADER_QUESTIONS[idx]) {
          n += 1; setPct(item, n);
          return ask(idx, function () { play(idx, n); });
        }
        if (n >= 100) return complete(idx);
        timers.push(setTimeout(function () { n += 1; setPct(item, n); tick(); }, step));
      })();
    }
    function ask(idx, resume) {
      var modal = html('<div class="fixed inset-0 z-[110] flex bg-token-ink-50/50 ui-modal"><div class="flex w-full items-center justify-center"><div class="w-full max-w-[327px] rounded-[12px] bg-token-paper-950 p-4 text-center text-token-neutral-300"><p class="mb-3 text-xs">Para continuar, responda</p><h2 class="mb-6 text-xl font-semibold"><p>' + LOADER_QUESTIONS[idx] + '</p></h2><div class="flex items-center gap-[11px]"><button data-test="option-no" class="min-h-12 flex-1 rounded-[40px] bg-token-warning-950-3 text-sm font-semibold">Não</button><button data-test="option-yes" class="min-h-12 flex-1 rounded-[40px] bg-token-warning-950-3 text-sm font-semibold">Sim</button></div></div></div></div>');
      app.appendChild(modal);
      qsa("button", modal).forEach(function (b) {
        b.addEventListener("click", function () {
          var yes = b.getAttribute("data-test") === "option-yes";
          setVar("loader_answer_" + (idx + 1), yes);
          track("answer", { key: "loader_answer_" + (idx + 1), value: yes });
          modal.remove();
          resume();
        });
      });
    }
    function finish() {
      if (s.showContinueButton) {
        var w = qs(".continue-btn-wrapper"); if (w) w.classList.remove("hidden");
        bindContinue(s);
      } else if (!navigated) { navigated = true; navigate(s.next); }
    }
    items.forEach(function (it, i) { if (i > 0) it.classList.add("hidden"); setPct(it, 0); });
    play(0, 0);
  }

  // carrossel de depoimentos: rolagem horizontal nativa (swipe no celular, arraste/scroll lateral no desktop),
  // encaixe por scroll-snap, bolinhas indicadoras e avanço automático a cada etapa de carregamento concluída
  function initCarousel(root) {
    if (!root) return null;
    var track = qs(".splide__track", root);
    var list = qs(".splide__list", root);
    if (!track || !list) return null;
    var cards = qsa(".splide__slide:not(.splide__slide--clone)", list);
    if (!cards.length) return null;
    // remove clones/estilos inline do Splide e a paginação antiga (oculta); o carrossel agora rola de verdade
    list.textContent = "";
    cards.forEach(function (c) { c.removeAttribute("style"); c.classList.remove("is-active", "is-visible", "is-next", "is-prev"); list.appendChild(c); });
    var old = qs(".splide__pagination", root); if (old) old.remove();
    root.classList.add("reviews-carousel");
    track.setAttribute("tabindex", "0");
    track.setAttribute("aria-label", "Depoimentos");

    var dots = document.createElement("div");
    dots.className = "reviews-dots";
    dots.setAttribute("role", "tablist");
    var dotEls = cards.map(function (c, i) {
      var d = document.createElement("button");
      d.type = "button"; d.className = "reviews-dot"; d.setAttribute("role", "tab");
      d.setAttribute("aria-label", "Ir para o depoimento " + (i + 1) + " de " + cards.length);
      d.addEventListener("click", function () { goTo(i, true); });
      dots.appendChild(d);
      return d;
    });
    root.appendChild(dots);

    function centerOf(i) { return cards[i].offsetLeft + cards[i].offsetWidth / 2; }
    function nearest() {
      var mid = track.scrollLeft + track.clientWidth / 2, best = 0, dist = 1e9;
      cards.forEach(function (c, i) { var d = Math.abs(centerOf(i) - mid); if (d < dist) { dist = d; best = i; } });
      return best;
    }
    function paint(i) {
      dotEls.forEach(function (d, k) { d.classList.toggle("is-active", k === i); d.setAttribute("aria-selected", k === i ? "true" : "false"); });
    }
    function goTo(i, smooth) {
      track.scrollTo({ left: centerOf(i) - track.clientWidth / 2, behavior: smooth ? "smooth" : "auto" });
      paint(i);
    }
    var raf = 0;
    function onScroll() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; paint(nearest()); }); }
    track.addEventListener("scroll", onScroll, { passive: true });

    // desktop: arrastar com o mouse (o toque e o trackpad já rolam nativamente)
    var drag = null;
    function onDown(e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: track.scrollLeft };
      track.style.scrollSnapType = "none"; track.classList.add("is-dragging");
    }
    function onMove(e) { if (drag) track.scrollLeft = drag.left - (e.clientX - drag.x); }
    function onUp() {
      if (!drag) return;
      drag = null; track.classList.remove("is-dragging");
      var i = nearest(); track.style.scrollSnapType = ""; goTo(i, true);
    }
    track.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(Math.min(cards.length - 1, nearest() + 1), true); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(Math.max(0, nearest() - 1), true); }
    });
    function onResize() { goTo(nearest(), false); }
    window.addEventListener("resize", onResize);

    goTo(0, false); paint(0);
    return {
      next: function () { goTo((nearest() + 1) % cards.length, true); },
      destroy: function () {
        window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp); window.removeEventListener("resize", onResize);
      }
    };
  }

  // ---------------------------------------------------------------- oferta (antes do checkout)
  // Preço único (R$ 39,70): o card e o texto legal vêm prontos do build (_src/build.cjs), sem seleção de plano.
  var CHECKOUT_URL = "https://checkout.payt.com.br/0c0a1c8436f1a850fa58f9db452f70ed";
  // Parâmetros do anúncio repassados ao checkout (como no CalmKids/CalmBaby). A UTMify já faz isso;
  // esta lista é a garantia caso o script dela seja bloqueado (ex.: bloqueador de anúncios).
  var TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "fbclid", "gclid", "src", "sck", "xcod"];
  function checkoutUrl() {
    var url = new URL(CHECKOUT_URL);
    var current = new URLSearchParams(location.search);
    TRACKING_PARAMS.forEach(function (key) {
      var value = current.get(key);
      if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
    });
    return url.toString();
  }
  function renderOffer() {
    if (!OFFER) {
      showLoader();
      return loadOffer(function () { if (currentRoute() === "offer") render(); });
    }
    document.documentElement.classList.add("offer-page");
    // a oferta muda conforme objetivo, status e idade respondidos (como no original); sem respostas usa a versão padrão
    var variant = OFFER.variants && OFFER.variants[state.vars.goal] && OFFER.variants[state.vars.goal][state.vars.relationship_status];
    mount(app, variant || OFFER.html);
    if (lastTracked !== "offer") track("offer");
    trackStep(200, "offer");
    var ageSrc = OFFER.ageImg && OFFER.ageImg[state.vars.age || "30-39"];
    var heroImg = qs(".compare-before-after-generated img");
    if (heroImg && ageSrc) heroImg.setAttribute("src", ageSrc);
    document.body.style.overflow = "hidden";
    window.scrollTo(0, 0);
    hideLoader();
    fillVars();
    // Todos os botões "Obter meu plano" levam ao checkout da Payt
    qsa("#qz-button-continue").forEach(function (b) {
      b.addEventListener("click", function () {
        // envia na hora (keepalive): a página sai logo em seguida
        track("checkout", {}, { now: true });
        location.href = checkoutUrl();
      });
    });
    bindOfferTimer();
    bindOfferFaq();
  }
  var OFFER_SECONDS = 600;
  function bindOfferTimer() {
    var remaining = OFFER_SECONDS - 1;
    var groups = qsa(".ui-timer__inner");
    function paint() {
      var m = Math.floor(remaining / 60), sec = remaining % 60;
      groups.forEach(function (g) {
        var nums = qsa(".main-text", g).filter(function (e) { return e.textContent !== ":"; });
        if (nums[0]) nums[0].textContent = pad(m);
        if (nums[1]) nums[1].textContent = pad(sec);
      });
    }
    paint();
    var iv = setInterval(function () {
      remaining -= 1;
      if (remaining < 0) { clearInterval(iv); remaining = 0; paint(); return showExtraTime(); }
      paint();
    }, 1000);
    function showExtraTime() {
      var pop = html(OFFER.extraTimePopup);
      app.appendChild(pop);
      var b = qs("button", pop);
      if (b) b.addEventListener("click", function () {
        pop.remove();
        remaining = 7 * 60;
        paint();
        iv = setInterval(function () { remaining -= 1; if (remaining <= 0) { clearInterval(iv); remaining = 0; } paint(); }, 1000);
        onCleanup(function () { clearInterval(iv); });
      });
    }
    onCleanup(function () { clearInterval(iv); });
  }
  function bindOfferFaq() {
    qsa(".bg-token-caution-950").forEach(function (item) {
      var head = item.firstElementChild, body = item.children[1];
      if (!head || !body || !body.classList.contains("overflow-hidden")) return;
      head.addEventListener("click", function () {
        // mesmas classes do original: corpo ganha mt-2.5 !h-auto !opacity-100 lg:mt-5; seta ganha rotate-180
        var open = body.classList.contains("!h-auto");
        ["mt-2.5", "!h-auto", "!opacity-100", "lg:mt-5"].forEach(function (c) { body.classList.toggle(c, !open); });
        var arrow = head.lastElementChild; if (arrow) arrow.classList.toggle("rotate-180", !open);
      });
    });
  }

  // ---------------------------------------------------------------- init
  window.addEventListener("hashchange", render);
  render();
  // oferta em segundo plano, depois que a primeira tela já apareceu e a rede ficou livre
  whenIdle(function () { loadOffer(); }, 4000);
})();
