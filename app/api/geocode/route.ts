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

function resolvedResult(name: string, query: string, geocode: AmapGeoCode, point: { lat: number; lng: number }) {
  return {
    name,
    status: "resolved" as const,
    lat: point.lat,
    lng: point.lng,
    adcode: geocode.adcode,
    formattedAddress: geocode.formatted_address,
    query,
    provider: "amap" as const
  };
}

async function requestGeocode(query: string) {
  const key = amapKey();
  if (!key) throw new Error("Missing AMAP_WEB_SERVICE_KEY");

  const url = new URL("https://restapi.amap.com/v3/geocode/geo");
  url.searchParams.set("key", key);
  url.searchParams.set("address", query);
  url.searchParams.set("output", "json");

  const response = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  if (!response.ok) throw new Error("Amap geocode request failed");

  return await response.json() as AmapGeoResponse;
}

async function geocodeOne(name: string) {
  const key = amapKey();
  if (!key) throw new Error("Missing AMAP_WEB_SERVICE_KEY");

  const exactData = await requestGeocode(name);
  const exact = exactData.geocodes?.[0];
  const exactPoint = parseLocation(exact?.location);
  if (exactData.status !== "1" || !exact || !exactPoint) {
    return { name, status: "missing" as const };
  }

  return resolvedResult(name, name, exact, exactPoint);
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
