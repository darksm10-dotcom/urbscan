"use client";

import { useState, useEffect } from "react";
import { Industry, SearchLocation, SearchParams } from "@/types";
import { geocodeAddress } from "@/lib/places";
import { getHistory, HistoryEntry } from "@/lib/history";

interface SearchPanelProps {
  onSearch: (params: SearchParams) => void;
  loading: boolean;
}

const BUILDING_PRESETS: { icon: string; label: string; keyword: string; hint: string }[] = [
  { icon: "🏢", label: "写字楼",   keyword: "office tower menara",           hint: "商业办公楼、甲级写字楼" },
  { icon: "🏠", label: "住宅区",   keyword: "condominium apartment residential", hint: "公寓、住宅、花园洋房" },
  { icon: "🏗️", label: "高楼大厦", keyword: "skyscraper tall building tower",   hint: "超高层、地标建筑" },
  { icon: "🛍️", label: "商业中心", keyword: "shopping mall commercial centre",  hint: "购物中心、商场" },
  { icon: "🏭", label: "工业园",   keyword: "industrial park factory warehouse", hint: "工厂、仓库、工业区" },
  { icon: "🏨", label: "酒店",     keyword: "hotel serviced apartment",         hint: "酒店、服务式公寓" },
];

const PRESET_RADII = [
  { label: "500M", value: 500 },
  { label: "1KM", value: 1000 },
  { label: "3KM", value: 3000 },
  { label: "5KM", value: 5000 },
  { label: "10KM", value: 10000 },
];

const INDUSTRIES: { value: Industry; label: string; icon: string }[] = [
  { value: "all",           label: "全行业",  icon: "◈" },
  { value: "tech",          label: "科技/IT", icon: "⬡" },
  { value: "finance",       label: "金融",    icon: "◇" },
  { value: "telco",         label: "电信/网络",icon: "◎" },
  { value: "consulting",    label: "咨询",    icon: "△" },
  { value: "legal",         label: "法律",    icon: "▣" },
  { value: "healthcare",    label: "医疗",    icon: "✚" },
  { value: "logistics",     label: "物流",    icon: "▷" },
  { value: "manufacturing", label: "制造",    icon: "⬟" },
  { value: "trading",       label: "贸易",    icon: "◆" },
];

const VERTICAL_HINTS: { keywords: string[]; industry: Industry; label: string }[] = [
  { keywords: ["cyberjaya", "msc", "technology park", "tech park", "silicon", "digital hub"], industry: "tech", label: "科技/IT" },
  { keywords: ["klcc", "bursa", "labuan", "finance", "financial", "securities", "investment"], industry: "finance", label: "金融" },
  { keywords: ["port klang", "pelabuhan", "pelabuhan klang", "port", "logistic", "warehouse", "freight", "cargo"], industry: "logistics", label: "物流" },
  { keywords: ["hospital", "medical", "klinik", "clinic", "pharma", "healthcare", "specialist"], industry: "healthcare", label: "医疗" },
  { keywords: ["industrial", "factory", "perindustrian", "manufacturing", "plant", "kilang"], industry: "manufacturing", label: "制造" },
  { keywords: ["court", "legal", "law firm", "mahkamah", "peguam", "advocate"], industry: "legal", label: "法律" },
  { keywords: ["telco", "celcom", "maxis", "digi", "time dotcom", "telekomunikasi", "broadband"], industry: "telco", label: "电信" },
  { keywords: ["trading", "wholesale", "import export", "perdagangan", "distributor"], industry: "trading", label: "贸易" },
  { keywords: ["consulting", "advisory", "management services", "outsourcing"], industry: "consulting", label: "咨询" },
];

function detectIndustry(address: string): { industry: Industry; label: string } | null {
  const lower = address.toLowerCase();
  for (const hint of VERTICAL_HINTS) {
    if (hint.keywords.some((k) => lower.includes(k))) return { industry: hint.industry, label: hint.label };
  }
  return null;
}

const label: React.CSSProperties = {
  fontSize: "13px", letterSpacing: "0.2em",
  color: "var(--text-dim)", textTransform: "uppercase" as const,
  marginBottom: "8px", display: "block",
};

