import { NextResponse } from "next/server";

type RoutePlace = {
  name: string;
  lat: number;
  lng: number;
};

type AmapStep = {
  instruction?: string;
  road?: string;
  distance?: string;
  duration?: string;
  polyline?: string;
};

type AmapPath = {
  distance?: string;
  duration?: string;
  steps?: AmapStep[];
};

type AmapRouteResponse = {
  status?: string;
  info?: string;
  route?: {
    paths?: AmapPath[];
  };
};

function coordinate(place: RoutePlace) {
  return `${place.lng},${place.lat}`;
}

function parsePolyline(polyline?: string): [number, number][] {
  if (!polyline) return [];
  return polyline
    .split(";")
    .map((pair) => {
      const [lngText, latText] = pair.split(",");
      const lng = Number(lngText);
      const lat = Number(latText);
      return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] as [number, number] : null;
    })
    .filter((point): point is [number, number] => Boolean(point));
}

export async function POST(request: Request) {
  try {
    const key = process.env.AMAP_WEB_SERVICE_KEY;
    if (!key) throw new Error("Missing AMAP_WEB_SERVICE_KEY");

    const body = await request.json() as { places?: RoutePlace[] };
    const places = (body.places ?? []).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
    if (places.length < 2) {
      return NextResponse.json({ error: "At least two places are required" }, { status: 400 });
    }

    const origin = places[0];
    const destination = places[places.length - 1];
    const waypoints = places.slice(1, -1).slice(0, 16);
    const url = new URL("https://restapi.amap.com/v3/direction/driving");
    url.searchParams.set("key", key);
    url.searchParams.set("origin", coordinate(origin));
    url.searchParams.set("destination", coordinate(destination));
    url.searchParams.set("extensions", "base");
    url.searchParams.set("strategy", "0");
    url.searchParams.set("output", "json");
    if (waypoints.length > 0) {
      url.searchParams.set("waypoints", waypoints.map(coordinate).join(";"));
    }

    const response = await fetch(url, { next: { revalidate: 60 * 30 } });
    if (!response.ok) throw new Error("Amap route request failed");

    const data = await response.json() as AmapRouteResponse;
    const path = data.route?.paths?.[0];
    const steps = path?.steps ?? [];
    const geometry = steps.flatMap((step) => parsePolyline(step.polyline));
    if (data.status !== "1" || !path || geometry.length < 2) {
      throw new Error(data.info ?? "Amap route not found");
    }

    return NextResponse.json({
      provider: "amap",
      distanceMeters: Number(path.distance ?? 0),
      durationSeconds: Number(path.duration ?? 0),
      roads: Array.from(new Set(steps.map((step) => step.road).filter(Boolean))),
      geometry
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Route failed" },
      { status: 500 }
    );
  }
}
