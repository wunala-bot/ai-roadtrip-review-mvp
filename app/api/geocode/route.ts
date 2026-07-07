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

function buildQueries(name: string) {
  const normalized = name.trim();
  const hasRegion = /四川|甘孜|成都|康定|理塘|巴塘|稻城/.test(normalized);
  return hasRegion
    ? [normalized]
    : [normalized, `四川甘孜${normalized}`, `甘孜${normalized}`, `巴塘${normalized}`, `理塘${normalized}`];
}

function scoreCandidate(name: string, query: string, geocode: AmapGeoCode) {
  const address = geocode.formatted_address ?? "";
  const adcode = geocode.adcode ?? "";
  let score = 0;
  if (address.includes(name)) score += 50;
  if (address.includes(query)) score += 20;
  if (adcode.startsWith("5133")) score += 30;
  if (address.includes("四川省")) score += 10;
  if (address.includes("新疆")) score -= 50;
  return score;
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

  const candidates = [];
  for (const query of buildQueries(name)) {
    const data = await requestGeocode(query);
    const first = data.geocodes?.[0];
    const point = parseLocation(first?.location);
    if (data.status === "1" && first && point) {
      candidates.push({ query, geocode: first, point, score: scoreCandidate(name, query, first) });
    }
  }

  const best = candidates.sort((first, second) => second.score - first.score)[0];
  if (!best) {
    return { name, status: "missing" as const };
  }

  return {
    name,
    status: "resolved" as const,
    lat: best.point.lat,
    lng: best.point.lng,
    adcode: best.geocode.adcode,
    formattedAddress: best.geocode.formatted_address,
    query: best.query,
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
