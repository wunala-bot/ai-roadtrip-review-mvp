"use client";

import { AlertTriangle, Apple, Bot, CarFront, Clock3, ExternalLink, Map, Mountain, Navigation, Route, ShieldCheck, Sparkles } from "lucide-react";
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

function driveBand(hours: number) {
  if (hours >= 7) return "高";
  if (hours >= 5) return "中";
  return "低";
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
  const [text, setText] = useState(sampleText);
  const [activeView, setActiveView] = useState<ActiveView>(1);
  const [geocodedPlaces, setGeocodedPlaces] = useState<Record<string, Place>>({});
  const geocodeAttemptedRef = useRef<Set<string>>(new Set());
  const placeDirectory = useMemo(() => ({ ...placeBook, ...geocodedPlaces }), [geocodedPlaces]);
  const routes = useMemo(() => parseItinerary(text, placeDirectory), [text, placeDirectory]);
  const allRoute = useMemo(() => buildAllRoute(routes), [routes]);
  const activeRoute = activeView === "all" ? allRoute : routes.find((route) => route.day === activeView) ?? routes[0];
  const activeReview = useMemo(() => activeRoute ? reviewDay(activeRoute) : null, [activeRoute]);
  const isAllView = activeView === "all";
  const activeLinks = activeRoute && activeRoute.places.length >= 2 ? mapLinks(activeRoute.places) : null;
  const missingStops = activeRoute?.stops.filter((stop) => stop.status === "missing") ?? [];

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
            {!activeRoute || !activeReview ? (
              <div className="emptyState">
                <Bot size={24} />
                <p>还没有解析到有效路线。请使用 “Day1 城市 - 城市” 这样的格式，并包含两个以上地点。</p>
              </div>
            ) : (
              <article className="reviewCard selected">
                <div className="pagerMeta">
                  <span>{isAllView ? "全程概览" : `Day ${activeRoute.day} / ${routes.length}`}</span>
                  <strong>{activeRoute.stops.length} 个识别地点</strong>
                </div>
                <div className="cardHead staticHead">
                  <span>{isAllView ? "全程" : `Day${activeRoute.day}`}</span>
                  <strong>{activeRoute.stops.map((stop) => stop.name).join(" - ")}</strong>
                </div>
                <div className="stopList" aria-label="地点识别状态">
                  {activeRoute.stops.map((stop, index) => (
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
              </article>
            )}
          </section>
        </aside>

        <section className="rightPane">
          <div className="mapHeader">
            <div>
              <p><Mountain size={16} /> {isAllView ? "全程路线" : "当前路线"}</p>
              <h2>{activeRoute ? activeRoute.stops.map((stop) => stop.name).join(" - ") : "等待路线"}</h2>
            </div>
            {activeRoute && (
              <div className="routeFacts">
                <span><Clock3 size={15} /> {activeRoute.driveHours}h</span>
                <span><AlertTriangle size={15} /> {driveBand(activeRoute.driveHours)}压力</span>
                <span>{activeRoute.distanceKm}km</span>
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
