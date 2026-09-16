import { describe, expect, it } from "vitest";
import { stepEscape, type EscapePoint, type EscapeRect } from "@/features/invitation/hooks/useNoEscape";

const rect = (left: number, top: number, width: number, height: number): EscapeRect => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

function frame(button: EscapeRect, pointer: EscapePoint | null, velocity = { x: 0, y: 0 }, obstacle?: EscapeRect) {
  return stepEscape({ button, pointer, velocity, obstacle, bounds: rect(0, 0, 800, 600), delta: 1 / 60 });
}

describe("continuous NO-button physics", () => {
  it("remains perfectly stationary while the cursor is far away", () => {
    const button = rect(330, 260, 92, 48);
    const result = frame(button, { x: 20, y: 20 });
    expect(result.position).toEqual({ x: button.left, y: button.top });
    expect(result.velocity).toEqual({ x: 0, y: 0 });
  });

  it("moves away continuously and accelerates more strongly at close range", () => {
    const button = rect(330, 260, 92, 48);
    const near = frame(button, { x: 360, y: 284 });
    const farther = frame(button, { x: 250, y: 284 });
    expect(near.position.x).toBeGreaterThan(button.left);
    expect(Math.hypot(near.velocity.x, near.velocity.y)).toBeGreaterThan(Math.hypot(farther.velocity.x, farther.velocity.y));
    const next = frame(rect(near.position.x, near.position.y, 92, 48), { x: 361, y: 284 }, near.velocity);
    expect(next.position.x).toBeGreaterThan(near.position.x);
  });

  it("damps existing velocity naturally when the cursor backs away", () => {
    const button = rect(330, 260, 92, 48);
    const velocity = { x: 180, y: -40 };
    const result = frame(button, null, velocity);
    expect(Math.hypot(result.velocity.x, result.velocity.y)).toBeLessThan(Math.hypot(velocity.x, velocity.y));
    expect(result.position.x).toBeGreaterThan(button.left);
  });

  it("keeps the entire button inside safe viewport margins", () => {
    let button = rect(690, 530, 92, 48);
    let velocity = { x: 220, y: 180 };
    for (let index = 0; index < 90; index++) {
      const result = frame(button, { x: 700, y: 550 }, velocity);
      button = rect(result.position.x, result.position.y, button.width, button.height);
      velocity = result.velocity;
      expect(button.left).toBeGreaterThanOrEqual(14);
      expect(button.top).toBeGreaterThanOrEqual(14);
      expect(button.right).toBeLessThanOrEqual(786);
      expect(button.bottom).toBeLessThanOrEqual(586);
    }
  });

  it("slides around YES without crossing through it", () => {
    const obstacle = rect(340, 260, 142, 52);
    let button = rect(230, 265, 92, 48);
    let velocity = { x: 240, y: 25 };
    for (let index = 0; index < 90; index++) {
      const result = frame(button, { x: 180, y: 280 }, velocity, obstacle);
      button = rect(result.position.x, result.position.y, button.width, button.height);
      velocity = result.velocity;
      const overlapsYes = button.left < obstacle.right + 12 && button.right > obstacle.left - 12 &&
        button.top < obstacle.bottom + 12 && button.bottom > obstacle.top - 12;
      expect(overlapsYes).toBe(false);
    }
  });

  it("uses deterministic motion for an exact-center touch", () => {
    const button = rect(330, 260, 92, 48);
    const center = { x: 376, y: 284 };
    expect(frame(button, center)).toEqual(frame(button, center));
    expect(frame(button, center).position).not.toEqual({ x: button.left, y: button.top });
  });
});
