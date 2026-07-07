import { NextResponse } from "next/server";

type AmapGeoCode = {
  formatted_address?: string;
  location?: string;
  adcode?: string;
  city?: string | string[];
  district?: string;
};

type AmapGeoResponse = {
  status?: string;
  info?: string;
  geocodes?: AmapGeoCode[];
};

function amapKey() {
  return process.env.AMAP_WEB_SERVICE_KEY;
}

function parseLocation(location?: string) {
  const [lngText, latText] = location?.split(",") ?? [];
  const lng = Number(lngText);
  const lat = Number(latText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeOne(name: string) {
  const key = amapKey();
  if (!key) throw new Error("Missing AMAP_WEB_SERVICE_KEY");

  const url = new URL("https://restapi.amap.com/v3/geocode/geo");
  url.searchParams.set("key", key);
  url.searchParams.set("address", name);
  url.searchParams.set("output", "json");

  const response = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!response.ok) throw new Error("Amap geocode request failed");

  const data = await response.json() as AmapGeoResponse;
  const first = data.geocodes?.[0];
  const point = parseLocation(first?.location);
  if (data.status !== "1" || !first || !point) {
    return { name, status: "missing" as const };
  }

  return {
    name,
    status: "resolved" as const,
    lat: point.lat,
    lng: point.lng,
    adcode: first.adcode,
    formattedAddress: first.formatted_address,
    provider: "amap" as const
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { names?: string[] };
    const names = Array.from(new Set((body.names ?? []).map((name) => name.trim()).filter(Boolean))).slice(0, 30);
    if (names.length === 0) return NextResponse.json({ results: [] });

    const results = await Promise.all(names.map((name) => geocodeOne(name)));
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Geocode failed" },
      { status: 500 }
    );
  }
}
