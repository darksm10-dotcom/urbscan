"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTheme } from "@/components/ThemeSwitcher";
import dynamic from "next/dynamic";
import { exportBackup, importBackup } from "@/lib/backup";
import { Building, SearchParams } from "@/types";
import { searchNearbyBuildings } from "@/lib/places";
import { pushHistory } from "@/lib/history";
import { getOverdueFollowUps, onContactsChanged } from "@/lib/contacts";
import { getTasks, onTasksChanged } from "@/lib/tasks";

const SearchPanel   = dynamic(() => import("@/components/SearchPanel"),   { ssr: false });
const ResultsList   = dynamic(() => import("@/components/ResultsList"),   { ssr: false });
const ContactsPanel = dynamic(() => import("@/components/ContactsPanel"), { ssr: false });
const NotesPanel    = dynamic(() => import("@/components/NotesPanel"),    { ssr: false });
const TodayPanel    = dynamic(() => import("@/components/TodayPanel"),    { ssr: false });

type AppTab = "today" | "scan" | "contacts" | "notes";

export default function Home() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [lastParams, setLastParams] = useState<SearchParams | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [overdueCount, setOverdueCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  useTheme();

  useEffect(() => {
    const update = () => setOverdueCount(getOverdueFollowUps().length);
    update();
    return onContactsChanged(update);
  }, []);

  useEffect(() => {
    const update = () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const pending = getTasks().filter((t) => t.date <= todayStr && !t.done).length;
      setTodayCount(pending + getOverdueFollowUps().length);
    };
    update();
    const unsubTasks = onTasksChanged(update);
    const unsubContacts = onContactsChanged(update);
    return () => { unsubTasks(); unsubContacts(); };
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
            { tab: "today",    label: "Today" },
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
              {tab === "today" && todayCount > 0 && (
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
                  {todayCount > 99 ? "99+" : todayCount}
                </span>
              )}
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
        {activeTab === "today" ? (
          <section style={{ flex: 1, display: "flex", minHeight: 0, overflow: "auto" }}>
            <TodayPanel onGoToContacts={() => setActiveTab("contacts")} />
          </section>
        ) : activeTab === "scan" ? (
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

      {/* Backup row */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "6px 16px", borderTop: "1px solid var(--border)", background: "var(--bg-card)", flexShrink: 0 }}>
        <button
          onClick={exportBackup}
          style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
        >
          ↓ 备份
        </button>
        <label style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>
          ↑ 恢复
          <input type="file" accept=".json" style={{ display: "none" }} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const count = await importBackup(file);
              alert(`已恢复 ${count} 项数据，页面将刷新`);
              window.location.reload();
            } catch (err) {
              alert(err instanceof Error ? err.message : "恢复失败");
            }
            e.target.value = "";
          }} />
        </label>
      </div>

      <style>{`
        @media (max-width: 768px) {
          main { flex-direction: column !important; }
          .sidebar { width: 100% !important; border-right: none !important; border-bottom: 1px solid var(--border); }
        }
      `}</style>
    </div>
  );
}
