const SCRAPE_PATHS = ["/", "/about", "/about-us", "/products", "/services"];
const FETCH_TIMEOUT_MS = 8000;
const MAX_CHARS = 6000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractMeta(html: string): string {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "";
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  return [title, desc].filter(Boolean).join(" | ");
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const html = await res.text();
    const meta = extractMeta(html);
    const body = stripHtml(html);
    return [meta, body].filter(Boolean).join("\n");
  } catch {
    clearTimeout(timer);
    return "";
  }
}

export async function scrapeCompany(baseUrl: string): Promise<string> {
  const origin = new URL(baseUrl).origin;
  const tried = new Set<string>();
  const parts: string[] = [];

  for (const path of SCRAPE_PATHS) {
    const url = origin + path;
    if (tried.has(url)) continue;
    tried.add(url);
    const text = await fetchPage(url);
    if (text) parts.push(text);
    if (parts.length >= 3) break;
  }

  return parts.join("\n\n").slice(0, MAX_CHARS);
}
