// Recebe lotes de eventos do quiz e grava em public.alpha_sessions via
// apply_alpha_session_events. Deploy: supabase functions deploy track-alpha --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

// Variável própria para poder dividir o projeto Supabase com outros funis.
// Vazio = aceita qualquer origem (a escrita já é validada campo a campo).
const ALLOWED_ORIGINS = (Deno.env.get("ALPHA_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Chave da resposta: variável do funil (goal, age...) ou nome da tela (quizDoYourConversationsFadeOut).
const KEY = /^[a-z0-9_]{1,80}$/i;
const UTM_KEY = /^[a-z0-9_]{1,40}$/i;
const TYPES = new Set(["landing", "step", "answer", "offer", "checkout"]);
const MAX_BODY = 16_000;
const MAX_EVENTS = 50;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : undefined;

function cors(origin: string | null): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.length === 0 || (origin !== null && ALLOWED_ORIGINS.includes(origin));
  return allowed && origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

// Respostas: texto, lista (múltipla escolha), número (pontuação) ou booleano (perguntas do loader).
function cleanValue(value: unknown): string | string[] | number | boolean | undefined {
  if (typeof value === "string") return value.slice(0, 200);
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => String(item).slice(0, 200));
  return undefined;
}

function cleanEvent(raw: any) {
  if (!raw || !TYPES.has(raw.type) || !Number.isInteger(raw.seq) || raw.seq < 1 || raw.seq > 100_000) return null;
  const event: Record<string, unknown> = { type: raw.type, seq: raw.seq };
  if (raw.type === "step") {
    if (!Number.isInteger(raw.idx) || raw.idx < 0 || raw.idx > 200) return null;
    event.idx = raw.idx;
    event.id = text(raw.id, 80);
  } else if (raw.type === "answer") {
    const value = cleanValue(raw.value);
    if (typeof raw.key !== "string" || !KEY.test(raw.key) || value === undefined) return null;
    event.key = raw.key;
    event.value = value;
  }
  return event;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" },
    });
  }
  if (req.method !== "POST") return new Response("{}", { status: 405, headers });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response("{}", { status: 413, headers });

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("{}", { status: 400, headers });
  }
  if (!body || typeof body.sid !== "string" || !UUID.test(body.sid) || !Array.isArray(body.events)) {
    return new Response("{}", { status: 400, headers });
  }

  const events = body.events.slice(0, MAX_EVENTS).map(cleanEvent).filter(Boolean);
  if (!events.length) return new Response("{}", { status: 400, headers });

  // Meta só vem do evento landing.
  const landing = body.events.find((event: any) => event?.type === "landing");
  const utm: Record<string, string> = {};
  for (const [key, value] of Object.entries(landing?.meta?.utm ?? {})) {
    if (UTM_KEY.test(key) && typeof value === "string") utm[key] = value.slice(0, 200);
  }
  const meta = { utm, referrer: text(landing?.meta?.referrer, 300) };

  const { error } = await supabase.rpc("apply_alpha_session_events", {
    p_id: body.sid,
    p_meta: meta,
    p_events: events,
  });
  if (error) {
    console.error("apply_alpha_session_events", error.message);
    return new Response("{}", { status: 500, headers });
  }
  return new Response("{}", { status: 200, headers });
});
