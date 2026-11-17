// BRYSS AI — serveur du moteur IA
// Créé par Issam Akdi & Bryana Lebon
//
// Aucune dépendance à installer : uniquement Node.js 18 ou plus récent.
// La clé API reste ICI, côté serveur. Elle n'est jamais envoyée au navigateur.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// --- lecture optionnelle d'un fichier .env (utile en local) ---
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* pas de .env : on utilise les variables du serveur */ }

// --- réglages (tous modifiables par variables d'environnement) ---
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || "";
const BASE_URL = (process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
const MODEL = process.env.AI_MODEL || "gemini-3.5-flash";
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://issam-akdi.github.io").split(",").map((s) => s.trim()).filter(Boolean);
const PER_MINUTE = Number(process.env.LIMIT_PER_MINUTE || 12);   // messages / minute / personne
const PER_DAY = Number(process.env.LIMIT_PER_DAY || 200);        // messages / jour / personne
const GLOBAL_DAY = Number(process.env.LIMIT_GLOBAL_PER_DAY || 3000); // messages / jour pour tout le monde (protège ton quota)

const SYSTEM_PROMPT = process.env.BRYSS_SYSTEM_PROMPT || `Tu es BRYSS AI, un assistant personnel polyvalent, créé par Issam Akdi et Bryana Lebon.

Personnalité : chaleureux, clair, précis, motivant, jamais condescendant. Tu vas droit au but, tu aides à réfléchir, créer, apprendre, organiser et coder.

Règles :
- Réponds dans la langue de l'utilisateur, avec le même niveau de familiarité (tutoie s'il tutoie).
- Sois concret : étapes, exemples, code complet quand on te le demande. Évite le blabla.
- Si tu n'es pas sûr ou si tu ne sais pas, dis-le honnêtement au lieu d'inventer. Tu peux te tromper.
- Pour la santé, le droit et la finance, donne des informations utiles mais rappelle que tu ne remplaces pas un professionnel.
- Refuse poliment ce qui est dangereux, illégal ou destiné à nuire.
- Si on te demande qui t'a créé : Issam Akdi et Bryana Lebon. Si on te demande sur quelle technologie tu fonctionnes, dis honnêtement que BRYSS AI s'appuie sur un modèle de langage fourni par un partenaire technologique, sans inventer de détails.`;

// --- limites d'usage (en mémoire) ---
const perMin = new Map(), perDay = new Map();
let globalDay = { day: "", n: 0 };
const today = () => new Date().toISOString().slice(0, 10);
function allowed(ip) {
  const now = Date.now(), d = today();
  if (globalDay.day !== d) globalDay = { day: d, n: 0 };
  if (globalDay.n >= GLOBAL_DAY) return "global";
  const a = (perMin.get(ip) || []).filter((t) => now - t < 60000);
  if (a.length >= PER_MINUTE) return "minute";
  const b = perDay.get(ip);
  const dayCount = b && b.day === d ? b.n : 0;
  if (dayCount >= PER_DAY) return "day";
  a.push(now); perMin.set(ip, a);
  perDay.set(ip, { day: d, n: dayCount + 1 });
  globalDay.n++;
  return "";
}
setInterval(() => { const now = Date.now(); for (const [k, v] of perMin) if (!v.some((t) => now - t < 60000)) perMin.delete(k); }, 60000).unref();

// --- utilitaires HTTP ---
function cors(req, res) {
  const o = req.headers.origin;
  if (!o) return;
  const ok = ORIGINS.includes("*") || ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  if (ok) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
function readBody(req, max = 120_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > max) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// --- /api/chat ---
async function chat(req, res) {
  if (!API_KEY) return json(res, 503, { error: "no_key", message: "Le moteur IA n'est pas encore configuré." });
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").toString().split(",")[0].trim();
  const limit = allowed(ip);
  if (limit) return json(res, 429, { error: "rate_limit", message: limit === "global" ? "BRYSS AI a beaucoup de succès aujourd'hui ! Réessaie demain." : "Tu vas un peu vite. Patiente quelques instants avant de réessayer." });

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: "bad_request", message: "Requête invalide." }); }
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-20)
    .map((m) => ({ role: m && m.role === "assistant" ? "assistant" : "user", content: String((m && (m.text ?? m.content)) ?? "").slice(0, 4000) }))
    .filter((m) => m.content.trim());
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json(res, 400, { error: "bad_request", message: "Message vide." });

  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...msgs], temperature: 0.7 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) {
      console.error("moteur IA:", r.status, (await r.text()).slice(0, 300));
      return json(res, r.status === 429 ? 429 : 502, { error: "upstream", message: r.status === 429 ? "Le moteur IA est très sollicité. Réessaie dans un instant." : "Le moteur IA a rencontré un problème. Réessaie dans un instant." });
    }
    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content;
    return json(res, 200, { reply: typeof reply === "string" && reply.trim() ? reply : "Je n'ai pas pu générer de réponse. Peux-tu reformuler ?" });
  } catch (e) {
    console.error("moteur IA (erreur):", e?.name || e);
    return json(res, 504, { error: "timeout", message: "Le moteur IA met trop de temps à répondre. Réessaie." });
  }
}

// --- fichiers du site (pour héberger aussi l'interface depuis ce serveur) ---
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".txt": "text/plain; charset=utf-8" };
const HIDDEN = /^(server\.js|package(-lock)?\.json|readme\.md)$/i;
function serveFile(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file);
  const segs = rel.split(path.sep);
  if (rel.startsWith("..") || path.isAbsolute(rel) || segs.some((s) => s.startsWith(".") || s === "node_modules" || s === "tools") || HIDDEN.test(segs[segs.length - 1]) || !MIME[path.extname(file).toLowerCase()]) {
    res.writeHead(404); return res.end("Not found");
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()], "Cache-Control": "no-cache" });
    res.end(buf);
  });
}

http.createServer(async (req, res) => {
  cors(req, res);
  const { pathname } = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (pathname === "/health") return json(res, 200, { ok: true, ai: Boolean(API_KEY) });
  if (pathname === "/api/chat" && req.method === "POST") return chat(req, res);
  if (req.method === "GET" || req.method === "HEAD") return serveFile(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log(`BRYSS AI prêt sur le port ${PORT} · moteur : ${API_KEY ? MODEL : "NON CONFIGURÉ (ajoute AI_API_KEY)"}`));
