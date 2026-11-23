import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(root, "data", "leads.jsonl");
const port = Number(process.env.PORT || 4173);
const requests = new Map();

fs.mkdirSync(path.dirname(dataFile), { recursive: true });

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

function rateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const entries = (requests.get(ip) || []).filter((time) => time > windowStart);
  if (entries.length >= 5) {
    requests.set(ip, entries);
    return true;
  }
  entries.push(now);
  requests.set(ip, entries);
  return false;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 16_384) throw new Error("Слишком много данных");
  }
  return JSON.parse(body);
}

const server = http.createServer(async (request, response) => {
  const host = request.headers.host || "";
  const isApi = request.method === "POST" && request.url === "/api/leads";

  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method === "GET" && request.url === "/robots.txt") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    const scheme = request.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    return response.end(`User-agent: *\nAllow: /\n\nSitemap: ${new URL("/", `${scheme}://${host}`).origin}/sitemap.xml\n`);
  }

  if (request.method === "GET" && request.url === "/sitemap.xml") {
    const scheme = request.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const origin = new URL("/", `${scheme}://${host}`).origin;
    const pages = ["", "about.html", "practices.html", "retreat.html", "reviews.html", "contact.html", "privacy.html", "en/", "en/about.html", "en/practices.html", "en/retreat.html", "en/reviews.html", "en/contact.html", "en/privacy.html"];
    const urls = pages.map((page) => `  <url><loc>${origin}/${page}</loc></url>`).join("\n");
    response.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    return response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  }

  if (isApi) {
    const origin = request.headers.origin;
    if (origin && new URL(origin).host !== host) {
      return json(response, 403, { error: "Запрос отклонён" });
    }
    if (rateLimited(request.socket.remoteAddress || "unknown")) {
      return json(response, 429, { error: "Слишком много попыток. Повторите позже." });
    }
    try {
      const data = await readJson(request);
      const name = String(data.name || "").trim();
      const email = String(data.email || "").trim().toLowerCase();
      const allowedSubjects = [
        "Практика — Тазовое дно",
        "Практика — Здоровая спина",
        "Практика — Йога для беременных",
        "Запрос ретрита",
        "Сертификат",
        "Practice — Pelvic floor",
        "Practice — Healthy back",
        "Practice — Prenatal yoga",
        "Retreat enquiry",
        "Gift certificate"
      ];
      const subject = String(data.subject || "").trim();
      if (String(data.website || "").trim()) return json(response, 200, { ok: true });
      if (name.length < 2 || name.length > 80) return json(response, 400, { error: "Укажите имя" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
        return json(response, 400, { error: "Проверьте email" });
      }
      if (!data.consent) return json(response, 400, { error: "Нужно согласие на рассылку" });
      if (!allowedSubjects.includes(subject)) return json(response, 400, { error: "Выберите тему обращения" });

      const lead = {
        name,
        email,
        subject,
        consent: true,
        createdAt: new Date().toISOString()
      };
      await fs.promises.appendFile(dataFile, JSON.stringify(lead) + "\n", { mode: 0o600 });
      return json(response, 201, { ok: true });
    } catch (error) {
      if (error instanceof SyntaxError) return json(response, 400, { error: "Некорректные данные" });
      console.error(error);
      return json(response, 500, { error: "Не удалось сохранить заявку" });
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return json(response, 405, { error: "Метод не поддерживается" });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  } catch {
    return json(response, 400, { error: "Некорректный адрес" });
  }
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/en/" || pathname === "/en") pathname = "/en/index.html";
  const filePath = path.resolve(root, "." + pathname);
  if (!filePath.startsWith(root + path.sep)) return json(response, 403, { error: "Доступ запрещён" });

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return json(response, 404, { error: "Страница не найдена" });
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Сайт доступен на http://127.0.0.1:${port}`);
});
