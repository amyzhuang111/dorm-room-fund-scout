import assert from "node:assert/strict";
import { formatMapHitMiss, mapPointFromPointer, nearestProjectedMarker } from "./map-pointer";

// Unscaled: identity
{
  const container = {
    clientWidth: 390,
    clientHeight: 260,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 390, height: 260 } as DOMRect),
  };
  const p = mapPointFromPointer(container, 10 + 100, 20 + 50);
  assert.equal(p.x, 100);
  assert.equal(p.y, 50);
}

// CSS transform scale(0.5): visual rect half of layout — must undo scale
{
  const container = {
    clientWidth: 390,
    clientHeight: 260,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 195, height: 130 } as DOMRect),
  };
  const p = mapPointFromPointer(container, 97.5, 65);
  assert.ok(Math.abs(p.x - 195) < 0.01, `x=${p.x}`);
  assert.ok(Math.abs(p.y - 130) < 0.01, `y=${p.y}`);
}

// Stale-rect scenario: each call re-reads getBoundingClientRect
{
  let left = 0;
  const container = {
    clientWidth: 100,
    clientHeight: 100,
    getBoundingClientRect: () => ({ left, top: 0, width: 100, height: 100 } as DOMRect),
  };
  assert.equal(mapPointFromPointer(container, 50, 50).x, 50);
  left = 40; // scrolled / moved
  assert.equal(mapPointFromPointer(container, 50, 50).x, 10);
}

{
  const markers = [
    { id: "a", name: "A", founders: 1, signals: 0, country: "US", x: 100, y: 100 },
    { id: "b", name: "B", founders: 1, signals: 0, country: "US", x: 200, y: 200 },
  ];
  const hit = nearestProjectedMarker({ x: 105, y: 108 }, markers, 40);
  assert.equal(hit?.id, "a");
  assert.ok(hit && hit.dist < 10);
  assert.equal(nearestProjectedMarker({ x: 0, y: 0 }, markers, 40), null);
}

{
  const msg = formatMapHitMiss({ x: 10, y: 20 }, [{ id: "a", name: "A", x: 100, y: 100, dist: 120 }]);
  assert.match(msg, /miss point=\(10\.0,20\.0\)/);
  assert.match(msg, /a@\(100\.0,100\.0\)/);
}

console.log("map-pointer tests ok");
