"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Building, HunterContact, SearchParams } from "@/types";
import { optimizeRoute, totalRouteDistance } from "@/lib/route";
import { getVisited, toggleVisited } from "@/lib/visited";

const BuildingMap = dynamic(() => import("./BuildingMap"), { ssr: false });

interface ResultsListProps {
  buildings: Building[];
  loading: boolean;
  error: string | null;
  searched: boolean;
  lastParams: SearchParams | null;
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
}

type SortMode = "score" | "distance" | "type" | "route";

function formatDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(2)}km`;
}

function formatTotalDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "#7ab86a" : score >= 40 ? "var(--amber)" : "var(--text-dim)";
  const label = score >= 70 ? "HIGH" : score >= 40 ? "MED" : "LOW";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color, fontWeight: 600 }}>
        {score}
      </div>
      <span style={{ fontSize: "9px", color, letterSpacing: "0.1em" }}>{label}</span>
    </div>
  );
}

function StarRating({ rating }: { rating?: number }) {
  if (!rating) return <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>—</span>;
  const full = Math.floor(rating);
  return (
    <span style={{ fontSize: "11px", color: "var(--amber)", letterSpacing: "-1px" }}>
      {"★".repeat(full)}{"☆".repeat(5 - full)}
      <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "4px", letterSpacing: "normal" }}>{rating.toFixed(1)}</span>
    </span>
  );
}

function exportCSV(buildings: Building[]) {
  const header = "序号,企业名称,地址,类型,线索评分,Google评分,评论数,电话,网站,距离(m),纬度,经度\n";
  const rows = buildings.map((b, i) =>
    `${i + 1},"${b.name}","${b.address}","${b.type === "office" ? "写字楼" : "住宅"}",${b.score},${b.rating ?? ""},${b.reviewCount ?? ""},"${b.phone ?? ""}","${b.website ?? ""}",${b.distance},${b.lat},${b.lng}`
  ).join("\n");
  const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `urbscan-b2b-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function gmapsLink(b: Building): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name + " " + b.address)}`;
}

async function fetchContacts(website: string): Promise<HunterContact[]> {
  const res = await fetch("/api/hunter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ website }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "查询失败");
  return data.contacts as HunterContact[];
}

function ContactCard({ c }: { c: HunterContact }) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || null;
  const seniority: Record<string, string> = {
    senior: "高级", junior: "初级", executive: "高管", director: "总监", manager: "经理",
  };
  return (
    <div style={{
      padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "3px",
      background: "var(--bg)", marginBottom: "6px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
        <div>
          {name && (
            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500, marginBottom: "2px" }}>{name}</div>
          )}
          {c.position && (
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
              {c.position}
              {c.seniority && <span style={{ color: "var(--text-dim)", marginLeft: "6px" }}>· {seniority[c.seniority] ?? c.seniority}</span>}
            </div>
          )}
          {c.department && !c.position && (
            <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{c.department}</div>
          )}
        </div>
        <div style={{
          fontSize: "10px", padding: "2px 6px", borderRadius: "2px",
          border: `1px solid ${c.confidence >= 70 ? "rgba(90,138,74,0.4)" : c.confidence >= 40 ? "rgba(212,160,60,0.3)" : "var(--border)"}`,
          color: c.confidence >= 70 ? "var(--green-bright)" : c.confidence >= 40 ? "var(--amber)" : "var(--text-dim)",
          flexShrink: 0, letterSpacing: "0.08em",
        }}>
          {c.confidence}%
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <a href={`mailto:${c.email}`}
          style={{ fontSize: "12px", color: "var(--amber)", textDecoration: "none", letterSpacing: "0.02em" }}
        >{c.email}</a>
        <button
          onClick={() => navigator.clipboard.writeText(c.email)}
          style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "2px", padding: "1px 6px", color: "var(--text-dim)", fontSize: "10px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all 0.15s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--amber)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--amber)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
        >复制</button>
        {c.phone && (
          <a href={`tel:${c.phone}`} style={{ fontSize: "11px", color: "var(--text-secondary)", textDecoration: "none" }}>{c.phone}</a>
        )}
        {c.linkedin && (
          <a href={c.linkedin} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: "11px", color: "var(--text-dim)", textDecoration: "none", letterSpacing: "0.06em", transition: "color 0.15s" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--amber)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text-dim)")}
          >in LinkedIn</a>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", gap: "12px" }}>
      <div style={{ fontSize: "40px", color: "var(--text-dim)", fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>◈</div>
      <div style={{ fontSize: "13px", color: "var(--text-secondary)", letterSpacing: "0.15em", textTransform: "uppercase" }}>{message}</div>
      {sub && <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>{sub}</div>}
    </div>
  );
}

export default function ResultsList({ buildings, loading, error, searched, lastParams, selectedId, onSelectId }: ResultsListProps) {
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visited, setVisited] = useState<Set<string>>(() => getVisited());
  const [showVisited, setShowVisited] = useState(true);
  // Hunter.io state: map of placeId -> contacts or loading/error state
  const [hunterData, setHunterData] = useState<Record<string, { loading: boolean; contacts?: HunterContact[]; error?: string }>>({});

  async function handleHunterLookup(b: Building) {
    if (!b.website || hunterData[b.id]) return;
    setHunterData((prev) => ({ ...prev, [b.id]: { loading: true } }));
    try {
      const contacts = await fetchContacts(b.website);
      setHunterData((prev) => ({ ...prev, [b.id]: { loading: false, contacts } }));
    } catch (err) {
      setHunterData((prev) => ({ ...prev, [b.id]: { loading: false, error: err instanceof Error ? err.message : "查询失败" } }));
    }
  }

  const primaryCenter = lastParams?.locations[0] ?? null;

  const sorted = useMemo(() => {
    let list = showVisited ? buildings : buildings.filter((b) => !visited.has(b.id));
    switch (sortMode) {
      case "score":    return [...list].sort((a, b) => b.score - a.score);
      case "distance": return [...list].sort((a, b) => a.distance - b.distance);
      case "type":     return [...list].sort((a, b) => a.type.localeCompare(b.type) || a.distance - b.distance);
      case "route":    return primaryCenter ? optimizeRoute([...list], primaryCenter) : list;
      default:         return list;
    }
  }, [buildings, sortMode, visited, showVisited, primaryCenter]);

  const routeTotal = useMemo(() => {
    if (sortMode !== "route" || !primaryCenter || sorted.length === 0) return null;
    return totalRouteDistance(sorted, primaryCenter);
  }, [sorted, sortMode, primaryCenter]);

  const visitedCount = buildings.filter((b) => visited.has(b.id)).length;
  const highLeads = buildings.filter((b) => b.score >= 70).length;

  function handleToggleVisited(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    toggleVisited(id);
    setVisited(getVisited());
  }

  function toggleRow(id: string) {
    setExpandedId(expandedId === id ? null : id);
    onSelectId(id === selectedId ? null : id);
  }

  if (loading) {
    return (
      <div style={{ animation: "fadeSlideIn 0.3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", padding: "10px 16px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg-card)" }}>
          <span style={{ animation: "spinnerRotate 1s linear infinite", display: "inline-block", color: "var(--amber)", fontSize: "14px" }}>◌</span>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)", letterSpacing: "0.08em" }}>正在并行扫描 B2B 线索...</span>
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ height: "60px", marginBottom: "4px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "3px", opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    );
  }

  if (error) return (
    <div style={{ padding: "16px 20px", border: "1px solid rgba(180,60,60,0.3)", borderRadius: "3px", background: "rgba(140,40,40,0.06)", color: "#c07070", fontSize: "13px", animation: "fadeSlideIn 0.3s ease" }}>
      <span style={{ color: "#b85050", marginRight: "8px" }}>✕ ERROR</span>{error}
    </div>
  );

  if (!searched) return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg-card)", animation: "fadeSlideIn 0.4s ease" }}>
      <EmptyState message="等待扫描指令" sub="在左侧选择行业和地点，开始搜索 B2B 线索" />
    </div>
  );

  if (buildings.length === 0) return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg-card)", animation: "fadeSlideIn 0.3s ease" }}>
      <EmptyState message="无结果" sub="尝试扩大范围或切换行业关键词" />
    </div>
  );

  return (
    <div style={{ animation: "fadeSlideIn 0.35s ease" }}>

      {/* Map */}
      {primaryCenter && (
        <div style={{ marginBottom: "16px" }}>
          <BuildingMap buildings={sorted} center={primaryCenter} selectedId={selectedId} onSelectId={onSelectId} />
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "14px" }}>
        {[
          { label: "线索总数", value: buildings.length, unit: "条" },
          { label: "高价值", value: highLeads, unit: "条", accent: true },
          { label: "已拜访", value: visitedCount, unit: "条" },
          { label: "未拜访", value: buildings.length - visitedCount, unit: "条" },
        ].map((s) => (
          <div key={s.label} style={{ padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "3px", background: "var(--bg-card)" }}>
            <div style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontSize: "22px", color: s.accent ? "var(--green-bright)" : "var(--amber)", lineHeight: 1 }}>
              {s.value}<span style={{ fontSize: "11px", color: "var(--text-dim)", marginLeft: "3px" }}>{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", gap: "8px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.15em", marginRight: "4px" }}>排序</span>
          {([
            { mode: "score", label: "评分" },
            { mode: "distance", label: "距离" },
            { mode: "type", label: "类型" },
            { mode: "route", label: "路线" },
          ] as { mode: SortMode; label: string }[]).map(({ mode, label: lbl }) => (
            <button key={mode} onClick={() => setSortMode(mode)}
              style={{
                background: sortMode === mode ? "rgba(212,160,60,0.12)" : "transparent",
                border: `1px solid ${sortMode === mode ? "var(--amber)" : "var(--border)"}`,
                borderRadius: "3px", padding: "3px 10px",
                color: sortMode === mode ? "var(--amber)" : "var(--text-secondary)",
                fontSize: "11px", letterSpacing: "0.08em", cursor: "pointer",
                transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace",
              }}
            >{lbl}</button>
          ))}

          <button onClick={() => setShowVisited(!showVisited)}
            style={{
              background: !showVisited ? "rgba(180,60,60,0.08)" : "transparent",
              border: `1px solid ${!showVisited ? "rgba(180,60,60,0.4)" : "var(--border)"}`,
              borderRadius: "3px", padding: "3px 10px",
              color: !showVisited ? "#c07070" : "var(--text-secondary)",
              fontSize: "11px", letterSpacing: "0.08em", cursor: "pointer",
              transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace",
            }}
          >{showVisited ? "含已拜访" : "隐藏已拜访"}</button>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          {routeTotal !== null && (
            <span style={{ fontSize: "11px", color: "var(--amber-dim)", alignSelf: "center", letterSpacing: "0.05em" }}>
              总路程 {formatTotalDistance(routeTotal)}
            </span>
          )}
          <button onClick={() => exportCSV(sorted)}
            style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "3px", padding: "4px 12px", color: "var(--text-secondary)", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--amber)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--amber)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
          >↓ CSV</button>
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 80px 60px 60px", gap: "0 8px", padding: "6px 14px", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "rgba(212,160,60,0.03)", marginBottom: "2px" }}>
        {["#", "企业名称 / 地址", "评分", "评级", "距离"].map((h) => (
          <div key={h} style={{ fontSize: "10px", color: "var(--text-dim)", letterSpacing: "0.18em", textTransform: "uppercase" }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div>
        {sorted.map((b, i) => {
          const isExpanded = expandedId === b.id;
          const isSelected = selectedId === b.id;
          const isVisited = visited.has(b.id);
          return (
            <div key={b.id} style={{ animation: `rowReveal 0.3s ease ${Math.min(i * 0.03, 0.4)}s both`, opacity: isVisited ? 0.5 : 1 }}>
              <div
                onClick={() => toggleRow(b.id)}
                style={{
                  display: "grid", gridTemplateColumns: "36px 1fr 80px 60px 60px",
                  gap: "0 8px", padding: "10px 14px",
                  borderBottom: isExpanded ? "none" : "1px solid rgba(212,160,60,0.06)",
                  background: isSelected ? "var(--amber-glow)" : i % 2 === 0 ? "transparent" : "rgba(212,160,60,0.01)",
                  cursor: "pointer", transition: "background 0.15s",
                  borderLeft: isSelected ? "2px solid var(--amber)" : isVisited ? "2px solid rgba(90,138,74,0.4)" : "2px solid transparent",
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(212,160,60,0.04)"; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = i % 2 === 0 ? "transparent" : "rgba(212,160,60,0.01)"; }}
              >
                {/* Index / route number */}
                <div style={{ fontSize: "12px", color: "var(--text-dim)", alignSelf: "center", fontWeight: 300 }}>
                  {sortMode === "route" ? (
                    <span style={{ color: "var(--amber)", fontSize: "13px", fontWeight: 600 }}>{i + 1}</span>
                  ) : String(i + 1).padStart(2, "0")}
                </div>

                {/* Name + address */}
                <div style={{ minWidth: 0, alignSelf: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                    <span style={{ fontSize: "13px", color: isVisited ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      {b.name}
                    </span>
                    {isVisited && <span style={{ fontSize: "9px", color: "var(--green-bright)", letterSpacing: "0.1em", flexShrink: 0 }}>✓ 已拜访</span>}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {b.address}
                  </div>
                </div>

                {/* Score */}
                <div style={{ alignSelf: "center" }}>
                  <ScoreBadge score={b.score} />
                </div>

                {/* Rating */}
                <div style={{ alignSelf: "center" }}>
                  <StarRating rating={b.rating} />
                  {b.reviewCount ? (
                    <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>{b.reviewCount}条</div>
                  ) : null}
                </div>

                {/* Distance */}
                <div style={{ alignSelf: "center", textAlign: "right" }}>
                  <div style={{ fontSize: "12px", color: "var(--amber-dim)", marginBottom: "3px" }}>{formatDistance(b.distance)}</div>
                  <div style={{ height: "2px", background: "var(--bg-elevated)", borderRadius: "1px" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.round((b.distance / (lastParams?.radius ?? 5000)) * 100))}%`, background: "var(--amber-dim)", borderRadius: "1px" }} />
                  </div>
                </div>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ padding: "12px 14px 14px 50px", borderBottom: "1px solid rgba(212,160,60,0.08)", background: "rgba(212,160,60,0.03)", animation: "fadeSlideIn 0.2s ease" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Contact info row */}
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
                    {b.phone ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.08em" }}>☎</span>
                        <a href={`tel:${b.phone}`}
                          style={{ fontSize: "13px", color: "var(--amber)", textDecoration: "none", letterSpacing: "0.04em", fontWeight: 500 }}
                        >{b.phone}</a>
                        <button
                          onClick={() => navigator.clipboard.writeText(b.phone!)}
                          title="复制号码"
                          style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "2px", padding: "1px 6px", color: "var(--text-dim)", fontSize: "10px", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--amber)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--amber)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
                        >复制</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--text-dim)", letterSpacing: "0.06em" }}>☎ 无电话</span>
                    )}

                    {b.website && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>⊕</span>
                        <a href={b.website} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: "12px", color: "var(--text-secondary)", textDecoration: "none", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", letterSpacing: "0.02em" }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--amber)")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text-secondary)")}
                        >{b.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>
                      </div>
                    )}
                  </div>

                  {/* Meta + actions row */}
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                      <span style={{ color: "var(--text-secondary)", marginRight: "5px" }}>距离</span>{b.distance}m
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                      <span style={{ color: "var(--text-secondary)", marginRight: "5px" }}>坐标</span>{b.lat.toFixed(4)}, {b.lng.toFixed(4)}
                    </span>
                    <button
                      onClick={(e) => handleToggleVisited(e, b.id)}
                      style={{ fontSize: "11px", background: isVisited ? "rgba(90,138,74,0.1)" : "transparent", border: `1px solid ${isVisited ? "rgba(90,138,74,0.4)" : "var(--border)"}`, borderRadius: "2px", padding: "2px 10px", color: isVisited ? "var(--green-bright)" : "var(--text-secondary)", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
                    >{isVisited ? "✓ 取消拜访" : "标记已拜访"}</button>
                    <a href={gmapsLink(b)} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: "11px", color: "var(--amber)", border: "1px solid var(--border-bright)", borderRadius: "2px", padding: "2px 10px", textDecoration: "none" }}
                    >↗ Google Maps</a>
                    {b.website && !hunterData[b.id] && (
                      <button
                        onClick={() => handleHunterLookup(b)}
                        style={{ fontSize: "11px", background: "rgba(212,160,60,0.08)", border: "1px solid var(--amber)", borderRadius: "2px", padding: "2px 10px", color: "var(--amber)", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(212,160,60,0.16)")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(212,160,60,0.08)")}
                      >⬡ 查找联系人</button>
                    )}
                  </div>

                  {/* Hunter.io results */}
                  {hunterData[b.id] && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "8px" }}>
                        ◈ 联系人（via Hunter.io）
                      </div>
                      {hunterData[b.id].loading && (
                        <div style={{ fontSize: "12px", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ animation: "spinnerRotate 1s linear infinite", display: "inline-block" }}>◌</span>
                          正在查找...
                        </div>
                      )}
                      {hunterData[b.id].error && (
                        <div style={{ fontSize: "12px", color: "#b85050" }}>✕ {hunterData[b.id].error}</div>
                      )}
                      {hunterData[b.id].contacts?.length === 0 && (
                        <div style={{ fontSize: "12px", color: "var(--text-dim)" }}>该域名暂无公开联系人数据</div>
                      )}
                      {hunterData[b.id].contacts?.map((c) => (
                        <ContactCard key={c.email} c={c} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "12px", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.12em" }}>
          显示 {sorted.length} / {buildings.length} 条线索
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.12em" }}>
          {sortMode === "route" ? "OPTIMIZED ROUTE" : `SORTED BY ${sortMode.toUpperCase()}`}
        </span>
      </div>
    </div>
  );
}
