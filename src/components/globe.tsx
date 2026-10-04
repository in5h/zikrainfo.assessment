"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land from "world-atlas/land-110m.json";

/**
 * Interactive dotted globe (three.js). Land is drawn as dots sampled from the
 * Natural Earth 110m land outline; each city is a glowing, pulsing pin with a
 * clickable HTML label. Drag to spin. Selecting a city eases it to the front.
 */

/** `side` places the label left/right of the pin so nearby cities (Lisbon, Rome) don't overlap. */
export type GlobeCity = { id: string; name: string; country: string; lat: number; lng: number; emoji: string; side?: "left" | "right" | "top" };

const R = 1;

function latLngToVec(lat: number, lng: number, r = R) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const th = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}

/** Rotation that brings (lat, lng) to face a camera on +z (verified numerically). */
function facing(lat: number, lng: number) {
  const v = latLngToVec(lat, lng);
  return { x: (lat * Math.PI) / 180, y: -Math.atan2(v.x, v.z) };
}

/** Rasterise land polygons into an equirectangular mask we can sample. */
function landMask(w = 720, h = 360) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const topo = land as unknown as Topology<{ land: GeometryCollection }>;
  const geo = feature(topo, topo.objects.land) as unknown as GeoJSON.FeatureCollection;
  ctx.fillStyle = "#000";
  for (const f of geo.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      ctx.beginPath();
      for (const ring of poly) {
        ring.forEach(([lng, lat], i) => {
          const x = ((lng + 180) / 360) * w;
          const y = ((90 - lat) / 180) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fill("evenodd");
    }
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  return (lat: number, lng: number) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor(((lng + 180) / 360) * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * h)));
    return data[(y * w + x) * 4 + 3] > 0;
  };
}

