"use client";

import { useCallback, useRef } from "react";
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from "@react-google-maps/api";
import { Building } from "@/types";

interface BuildingMapProps {
  buildings: Building[];
  center: { lat: number; lng: number };
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
}

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1810" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0c0b09" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8c7f65" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2518" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1408" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b5f40" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a2f10" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#161410" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6b5f40" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0d14" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d4a60" }] },
  { featureType: "transit", stylers: [{ color: "#2a2518" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2a2518" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e8060" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c4a870" }] },
];

const OFFICE_ICON = {
  path: "M -6,-8 L 6,-8 L 6,8 L -6,8 Z",
  fillColor: "#5080d4",
  fillOpacity: 0.9,
  strokeColor: "#3060b4",
  strokeWeight: 1,
  scale: 1.2,
};

const RESIDENTIAL_ICON = {
  path: "M 0,-9 L 8,3 L -8,3 Z",
  fillColor: "#5a8a4a",
  fillOpacity: 0.9,
  strokeColor: "#3a6a2a",
  strokeWeight: 1,
  scale: 1.2,
};

const SELECTED_ICON = {
  path: "M 0,-10 C -6,-10 -10,-6 -10,0 C -10,6 0,14 0,14 C 0,14 10,6 10,0 C 10,-6 6,-10 0,-10 Z",
  fillColor: "#d4a03c",
  fillOpacity: 1,
  strokeColor: "#a07820",
  strokeWeight: 1.5,
  scale: 1,
};

export default function BuildingMap({ buildings, center, selectedId, onSelectId }: BuildingMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const selectedBuilding = buildings.find((b) => b.id === selectedId);

  if (!isLoaded) {
    return (
      <div style={{
        height: "280px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-dim)",
        fontSize: "12px",
        letterSpacing: "0.1em",
      }}>
        地图加载中...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "280px", borderRadius: "3px" }}
      center={center}
      zoom={14}
      onLoad={onLoad}
      options={{
        styles: MAP_STYLES,
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      }}
      onClick={() => onSelectId(null)}
    >
      {/* Center marker */}
      <Marker
        position={center}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: "#d4a03c",
          fillOpacity: 1,
          strokeColor: "#d4a03c",
          strokeWeight: 3,
          scale: 5,
        }}
      />

      {/* Building markers */}
      {buildings.map((b) => (
        <Marker
          key={b.id}
          position={{ lat: b.lat, lng: b.lng }}
          icon={b.id === selectedId ? SELECTED_ICON : b.type === "office" ? OFFICE_ICON : RESIDENTIAL_ICON}
          onClick={() => onSelectId(b.id === selectedId ? null : b.id)}
          zIndex={b.id === selectedId ? 10 : 1}
        />
      ))}

      {/* Info window for selected */}
      {selectedBuilding && (
        <InfoWindow
          position={{ lat: selectedBuilding.lat, lng: selectedBuilding.lng }}
          onCloseClick={() => onSelectId(null)}
          options={{ pixelOffset: new google.maps.Size(0, -14) }}
        >
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "12px",
            color: "#1a1810",
            maxWidth: "200px",
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 600, marginBottom: "2px" }}>{selectedBuilding.name}</div>
            <div style={{ fontSize: "11px", color: "#6b5f40" }}>{selectedBuilding.address}</div>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
