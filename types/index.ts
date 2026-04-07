export type BuildingType = "office" | "residential" | "all";
export type RangeMode = "radius" | "custom";

export type Industry =
  | "all"
  | "tech"
  | "finance"
  | "legal"
  | "healthcare"
  | "manufacturing"
  | "logistics"
  | "telco"
  | "consulting"
  | "trading";

export interface SearchLocation {
  address: string;
  lat: number;
  lng: number;
}

export interface SearchParams {
  locations: SearchLocation[];   // supports multi-location
  radius: number;
  buildingType: BuildingType;
  industry: Industry;
  keyword: string;
}

export interface Building {
  id: string;
  name: string;
  address: string;
  type: BuildingType;
  distance: number;       // from nearest search center, in meters
  lat: number;
  lng: number;
  // B2B enrichment
  rating?: number;
  reviewCount?: number;
  score: number;          // computed lead score 0-100
  industry?: string;
  nearestCenter?: SearchLocation;
  phone?: string;
  website?: string;
  contacts?: HunterContact[];
}

export interface HunterContact {
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  seniority?: string;
  department?: string;
  phone?: string;
  linkedin?: string;
  confidence: number;
}
