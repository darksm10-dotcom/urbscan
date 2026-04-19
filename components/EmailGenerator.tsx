"use client";

import { useState } from "react";
import { EmailType, Language, EmailResult } from "@/lib/email-writer";

const DEFAULT_PRODUCT =
  process.env.NEXT_PUBLIC_DEFAULT_PRODUCT ??
  "Enterprise connectivity solutions";

type LoadingStage = "scraping" | "writing" | null;

export default function EmailGenerator() {
  const [url, setUrl] = useState("");
  const [emailType, setEmailType] = useState<EmailType>("cold");
  const [language, setLanguage] = useState<Language>("en");
  const [productDescription, setProductDescription] = useState(DEFAULT_PRODUCT);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>(null);
  const [result, setResult] = useState<EmailResult | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [editedSubject, setEditedSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (!url.trim()) return;
    setError(null);
    setResult(null);
    setLoadingStage("scraping");

    const timer = setTimeout(() => setLoadingStage("writing"), 3000);

    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), emailType, language, productDescription }),
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setResult(data as EmailResult);
      setEditedSubject(data.subject);
      setEditedBody(data.body);
    } catch {
      clearTimeout(timer);
      setError("Network error. Please try again.");
    } finally {
      setLoadingStage(null);
    }
  }

  function handleCopy() {
    const text = `Subject: ${editedSubject}\n\n${editedBody}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isLoading = loadingStage !== null;

  return (
    <div style={{ maxWidth: "720px", padding: "32px 40px" }}>
      <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
        Email Generator
      </div>
      <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "28px" }}>
        Paste a company URL to generate a personalized sales email
      </div>

      <div style={{ marginBottom: "16px" }}>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
          Company Website
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder="https://company.com"
          disabled={isLoading}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            fontSize: "14px",
            fontFamily: "var(--font-ui)",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
            Email Type
          </label>
          <select
            value={emailType}
            onChange={(e) => setEmailType(e.target.value as EmailType)}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-ui)",
            }}
          >
            <option value="cold">Cold Outreach</option>
            <option value="followup">Follow-up</option>
            <option value="proposal">Proposal</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
            Language
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-ui)",
            }}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
          Your Product / Service
        </label>
        <textarea
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          disabled={isLoading}
          rows={2}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            fontSize: "14px",
            fontFamily: "var(--font-ui)",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={isLoading || !url.trim()}
        style={{
          padding: "10px 28px",
          borderRadius: "8px",
          border: "none",
          background: isLoading || !url.trim() ? "var(--border)" : "var(--text-primary)",
          color: isLoading || !url.trim() ? "var(--text-secondary)" : "var(--bg-card)",
          fontSize: "14px",
          fontWeight: 600,
          cursor: isLoading || !url.trim() ? "not-allowed" : "pointer",
          fontFamily: "var(--font-ui)",
          marginBottom: "24px",
        }}
      >
        {isLoading
          ? loadingStage === "scraping" ? "Scraping website..." : "Writing email..."
          : "Generate Email"}
      </button>

      {error && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "8px",
          background: "rgba(255,80,80,0.1)",
          color: "var(--text-primary)",
          fontSize: "14px",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {result && (
        <div>
          <details style={{ marginBottom: "20px" }}>
            <summary style={{ fontSize: "13px", color: "var(--text-secondary)", cursor: "pointer", marginBottom: "8px" }}>
              Key insights used ({result.key_insights.length})
            </summary>
            <ul style={{ paddingLeft: "20px", margin: "8px 0 0 0" }}>
              {result.key_insights.map((insight, i) => (
                <li key={i} style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  {insight}
                </li>
              ))}
            </ul>
          </details>

          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Subject
            </label>
            <input
              type="text"
              value={editedSubject}
              onChange={(e) => setEditedSubject(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                fontSize: "14px",
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Body
            </label>
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={12}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text-primary)",
                fontSize: "14px",
                fontFamily: "var(--font-ui)",
                lineHeight: 1.6,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            onClick={handleCopy}
            style={{
              padding: "10px 24px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: copied ? "var(--bg-elevated)" : "transparent",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
            }}
          >
            {copied ? "Copied!" : "Copy Email"}
          </button>
        </div>
      )}
    </div>
  );
}
