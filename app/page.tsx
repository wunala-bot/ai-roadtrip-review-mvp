"use client";

import { AlertTriangle, Apple, Bot, CarFront, Check, Clock3, Copy, Download, ExternalLink, Image as ImageIcon, Map, Mountain, Navigation, Route, Share2, ShieldCheck, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

type Place = {
  name: string;
  lat: number;
  lng: number;
  adcode?: string;
  provider?: "amap" | "static";
};

type Stop = {
  name: string;
  status: "resolved" | "missing";
  lat?: number;
  lng?: number;
  adcode?: string;
  provider?: "amap" | "static";
};

type DayRoute = {
  day: number;
  title: string;
  stops: Stop[];
  places: Place[];
  distanceKm: number;
  driveHours: number;
  roadLevel: "easy" | "moderate" | "hard";
};

type DayReview = {
  pressure: number;
  tightness: number;
  risk: number;
  summary: string;
  suggestions: string[];
};

type ActiveView = number | "all";

type RouteMetrics = {
  distanceMeters: number;
  durationSeconds: number;
  provider: "amap";
};

type MetricsState = {
  status: "idle" | "loading" | "ready" | "error";
  data?: RouteMetrics;
};

type ShareStatus = "idle" | "copied" | "shared" | "image" | "downloaded" | "error";

const MapPanel = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => <div className="mapLoading">地图加载中...</div>
});

const placeBook: Record<string, Place> = {
  成都: { name: "成都", lat: 30.5728, lng: 104.0668 },
  康定: { name: "康定", lat: 30.0495, lng: 101.9603 },
  新都桥: { name: "新都桥", lat: 30.0441, lng: 101.4938 },
  雅江: { name: "雅江", lat: 30.0323, lng: 101.0144 },
  理塘: { name: "理塘", lat: 30.0015, lng: 100.2696 },
  喇嘛垭: { name: "喇嘛垭", lat: 29.7416, lng: 99.7929 },
  格聂之眼: { name: "格聂之眼", lat: 29.7391, lng: 99.7122 },
  格聂南线: { name: "格聂南线", lat: 29.8059, lng: 99.6068 },
  下则通: { name: "下则通", lat: 29.8265, lng: 99.7748 },
  热梯河谷: { name: "热梯河谷", lat: 30.0053, lng: 99.1106 },
  冷古寺: { name: "冷古寺", lat: 29.7872, lng: 99.6515 },
  巴塘: { name: "巴塘", lat: 30.0042, lng: 99.1041 },
  姊妹湖: { name: "姊妹湖", lat: 30.0553, lng: 99.5506 },
  稻城: { name: "稻城", lat: 29.0379, lng: 100.2965 },
  亚丁: { name: "亚丁", lat: 28.4335, lng: 100.3456 },
  香格里拉镇: { name: "香格里拉镇", lat: 28.5524, lng: 100.3316 }
};

const sampleText = `Day1 成都 - 康定 - 新都桥
约 360km / 7h，翻越折多山，下午抵达新都桥。

Day2 新都桥 - 雅江 - 理塘 - 喇嘛垭
约 310km / 6.5h，海拔持续升高，进入格聂南线前夜。

Day3 喇嘛垭 - 格聂之眼 - 冷古寺 - 巴塘
约 180km / 5.5h，碎石路和盘山路较多，边走边拍。

Day4 巴塘 - 姊妹湖 - 理塘 - 稻城
约 390km / 8h，全天驾驶距离较长，注意高反和疲劳。

Day5 稻城 - 亚丁 - 香格里拉镇
约 120km / 3h，低速山路，预留徒步和景区换乘时间。`;

function parseStopNames(block: string, heading: string, placeDirectory: Record<string, Place>) {
  const routeText = heading
    .replace(/^Day\s*\d+\s*/i, "")
    .replace(/^第\s*\d+\s*天\s*/, "")
    .trim();
  const splitStops = routeText
    .split(/\s*(?:→|->|—|–|-|到|至)\s*/g)
    .map((name) => name.replace(/[，。；,;：:]/g, "").trim())
    .filter((name) => name.length > 0 && !/^\d/.test(name));

  if (splitStops.length >= 2) return splitStops;

  return Object.keys(placeDirectory)
    .filter((name) => block.includes(name))
    .sort((first, second) => block.indexOf(first) - block.indexOf(second));
}

