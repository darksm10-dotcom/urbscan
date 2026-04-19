"use client";

import { useState, useEffect } from "react";
import { EmailType, Language, EmailResult } from "@/lib/email-writer";
import { loadEmailHistory, saveEmailRecord, markNotionSaved, deleteEmailRecord, EmailRecord } from "@/lib/email-history";

const DEFAULT_PRODUCT =
  process.env.NEXT_PUBLIC_DEFAULT_PRODUCT ??
  "Enterprise connectivity solutions";

const DEFAULT_SELLER_PERSONA = `你是InNET Technologies Sdn Bhd的资深B2B销售经理，拥有15年以上马来西亚电信与IT行业销售经验。你深入了解公司的所有产品、服务、差异化优势和客户案例，能够针对不同行业客户制定精准的销售策略。
公司背景：
InNET Technologies成立于2012年，从系统集成商（SI）起步，后拓展至电信领域。公司持有MCMC颁发的NSP和NFP牌照，是一家carrier-neutral的电信与IT一站式解决方案提供商。创始人Rick Ng带领团队完成超过300个项目，服务涵盖航空、金融、物流、酒店、房地产等多个行业。
核心产品与服务：
Connectivity Services — Carrier-neutral优势，可整合TM、TIME、NTT等多家运营商资源，为客户设计最优性价比方案
Dedicated Internet Access (DIA) — 面向需要稳定高速互联网的企业
Private Leased Line (Metro-E) — 多办公地点间的安全专线连接，承载数据、语音和视频
International Ethernet Private Line (IEPL) — 跨境点对点专线，支持可扩展带宽
Data Center Services — 位于KLCC和Cyberjaya，99.99% uptime保障
IT System Integration — 网络集成、项目管理、云计算
六大差异化卖点（核心武器）：
One Stop Centre (Telco + IT) — 带宽和IT系统集成一站搞定，客户不用找两家供应商
InTouch Support — 7×24小时优先技术支持，WhatsApp群直连网络工程师，不是打去call center排队
Auto Bandwidth Monitoring — 自动监控带宽，95%拥塞持续5分钟即触发邮件告警，主动发现问题
Bandwidth On Demand — 支持burstable带宽，按需临时升级，灵活应对业务峰值
Hybrid Solution — 光纤+无线/宽带备份，实现近99.99% uptime
Personalized Account Manager — 一个客户经理对接所有服务，不用被踢来踢去
标杆客户：Qatar Airways, British Airways, CIMB, Alibaba, Lazada, Pos Malaysia, Mandarin Oriental, Al Jazeera等`;

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
  const [sellerPersona, setSellerPersona] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sellerPersona") ?? DEFAULT_SELLER_PERSONA;
    }
    return DEFAULT_SELLER_PERSONA;
  });
  const [showPersona, setShowPersona] = useState(false);
  const [history, setHistory] = useState<EmailRecord[]>([]);
  const [savingNotion, setSavingNotion] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadEmailHistory());
  }, []);

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
        body: JSON.stringify({ url: url.trim(), emailType, language, productDescription, sellerPersona }),
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
      const record = saveEmailRecord({
        url: url.trim(),
        companyName: data.key_insights?.[0] ?? new URL(url.startsWith("http") ? url : `https://${url}`).hostname,
        subject: data.subject,
        body: data.body,
        emailType,
        language,
      });
      setHistory(prev => [record, ...prev]);
    } catch {
      clearTimeout(timer);
      setError("Network error. Please try again.");
    } finally {
      setLoadingStage(null);
    }
  }

  function handlePersonaChange(value: string) {
    setSellerPersona(value);
    localStorage.setItem("sellerPersona", value);
  }

  function handleCopy() {
    const text = `Subject: ${editedSubject}\n\n${editedBody}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isLoading = loadingStage !== null;

  async function saveToNotion(record: EmailRecord) {
    setSavingNotion(record.id);
    try {
      const res = await fetch("/api/notion/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: record.companyName,
          subject: record.subject,
          url: record.url,
          emailType: record.emailType,
          language: record.language,
          emailBody: record.body,
          createdAt: record.createdAt,
        }),
      });
      if (res.ok) {
        markNotionSaved(record.id);
        setHistory(loadEmailHistory());
      }
    } finally {
      setSavingNotion(null);
    }
  }

  function handleDeleteRecord(id: string) {
    deleteEmailRecord(id);
    setHistory(loadEmailHistory());
  }

  return (
    <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
      {/* Left: form */}
      <div style={{ maxWidth: "720px", width: "100%", padding: "32px 40px", overflowY: "auto" }}>
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

      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={() => setShowPersona(!showPersona)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "13px",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
            textDecoration: "underline",
          }}
        >
          {showPersona ? "Hide seller profile ▲" : "Edit seller profile ▼"}
        </button>
        {showPersona && (
          <textarea
            value={sellerPersona}
            onChange={(e) => handlePersonaChange(e.target.value)}
            rows={8}
            style={{
              marginTop: "8px",
              width: "100%",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontFamily: "var(--font-ui)",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        )}
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

      {/* Right: history */}
      {history.length > 0 && (
        <div style={{
          width: "320px",
          flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          overflowY: "auto",
          padding: "32px 20px",
        }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "16px" }}>
            History ({history.length})
          </div>
          {history.map((record) => (
            <div key={record.id} style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              marginBottom: "10px",
              background: "var(--bg-card)",
            }}>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                {new Date(record.createdAt).toLocaleDateString()} · {record.emailType}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px", wordBreak: "break-word" }}>
                {record.subject}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                {record.url}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => {
                    setEditedSubject(record.subject);
                    setEditedBody(record.body);
                    setResult({ subject: record.subject, body: record.body, key_insights: [] });
                  }}
                  style={{
                    fontSize: "11px", padding: "4px 10px", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-ui)",
                  }}
                >
                  View
                </button>
                {!record.notionSaved ? (
                  <button
                    onClick={() => saveToNotion(record)}
                    disabled={savingNotion === record.id}
                    style={{
                      fontSize: "11px", padding: "4px 10px", borderRadius: "6px",
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-ui)",
                    }}
                  >
                    {savingNotion === record.id ? "Saving..." : "→ Notion"}
                  </button>
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)", padding: "4px 6px" }}>✓ Notion</span>
                )}
                <button
                  onClick={() => handleDeleteRecord(record.id)}
                  style={{
                    fontSize: "11px", padding: "4px 8px", borderRadius: "6px",
                    border: "none", background: "transparent",
                    color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-ui)",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
