// Remove de quiz-pt-br/css/style.css as regras que nunca casam com nada no quiz:
//  1. regras de componentes Vue cujo atributo de escopo ([data-v-xxxxxxxx]) não aparece em nenhuma tela;
//  2. utilitários de classe única (.h-\[46px\], .lg\:mt-5 ...) cujo nome não aparece em nenhum HTML/JS do quiz.
// Conservador: na dúvida mantém (seletor composto, pseudo-elemento de terceiros, @keyframes, @font-face...).
// Uso (na raiz do repositório), depois de `node _src/build.cjs`: node _src/purge-css.cjs
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "quiz-pt-br");
const cssPath = path.join(root, "css", "style.css");
const css = fs.readFileSync(cssPath, "utf8");
const corpus = ["js/screens-data.js", "js/offer-data.js", "js/script.js", "js/funnel-data.js", "css/app.css", "index.html"]
  .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
  .join("\n")
  .replace(/\\"/g, '"');
const usedScopes = new Set(corpus.match(/data-v-[0-9a-f]{8}/g));

// nome da classe a partir do seletor escapado: ".lg\:mt-5" -> "lg:mt-5"
const unescape = (s) => s.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (m, c) => (/^[0-9a-fA-F]/.test(c) && c.length > 1 ? String.fromCodePoint(parseInt(c, 16)) : c));
function selectorDead(sel) {
  sel = sel.trim();
  const scopes = sel.match(/data-v-[0-9a-f]{8}/g);
  if (scopes && scopes.some((h) => !usedScopes.has(h))) return true;
  // utilitário simples: uma classe, com pseudo-classe/elemento opcional
  const m = sel.match(/^\.((?:\\.|[\w-])+)(?::{1,2}[\w-]+(?:\([^)]*\))?)*$/);
  if (m) {
    const name = unescape(m[1]);
    // classes montadas no JS (ex.: "--" + estado) ou muito curtas: mantém
    if (name.length < 3 || name.startsWith("--") || name.startsWith("splide") || name.startsWith("sc__")) return false;
    return !corpus.includes(name);
  }
  return false;
}

// percorre o CSS por blocos de chaves; @media/@supports são processados por dentro
function purge(text) {
  let out = "", i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) { out += text.slice(i); break; }
    let depth = 1, j = open + 1;
    while (j < text.length && depth) { if (text[j] === "{") depth++; else if (text[j] === "}") depth--; j++; }
    const prelude = text.slice(i, open);
    const body = text.slice(open + 1, j - 1);
    const lead = prelude.match(/^[\s\S]*(?:\*\/|\n)/); // comentários/linhas antes do seletor
    const head = lead ? prelude.slice(lead[0].length) : prelude;
    const keepLead = lead ? lead[0] : "";
    if (/^\s*@(media|supports|layer|container)/.test(head)) {
      const inner = purge(body);
      out += keepLead + (inner.trim() ? head + "{" + inner + "}" : "");
    } else if (/^\s*@/.test(head)) {
      out += prelude + "{" + body + "}";
    } else {
      const sels = splitSelectors(head);
      const alive = sels.filter((s) => !selectorDead(s));
      out += keepLead + (alive.length ? alive.join(",") + "{" + body + "}" : "");
    }
    i = j;
  }
  return out;
}
function splitSelectors(s) {
  const parts = []; let depth = 0, cur = "";
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "\\") { cur += c + s[++k]; continue; }
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && !depth) { parts.push(cur); cur = ""; } else cur += c;
  }
  parts.push(cur);
  return parts;
}

const result = purge(css).replace(/\/\* ==== [^*]+ ==== \*\/\n+(?=\/\* ==== |\s*$)/g, "");
fs.writeFileSync(cssPath, result);
console.log("style.css:", (css.length / 1024).toFixed(0), "KB ->", (result.length / 1024).toFixed(0), "KB");
