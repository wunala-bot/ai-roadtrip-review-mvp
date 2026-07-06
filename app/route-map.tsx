"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngExpression, LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";

type Place = {
  name: string;
  lat: number;
  lng: number;
};

type DayRoute = {
  day: number;
  title: string;
  places: Place[];
  distanceKm: number;
  driveHours: number;
  roadLevel: "easy" | "moderate" | "hard";
};

type RouteStatus = "idle" | "loading" | "matched" | "fallback" | "insufficient";
type ActiveView = number | "all";

type MapPoint = Place & {
  label: string;
};

const routeColors = {
  casing: "#111827",
  primary: "#f97316",
  fallback: "#f43f5e"
};

async function fetchRoadGeometry(places: Place[]): Promise<[number, number][]> {
  const coordinates = places.map((place) => `${place.lng},${place.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Route service unavailable");
  const data = await response.json() as {
    routes?: Array<{
      geometry?: {
        coordinates?: Array<[number, number]>;
      };
    }>;
  };
  const route = data.routes?.[0]?.geometry?.coordinates;
  if (!route || route.length < 2) throw new Error("No route geometry");
  return route.map(([lng, lat]) => [lat, lng]);
}

function buildAllMapPoints(routes: DayRoute[]): MapPoint[] {
  return routes.flatMap((route, routeIndex) => {
    const previousPlaces = routes[routeIndex - 1]?.places ?? [];
    const previousLast = previousPlaces[previousPlaces.length - 1];
    const places = routeIndex > 0 && previousLast?.name === route.places[0]?.name
      ? route.places.slice(1)
      : route.places;
    return places.map((place, placeIndex) => ({
      ...place,
      label: `D${route.day}.${placeIndex + 1}`
    }));
  });
}

function buildDayMapPoints(route: DayRoute): MapPoint[] {
  return route.places.map((place, index) => ({
    ...place,
    label: `${index + 1}`
  }));
}

export default function RouteMap({ routes, activeView }: { routes: DayRoute[]; activeView: ActiveView }) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>("idle");

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      if (!nodeRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !nodeRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(nodeRef.current, {
          zoomControl: false,
          scrollWheelZoom: true
        }).setView([29.9, 100.2], 8);

        L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 18
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      routeLayerRef.current?.remove();
      const routeLayer = L.layerGroup().addTo(map);
      routeLayerRef.current = routeLayer;

      const activeRoute = activeView === "all" ? null : routes.find((route) => route.day === activeView) ?? routes[0];
      const mapPoints = activeView === "all" ? buildAllMapPoints(routes) : activeRoute ? buildDayMapPoints(activeRoute) : [];
      if (mapPoints.length === 0) {
        setRouteStatus("insufficient");
        return;
      }

      const bounds: [number, number][] = [];
      const straightPoints: LatLngExpression[] = mapPoints.map((place) => [place.lat, place.lng]);

      if (mapPoints.length < 2) {
        setRouteStatus("insufficient");
      } else {
        setRouteStatus("loading");
        try {
          const roadPoints = await fetchRoadGeometry(mapPoints);
          if (cancelled) return;
          setRouteStatus("matched");
          L.polyline(roadPoints, {
            color: routeColors.casing,
            weight: 9,
            opacity: 0.72
          }).addTo(routeLayer);
          L.polyline(roadPoints, {
            color: routeColors.primary,
            weight: 5,
            opacity: 0.95
          }).addTo(routeLayer);
        } catch {
          if (cancelled) return;
          setRouteStatus("fallback");
          L.polyline(straightPoints, {
            color: routeColors.casing,
            weight: 9,
            opacity: 0.62,
            dashArray: "8 8"
          }).addTo(routeLayer);
          L.polyline(straightPoints, {
            color: routeColors.fallback,
            weight: 5,
            opacity: 0.9,
            dashArray: "8 8"
          }).addTo(routeLayer);
        }
      }

      mapPoints.forEach((place, index) => {
        bounds.push([place.lat, place.lng]);
        const marker = L.divIcon({
          className: "routeMarker",
          html: `<span>${activeView === "all" ? index + 1 : place.label}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });

        L.marker([place.lat, place.lng], { icon: marker })
          .addTo(routeLayer)
          .bindTooltip(`${activeView === "all" ? index + 1 : place.label}. ${place.name}`, {
            className: "placeLabel",
            direction: "right",
            offset: [16, 0],
            permanent: true
          });
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 10 });
      } else {
        map.setView(bounds[0], 9);
      }
    }

    renderMap();

    return () => {
      cancelled = true;
    };
  }, [routes, activeView]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="mapFrame">
      {routeStatus !== "idle" && (
        <div className="routeStatus">
          {routeStatus === "loading" && "正在匹配道路路线..."}
          {routeStatus === "matched" && "已按道路路网显示路线"}
          {routeStatus === "fallback" && "路网匹配失败，已使用地点连线"}
          {routeStatus === "insufficient" && "已识别行程，但可绘制坐标不足"}
        </div>
      )}
      <div className="leafletCanvas" ref={nodeRef} />
    </div>
  );
}
