import { LeadSubmissionError, submitLead } from "../lead-service.js";

function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  const { body } = request;
  if (body !== undefined) {
    if (typeof body === "string") return JSON.parse(body);
    if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8"));
    return body;
  }

  let rawBody = "";
  for await (const chunk of request) {
    rawBody += chunk;
    if (Buffer.byteLength(rawBody) > 16_384) {
      throw new LeadSubmissionError(413, "Слишком много данных");
    }
  }
  return JSON.parse(rawBody);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Метод не поддерживается" });
  }

  const host = request.headers.host || "";
  const forwardedFor = request.headers["x-forwarded-for"];
  const ip = String(forwardedFor || request.socket.remoteAddress || "unknown").split(",")[0].trim();

  try {
    const result = await submitLead({
      data: await readBody(request),
      ip,
      origin: request.headers.origin,
      host
    });
    return json(response, result.status, result.body);
  } catch (error) {
    if (error instanceof LeadSubmissionError) {
      return json(response, error.status, { error: error.message });
    }
    if (error instanceof SyntaxError) {
      return json(response, 400, { error: "Некорректные данные" });
    }
    console.error("Lead email delivery failed", error);
    return json(response, 502, { error: "Не удалось отправить заявку. Попробуйте позже." });
  }
}
