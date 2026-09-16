import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseEscapePosition, useNoEscape, type EscapeRect } from "@/features/invitation/hooks/useNoEscape";

function rect(left: number, top: number, width: number, height: number): EscapeRect {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function overlaps(a: EscapeRect, b: EscapeRect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe("NO escape geometry", () => {
  it("keeps the whole escape route clear of YES, not only its destination", () => {
    const button = rect(8, 48, 70, 42);
    const obstacle = rect(145, 90, 110, 46);
    const target = chooseEscapePosition({ arena: rect(0, 0, 430, 250), button, obstacle, pointer: { x: 60, y: 90 }, attempt: 5 });
    for (let step = 0; step <= 100; step++) {
      const progress = step / 100;
      expect(overlaps(rect(button.left + (target.x - button.left) * progress, button.top + (target.y - button.top) * progress, button.width, button.height), obstacle)).toBe(false);
    }
  });

  it.each([
    [{ x: 150, y: 172 }, "right"],
    [{ x: 290, y: 172 }, "left"],
    [{ x: 220, y: 100 }, "down"],
    [{ x: 220, y: 250 }, "up"],
  ] as const)("escapes away from the approach %j", (pointer, direction) => {
    const button = rect(180, 150, 80, 44);
    const target = chooseEscapePosition({ arena: rect(0, 0, 440, 360), button, pointer, attempt: 1 });
    if (direction === "right") expect(target.x).toBeGreaterThan(button.left);
    if (direction === "left") expect(target.x).toBeLessThan(button.left);
    if (direction === "down") expect(target.y).toBeGreaterThan(button.top);
    if (direction === "up") expect(target.y).toBeLessThan(button.top);
  });

  it("keeps every candidate bounded after repeated escapes near all edges", () => {
    const arena = rect(0, 0, 286, 156);
    let button = rect(164, 22, 74, 48);
    for (let attempt = 0; attempt < 100; attempt++) {
      const target = chooseEscapePosition({ arena, button, pointer: { x: button.left + 37, y: button.top + 24 }, attempt });
      expect(target.x).toBeGreaterThanOrEqual(8);
      expect(target.y).toBeGreaterThanOrEqual(8);
      expect(target.x + button.width).toBeLessThanOrEqual(arena.right - 8);
      expect(target.y + button.height).toBeLessThanOrEqual(arena.bottom - 8);
      button = rect(target.x, target.y, button.width, button.height);
    }
  });
});

describe("NO interaction lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  function fixture(reducedMotion = false) {
    const arena = document.createElement("div");
    const button = document.createElement("button");
    arena.append(button);
    document.body.append(arena);
    let bounds = rect(0, 0, 400, 164);
    let buttonBounds = rect(220, 30, 80, 48);
    Object.defineProperties(arena, { offsetWidth: { get: () => bounds.width }, clientWidth: { get: () => bounds.width }, offsetHeight: { get: () => bounds.height }, clientHeight: { get: () => bounds.height } });
    Object.defineProperties(button, { offsetLeft: { get: () => 220 }, offsetTop: { get: () => 30 }, offsetWidth: { get: () => 80 }, offsetHeight: { get: () => 48 }, offsetParent: { get: () => arena } });
    arena.getBoundingClientRect = () => bounds as DOMRect;
    button.getBoundingClientRect = () => buttonBounds as DOMRect;
    const onAttempt = vi.fn();
    const onStatus = vi.fn();
    const hook = renderHook(() => useNoEscape({ arenaRef: { current: arena }, buttonRef: { current: button }, enabled: true, reducedMotion, onAttempt, onStatus }));
    const move = (x: number, y: number) => act(() => { hook.result.current.onArenaPointerMove({ pointerType: "mouse", clientX: x, clientY: y } as never); vi.advanceTimersByTime(17); });
    return { ...hook, arena, button, onAttempt, onStatus, move, setButton: (value: EscapeRect) => { buttonBounds = value; }, setArena: (value: EscapeRect) => { bounds = value; } };
  }

  it("does not double-count target offsets while the previous escape is still easing", () => {
    const view = fixture();
    view.move(210, 54);
    view.setButton(rect(240, 30, 80, 48));
    // The rendered button has travelled 20px, while its earlier target is farther away.
    view.move(235, 54);
    expect(220 + view.result.current.offset.x + 80).toBeLessThanOrEqual(392);
  });

  it("counts a chase once instead of treating every animation frame as an attempt", () => {
    const view = fixture();
    for (let frame = 0; frame < 20; frame++) view.move(230 + frame / 10, 54);
    expect(view.onAttempt).toHaveBeenCalledTimes(1);
  });

  it("uses the layout origin for a fresh press while rendering lags behind its previous target", () => {
    const view = fixture();
    view.move(210, 54);
    view.setButton(rect(240, 30, 80, 48));
    act(() => vi.advanceTimersByTime(400));
    act(() => view.result.current.onNoPointerDown({ pointerType: "mouse", clientX: 235, clientY: 54, preventDefault: vi.fn() } as never));
    expect(view.onAttempt).toHaveBeenCalledTimes(2);
    expect(220 + view.result.current.offset.x + 80).toBeLessThanOrEqual(392);
  });

  it("rearms after the pointer retreats and approaches again", () => {
    const view = fixture();
    view.move(210, 54);
    view.move(600, 300);
    act(() => vi.advanceTimersByTime(400));
    view.move(210, 54);
    expect(view.onAttempt).toHaveBeenCalledTimes(2);
  });

  it("keeps keyboard and reduced-motion activation stationary with feedback", () => {
    const view = fixture();
    act(() => view.result.current.onNoClick());
    expect(view.result.current.offset).toEqual({ x: 0, y: 0 });
    expect(view.onStatus).toHaveBeenCalledTimes(1);
    view.unmount();
    const reduced = fixture(true);
    act(() => reduced.result.current.onNoPointerDown({ pointerType: "touch", clientX: 250, clientY: 50, preventDefault: vi.fn() } as never));
    expect(reduced.result.current.offset).toEqual({ x: 0, y: 0 });
    expect(reduced.onStatus).toHaveBeenCalledTimes(1);
  });

  it("deduplicates the click following a touch escape", () => {
    const view = fixture();
    act(() => view.result.current.onNoPointerDown({ pointerType: "touch", clientX: 260, clientY: 54, preventDefault: vi.fn() } as never));
    act(() => view.result.current.onNoClick());
    expect(view.onAttempt).toHaveBeenCalledTimes(1);
  });

  it("still accepts a keyboard click immediately after pointer interaction", () => {
    const view = fixture();
    act(() => view.result.current.onNoPointerDown({ pointerType: "touch", clientX: 260, clientY: 54, preventDefault: vi.fn() } as never));
    const previous = view.result.current.offset;
    act(() => view.result.current.onNoClick({ detail: 0 } as never));
    expect(view.onAttempt).toHaveBeenCalledTimes(2);
    expect(view.result.current.offset).toEqual(previous);
  });

  it("re-clamps a previous offset when the viewport or arena narrows", () => {
    const view = fixture();
    view.move(210, 54);
    view.setArena(rect(0, 0, 320, 156));
    view.setButton(rect(312, 30, 80, 48));
    act(() => { window.dispatchEvent(new Event("resize")); vi.advanceTimersByTime(17); });
    expect(220 + view.result.current.offset.x + 80).toBeLessThanOrEqual(312);
  });
});
