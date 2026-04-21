import { ContactLog } from "@/types";
import { getEmailDrafts, addEmailDraft } from "@/lib/email-drafts";
import { getEmailPrompt } from "@/lib/email-settings";

export async function generateFollowUpDraft(
  c: ContactLog,
  signal?: AbortSignal
): Promise<void> {
  const allDrafts = getEmailDrafts();
  const sentDraft = allDrafts.find((d) => d.contactId === c.buildingId && d.status === "sent");
  const rolePrompt = getEmailPrompt();

  const res = await fetch("/api/generate-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buildingName: c.buildingName,
      buildingAddress: c.buildingAddress,
      recipientName: c.recipientName,
      rolePrompt: rolePrompt || undefined,
      websiteSummary: sentDraft?.websiteSummary || undefined,
      isFollowUp: true,
      previousSubject: sentDraft?.subject || undefined,
    }),
    signal,
  });

  if (!res.ok) throw new Error(`Generation failed (${res.status})`);
  const data = await res.json() as { subject: string; bodyText: string; bodyHtml: string };

  addEmailDraft({
    contactId: c.buildingId,
    buildingName: c.buildingName,
    buildingAddress: c.buildingAddress,
    website: sentDraft?.website,
    websiteSummary: sentDraft?.websiteSummary,
    recipientEmail: c.recipientEmail ?? sentDraft?.recipientEmail ?? "",
    recipientName: c.recipientName ?? sentDraft?.recipientName ?? "",
    ccEmails: sentDraft?.ccEmails,
    subject: data.subject,
    bodyText: data.bodyText,
    bodyHtml: data.bodyHtml,
    status: "draft",
  });
}
