import { LeadStatus } from "@/types";

export const STATUS_META: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  new:       { label: "新线索", color: "var(--text-dim)",    bg: "transparent" },
  contacted: { label: "已联系", color: "var(--amber)",       bg: "rgba(212,160,60,0.08)" },
  following: { label: "跟进中", color: "var(--cyan)",        bg: "rgba(0,212,168,0.06)" },
  won:       { label: "成交",   color: "var(--green-bright)", bg: "rgba(90,138,74,0.08)" },
  lost:      { label: "放弃",   color: "#c07070",            bg: "rgba(180,60,60,0.08)" },
};
