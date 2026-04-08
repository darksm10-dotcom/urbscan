"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import SearchPanel from "@/components/SearchPanel";
import ResultsList from "@/components/ResultsList";
import dynamic from "next/dynamic";
import { Building, SearchParams } from "@/types";
import { searchNearbyBuildings } from "@/lib/places";
import { pushHistory } from "@/lib/history";
import { getOverdueFollowUps } from "@/lib/contacts";

const ContactsPanel = dynamic(() => import("@/components/ContactsPanel"), { ssr: false });

type AppTab = "scan" | "contacts";

export default function Home() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [lastParams, setLastParams] = useState<SearchParams | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("scan");
  const [overdueCount, setOverdueCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setOverdueCount(getOverdueFollowUps().length);
  }, [activeTab]);

  const handleSearch = useCallback(async (params: SearchParams) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSearched(true);
    setSelectedId(null);
    setLastParams(params);

    try {
      const results = await searchNearbyBuildings(params, controller.signal);
      setBuildings(results);
      params.locations.forEach((loc) => pushHistory({ address: loc.address, lat: loc.lat, lng: loc.lng }));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "查询失败，请重试");
      setBuildings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ borderBottom: "1px solid var(--border)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(180deg, rgba(212,160,60,0.04) 0%, transparent 100%)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: "26px", fontWeight: 800, letterSpacing: "0.1em", color: "var(--amber)", textTransform: "uppercase" }}>URBSCAN</span>
          <span style={{ fontSize: "12px", color: "var(--text-dim)", letterSpacing: "0.15em", textTransform: "uppercase" }}>B2B 线索引擎 v2.0</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: "2px" }}>
            {([
              { tab: "scan",     label: "◈ SCAN" },
              { tab: "contacts", label: "📋 CONTACTS" },
            ] as { tab: AppTab; label: string }[]).map(({ tab, label }) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ position: "relative", fontSize: "11px", padding: "5px 14px", border: `1px solid ${activeTab === tab ? "var(--amber)" : "var(--border)"}`, borderRadius: "3px", background: activeTab === tab ? "rgba(212,160,60,0.1)" : "transparent", color: activeTab === tab ? "var(--amber)" : "var(--text-dim)", cursor: "pointer", letterSpacing: "0.12em", fontFamily: "'JetBrains Mono', monospace", transition: "all 0.15s" }}
              >
                {label}
                {tab === "contacts" && overdueCount > 0 && (
                  <span style={{ position: "absolute", top: "-6px", right: "-6px", background: "#c07070", color: "#fff", fontSize: "9px", borderRadius: "50%", width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{overdueCount}</span>
                )}
              </button>
            ))}
          </div>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--green-bright)", boxShadow: "0 0 6px var(--green-bright)", animation: "scanPulse 2s ease-in-out infinite", display: "inline-block" }} />
          <span style={{ fontSize: "12px", color: "var(--green-bright)", letterSpacing: "0.1em" }}>ONLINE</span>
        </div>
      </header>

      <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, var(--amber-dim), transparent)", opacity: 0.3, flexShrink: 0 }} />

      <main style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {activeTab === "scan" ? (
          <>
            <aside style={{ width: "340px", flexShrink: 0, borderRight: "1px solid var(--border)", padding: "20px", background: "var(--bg-card)", overflowY: "auto" }} className="sidebar">
              <SearchPanel onSearch={handleSearch} loading={loading} />
            </aside>
            <section style={{ flex: 1, padding: "20px 24px", overflowY: "auto", minWidth: 0 }}>
              <ResultsList buildings={buildings} loading={loading} error={error} searched={searched} lastParams={lastParams} selectedId={selectedId} onSelectId={setSelectedId} />
            </section>
          </>
        ) : (
          <section style={{ flex: 1, padding: "24px 32px", overflowY: "auto", minWidth: 0, maxWidth: "860px" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "18px", fontWeight: 700, color: "var(--amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>Contact Log & Follow-ups</div>
              <div style={{ fontSize: "12px", color: "var(--text-dim)", letterSpacing: "0.08em" }}>Track outreach history and never miss a follow-up</div>
            </div>
            <ContactsPanel />
          </section>
        )}
      </main>

      <footer style={{ borderTop: "1px solid var(--border)", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.12em" }}>POWERED BY GOOGLE PLACES API (NEW)</span>
        <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.12em" }}>© 2026 URBSCAN INTELLIGENCE</span>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          main { flex-direction: column !important; }
          .sidebar { width: 100% !important; border-right: none !important; border-bottom: 1px solid var(--border); }
        }
      `}</style>
    </div>
  );
}
