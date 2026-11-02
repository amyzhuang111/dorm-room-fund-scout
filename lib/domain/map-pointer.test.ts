import assert from "node:assert/strict";
import { mapPointFromPointer } from "./map-pointer";

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

// DPR must not be applied (passing a "fake" high-DPR by using layout coords only)
{
  const container = {
    clientWidth: 390,
    clientHeight: 260,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 260 } as DOMRect),
  };
  const p = mapPointFromPointer(container, 195, 130);
  assert.equal(p.x, 195);
  assert.equal(p.y, 130);
}

console.log("map-pointer tests ok");