function resolveStops(names: string[], placeDirectory: Record<string, Place>): Stop[] {
  return names.map((name) => {
    const place = placeDirectory[name];
    return place
      ? { name, lat: place.lat, lng: place.lng, adcode: place.adcode, provider: place.provider, status: "resolved" }
      : { name, status: "missing" };
  });
}

function resolvedPlaces(stops: Stop[]): Place[] {
  return stops
    .filter((stop): stop is Stop & { lat: number; lng: number } => stop.status === "resolved" && stop.lat !== undefined && stop.lng !== undefined)
    .map((stop) => ({ name: stop.name, lat: stop.lat, lng: stop.lng }));
}

function parseItinerary(text: string, placeDirectory: Record<string, Place>): DayRoute[] {
  const blocks = text
    .split(/(?=Day\s*\d+|第\s*\d+\s*天)/i)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block, index) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const heading = lines[0] ?? `Day${index + 1}`;
      const dayMatch = heading.match(/(?:Day|第)\s*(\d+)/i);
      const day = dayMatch ? Number(dayMatch[1]) : index + 1;
      const stops = resolveStops(parseStopNames(block, heading, placeDirectory), placeDirectory);
      const places = resolvedPlaces(stops);
      const distanceMatch = block.match(/约?\s*(\d+(?:\.\d+)?)\s*km/i);
      const hourMatch = block.match(/(\d+(?:\.\d+)?)\s*h/i);
      const distanceKm = distanceMatch ? Number(distanceMatch[1]) : Math.max(stops.length - 1, 1) * 120;
      const driveHours = hourMatch ? Number(hourMatch[1]) : Math.max(stops.length - 1, 1) * 2.5;
      const hardWords = ["碎石", "盘山", "高反", "翻越", "低速", "疲劳"];
      const roadLevel: DayRoute["roadLevel"] = hardWords.some((word) => block.includes(word)) || driveHours >= 7
        ? "hard"
        : driveHours >= 5
          ? "moderate"
          : "easy";

      return {
        day,
        title: heading.replace(/^Day\s*\d+\s*/i, `Day${day} `),
        stops,
        places,
        distanceKm,
        driveHours,
        roadLevel
      };
    })
    .filter((route) => route.stops.length >= 2);
}

function reviewDay(route: DayRoute): DayReview {
  const pressure = Math.min(100, Math.round(route.driveHours * 10 + route.distanceKm / 9 + (route.roadLevel === "hard" ? 14 : 4)));
  const tightness = Math.min(100, Math.round(route.driveHours * 12 + route.stops.length * 5));
  const risk = Math.min(100, Math.round((route.roadLevel === "hard" ? 60 : route.roadLevel === "moderate" ? 42 : 24) + route.driveHours * 3));
  const suggestions = [];
  const missingStops = route.stops.filter((stop) => stop.status === "missing");

  if (driveBand(route.driveHours) === "高") suggestions.push("建议减少 1 个停留点，或把其中一段拆到前后两天。");
  if (route.roadLevel === "hard") suggestions.push("山路和非铺装路比例较高，尽量在 16:30 前完成核心路段。");
  if (route.distanceKm > 320) suggestions.push("单日里程偏长，午后安排固定休息点并保留 60-90 分钟缓冲。");
  if (route.stops.some((stop) => ["理塘", "喇嘛垭", "格聂之眼", "冷古寺", "亚丁"].includes(stop.name))) {
    suggestions.push("涉及高海拔区域，避免当天洗澡饮酒，车上准备氧气和热水。");
  }
  if (missingStops.length > 0) suggestions.push(`${missingStops.map((stop) => stop.name).join("、")} 缺少坐标，地图会先绘制已知坐标点。`);
  if (suggestions.length === 0) suggestions.push("节奏较稳，可以把午餐、加油和观景点提前标注，减少临场决策。");

  return {
    pressure,
    tightness,
    risk,
    summary: `${route.distanceKm}km / ${route.driveHours}h，${route.roadLevel === "hard" ? "山路压力明显" : route.roadLevel === "moderate" ? "节奏中等偏紧" : "驾驶压力可控"}。`,
    suggestions
  };
}

function roadLevelFromMetrics(route: DayRoute, driveHours: number): DayRoute["roadLevel"] {
  if (route.roadLevel === "hard" || driveHours >= 7) return "hard";
  if (driveHours >= 5) return "moderate";
  return "easy";
}