function glowTexture(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color + "aa");
  g.addColorStop(1, color + "00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Globe({
  cities,
  selected,
  onSelect,
  className,
}: {
  cities: GlobeCity[];
  selected: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const labels = useRef<Record<string, HTMLButtonElement | null>>({});
  const target = useRef<{ x: number; y: number } | null>(null);
  // Read by the render loop, so selection changes don't rebuild the scene.
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Ease to the selected city.
  useEffect(() => {
    const c = cities.find((x) => x.id === selected);
    if (c) target.current = facing(c.lat, c.lng);
  }, [selected, cities]);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    // Vertical swipes still scroll the page on phones; horizontal drags spin the globe.
    renderer.domElement.style.touchAction = "pan-y";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 3.9);

    const globe = new THREE.Group();
    scene.add(globe);

    // Ocean sphere + soft atmosphere.
    globe.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(R * 0.995, 64, 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color("#0b3b45"), transparent: true, opacity: 0.92 })
      )
    );
    // Thin bright rim (the soft outer glow is a CSS gradient behind the canvas).
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.015, 64, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { c: { value: new THREE.Color("#5eead4") } },
        vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: "uniform vec3 c; varying vec3 vN; void main(){ float i = pow(1.0 - abs(dot(vN, vec3(0.0,0.0,1.0))), 4.0); gl_FragColor = vec4(c, i * 0.9); }",
      })
    );
    scene.add(rim);

    // Land dots on a Fibonacci sphere.
    const isLand = landMask();
    const N = 16000;
    const pos: number[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      const lat = (Math.asin(y) * 180) / Math.PI;
      const v = new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r);
      const lng = ((Math.atan2(v.z, -v.x) * 180) / Math.PI + 360) % 360 - 180;
      if (lat < -60 || !isLand(lat, lng)) continue;
      const p = latLngToVec(lat, lng, R * 1.001);
      pos.push(p.x, p.y, p.z);
    }
    const dots = new THREE.BufferGeometry();
    dots.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    globe.add(new THREE.Points(dots, new THREE.PointsMaterial({ color: "#a7f3d0", size: 0.016, sizeAttenuation: true, transparent: true, opacity: 0.95 })));

    // City pins, pulse rings and arcs.
    const glow = glowTexture("#fbbf24");
    const pins = cities.map((c) => {
      const p = latLngToVec(c.lat, c.lng, R * 1.005);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, depthWrite: false, transparent: true }));
      sprite.position.copy(p);
      sprite.scale.setScalar(0.11);
      globe.add(sprite);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.03, 0.036, 48),
        new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.position.copy(p);
      ring.lookAt(p.clone().multiplyScalar(2));
      globe.add(ring);
      return { id: c.id, p, sprite, ring };
    });
    for (let i = 0; i < pins.length; i++) {
      const a = pins[i].p;
      const b = pins[(i + 1) % pins.length].p;
      const mid = a.clone().add(b).normalize().multiplyScalar(R + a.distanceTo(b) * 0.35);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      globe.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(64)),
          new THREE.LineBasicMaterial({ color: "#fcd34d", transparent: true, opacity: 0.35 })
        )
      );
    }

    // Start facing Europe.
    const start = facing(30, 25);
    globe.rotation.set(start.x * 0.6, start.y, 0);

    // Drag to spin.
    let dragging = false;
    let last = { x: 0, y: 0 };
    let idleSince = performance.now();
    const down = (e: PointerEvent) => {
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
      target.current = null;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      globe.rotation.y += (e.clientX - last.x) * 0.006;
      globe.rotation.x = Math.max(-1.1, Math.min(1.1, globe.rotation.x + (e.clientY - last.y) * 0.004));
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      dragging = false;
      idleSince = performance.now();
    };
    renderer.domElement.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const tmp = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const t = target.current;
      if (t) {
        // Shortest way round, then ease.
        const dy = ((t.y - globe.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        globe.rotation.y += dy * 0.08;
        globe.rotation.x += (t.x - globe.rotation.x) * 0.08;
      } else if (!dragging && !reduced && now - idleSince > 1200) {
        globe.rotation.y += 0.0012;
      }
      const pulse = (now % 2000) / 2000;
      for (const pin of pins) {
        const active = pin.id === selectedRef.current;
        pin.ring.scale.setScalar(1 + pulse * (active ? 2.6 : 1.6));
        (pin.ring.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * (active ? 1 : 0.6);
        pin.sprite.scale.setScalar(active ? 0.16 : 0.1);
      }
      renderer.render(scene, camera);

      // Position HTML labels; hide the ones on the far side.
      const { width, height } = el.getBoundingClientRect();
      camera.getWorldDirection(camDir);
      for (const pin of pins) {
        const node = labels.current[pin.id];
        if (!node) continue;
        tmp.copy(pin.p).applyMatrix4(globe.matrixWorld);
        const visible = tmp.clone().normalize().dot(camDir) < -0.15;
        tmp.project(camera);
        const side = cities.find((c) => c.id === pin.id)?.side ?? "top";
        const offset = side === "left" ? "translate(calc(-100% - 12px), -50%)" : side === "right" ? "translate(12px, -50%)" : "translate(-50%, -140%)";
        node.style.transform = `translate(${((tmp.x + 1) / 2) * width}px, ${((1 - tmp.y) / 2) * height}px) ${offset}`;
        node.style.opacity = visible ? "1" : "0";
        node.style.pointerEvents = visible ? "auto" : "none";
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      glow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [cities]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <div className="pointer-events-none absolute inset-[4%] rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.45)_0%,rgba(45,212,191,0.18)_45%,transparent_70%)] blur-2xl" />
      <div ref={mount} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      {cities.map((c) => (
        <button
          key={c.id}
          ref={(n) => {
            labels.current[c.id] = n;
            // Hidden until the render loop positions it; after that the loop owns opacity.
            if (n && !n.style.opacity) n.style.opacity = "0";
          }}
          type="button"
          onClick={() => onSelect(c.id)}
          // Labels move every frame; don't let focus scroll the page to them.
          onMouseDown={(e) => e.preventDefault()}
          className={`absolute top-0 left-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap shadow-lg backdrop-blur transition-[opacity,background-color] duration-300 ${
            selected === c.id ? "bg-amber-300 text-amber-950" : "bg-white/85 text-slate-800 hover:bg-white"
          }`}
        >
          {c.emoji} {c.name}
        </button>
      ))}
    </div>
  );
}
