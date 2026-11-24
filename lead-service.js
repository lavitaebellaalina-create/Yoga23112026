import nodemailer from "nodemailer";

const ownerEmail = "lavita.e.bella.alina@gmail.com";
const allowedSubjects = new Set([
  "Практика — Тазовое дно",
  "Практика — Здоровая спина",
  "Практика — Йога для беременных",
  "Практика — Йога в Ларнаке",
  "Онлайн клуб йоги",
  "Запрос ретрита",
  "Сертификат",
  "Practice — Pelvic floor",
  "Practice — Healthy back",
  "Practice — Prenatal yoga",
  "Practice — Yoga in Larnaca",
  "Online yoga club",
  "Retreat enquiry",
  "Gift certificate"
]);
const requests = new Map();

export class LeadSubmissionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isRateLimited(ip) {
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

export async function submitLead({ data, ip, origin, host }) {
  if (origin) {
    try {
      if (new URL(origin).host !== host) {
        throw new LeadSubmissionError(403, "Запрос отклонён");
      }
    } catch (error) {
      if (error instanceof LeadSubmissionError) throw error;
      throw new LeadSubmissionError(403, "Запрос отклонён");
    }
  }

  if (isRateLimited(ip || "unknown")) {
    throw new LeadSubmissionError(429, "Слишком много попыток. Повторите позже.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new LeadSubmissionError(400, "Некорректные данные");
  }
  if (String(data.website || "").trim()) {
    return { status: 200, body: { ok: true } };
  }

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const subject = String(data.subject || "").trim();
  if (name.length < 2 || name.length > 80) {
    throw new LeadSubmissionError(400, "Укажите имя");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    throw new LeadSubmissionError(400, "Проверьте email");
  }
  if (data.consent !== true) {
    throw new LeadSubmissionError(400, "Нужно согласие на обработку данных");
  }
  if (!allowedSubjects.has(subject)) {
    throw new LeadSubmissionError(400, "Выберите тему обращения");
  }

  const appPassword = process.env.GMAIL_APP_PASSWORD;
  if (!appPassword) {
    throw new LeadSubmissionError(503, "Форма временно не настроена. Попробуйте позже.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: ownerEmail,
      pass: appPassword.replace(/\s/g, "")
    }
  });

  await transporter.sendMail({
    from: { name: "Заявка с сайта yoga", address: ownerEmail },
    to: ownerEmail,
    replyTo: email,
    subject: `Новая заявка: ${subject}`,
    text: [
      "Новая заявка с сайта",
      "",
      `Имя: ${name}`,
      `Email: ${email}`,
      `Тема: ${subject}`,
      `Согласие на обработку данных: ${data.consent ? "да" : "нет"}`
    ].join("\n")
  });

  return { status: 201, body: { ok: true } };
}