function routeWithMetrics(route: DayRoute, metrics?: RouteMetrics): DayRoute {
  if (!metrics) return route;
  const distanceKm = Math.round(metrics.distanceMeters / 1000);
  const driveHours = Number((metrics.durationSeconds / 3600).toFixed(1));
  return {
    ...route,
    distanceKm,
    driveHours,
    roadLevel: roadLevelFromMetrics(route, driveHours)
  };
}

function driveBand(hours: number) {
  if (hours >= 7) return "高";
  if (hours >= 5) return "中";
  return "低";
}

function formatDriveHours(hours: number) {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (wholeHours <= 0) return `${minutes}分钟`;
  if (minutes === 0) return `${wholeHours}小时`;
  return `${wholeHours}小时${minutes}分钟`;
}

function buildAllRoute(routes: DayRoute[]): DayRoute | null {
  if (routes.length === 0) return null;
  const stops = routes.flatMap((route, routeIndex) => {
    if (routeIndex === 0) return route.stops;
    const previousRoute = routes[routeIndex - 1];
    return previousRoute.stops.at(-1)?.name === route.stops[0]?.name ? route.stops.slice(1) : route.stops;
  });
  const places = resolvedPlaces(stops);
  const distanceKm = routes.reduce((total, route) => total + route.distanceKm, 0);
  const driveHours = Number(routes.reduce((total, route) => total + route.driveHours, 0).toFixed(1));
  const hasHardDay = routes.some((route) => route.roadLevel === "hard");

  return {
    day: 0,
    title: "全程路线",
    stops,
    places,
    distanceKm,
    driveHours,
    roadLevel: hasHardDay ? "hard" : "moderate"
  };
}

function mapLinks(places: Place[]) {
  const origin = places[0];
  const destination = places[places.length - 1];
  const waypoints = places.slice(1, -1);
  const encodedPlaces = places.map((place) => encodeURIComponent(place.name));
  const appleRouteText = places.slice(1).map((place) => place.name).join(" to ");
  const googleWaypoints = waypoints.length
    ? `&waypoints=${waypoints.map((place) => encodeURIComponent(place.name)).join("|")}`
    : "";
  const amapPoint = (place: Place) => `${place.lng},${place.lat},${encodeURIComponent(place.name)}`;
  const amapVia = waypoints.length
    ? `&via=${waypoints.map(amapPoint).join("|")}`
    : "";

  return {
    google: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin.name)}&destination=${encodeURIComponent(destination.name)}${googleWaypoints}&travelmode=driving`,
    apple: `https://maps.apple.com/?saddr=${encodeURIComponent(origin.name)}&daddr=${encodeURIComponent(appleRouteText)}&dirflg=d`,
    amap: `https://uri.amap.com/navigation?from=${amapPoint(origin)}&to=${amapPoint(destination)}${amapVia}&mode=car&policy=1&src=mvp&coordinate=gaode&callnative=1`,
    search: `https://www.google.com/maps/dir/${encodedPlaces.join("/")}`
  };
}

function buildTimeline(route: DayRoute) {
  const denominator = Math.max(route.stops.length - 1, 1);
  return route.stops.map((stop, index) => {
    if (index === 0) return { name: stop.name, time: "出发" };
    if (index === route.stops.length - 1) return { name: stop.name, time: `约 ${formatDriveHours(route.driveHours)} 抵达` };
    const elapsed = route.driveHours * (index / denominator);
    return { name: stop.name, time: `约 ${formatDriveHours(elapsed)} 后` };
  });
}

