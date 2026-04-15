import { ContactLog } from "@/types";

export interface NotionSyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

export interface NotionContactPayload {
  buildingId: string;
  buildingName: string;
  buildingAddress?: string;
  buildingPhone?: string;
  method: string;
  note: string;
  contactedAt: string;
  followUpAt?: string;
  followUpDone: boolean;
  pipelineStatus: string;
}

/**
 * Groups contacts by company (buildingId), picks the most recent contact log
 * per company, and merges in the pipeline status.
 */
export function buildNotionPayload(
  contacts: ContactLog[],
  pipeline: Record<string, { status: string; note: string }>
): NotionContactPayload[] {
  const byBuilding = new Map<string, ContactLog>();

  for (const c of contacts) {
    const existing = byBuilding.get(c.buildingId);
    if (!existing || c.contactedAt > existing.contactedAt) {
      byBuilding.set(c.buildingId, c);
    }
  }

  return Array.from(byBuilding.values()).map((c) => ({
    buildingId: c.buildingId,
    buildingName: c.buildingName,
    buildingAddress: c.buildingAddress,
    buildingPhone: c.buildingPhone,
    method: c.method,
    note: pipeline[c.buildingId]?.note || c.note || "",
    contactedAt: c.contactedAt,
    followUpAt: c.followUpAt,
    followUpDone: c.followUpDone,
    pipelineStatus: pipeline[c.buildingId]?.status ?? "new",
  }));
}

export async function syncToNotion(
  payload: NotionContactPayload[]
): Promise<NotionSyncResult> {
  const res = await fetch("/api/notion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<NotionSyncResult>;
}
