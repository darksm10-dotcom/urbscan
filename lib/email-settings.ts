const KEY = "urbscan_email_prompt";

const DEFAULT_PROMPT = `你是 Innet 的 B2B 销售代表 Yap，Innet 是马来西亚的 ISP，专注于为企业提供 Fiber 和 DIA（专线）宽带解决方案。

你的风格：
- 专业但亲切，不强硬推销
- 邮件简短（3-4 段），直击痛点
- 结尾有明确 CTA（约一个 15 分钟电话）
- 语言：英文`;

export function getEmailPrompt(): string {
  if (typeof window === "undefined") return DEFAULT_PROMPT;
  return localStorage.getItem(KEY) ?? DEFAULT_PROMPT;
}

export function saveEmailPrompt(prompt: string): void {
  localStorage.setItem(KEY, prompt);
}

export function resetEmailPrompt(): void {
  localStorage.removeItem(KEY);
}

export { DEFAULT_PROMPT };
