import { NextRequest, NextResponse } from "next/server";
import { Industry, SearchLocation } from "@/types";
import { INDUSTRY_KEYWORDS } from "@/lib/keywords";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

// Types that indicate consumer/non-B2B places — filter these out
const EXCLUDE_TYPES = new Set([
  "restaurant", "food", "cafe", "bar", "night_club", "bakery",
  "lodging", "hotel", "motel",
  "grocery_store", "supermarket", "convenience_store",
  "clothing_store", "shoe_store", "jewelry_store", "home_goods_store",
  "hardware_store", "furniture_store", "electronics_store",
  "pharmacy", "drugstore", "beauty_salon", "hair_care", "spa", "gym",
  "movie_theater", "amusement_park", "bowling_alley", "casino",
  "gas_station", "car_dealer", "car_repair", "car_wash",
  "church", "mosque", "temple", "place_of_worship",
  "primary_school", "secondary_school", "school",
  "atm",
]);

// Only exclude bank type for non-finance industries (bank HQs are valid finance leads)
const FINANCE_INDUSTRIES = new Set<Industry>(["finance"]);

const OFFICE_NAME_KEYWORDS = [
  "tower", "menara", "wisma", "plaza", "centre", "center", "office",
  "corporate", "business", "commercial", "hq", "block", "exchange",
  "financial", "tech", "gateway", "hub", "park", "suites",
];
const RESIDENTIAL_NAME_KEYWORDS = [
  "apartment", "condominium", "condo", "residency", "residence",
  "flat", "taman", "perumahan", "housing", "villa", "court",
  "garden", "grove", "heights", "terrace",
];

function extractDomain(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch { return null; }
}

function formatMalaysianPhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (!digits.startsWith("60") || digits.length < 9) return raw;
  const after60 = digits.slice(2);
  if (after60.startsWith("1")) {
    const prefix = after60.startsWith("11") ? after60.slice(0, 3) : after60.slice(0, 2);
    const rest = after60.slice(prefix.length);
    return `+60${prefix}-${rest.slice(0, 3)}-${rest.slice(3)}`;
  }
  const area = after60.slice(0, 1);
  const rest = after60.slice(1);
  return `+60${area}-${rest.slice(0, 4)}-${rest.slice(4)}`;
}

function inferType(name: string, types: string[]): "office" | "residential" {
  const lower = name.toLowerCase();
  const resScore = RESIDENTIAL_NAME_KEYWORDS.filter((k) => lower.includes(k)).length;
  const offScore = OFFICE_NAME_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (types.includes("lodging")) return "residential";
  if (resScore > offScore) return "residential";
  return "office";
}

// Sdn Bhd / Berhad = Malaysian registered company → always B2B
function isMalaysianRegisteredCompany(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("sdn bhd") || lower.includes("sdn. bhd") ||
    lower.includes("berhad") || lower.includes(" bhd")
  );
}

function isBusiness(types: string[], name: string, industry: Industry): boolean {
  // Malaysian registered companies are always B2B — skip all other checks
  if (isMalaysianRegisteredCompany(name)) return true;
  if (types.some((t) => EXCLUDE_TYPES.has(t))) return false;
  // Only exclude bank branches for non-finance industries
  if (!FINANCE_INDUSTRIES.has(industry) && types.includes("bank")) return false;
  // Must have at least one business-like type
  const businessTypes = [
    "establishment", "point_of_interest", "finance", "health",
    "real_estate_agency", "lawyer", "insurance_agency",
    "corporate_office", "office",
  ];
  if (!types.some((t) => businessTypes.includes(t))) return false;
  // Reject only clearly consumer-facing names
  const lower = name.toLowerCase();
  const consumerWords = ["restaurant", "cafe", "mamak", "kopitiam", "bistro", "eatery", "kedai makan", "warung"];
  if (consumerWords.some((w) => lower.includes(w))) return false;
  return true;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function computeScore(
  rating: number | undefined,
  reviewCount: number | undefined,
  distance: number,
  radius: number,
  name: string,
  types: string[],
  hasWebsite: boolean,
): number {
  // Presence score: 0-35 pts
  const countScore = Math.min(35, Math.round(((reviewCount ?? 0) / 200) * 35));
  // Quality score: 0-35 pts
  const ratingScore = rating ? Math.round(((rating - 1) / 4) * 35) : 0;
  // Proximity score: 0-15 pts
  const proximityScore = Math.round((1 - distance / radius) * 15);
  // B2B confidence bonus: 0-15 pts
  let b2bBonus = 0;
  if (isMalaysianRegisteredCompany(name)) b2bBonus += 10;
  if (types.includes("corporate_office")) b2bBonus += 8;
  else if (types.includes("office")) b2bBonus += 4;
  if (hasWebsite) b2bBonus += 3;
  b2bBonus = Math.min(15, b2bBonus);

  return Math.max(0, Math.min(100, countScore + ratingScore + proximityScore + b2bBonus));
}

type PlaceResult = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
};

