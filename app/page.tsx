"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ThemeSwitcher, { useTheme } from "@/components/ThemeSwitcher";
import dynamic from "next/dynamic";
import { Building, SearchParams } from "@/types";
import { searchNearbyBuildings } from "@/lib/places";
import { pushHistory } from "@/lib/history";
import { getOverdueFollowUps, onContactsChanged } from "@/lib/contacts";

const SearchPanel   = dynamic(() => import("@/components/SearchPanel"),   { ssr: false });
const ResultsList   = dynamic(() => import("@/components/ResultsList"),   { ssr: false });
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
  const { themeId, switchTheme } = useTheme();

  useEffect(() => {
    const update = () => setOverdueCount(getOverdueFollowUps().length);
    update();
    return onContactsChanged(update);
  }, []);

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
      <header style={{ position: "relative", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(180deg, var(--amber-glow) 0%, transparent 100%)", flexShrink: 0, overflow: "hidden" }}>
        {/* Radar sweep line */}
        <div className="radar-sweep" style={{ position: "absolute", top: 0, bottom: 0, width: "80px", background: "linear-gradient(90deg, transparent, var(--amber-glow), var(--cyan-glow), transparent)", animation: "radarSweep 6s ease-in-out infinite", pointerEvents: "none" }} />
        {/* Bottom accent line */}
        <div className="bottom-accent-line" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent 0%, var(--amber-dim) 30%, var(--cyan-dim) 70%, transparent 100%)", opacity: 0.4 }} />

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: "26px", fontWeight: 800, letterSpacing: "0.12em", color: "var(--amber)", textTransform: "uppercase", textShadow: "0 0 20px var(--amber-dim)" }}>URBSCAN</span>
            <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.2em", textTransform: "uppercase", borderLeft: "1px solid var(--border)", paddingLeft: "10px" }}>B2B INTEL v2.0</span>
          </div>
          {/* System indicators */}
          <div className="signal-bars" style={{ display: "flex", alignItems: "flex-end", gap: "2px", marginLeft: "4px" }}>
            {[0.35, 0.5, 0.7, 0.85, 1].map((h, i) => (
              <div key={i} style={{ width: "3px", height: `${6 + i * 3}px`, background: "var(--cyan)", opacity: h, borderRadius: "1px", animation: `signalGrow 0.4s ease ${i * 0.08}s both`, transformOrigin: "bottom" }} />
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: "2px" }}>
            {([
              { tab: "scan",     label: "◈ SCAN" },
              { tab: "contacts", label: "📋 CONTACTS" },
            ] as { tab: AppTab; label: string }[]).map(({ tab, label }) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ position: "relative", fontSize: "13px", padding: "5px 14px", border: `1px solid ${activeTab === tab ? "var(--amber)" : "var(--border)"}`, borderRadius: "3px", background: activeTab === tab ? "var(--amber-glow)" : "transparent", color: activeTab === tab ? "var(--amber)" : "var(--text-dim)", cursor: "pointer", letterSpacing: "0.12em", fontFamily: "var(--font-ui)", transition: "all 0.2s", boxShadow: activeTab === tab ? "0 0 12px var(--amber-glow)" : "none" }}
              >
                {label}
                {tab === "contacts" && overdueCount > 0 && (
                  <span style={{ position: "absolute", top: "-6px", right: "-6px", background: "#c07070", color: "#fff", fontSize: "9px", borderRadius: "50%", width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{overdueCount}</span>
                )}
              </button>
            ))}
          </div>
          {/* Theme switcher */}
          <ThemeSwitcher themeId={themeId} onSwitch={switchTheme} />
          {/* Online status */}
          <div className="sys-status" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--cyan)", boxShadow: "0 0 8px var(--cyan), 0 0 16px var(--cyan-dim)", animation: "scanPulse 2s ease-in-out infinite", display: "inline-block" }} />
            <span style={{ fontSize: "13px", color: "var(--cyan)", letterSpacing: "0.14em", textShadow: "0 0 10px var(--cyan-dim)" }}>SYS·ONLINE</span>
          </div>
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
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "20px", fontWeight: 700, color: "var(--amber)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>Contact Log & Follow-ups</div>
              <div style={{ fontSize: "13px", color: "var(--text-dim)", letterSpacing: "0.08em" }}>Track outreach history and never miss a follow-up</div>
            </div>
            <ContactsPanel />
          </section>
        )}
      </main>

      <footer style={{ position: "relative", borderTop: "1px solid var(--border)", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, var(--cyan-dim), var(--amber-dim), transparent)", opacity: 0.3 }} />
        <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.18em" }}>◈ GOOGLE PLACES API (NEW) · HUNTER.IO · APOLLO.IO</span>
        <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.15em" }}>URBSCAN INTELLIGENCE © 2026</span>
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
