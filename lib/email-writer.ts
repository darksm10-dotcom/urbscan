import OpenAI from "openai";

export type EmailType = "cold" | "followup" | "proposal";
export type Language = "en" | "zh";

export interface EmailResult {
  subject: string;
  body: string;
  key_insights: string[];
}

export interface GenerateEmailParams {
  companyContent: string;
  emailType: EmailType;
  language: Language;
  productDescription: string;
  sellerPersona?: string;
}

const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  cold: "cold outreach (first contact, introduce yourself and your product)",
  followup: "follow-up (you've had previous contact, reference that and add value)",
  proposal: "proposal (you've analyzed their needs, present your solution directly)",
};

const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
};

export async function generateEmail(params: GenerateEmailParams): Promise<EmailResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });

  const { companyContent, emailType, language, productDescription, sellerPersona } = params;

  const prompt = `You are a B2B sales email writer. Write a concise, personalized sales email.

SELLER PROFILE:
${sellerPersona ?? ""}

COMPANY WEBSITE CONTENT:
${companyContent}

TASK:
- Email type: ${EMAIL_TYPE_LABELS[emailType]}
- Language: ${LANGUAGE_LABELS[language]}
- Your product/service: ${productDescription}

RULES:
- Subject line: specific and compelling, under 60 chars
- Body: 3-4 short paragraphs, no generic filler
- Reference specific details from the company content
- Do NOT use placeholder text like [Name] or [Company]
- Use the company name if found in the content

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "subject": "...",
  "body": "...",
  "key_insights": ["insight 1", "insight 2", "insight 3"]
}`;

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 1000,
  });

  const raw = response.choices[0]?.message?.content ?? "";

  try {
    return JSON.parse(raw) as EmailResult;
  } catch {
    throw new Error(`DeepSeek returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}
