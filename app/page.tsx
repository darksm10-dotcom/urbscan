"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "@/components/ThemeSwitcher";
import dynamic from "next/dynamic";
import { Building, SearchParams } from "@/types";
import { searchNearbyBuildings } from "@/lib/places";
import { pushHistory } from "@/lib/history";
import { getOverdueFollowUps, onContactsChanged } from "@/lib/contacts";

const SearchPanel   = dynamic(() => import("@/components/SearchPanel"),   { ssr: false });
const ResultsList   = dynamic(() => import("@/components/ResultsList"),   { ssr: false });
const ContactsPanel = dynamic(() => import("@/components/ContactsPanel"), { ssr: false });
const NotesPanel    = dynamic(() => import("@/components/NotesPanel"),    { ssr: false });

type AppTab = "scan" | "contacts" | "notes";

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
  useTheme();

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
      {/* ── Header ─────────────────────────────────────── */}
      <header style={{
        flexShrink: 0,
        padding: "0 24px",
        height: "64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#000000",
        borderBottom: "1px solid var(--border)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Spotify-style icon */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--amber)">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
          <span style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "18px",
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "var(--text-primary)",
          }}>
            Urbscan
          </span>
          <span style={{
            fontSize: "11px",
            color: "var(--text-dim)",
            background: "var(--bg-elevated)",
            padding: "2px 8px",
            borderRadius: "4px",
            letterSpacing: "0.04em",
          }}>
            B2B INTEL
          </span>
        </div>

        {/* Nav tabs */}
        <div style={{ display: "flex", gap: "4px" }}>
          {([
            { tab: "scan",     label: "Scan" },
            { tab: "contacts", label: "Contacts" },
            { tab: "notes",    label: "Notes" },
          ] as { tab: AppTab; label: string }[]).map(({ tab, label }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                position: "relative",
                fontSize: "14px",
                fontWeight: activeTab === tab ? 700 : 400,
                padding: "8px 20px",
                borderRadius: "500px",
                border: "none",
                background: activeTab === tab ? "var(--bg-elevated)" : "transparent",
                color: activeTab === tab ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                transition: "all 0.15s ease",
              }}
            >
              {label}
              {tab === "contacts" && overdueCount > 0 && (
                <span style={{
                  position: "absolute",
                  top: "4px",
                  right: "8px",
                  background: "var(--amber)",
                  color: "#000",
                  fontSize: "9px",
                  borderRadius: "50%",
                  width: "16px",
                  height: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                }}>
                  {overdueCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Right — empty, reserved for future controls */}
        <div style={{ width: "80px" }} />
      </header>

      {/* ── Main layout ────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {activeTab === "scan" ? (
          <>
            <aside
              className="sidebar"
              style={{
                width: "320px",
                flexShrink: 0,
                borderRight: "1px solid var(--border)",
                padding: "20px 16px",
                background: "var(--bg-card)",
                overflowY: "auto",
              }}
            >
              <SearchPanel onSearch={handleSearch} loading={loading} />
            </aside>
            <section style={{
              flex: 1,
              padding: "20px 24px",
              overflowY: "auto",
              overflowX: "hidden",
              minWidth: 0,
            }}>
              <ResultsList
                buildings={buildings}
                loading={loading}
                error={error}
                searched={searched}
                lastParams={lastParams}
                selectedId={selectedId}
                onSelectId={setSelectedId}
              />
            </section>
          </>
        ) : activeTab === "contacts" ? (
          <section style={{
            flex: 1,
            padding: "32px 40px",
            overflowY: "auto",
            minWidth: 0,
            maxWidth: "900px",
          }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                Contacts
              </div>
              <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                Manage your outreach pipeline and follow-ups
              </div>
            </div>
            <ContactsPanel />
          </section>
        ) : (
          <section style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
            <NotesPanel />
          </section>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer style={{
        flexShrink: 0,
        height: "40px",
        padding: "0 24px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#000000",
      }}>
        <span style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.04em" }}>
          Google Places API · Hunter.io · Apollo.io
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
          Urbscan © 2026
        </span>
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
