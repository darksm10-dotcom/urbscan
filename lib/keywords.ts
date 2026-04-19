import type { Industry } from "@/types";

export const INDUSTRY_KEYWORDS: Record<Industry, string[]> = {
  all: [
    "company office corporate headquarters",
    "business enterprise services",
    "professional services firm",
  ],
  tech: [
    "IT company software technology",
    "tech startup digital agency",
    "data center cloud computing cybersecurity",
  ],
  finance: [
    "bank financial services investment",
    "insurance accounting audit firm",
    "fund management securities",
  ],
  legal: [
    "law firm legal services advocate",
    "solicitor chambers legal consultant",
  ],
  healthcare: [
    "clinic medical specialist hospital",
    "pharmaceutical biotech medical device",
  ],
  manufacturing: [
    "factory manufacturing industrial production",
    "engineering plant assembly",
  ],
  logistics: [
    "logistics warehouse freight shipping",
    "courier supply chain distribution",
  ],
  telco: [
    "telecommunications internet service provider broadband",
    "ISP network infrastructure telco",
  ],
  consulting: [
    "consulting advisory management services",
    "strategy firm HR outsourcing",
  ],
  trading: [
    "trading wholesale distributor import export",
    "retail chain general trading",
  ],
};
