"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngExpression, LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";

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

export default function RouteMap({ routes, activeDay }: { routes: DayRoute[]; activeDay: number }) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);

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

      const activeRoute = routes.find((route) => route.day === activeDay) ?? routes[0];
      if (!activeRoute) return;

      const bounds: [number, number][] = [];
      routes.forEach((route) => {
        const points: LatLngExpression[] = route.places.map((place) => [place.lat, place.lng]);
        const isActive = route.day === activeRoute.day;
        L.polyline(points, {
          color: isActive ? "#f97316" : "#94a3b8",
          weight: isActive ? 5 : 2,
          opacity: isActive ? 0.95 : 0.35,
          dashArray: isActive ? undefined : "6 8"
        }).addTo(routeLayer);
      });

      activeRoute.places.forEach((place, index) => {
        bounds.push([place.lat, place.lng]);
        const marker = L.divIcon({
          className: "routeMarker",
          html: `<span>${index + 1}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });

        L.marker([place.lat, place.lng], { icon: marker })
          .addTo(routeLayer)
          .bindTooltip(place.name, { direction: "top", offset: [0, -12] });
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 10 });
      }
    }

    renderMap();

    return () => {
      cancelled = true;
    };
  }, [routes, activeDay]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div className="leafletCanvas" ref={nodeRef} />;
}
