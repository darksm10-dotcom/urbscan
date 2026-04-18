export interface WaTemplate {
  id: string;
  label: string;
  body: string;
}

export const TEMPLATES_KEY = "urbscan_wa_templates";
export const LAST_TEMPLATE_KEY = "urbscan_wa_last_template";

export const DEFAULT_TEMPLATES: WaTemplate[] = [
  {
    id: "intro",
    label: "Initial Outreach",
    body: "Hi, I'm {name} from {company}.\n\nI came across {lead} and believe we could offer something valuable for your business.\n\nWould you be open to a quick chat? 😊",
  },
  {
    id: "followup",
    label: "Follow Up",
    body: "Hi there,\n\nThis is {name} from {company}. I reached out to {lead} recently and wanted to follow up.\n\nWould you have a moment to connect this week? 🙏",
  },
  {
    id: "pitch",
    label: "Product Pitch",
    body: "Hi {lead},\n\nI'm {name} from {company}. We help businesses like yours with [your service/product].\n\nI'd love to share more — would you be interested? 📋",
  },
  {
    id: "meeting",
    label: "Meeting Request",
    body: "Hi, I'm {name} from {company}.\n\nI'd like to arrange a brief 15–20 min visit with {lead}'s team.\n\nWould this week or next work for you?",
  },
];

export function loadTemplates(): WaTemplate[] {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES;
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw) as WaTemplate[];
    return parsed.length > 0 ? parsed : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export function persistTemplates(templates: WaTemplate[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export function loadLastTemplateId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(LAST_TEMPLATE_KEY) ?? "";
}

export function saveLastTemplateId(id: string): void {
  localStorage.setItem(LAST_TEMPLATE_KEY, id);
}

export function loadPhoneTemplateId(phoneDigits: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`urbscan_wa_tmpl_${phoneDigits}`) ?? "";
}

export function savePhoneTemplateId(phoneDigits: string, id: string): void {
  localStorage.setItem(`urbscan_wa_tmpl_${phoneDigits}`, id);
}

export function interpolateTemplate(body: string, lead: string, name: string, company: string): string {
  return body
    .replace(/\{lead\}/g, lead || "[Lead Company]")
    .replace(/\{name\}/g, name || "[Your Name]")
    .replace(/\{company\}/g, company || "[Your Company]");
}