const divider: React.CSSProperties = {
  height: "1px", background: "var(--border)", margin: "18px 0",
};

const inputBase: React.CSSProperties = {
  width: "100%", background: "rgba(212,160,60,0.04)",
  border: "1px solid var(--border)", borderRadius: "3px",
  padding: "9px 12px", color: "var(--text-primary)",
  fontSize: "13px", outline: "none", transition: "border-color 0.2s",
  fontFamily: "'JetBrains Mono', monospace",
};

export default function SearchPanel({ onSearch, loading }: SearchPanelProps) {
  const [locations, setLocations] = useState<Array<{ address: string; resolved?: SearchLocation }>>([{ address: "" }]);
  const [radius, setRadius] = useState(10000);
  const [customRadius, setCustomRadius] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [industry, setIndustry] = useState<Industry>("all");
  const [keyword, setKeyword] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [suggestion, setSuggestion] = useState<{ industry: Industry; label: string } | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => { setHistory(getHistory()); }, []);

  function updateAddress(idx: number, val: string) {
    setLocations((prev) => prev.map((l, i) => i === idx ? { address: val } : l));
    if (idx === 0) setSuggestion(detectIndustry(val));
  }

  function addLocation() {
    if (locations.length < 5) setLocations((prev) => [...prev, { address: "" }]);
  }

  function removeLocation(idx: number) {
    setLocations((prev) => prev.filter((_, i) => i !== idx));
  }

  function useCurrentLocation(idx: number) {
    if (!navigator.geolocation) { setError("浏览器不支持定位"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const addr = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        setLocations((prev) => prev.map((l, i) =>
          i === idx ? { address: addr, resolved: { address: addr, lat: pos.coords.latitude, lng: pos.coords.longitude } } : l
        ));
        setLocating(false); setError(null);
      },
      () => { setError("定位失败"); setLocating(false); }
    );
  }

  async function resolveLocations(): Promise<SearchLocation[]> {
    const resolved: SearchLocation[] = [];
    for (const loc of locations) {
      if (!loc.address.trim()) continue;
      if (loc.resolved) { resolved.push(loc.resolved); continue; }
      const coordMatch = loc.address.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
      if (coordMatch) {
        resolved.push({ address: loc.address, lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) });
      } else {
        const coords = await geocodeAddress(loc.address);
        resolved.push({ address: loc.address, ...coords });
      }
    }
    return resolved;
  }

  async function handlePreset(preset: typeof BUILDING_PRESETS[number]) {
    setActivePreset(preset.keyword);
    setKeyword(preset.keyword);
    const filled = locations.filter((l) => l.address.trim());
    if (!filled.length) return; // just set keyword, user fills location
    setError(null);
    try {
      const resolvedLocs = await resolveLocations();
      const effectiveRadius = useCustom
        ? Math.min(50000, Math.max(100, parseFloat(customRadius || "1") * 1000))
        : radius;
      onSearch({ locations: resolvedLocs, radius: effectiveRadius, buildingType: "office", industry, keyword: preset.keyword });
      setTimeout(() => setHistory(getHistory()), 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "地址解析失败");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const filled = locations.filter((l) => l.address.trim());
    if (!filled.length) { setError("请至少输入一个地址"); return; }

    try {
      const resolvedLocs = await resolveLocations();
      const effectiveRadius = useCustom
        ? Math.min(50000, Math.max(100, parseFloat(customRadius || "1") * 1000))
        : radius;

      onSearch({ locations: resolvedLocs, radius: effectiveRadius, buildingType: "office", industry, keyword });
      setTimeout(() => setHistory(getHistory()), 200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "地址解析失败");
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>

      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "13px", letterSpacing: "0.25em", color: "var(--amber)", textTransform: "uppercase", marginBottom: "4px" }}>◈ B2B 线索搜索</div>
        <div style={{ height: "1px", background: "linear-gradient(90deg, var(--amber-dim), transparent)" }} />
      </div>

      {/* Building Type Quick Presets */}
      <div style={{ marginBottom: "18px" }}>
        <label style={label}>楼宇类型 · 快速搜索</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
          {BUILDING_PRESETS.map((preset) => {
            const active = activePreset === preset.keyword;
            return (
              <button
                key={preset.keyword}
                type="button"
                title={preset.hint}
                onClick={() => handlePreset(preset)}
                style={{
                  background: active ? "rgba(0,168,255,0.12)" : "rgba(0,168,255,0.03)",
                  border: `1px solid ${active ? "var(--amber)" : "var(--border)"}`,
                  borderRadius: "3px",
                  padding: "8px 4px",
                  color: active ? "var(--amber)" : "var(--text-secondary)",
                  fontSize: "12px",
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "3px",
                  fontFamily: "'JetBrains Mono', monospace",
                  boxShadow: active ? "0 0 10px rgba(0,168,255,0.15)" : "none",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--amber-dim)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--amber)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
                  }
                }}
              >
                <span style={{ fontSize: "18px", lineHeight: 1 }}>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: "5px", fontSize: "11px", color: "var(--text-dim)", letterSpacing: "0.06em" }}>
          {activePreset
            ? `▸ 已选: ${BUILDING_PRESETS.find(p => p.keyword === activePreset)?.label} · 填入地点后自动触发`
            : "选择楼宇类型，填入地点后自动搜索"}
        </div>
      </div>

      <div style={divider} />

      {/* Locations */}
      <div style={{ marginBottom: "18px" }}>
        <label style={label}>目标地点</label>
        {locations.map((loc, idx) => (
          <div key={idx} style={{ marginBottom: "6px" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              <input
                type="text"
                value={loc.address}
                onChange={(e) => updateAddress(idx, e.target.value)}
                placeholder={idx === 0 ? "Menara Kuala Lumpur..." : `地点 ${idx + 1}...`}
                style={{ ...inputBase, flex: 1, fontSize: "13px" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--amber-dim)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
              <button type="button" onClick={() => useCurrentLocation(idx)}
                title="使用当前位置"
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "3px", padding: "0 10px", color: "var(--text-dim)", cursor: "pointer", fontSize: "13px", transition: "all 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--amber)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--amber)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
              >
                {locating ? "◌" : "⊕"}
              </button>
              {locations.length > 1 && (
                <button type="button" onClick={() => removeLocation(idx)}
                  style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "3px", padding: "0 10px", color: "var(--text-dim)", cursor: "pointer", fontSize: "13px", transition: "all 0.15s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#b85050"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#b85050"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
                >✕</button>
              )}
            </div>
          </div>
        ))}

        {locations.length < 5 && (
          <button type="button" onClick={addLocation}
            style={{ width: "100%", background: "transparent", border: "1px dashed var(--border)", borderRadius: "3px", padding: "6px", color: "var(--text-dim)", fontSize: "13px", letterSpacing: "0.12em", cursor: "pointer", transition: "all 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--amber-dim)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--amber)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)"; }}
          >+ 添加地点</button>
        )}

        {error && <div style={{ marginTop: "6px", fontSize: "15px", color: "#b85050" }}>✕ {error}</div>}

        {/* Auto-detect vertical suggestion */}
        {suggestion && suggestion.industry !== industry && (
          <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", border: "1px solid rgba(212,160,60,0.25)", borderRadius: "3px", background: "rgba(212,160,60,0.04)", animation: "fadeSlideIn 0.2s ease" }}>
            <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>检测到 <strong style={{ color: "var(--amber)" }}>{suggestion.label}</strong> 区域</span>
            <button
              type="button"
              onClick={() => { setIndustry(suggestion.industry); setSuggestion(null); }}
              style={{ fontSize: "15px", padding: "2px 10px", border: "1px solid var(--amber)", borderRadius: "2px", background: "rgba(212,160,60,0.12)", color: "var(--amber)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", flexShrink: 0 }}
            >切换行业</button>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontSize: "15px", color: "var(--text-dim)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "3px" }}>最近搜索</div>
            {history.map((h) => (
              <button key={h.timestamp} type="button"
                onClick={() => setLocations([{ address: h.address, resolved: { address: h.address, lat: h.lat, lng: h.lng } }])}
                style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "2px 0", color: "var(--text-dim)", fontSize: "13px", cursor: "pointer", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "color 0.15s", fontFamily: "'JetBrains Mono', monospace" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--amber)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "var(--text-dim)")}
              >↺ {h.address}</button>
            ))}
          </div>
        )}
      </div>

      <div style={divider} />

      {/* Industry */}
      <div style={{ marginBottom: "18px" }}>
        <label style={label}>目标行业</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          {INDUSTRIES.map((ind) => {
            const active = industry === ind.value;
            return (
              <button key={ind.value} type="button" onClick={() => setIndustry(ind.value)}
                style={{
                  background: active ? "rgba(212,160,60,0.1)" : "transparent",
                  border: `1px solid ${active ? "var(--amber)" : "var(--border)"}`,
                  borderRadius: "3px", padding: "7px 10px",
                  color: active ? "var(--amber)" : "var(--text-secondary)",
                  fontSize: "15px", letterSpacing: "0.04em", cursor: "pointer",
                  transition: "all 0.15s", display: "flex", alignItems: "center", gap: "6px",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                <span style={{ fontSize: "13px", opacity: 0.7 }}>{ind.icon}</span>
                {ind.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={divider} />

      {/* Keyword */}
      <div style={{ marginBottom: "18px" }}>
        <label style={label}>自定义关键词（可选）</label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setActivePreset(null); }}
          placeholder="如：ISP broadband provider..."
          style={inputBase}
          onFocus={(e) => (e.target.style.borderColor = "var(--amber-dim)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />
      </div>

      <div style={divider} />

      {/* Radius */}
      <div style={{ marginBottom: "18px" }}>
        <label style={label}>扫描半径</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "4px", marginBottom: "8px" }}>
          {PRESET_RADII.map((r) => {
            const active = !useCustom && radius === r.value;
            return (
              <button key={r.value} type="button" onClick={() => { setRadius(r.value); setUseCustom(false); }}
                style={{
                  background: active ? "rgba(212,160,60,0.12)" : "transparent",
                  border: `1px solid ${active ? "var(--amber)" : "var(--border)"}`,
                  borderRadius: "3px", padding: "7px 2px",
                  color: active ? "var(--amber)" : "var(--text-secondary)",
                  fontSize: "13px", cursor: "pointer", transition: "all 0.15s",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >{r.label}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            onClick={() => setUseCustom(!useCustom)}
            style={{
              width: "16px", height: "16px", border: `1px solid ${useCustom ? "var(--amber)" : "var(--border)"}`,
              borderRadius: "2px", background: useCustom ? "rgba(212,160,60,0.2)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "15px", color: "var(--amber)", transition: "all 0.15s", cursor: "pointer", flexShrink: 0,
            }}
          >{useCustom ? "✓" : ""}</span>
          <span style={{ fontSize: "15px", color: "var(--text-secondary)", cursor: "pointer" }} onClick={() => setUseCustom(!useCustom)}>自定义</span>
          {useCustom && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
              <input type="number" value={customRadius} onChange={(e) => setCustomRadius(e.target.value)}
                placeholder="0.1–50" min="0.1" max="50" step="0.1"
                style={{ ...inputBase, padding: "5px 8px", fontSize: "15px" }}
              />
              <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>KM</span>
            </div>
          )}
        </div>
      </div>

      {/* Submit */}
      <div style={{ marginTop: "auto" }}>
        <div style={divider} />
        <button type="submit" disabled={loading}
          style={{
            width: "100%",
            background: loading ? "rgba(212,160,60,0.05)" : "linear-gradient(135deg, rgba(212,160,60,0.15), rgba(212,160,60,0.08))",
            border: `1px solid ${loading ? "var(--border)" : "var(--amber)"}`,
            borderRadius: "3px", padding: "14px",
            color: loading ? "var(--text-dim)" : "var(--amber)",
            fontSize: "13px", letterSpacing: "0.22em", textTransform: "uppercase",
            cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s",
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}
        >
          {loading
            ? <><span style={{ animation: "spinnerRotate 1s linear infinite", display: "inline-block" }}>◌</span> 扫描中...</>
            : <>⬡ 扫描 B2B 线索</>}
        </button>
      </div>
    </form>
  );
}
