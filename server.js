import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LeadSubmissionError, submitLead } from "./lead-service.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);

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

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 16_384) {
      throw new LeadSubmissionError(413, "Слишком много данных");
    }
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
    try {
      const data = await readJson(request);
      const forwardedFor = request.headers["x-forwarded-for"];
      const ip = String(forwardedFor || request.socket.remoteAddress || "unknown").split(",")[0].trim();
      const result = await submitLead({
        data,
        ip,
        origin: request.headers.origin,
        host
      });
      return json(response, result.status, result.body);
    } catch (error) {
      if (error instanceof LeadSubmissionError) {
        return json(response, error.status, { error: error.message });
      }
      if (error instanceof SyntaxError) return json(response, 400, { error: "Некорректные данные" });
      console.error("Lead email delivery failed", error);
      return json(response, 502, { error: "Не удалось отправить заявку. Попробуйте позже." });
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