const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types," +
  "places.rating,places.userRatingCount,places.internationalPhoneNumber,places.nationalPhoneNumber,places.websiteUri," +
  "nextPageToken";

async function fetchPage(
  payload: Record<string, unknown>,
  apiKey: string
): Promise<{ places: PlaceResult[]; nextPageToken?: string }> {
  const res = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? "Places API error");
  }

  const data = await res.json();
  return { places: data.places ?? [], nextPageToken: data.nextPageToken };
}

async function searchKeyword(
  query: string,
  center: SearchLocation,
  radius: number,
  apiKey: string
): Promise<PlaceResult[]> {
  const basePayload = {
    textQuery: query,
    maxResultCount: 20,
    locationBias: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: Math.min(radius, 50000),
      },
    },
  };

  const allPlaces: PlaceResult[] = [];
  let pageToken: string | undefined;
  const MAX_PAGES = 2; // up to 40 results per keyword

  for (let page = 0; page < MAX_PAGES; page++) {
    const payload = pageToken
      ? { ...basePayload, pageToken }
      : basePayload;

    const { places, nextPageToken } = await fetchPage(payload, apiKey);
    allPlaces.push(...places);

    if (!nextPageToken || places.length === 0) break;
    pageToken = nextPageToken;
  }

  return allPlaces;
}


export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

  const body = await req.json();
  const { locations, radius, industry, keyword, queries } = body as {
    locations: SearchLocation[];
    radius: number;
    industry: Industry;
    keyword: string;
    queries?: string[]; // if provided, use directly (single-query incremental mode)
  };

  if (!locations?.length || !radius) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  try {
    const industryKws = INDUSTRY_KEYWORDS[industry] ?? INDUSTRY_KEYWORDS.all;
    const allKeywords = queries?.length
      ? queries
      : keyword?.trim()
        ? [...industryKws, keyword.trim()]
        : industryKws;

    // Parallel search across all locations × all keywords
    const searches = locations.flatMap((loc) =>
      allKeywords.map((kw) => searchKeyword(kw, loc, radius, apiKey).then((results) =>
        results.map((r) => ({ ...r, _center: loc }))
      ))
    );

    const results = await Promise.allSettled(searches);

    const seen = new Set<string>();
    const mapped = results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .filter((p) => {
        if (!p.id || seen.has(p.id)) return false;
        seen.add(p.id);
        const types = p.types ?? [];
        const name = p.displayName?.text ?? "";
        return isBusiness(types, name, industry);
      })
      .map((p) => {
        const pLat = p.location?.latitude ?? 0;
        const pLng = p.location?.longitude ?? 0;
        const center = (p as PlaceResult & { _center: SearchLocation })._center;
        const distance = calculateDistance(center.lat, center.lng, pLat, pLng);
        const name = p.displayName?.text ?? "未知企业";
        const rating = p.rating;
        const reviewCount = p.userRatingCount;

        return {
          id: p.id,
          name,
          address: p.formattedAddress ?? "地址未知",
          type: inferType(name, p.types ?? []),
          distance,
          lat: pLat,
          lng: pLng,
          rating,
          reviewCount,
          score: computeScore(rating, reviewCount, distance, radius, name, p.types ?? [], !!p.websiteUri),
          nearestCenter: center,
          phone: formatMalaysianPhone(p.internationalPhoneNumber ?? p.nationalPhoneNumber),
          website: p.websiteUri,
        };
      });

    // Domain deduplication: when multiple places share a website domain, keep the highest-scoring one
    const domainMap = new Map<string, number>();
    const domainDeduped: (typeof mapped[number])[] = [];
    for (const b of mapped) {
      const domain = extractDomain(b.website);
      if (domain) {
        const existingIdx = domainMap.get(domain);
        if (existingIdx !== undefined) {
          if (b.score > domainDeduped[existingIdx].score) domainDeduped[existingIdx] = b;
          continue;
        }
        domainMap.set(domain, domainDeduped.length);
      }
      domainDeduped.push(b);
    }

    const buildings = domainDeduped.sort((a, b) => b.score - a.score);

    return NextResponse.json({ buildings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "查询失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
