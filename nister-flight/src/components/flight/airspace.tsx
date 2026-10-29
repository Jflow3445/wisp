"use client";
import { useEffect, useRef } from "react";
import { AIRCRAFT, clamp, initialAircraft, stepAircraft, type AircraftState, type PilotInput } from "@/lib/flight-physics";
import type { Round } from "./client";

export function Airspace({ round, practice, input, forces }: { round: Round | null; practice: AircraftState | null; input: PilotInput; forces: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null), latest = useRef({ round, practice, input, forces, at: 0 });
  useEffect(() => { latest.current = { round, practice, input, forces, at: round !== latest.current.round || practice !== latest.current.practice ? performance.now() : latest.current.at }; }, [round, practice, input, forces]);
  useEffect(() => {
    const element = canvas.current!, ctx = element.getContext("2d");
    if (!ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, width = 800, height = 360, last = 0, lastSource: AircraftState | null = null, aircraft = initialAircraft();
    const trail: Array<{ x: number; y: number }> = [];
    let flightId = "";
    const observer = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = width * ratio; element.height = height * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
    observer.observe(element);
    const render = (now: number) => {
      const value = latest.current, active = !!value.practice || value.round?.status === "FLYING";
      const source = value.practice ?? value.round?.pilot ?? null;
      const newId = value.practice ? "practice" : value.round?.id ?? "ready";
      if (flightId !== newId) { flightId = newId; trail.length = 0; lastSource = null; }
      const dt = Math.min(.035, Math.max(0, (now - last) / 1000)); last = now;
      if (source && source !== lastSource) { aircraft = { ...source }; lastSource = source; }
      // Short visual prediction only. Server receipts alone determine money.
      if (source && !value.practice && active && !reduced.matches && now - value.at < 900) {
        const substeps = Math.max(1, Math.ceil(dt * AIRCRAFT.timeScale / .02));
        for (let n = 0; n < substeps; n++) aircraft = stepAircraft(aircraft, value.input, aircraft.wind, dt * AIRCRAFT.timeScale / substeps || .001);
      } else if (!source) aircraft = initialAircraft();
      const scale = width < 500 ? .55 : .8, px = width * (width < 500 ? .68 : .55);
      const py = clamp(height * .54 + (220 - aircraft.y) * .12, height * .34, height * .73);
      const ground = py + aircraft.y * scale;
      const project = (x: number, y: number) => ({ x: px + (x - aircraft.x) * scale, y: py - (y - aircraft.y) * scale });
      const sky = ctx.createLinearGradient(0, 0, 0, height); sky.addColorStop(0, "#060f23"); sky.addColorStop(.64, "#142d43"); sky.addColorStop(1, "#496269");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
      const halo = ctx.createRadialGradient(width * .8, height * .18, 2, width * .8, height * .18, width * .7);
      halo.addColorStop(0, "#c5e6b921"); halo.addColorStop(1, "#a5d8c000"); ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);
      for (let n = 0; n < 36; n++) {
        const x = ((n * 137.51 - aircraft.x * .008) % width + width) % width, y = (n * 59.73) % (height * .4);
        ctx.fillStyle = `rgba(226,240,255,${.12 + n % 4 * .09})`; ctx.fillRect(x, y, 1.3, 1.3);
      }
      // Distant coastline, haze and moving cloud layers provide depth.
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath(); ctx.moveTo(0, height);
        for (let x = 0; x <= width + 12; x += 12) {
          const world = x + aircraft.x * (.02 + layer * .04), ridge = Math.sin(world * .006 + layer * 3) * 16 + Math.sin(world * .017) * 7;
          ctx.lineTo(x, height * (.69 + layer * .1) + ridge);
        }
        ctx.lineTo(width, height); ctx.fillStyle = ["#23414b", "#1b353e", "#132b31"][layer]; ctx.fill();
      }
      for (let n = 0; n < 6; n++) {
        const x = ((n * 219 - aircraft.x * .15) % (width + 220) + width + 220) % (width + 220) - 110;
        const y = height * .21 + Math.sin(n * 12) * 42 + aircraft.y * .025;
        const cloud = ctx.createRadialGradient(x, y, 2, x, y, 95); cloud.addColorStop(0, "#bcd8df13"); cloud.addColorStop(1, "#bcd8df00");
        ctx.fillStyle = cloud; ctx.fillRect(x - 95, y - 95, 190, 190);
      }
      if (ground < height + 40) {
        ctx.fillStyle = "#112a29"; ctx.fillRect(0, ground, width, height);
        ctx.fillStyle = "#92b6a2"; ctx.fillRect(0, ground, width, 1.5);
        ctx.strokeStyle = "#ccd4b5"; ctx.lineWidth = 2; ctx.setLineDash([22, 30]); ctx.lineDashOffset = aircraft.x * scale;
        ctx.beginPath(); ctx.moveTo(0, ground + 18); ctx.lineTo(width, ground + 18); ctx.stroke(); ctx.setLineDash([]);
      }
      if (active && source && !reduced.matches && (!trail.length || Math.hypot(aircraft.x - trail.at(-1)!.x, aircraft.y - trail.at(-1)!.y) > 3)) {
        trail.push({ x: aircraft.x, y: aircraft.y }); if (trail.length > 150) trail.shift();
      }
      if (trail.length) {
        ctx.beginPath(); trail.forEach((p, n) => { const s = project(p.x, p.y); if (n) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
        ctx.strokeStyle = "#d4fda84d"; ctx.lineWidth = 2; ctx.stroke();
      }
      if (active && !reduced.matches) {
        ctx.strokeStyle = "#d7e9f71c"; ctx.lineWidth = 1;
        for (let n = 0; n < 18; n++) {
          const x = ((n * 107 - aircraft.x * (1 + n % 3 * .1)) % width + width) % width, y = (n * 83) % height;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.min(26, aircraft.airspeed * .24), y + aircraft.wind.y * .2); ctx.stroke();
        }
      }
      ctx.save(); ctx.translate(px, py); ctx.rotate(-aircraft.pitch);
      const size = width < 500 ? .8 : 1; ctx.scale(size, size);
      ctx.shadowColor = "#d5f6ff55"; ctx.shadowBlur = 18;
      const metal = ctx.createLinearGradient(0, -12, 0, 15); metal.addColorStop(0, "#f1f8f8"); metal.addColorStop(.5, "#adc3ca"); metal.addColorStop(1, "#597b8b");
      ctx.fillStyle = metal;
      ctx.beginPath(); ctx.moveTo(-49, 3); ctx.lineTo(-40, -4); ctx.lineTo(25, -8); ctx.quadraticCurveTo(44, -6, 57, 1); ctx.quadraticCurveTo(44, 8, 25, 8); ctx.lineTo(-46, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#8da8b2"; ctx.beginPath(); ctx.moveTo(-37, 1); ctx.lineTo(-49, -22); ctx.lineTo(-40, -22); ctx.lineTo(-23, 0); ctx.fill();
      ctx.fillStyle = "#d8fa8c"; ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(-22, -39); ctx.lineTo(-9, -38); ctx.lineTo(17, -4); ctx.fill();
      ctx.fillStyle = "#b6d1da"; ctx.beginPath(); ctx.moveTo(10, 3); ctx.lineTo(-15, 36); ctx.lineTo(-28, 34); ctx.lineTo(-3, 3); ctx.fill();
      ctx.fillStyle = "#244355"; ctx.beginPath(); ctx.moveTo(23, -7); ctx.lineTo(33, -5); ctx.lineTo(38, 0); ctx.lineTo(22, 0); ctx.fill();
      ctx.fillStyle = "#eea784"; ctx.fillRect(-43, -21, 4, 2); ctx.fillStyle = "#dcff9c"; ctx.fillRect(-18, -38, 4, 2);
      ctx.shadowBlur = 0; ctx.restore();
      if (value.forces && source) {
        const colors = { lift: "#b6f780", drag: "#f8b17d", thrust: "#91d5ff", weight: "#cbb7ff" };
        for (const key of ["lift", "drag", "thrust", "weight"] as const) {
          const f = aircraft.forces[key], magnitude = Math.hypot(f.x, f.y); if (magnitude < 1) continue;
          const length = clamp(magnitude / 200, 12, width < 500 ? 64 : 85), ux = f.x / magnitude, uy = -f.y / magnitude;
          const start = 15, ex = px + ux * (length + start), ey = py + uy * (length + start);
          ctx.strokeStyle = colors[key]; ctx.fillStyle = colors[key]; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(px + ux * start, py + uy * start); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * 7 - uy * 4, ey - uy * 7 + ux * 4); ctx.lineTo(ex - ux * 7 + uy * 4, ey - uy * 7 - ux * 4); ctx.fill();
          ctx.font = "600 12px system-ui"; ctx.textAlign = ux > .2 ? "left" : ux < -.2 ? "right" : "center";
          ctx.fillText(key.toUpperCase(), ex + ux * 7, ey + (uy > 0 ? 16 : -8));
        }
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  return <canvas ref={canvas} className="f-airspace" role="img" aria-label="Aircraft responding to lift, drag, thrust and gravity over a moving coastline"/>;
}
