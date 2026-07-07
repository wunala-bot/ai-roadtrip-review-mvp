import { NextResponse } from "next/server";

type AmapWeatherResponse = {
  status?: string;
  info?: string;
  lives?: unknown[];
  forecasts?: unknown[];
};

export async function POST(request: Request) {
  try {
    const key = process.env.AMAP_WEB_SERVICE_KEY;
    if (!key) throw new Error("Missing AMAP_WEB_SERVICE_KEY");

    const body = await request.json() as { adcode?: string; extensions?: "base" | "all" };
    if (!body.adcode) {
      return NextResponse.json({ error: "adcode is required" }, { status: 400 });
    }

    const url = new URL("https://restapi.amap.com/v3/weather/weatherInfo");
    url.searchParams.set("key", key);
    url.searchParams.set("city", body.adcode);
    url.searchParams.set("extensions", body.extensions ?? "base");
    url.searchParams.set("output", "json");

    const response = await fetch(url, { next: { revalidate: 60 * 10 } });
    if (!response.ok) throw new Error("Amap weather request failed");

    const data = await response.json() as AmapWeatherResponse;
    if (data.status !== "1") throw new Error(data.info ?? "Weather not found");
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Weather failed" },
      { status: 500 }
    );
  }
}
