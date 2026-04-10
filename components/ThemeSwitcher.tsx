"use client";

import { useEffect, useState } from "react";
import { THEMES, AppTheme, DEFAULT_THEME_ID, applyTheme, getThemeById } from "@/lib/themes";

const STORAGE_KEY = "urbscan_theme";

export function useTheme() {
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
    const theme = getThemeById(saved);
    setThemeId(theme.id);
    applyTheme(theme);
  }, []);

  const switchTheme = (id: string) => {
    const theme = getThemeById(id);
    setThemeId(theme.id);
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme.id);
  };

  return { themeId, switchTheme };
}

interface ThemeSwitcherProps {
  themeId: string;
  onSwitch: (id: string) => void;
}

export default function ThemeSwitcher({ themeId, onSwitch }: ThemeSwitcherProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      {THEMES.map((theme: AppTheme) => {
        const isActive = themeId === theme.id;
        const isHovered = hovered === theme.id;
        return (
          <button
            key={theme.id}
            onClick={() => onSwitch(theme.id)}
            onMouseEnter={() => setHovered(theme.id)}
            onMouseLeave={() => setHovered(null)}
            title={theme.name}
            style={{
              position: "relative",
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: theme.color,
              border: "none",
              outline: isActive
                ? `1px solid ${theme.color}`
                : isHovered
                  ? `1px solid rgba(255,255,255,0.25)`
                  : "1px solid transparent",
              outlineOffset: "2px",
              cursor: "pointer",
              padding: 0,
              opacity: isActive ? 1 : isHovered ? 0.8 : 0.35,
              transition: "all 0.18s ease",
              boxShadow: isActive ? `0 0 8px ${theme.color}80` : "none",
            }}
          />
        );
      })}
    </div>
  );
}
