/* Registro das respostas do quiz no Supabase (Edge Function "track-alpha").
 * Nunca bloqueia a tela: eventos vão para uma fila em localStorage e são enviados em segundo plano,
 * em lotes. Só saem da fila depois de resposta 2xx. Uso (em script.js): window.aaTrack(tipo, dados, { now: true }).
 */
(function () {
  "use strict";

  // URL da Edge Function. Vazio = tracking desligado (nada é enviado nem guardado).
  var TRACK_URL = "https://bionetfauvpcwlhqvvum.supabase.co/functions/v1/track-alpha";

  // Testes locais (localhost, file://) não sujam o banco de produção.
  var isLocal = location.protocol === "file:" || ["localhost", "127.0.0.1"].indexOf(location.hostname) !== -1;

  if (!TRACK_URL || isLocal || !window.fetch) {
    window.aaTrack = function () {};
    return;
  }

  var QUEUE_KEY = "aa_queue";
  var SID_KEY = "aa_sid";
  var SEQ_KEY = "aa_seq";
  var MAX_QUEUE = 300;
  var MAX_BATCH = 40;
  // Eventos saem em lotes, no máximo a cada 3 s (um envio a cada poucas respostas, não um por clique).
  var BATCH_EVERY = 3000;

  var memory = {};
  function store(area) {
    return {
      get: function (key) {
        try { return window[area].getItem(key); } catch (e) { return memory[area + key] || null; }
      },
      set: function (key, value) {
        try { window[area].setItem(key, value); } catch (e) { memory[area + key] = value; }
      }
    };
  }
  var local = store("localStorage");
  var session = store("sessionStorage");

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) {
      return (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
    });
  }

  // Uma sessão por visita (aba), como o estado do quiz (sessionStorage). Reabrir o link cria outra linha.
  var sid = session.get(SID_KEY);
  var isNew = !sid;
  if (isNew) {
    sid = uuid();
    session.set(SID_KEY, sid);
  }

  function readQueue() {
    try {
      var queue = JSON.parse(local.get(QUEUE_KEY) || "[]");
      return Array.isArray(queue) ? queue : [];
    } catch (e) { return []; }
  }
  function writeQueue(queue) { local.set(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE))); }

  var sending = false;
  var failures = 0;
  var timer = null;
  // Nada sai antes da página terminar de carregar: o pixel do Meta tem a banda só para ele.
  var pageReady = document.readyState === "complete";

  function nextSeq() {
    var seq = Number(session.get(SEQ_KEY) || 0) + 1;
    session.set(SEQ_KEY, String(seq));
    return seq;
  }

  function schedule(delay, reset) {
    if (!pageReady) return;
    if (timer && !reset) return; // já tem envio marcado: o evento novo vai junto
    clearTimeout(timer);
    timer = setTimeout(function () { timer = null; flush(); }, delay);
  }

  function drop(batch) {
    var sent = {};
    batch.forEach(function (e) { sent[e.sid + ":" + e.seq] = true; });
    writeQueue(readQueue().filter(function (e) { return !sent[e.sid + ":" + e.seq]; }));
  }

  // force = saída da página ou clique no checkout: manda tudo que ainda não foi confirmado,
  // mesmo com outro envio em andamento. O servidor ignora seq repetido, então não duplica.
  function flush(force) {
    if (sending && !force) return;
    var queue = readQueue();
    if (!queue.length) return;

    // Um lote por sessão, na ordem: sobras de visitas antigas saem com o sid delas.
    var batchSid = queue[0].sid;
    var batch = queue.filter(function (e) { return e.sid === batchSid; }).slice(0, MAX_BATCH);
    var events = batch.map(function (e) {
      var copy = {};
      Object.keys(e).forEach(function (k) { if (k !== "sid") copy[k] = e[k]; });
      return copy;
    });
    if (!force) sending = true;

    // text/plain evita o preflight de CORS (uma ida e volta a menos).
    fetch(TRACK_URL, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ sid: batchSid, events: events })
    }).then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      drop(batch);
      failures = 0;
      if (!force) sending = false;
      if (readQueue().length) schedule(0, true);
    }).catch(function (error) {
      if (!force) sending = false;
      var status = Number(error.message);
      // 4xx (payload inválido) é descartado para não travar a fila para sempre.
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        drop(batch);
        if (readQueue().length) schedule(0, true);
        return;
      }
      failures += 1;
      schedule(Math.min(30000, 1000 * Math.pow(2, failures)), true);
    });
  }

  window.aaTrack = function (type, data, opts) {
    var event = { sid: sid, seq: nextSeq(), type: type };
    Object.keys(data || {}).forEach(function (k) { event[k] = data[k]; });
    var queue = readQueue();
    queue.push(event);
    writeQueue(queue);
    if (opts && opts.now) flush(true);
    else schedule(BATCH_EVERY);
  };

  // Primeira visita da aba: UTMs e origem do anúncio.
  if (isNew) {
    var utm = {};
    try {
      new URLSearchParams(location.search).forEach(function (value, key) {
        if (/^(utm_\w+|fbclid|gclid|src|sck|xcod)$/.test(key) && value) utm[key] = value;
      });
    } catch (e) {}
    window.aaTrack("landing", { meta: { utm: utm, referrer: document.referrer || "" } });
  }

  function flushNow() { flush(true); }
  // Reenvia quando a rede volta; na saída da página, manda o que faltar (keepalive).
  window.addEventListener("online", function () { flush(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushNow();
  });
  window.addEventListener("pagehide", flushNow);

  // Primeiro envio só depois do load (inclui sobras de visitas anteriores).
  function start() { pageReady = true; schedule(1000); }
  if (pageReady) start();
  else window.addEventListener("load", start, { once: true });
})();
