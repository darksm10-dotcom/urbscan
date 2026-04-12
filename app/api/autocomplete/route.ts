import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get("input") ?? "";

  if (input.length < 2) return NextResponse.json({ suggestions: [] });

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:my&language=en&types=establishment|geocode&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = (data.predictions ?? []).slice(0, 6).map((p: {
      description: string;
      place_id: string;
      structured_formatting?: { main_text: string; secondary_text: string };
    }) => ({
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description.split(",")[0],
      secondary: p.structured_formatting?.secondary_text ?? "",
    }));

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