function buildShareText(route: DayRoute, review: DayReview, links: ReturnType<typeof mapLinks> | null, isAllView: boolean) {
  const title = isAllView ? "全程自驾路线" : `Day${route.day} 自驾路线`;
  const timeline = buildTimeline(route)
    .map((item, index) => `${index + 1}. ${item.time}：${item.name}`)
    .join("\n");
  const suggestions = review.suggestions.slice(0, 2).map((suggestion) => `- ${suggestion}`).join("\n");
  const mapLine = links?.amap ? `\n高德导航：${links.amap}` : "";

  return `${title}
${route.stops.map((stop) => stop.name).join(" - ")}

总长：${route.distanceKm}km
预计驾驶：${formatDriveHours(route.driveHours)}
驾驶压力：${driveBand(route.driveHours)}

关键节点：
${timeline}

评审：${review.summary}
优化建议：
${suggestions}${mapLine}`;
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const next = current + char;
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawRoundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

async function createShareImage(route: DayRoute, review: DayReview, isAllView: boolean) {
  const canvas = document.createElement("canvas");
  const width = 1080;
  const height = 1440;
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.scale(scale, scale);

  context.fillStyle = "#eef2f6";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  drawRoundRect(context, 48, 48, width - 96, height - 96, 18);
  context.fill();

  context.fillStyle = "#c2410c";
  context.font = "700 30px Arial, sans-serif";
  context.fillText(isAllView ? "全程自驾路线" : `Day${route.day} 自驾路线`, 88, 120);

  context.fillStyle = "#18212f";
  context.font = "800 52px Arial, sans-serif";
  const title = route.stops.map((stop) => stop.name).join(" - ");
  wrapCanvasText(context, title, width - 176).slice(0, 2).forEach((line, index) => {
    context.fillText(line, 88, 188 + index * 62);
  });

  const statsTop = 330;
  const stats = [
    [`${route.distanceKm}km`, "全长"],
    [formatDriveHours(route.driveHours), "预计驾驶"],
    [`${route.stops.length} 个`, "关键节点"]
  ];
  stats.forEach(([value, label], index) => {
    const x = 88 + index * 306;
    context.fillStyle = "#fff7ed";
    drawRoundRect(context, x, statsTop, 270, 112, 14);
    context.fill();
    context.fillStyle = "#7c2d12";
    context.font = "800 34px Arial, sans-serif";
    context.fillText(value, x + 24, statsTop + 48);
    context.fillStyle = "#64748b";
    context.font = "700 22px Arial, sans-serif";
    context.fillText(label, x + 24, statsTop + 84);
  });

  const mapTop = 515;
  context.strokeStyle = "#f97316";
  context.lineWidth = 8;
  context.lineCap = "round";
  context.beginPath();
  route.stops.forEach((_, index) => {
    const x = 130 + index * ((width - 260) / Math.max(route.stops.length - 1, 1));
    const y = mapTop + (index % 2 === 0 ? 22 : -22);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  route.stops.forEach((stop, index) => {
    const x = 130 + index * ((width - 260) / Math.max(route.stops.length - 1, 1));
    const y = mapTop + (index % 2 === 0 ? 22 : -22);
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#f97316";
    context.lineWidth = 6;
    context.beginPath();
    context.arc(x, y, 27, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#c2410c";
    context.font = "800 22px Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(String(index + 1), x, y + 8);
    context.fillStyle = "#334155";
    context.font = "700 20px Arial, sans-serif";
    wrapCanvasText(context, stop.name, 120).slice(0, 2).forEach((line, lineIndex) => {
      context.fillText(line, x, mapTop + 88 + lineIndex * 24);
    });
  });
  context.textAlign = "left";

  context.fillStyle = "#18212f";
  context.font = "800 30px Arial, sans-serif";
  context.fillText("关键时间点", 88, 760);
  const timeline = buildTimeline(route).slice(0, 8);
  timeline.forEach((item, index) => {
    const y = 820 + index * 58;
    context.fillStyle = "#f97316";
    context.beginPath();
    context.arc(104, y - 8, 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#18212f";
    context.font = "800 24px Arial, sans-serif";
    context.fillText(item.name, 130, y);
    context.fillStyle = "#64748b";
    context.font = "700 21px Arial, sans-serif";
    context.fillText(item.time, 130, y + 28);
  });

  context.fillStyle = "#12805c";
  context.font = "800 28px Arial, sans-serif";
  context.fillText("行程评审", 88, 1280);
  context.fillStyle = "#334155";
  context.font = "700 24px Arial, sans-serif";
  wrapCanvasText(context, review.summary, width - 176).slice(0, 2).forEach((line, index) => {
    context.fillText(line, 88, 1324 + index * 34);
  });

  context.fillStyle = "#94a3b8";
  context.font = "700 20px Arial, sans-serif";
  context.fillText("AI Roadtrip Reviewer", 88, 1392);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image export failed")), "image/png", 0.95);
  });
}

function routeKeyForPlaces(places: Place[]) {
  if (places.length < 2) return "";
  return places.map((place) => `${place.name}:${place.lng.toFixed(5)},${place.lat.toFixed(5)}`).join("|");
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="scoreRow">
      <span>{label}</span>
      <div className="meter" aria-label={`${label} ${value}`}>
        <div style={{ width: `${value}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>(1);
  const [geocodedPlaces, setGeocodedPlaces] = useState<Record<string, Place>>({});
  const geocodeAttemptedRef = useRef<Set<string>>(new Set());
  const placeDirectory = useMemo(() => ({ ...placeBook, ...geocodedPlaces }), [geocodedPlaces]);
  const routes = useMemo(() => parseItinerary(text, placeDirectory), [text, placeDirectory]);
  const allRoute = useMemo(() => buildAllRoute(routes), [routes]);
  const activeRoute = activeView === "all" ? allRoute : routes.find((route) => route.day === activeView) ?? routes[0];
  const isAllView = activeView === "all";
  const activeLinks = useMemo(
    () => activeRoute && activeRoute.places.length >= 2 ? mapLinks(activeRoute.places) : null,
    [activeRoute]
  );
  const missingStops = activeRoute?.stops.filter((stop) => stop.status === "missing") ?? [];
  const activeRouteKey = activeRoute ? routeKeyForPlaces(activeRoute.places) : "";
  const [metricsByRoute, setMetricsByRoute] = useState<Record<string, MetricsState>>({});
  const metricsRequestedRef = useRef<Set<string>>(new Set());
  const activeMetrics = activeRouteKey ? metricsByRoute[activeRouteKey] : undefined;
  const displayRoute = activeRoute ? routeWithMetrics(activeRoute, activeMetrics?.data) : null;
  const activeReview = useMemo(() => displayRoute ? reviewDay(displayRoute) : null, [displayRoute]);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const shareText = useMemo(
    () => displayRoute && activeReview ? buildShareText(displayRoute, activeReview, activeLinks, isAllView) : "",
    [displayRoute, activeReview, activeLinks, isAllView]
  );
  const timeline = useMemo(() => displayRoute ? buildTimeline(displayRoute) : [], [displayRoute]);

  useEffect(() => {
    geocodeAttemptedRef.current.clear();
  }, [text]);

  useEffect(() => {
    setShareStatus("idle");
  }, [shareText]);

  useEffect(() => {
    const missingNames = Array.from(new Set(
      routes.flatMap((route) => route.stops)
        .filter((stop) => stop.status === "missing")
        .map((stop) => stop.name)
    )).filter((name) => !geocodeAttemptedRef.current.has(name));

    if (missingNames.length === 0) return;
    missingNames.forEach((name) => geocodeAttemptedRef.current.add(name));

    async function resolveMissingStops() {
      try {
        const response = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: missingNames })
        });
        if (!response.ok) return;
        const data = await response.json() as {
          results?: Array<Place & { status: "resolved" | "missing" }>;
        };
        const resolved = (data.results ?? []).filter((place) => place.status === "resolved");
        if (resolved.length === 0) return;
        setGeocodedPlaces((current) => {
          const next = { ...current };
          resolved.forEach((place) => {
            next[place.name] = {
              name: place.name,
              lat: place.lat,
              lng: place.lng,
              adcode: place.adcode,
              provider: "amap"
            };
          });
          return next;
        });
      } catch {
        // Vercel API or map key may not be ready yet; the static fallback stays usable.
      }
    }

    resolveMissingStops();
  }, [routes]);

  useEffect(() => {
    if (!activeRoute || activeRoute.places.length < 2 || !activeRouteKey) return;
    if (metricsRequestedRef.current.has(activeRouteKey)) return;
    metricsRequestedRef.current.add(activeRouteKey);

    let cancelled = false;
    const places = activeRoute.places;
    setMetricsByRoute((current) => ({
      ...current,
      [activeRouteKey]: { status: "loading" }
    }));

    async function fetchRouteMetrics() {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ places, includeGeometry: false }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Route metrics unavailable");
        const data = await response.json() as RouteMetrics;
        if (cancelled) return;
        setMetricsByRoute((current) => ({
          ...current,
          [activeRouteKey]: { status: "ready", data }
        }));
      } catch {
        if (cancelled) return;
        setMetricsByRoute((current) => ({
          ...current,
          [activeRouteKey]: { status: "error" }
        }));
      } finally {
        window.clearTimeout(timeout);
      }
    }

    fetchRouteMetrics();

    return () => {
      cancelled = true;
    };
  }, [activeRoute, activeRouteKey]);

  async function copyShareText() {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setShareStatus("copied");
    } catch {
      setShareStatus("error");
    }
  }

  async function nativeShare() {
    if (!shareText || !displayRoute) return;
    const title = isAllView ? "全程自驾路线" : `Day${displayRoute.day} 自驾路线`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: shareText });
        setShareStatus("shared");
      } else {
        await copyShareText();
      }
    } catch {
      setShareStatus("error");
    }
  }

  async function downloadShareImage() {
    if (!displayRoute || !activeReview) return;
    try {
      const blob = await createShareImage(displayRoute, activeReview, isAllView);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${isAllView ? "roadtrip-full" : `roadtrip-day-${displayRoute.day}`}.png`;
      link.click();
      URL.revokeObjectURL(url);
      setShareStatus("downloaded");
    } catch {
      setShareStatus("error");
    }
  }

  async function shareImage() {
    if (!displayRoute || !activeReview) return;
    try {
      const blob = await createShareImage(displayRoute, activeReview, isAllView);
      const fileName = `${isAllView ? "roadtrip-full" : `roadtrip-day-${displayRoute.day}`}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const canShareFile = navigator.canShare?.({ files: [file] });
      if (navigator.share && canShareFile) {
        await navigator.share({
          title: isAllView ? "全程自驾路线" : `Day${displayRoute.day} 自驾路线`,
          files: [file]
        });
        setShareStatus("image");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        setShareStatus("downloaded");
      }
    } catch {
      setShareStatus("error");
    }
  }

  return (
    <main className="shell">
      <section className="workspace">
        <aside className="leftPane">
          <div className="topbar">
            <div>
              <p className="eyebrow"><Sparkles size={16} /> AI Roadtrip Reviewer</p>
              <h1>自驾行程评审</h1>
            </div>
            <button className="ghostButton" onClick={() => setText(sampleText)}>
              <Route size={16} /> 格聂南线示例
            </button>
          </div>

          <label className="inputBlock">
            <span>粘贴行程文本</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} />
          </label>

          <div className="dayTabs" role="tablist" aria-label="每日路线">
            <button
              className={isAllView ? "active" : ""}
              onClick={() => setActiveView("all")}
            >
              全程
            </button>
            {routes.map((route) => (
              <button
                key={route.day}
                className={!isAllView && route.day === activeRoute?.day ? "active" : ""}
                onClick={() => setActiveView(route.day)}
              >
                Day{route.day}
              </button>
            ))}
          </div>

          <section className="reviewList">
            {!displayRoute || !activeReview ? (
              <div className="emptyState">
                <Bot size={24} />
                <p>还没有解析到有效路线。请使用 “Day1 城市 - 城市” 这样的格式，并包含两个以上地点。</p>
              </div>
            ) : (
              <article className="reviewCard selected">
                <div className="pagerMeta">
                  <span>{isAllView ? "全程概览" : `Day ${displayRoute.day} / ${routes.length}`}</span>
                  <strong>{displayRoute.stops.length} 个识别地点</strong>
                </div>
                <div className="cardHead staticHead">
                  <span>{isAllView ? "全程" : `Day${displayRoute.day}`}</span>
                  <strong>{displayRoute.stops.map((stop) => stop.name).join(" - ")}</strong>
                </div>
                <div className="stopList" aria-label="地点识别状态">
                  {displayRoute.stops.map((stop, index) => (
                    <span className={stop.status === "resolved" ? "resolved" : "missing"} key={`${stop.name}-${index}`}>
                      {index + 1}. {stop.name}
                    </span>
                  ))}
                </div>
                {missingStops.length > 0 && (
                  <div className="missingNotice">
                    缺少坐标：{missingStops.map((stop) => stop.name).join("、")}。已保留该 Day，地图先展示可定位地点。
                  </div>
                )}
                <p className="summary"><CarFront size={16} /> {activeReview.summary}</p>
                <div className="metricNotice">
                  {activeMetrics?.status === "ready" && `高德路网估算：${displayRoute.distanceKm}km / ${formatDriveHours(displayRoute.driveHours)}`}
                  {activeMetrics?.status === "loading" && `当前先显示估算：${displayRoute.distanceKm}km / ${formatDriveHours(displayRoute.driveHours)}，正在后台校准高德路网数据...`}
                  {(!activeMetrics || activeMetrics.status === "idle") && "暂用文本或规则估算距离和耗时。"}
                  {activeMetrics?.status === "error" && "高德路网数据暂不可用，已使用文本或规则估算。"}
                </div>
                <ScoreBar label="驾驶压力" value={activeReview.pressure} />
                <ScoreBar label="时间紧张" value={activeReview.tightness} />
                <ScoreBar label="安全风险" value={activeReview.risk} />
                <div className="suggestions">
                  <p><ShieldCheck size={16} /> 优化建议</p>
                  {activeReview.suggestions.map((suggestion) => (
                    <span key={suggestion}>{suggestion}</span>
                  ))}
                </div>
                {activeLinks && (
                  <div className="mapButtons">
                    <a href={activeLinks.google} target="_blank" rel="noreferrer"><Navigation size={15} /> Google</a>
                    <a href={activeLinks.apple} target="_blank" rel="noreferrer"><Apple size={15} /> Apple</a>
                    <a href={activeLinks.amap} target="_blank" rel="noreferrer"><Map size={15} /> 高德</a>
                  </div>
                )}
                {!activeLinks && (
                  <div className="linkNotice">
                    当前可定位地点少于 2 个，暂不能生成地图跳转路线。
                  </div>
                )}
                <div className="shareBox">
                  <div className="shareHead">
                    <p><Share2 size={16} /> 分享路线包</p>
                    <span>{isAllView ? "全程" : `Day${displayRoute.day}`}</span>
                  </div>
                  <div className="shareMiniMap" aria-label="路线简图">
                    {displayRoute.stops.map((stop, index) => (
                      <div className="shareStop" key={`${stop.name}-share-${index}`}>
                        <span>{index + 1}</span>
                        <strong>{stop.name}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="shareStats">
                    <span>{displayRoute.distanceKm}km</span>
                    <span>{formatDriveHours(displayRoute.driveHours)}</span>
                    <span>{displayRoute.stops.length} 个节点</span>
                  </div>
                  <div className="timelineList">
                    {timeline.map((item, index) => (
                      <span key={`${item.name}-${index}`}>{index + 1}. {item.time} / {item.name}</span>
                    ))}
                  </div>
                  <div className="shareActions">
                    <button type="button" onClick={copyShareText}><Copy size={15} /> 复制文案</button>
                    <button type="button" onClick={nativeShare}><Share2 size={15} /> 系统分享</button>
                    <button type="button" onClick={downloadShareImage}><Download size={15} /> 下载图片</button>
                    <button type="button" onClick={shareImage}><ImageIcon size={15} /> 分享图片</button>
                  </div>
                  {shareStatus !== "idle" && (
                    <div className={shareStatus === "error" ? "shareFeedback error" : "shareFeedback"}>
                      {shareStatus === "copied" && <><Check size={14} /> 已复制分享文案</>}
                      {shareStatus === "shared" && <><Check size={14} /> 已打开系统分享</>}
                      {shareStatus === "image" && <><Check size={14} /> 已打开图片分享</>}
                      {shareStatus === "downloaded" && <><Check size={14} /> 已生成分享图片</>}
                      {shareStatus === "error" && "分享暂不可用，请稍后再试"}
                    </div>
                  )}
                </div>
              </article>
            )}
          </section>
        </aside>

        <section className="rightPane">
          <div className="mapHeader">
            <div>
              <p><Mountain size={16} /> {isAllView ? "全程路线" : "当前路线"}</p>
              <h2>{displayRoute ? displayRoute.stops.map((stop) => stop.name).join(" - ") : "等待路线"}</h2>
            </div>
            {displayRoute && (
              <div className="routeFacts">
                <span><Clock3 size={15} /> {formatDriveHours(displayRoute.driveHours)}</span>
                <span><AlertTriangle size={15} /> {driveBand(displayRoute.driveHours)}压力</span>
                <span>{displayRoute.distanceKm}km</span>
                <span>{activeMetrics?.status === "ready" ? "高德路网" : "估算"}</span>
              </div>
            )}
          </div>
          <MapPanel routes={routes} activeView={activeView} />
          {activeRoute && activeLinks && (
            <div className="activeFooter">
              <span>{activeRoute.places.length} / {activeRoute.stops.length} 个地点可绘制</span>
              <a href={activeLinks.search} target="_blank" rel="noreferrer">
                地图搜索 <ExternalLink size={14} />
              </a>
            </div>
          )}
          {activeRoute && !activeLinks && (
            <div className="activeFooter">
              <span>{activeRoute.places.length} / {activeRoute.stops.length} 个地点可绘制</span>
              <span>补充坐标后可生成路线</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
