"use client";

import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useRef } from "react";

export interface EscapePoint { x: number; y: number }
export interface EscapeRect { left: number; top: number; right: number; bottom: number; width: number; height: number }

export interface EscapeFrameInput {
  button: EscapeRect;
  bounds: EscapeRect;
  velocity: EscapePoint;
  pointer: EscapePoint | null;
  obstacle?: EscapeRect | null;
  /** Elapsed seconds; long/background frames are capped rather than jumped. */
  delta: number;
}

export interface UseNoEscapeOptions {
  arenaRef: RefObject<HTMLElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  obstacleRef?: RefObject<HTMLElement | null>;
  enabled: boolean;
  reducedMotion?: boolean;
  onAttempt?: (attempt: number) => void;
  onStatus?: (message: string) => void;
}

const EDGE_MARGIN = 14;
const OBSTACLE_GUTTER = 12;
const INFLUENCE_RADIUS = 140;
const MAX_SPEED = 250;
const STATUS_LINES = ["nice try.", "nah... try the other one.", "wrong button 😭", "that one seems unavailable."];

function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max); }
function magnitude(point: EscapePoint) { return Math.hypot(point.x, point.y); }
function at(position: EscapePoint, size: EscapeRect): EscapeRect {
  return { left: position.x, top: position.y, right: position.x + size.width, bottom: position.y + size.height, width: size.width, height: size.height };
}
function overlaps(a: EscapeRect, b: EscapeRect, gutter = OBSTACLE_GUTTER) {
  return a.left < b.right + gutter && a.right > b.left - gutter && a.top < b.bottom + gutter && a.bottom > b.top - gutter;
}
function distanceFromPointer(button: EscapeRect, pointer: EscapePoint) {
  return Math.hypot(button.left + button.width / 2 - pointer.x, button.top + button.height / 2 - pointer.y);
}

/** The first wall crossed by the entire moving button, including YES's gutter. */
function sweptCollision(button: EscapeRect, target: EscapePoint, obstacle: EscapeRect) {
  let enter = 0;
  let leave = 1;
  let axis: "x" | "y" = "x";
  for (const [key, origin, delta, min, max] of [
    ["x", button.left, target.x - button.left, obstacle.left - button.width - OBSTACLE_GUTTER, obstacle.right + OBSTACLE_GUTTER],
    ["y", button.top, target.y - button.top, obstacle.top - button.height - OBSTACLE_GUTTER, obstacle.bottom + OBSTACLE_GUTTER],
  ] as const) {
    if (Math.abs(delta) < 0.00001) {
      if (origin <= min || origin >= max) return null;
      continue;
    }
    const near = Math.min((min - origin) / delta, (max - origin) / delta);
    const far = Math.max((min - origin) / delta, (max - origin) / delta);
    if (near >= enter) { enter = near; axis = key; }
    leave = Math.min(leave, far);
    if (enter >= leave) return null;
  }
  return enter < 1 && leave > 0 ? { time: enter, axis } : null;
}

function safePosition(button: EscapeRect, bounds: EscapeRect, obstacle?: EscapeRect | null): EscapePoint {
  const minX = bounds.left + EDGE_MARGIN;
  const maxX = Math.max(minX, bounds.right - EDGE_MARGIN - button.width);
  const minY = bounds.top + EDGE_MARGIN;
  const maxY = Math.max(minY, bounds.bottom - EDGE_MARGIN - button.height);
  const position = { x: clamp(button.left, minX, maxX), y: clamp(button.top, minY, maxY) };
  if (!obstacle || !overlaps(at(position, button), obstacle)) return position;
  // Only layout/viewport changes can place YES underneath an existing position.
  // Correct to the nearest clear side; ordinary movement uses swept collision.
  const candidates = [
    { x: obstacle.right + OBSTACLE_GUTTER, y: position.y },
    { x: obstacle.left - OBSTACLE_GUTTER - button.width, y: position.y },
    { x: position.x, y: obstacle.top - OBSTACLE_GUTTER - button.height },
    { x: position.x, y: obstacle.bottom + OBSTACLE_GUTTER },
  ].filter(point => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY && !overlaps(at(point, button), obstacle));
  candidates.sort((a, b) => Math.hypot(a.x - position.x, a.y - position.y) - Math.hypot(b.x - position.x, b.y - position.y));
  return candidates[0] ?? position;
}

/** One continuous physics frame. No destinations, random angles or cooldowns. */
export function stepEscape({ button, bounds, pointer, obstacle, velocity, delta }: EscapeFrameInput) {
  const position = safePosition(button, bounds, obstacle);
  const current = at(position, button);
  const center = { x: current.left + current.width / 2, y: current.top + current.height / 2 };
  const dt = clamp(delta, 0, 1 / 30);
  const distance = pointer ? distanceFromPointer(current, pointer) : Infinity;
  const influence = Math.max(0, 1 - distance / INFLUENCE_RADIUS);
  let force = { x: 0, y: 0 };

  if (pointer && influence > 0) {
    // An exact-center press has no away vector. Reuse momentum, or take the
    // same gentle diagonal each time instead of choosing a random destination.
    const speed = magnitude(velocity);
    const away = distance > 0.5
      ? { x: (center.x - pointer.x) / distance, y: (center.y - pointer.y) / distance }
      : speed > 1 ? { x: velocity.x / speed, y: velocity.y / speed } : { x: 0.86, y: -0.51 };
    force = { x: away.x, y: away.y };

    // Gradually turn an outward force along an approaching wall. At a corner
    // the free tangent points back into the viewport, so chasing never pins NO.
    const steer = (normal: EscapePoint, clearance: number, tangent: EscapePoint) => {
      const outward = force.x * normal.x + force.y * normal.y;
      if (outward <= 0 || clearance >= 42) return;
      const turn = outward * (1 - Math.max(0, clearance) / 42);
      force.x += turn * (tangent.x * 1.15 - normal.x);
      force.y += turn * (tangent.y * 1.15 - normal.y);
    };
    const vertical = Math.abs(away.y) > 0.22 ? Math.sign(away.y) : Math.abs(velocity.y) > 15 ? Math.sign(velocity.y) : center.y < (bounds.top + bounds.bottom) / 2 ? 1 : -1;
    const horizontal = Math.abs(away.x) > 0.22 ? Math.sign(away.x) : Math.abs(velocity.x) > 15 ? Math.sign(velocity.x) : center.x < (bounds.left + bounds.right) / 2 ? 1 : -1;
    const verticalTangent = center.y < bounds.top + EDGE_MARGIN + button.height / 2 + 48 ? 1 : center.y > bounds.bottom - EDGE_MARGIN - button.height / 2 - 48 ? -1 : vertical;
    const horizontalTangent = center.x < bounds.left + EDGE_MARGIN + button.width / 2 + 48 ? 1 : center.x > bounds.right - EDGE_MARGIN - button.width / 2 - 48 ? -1 : horizontal;
    steer({ x: -1, y: 0 }, current.left - bounds.left - EDGE_MARGIN, { x: 0, y: verticalTangent });
    steer({ x: 1, y: 0 }, bounds.right - EDGE_MARGIN - current.right, { x: 0, y: verticalTangent });
    steer({ x: 0, y: -1 }, current.top - bounds.top - EDGE_MARGIN, { x: horizontalTangent, y: 0 });
    steer({ x: 0, y: 1 }, bounds.bottom - EDGE_MARGIN - current.bottom, { x: horizontalTangent, y: 0 });

    if (obstacle) {
      const gutter = OBSTACLE_GUTTER;
      const verticalOverlap = current.bottom > obstacle.top - gutter && current.top < obstacle.bottom + gutter;
      const horizontalOverlap = current.right > obstacle.left - gutter && current.left < obstacle.right + gutter;
      const aroundY = center.y < (obstacle.top + obstacle.bottom) / 2 ? -1 : 1;
      const aroundX = center.x < (obstacle.left + obstacle.right) / 2 ? -1 : 1;
      if (verticalOverlap && current.left >= obstacle.right + gutter) steer({ x: -1, y: 0 }, current.left - obstacle.right - gutter, { x: 0, y: aroundY });
      if (verticalOverlap && current.right <= obstacle.left - gutter) steer({ x: 1, y: 0 }, obstacle.left - gutter - current.right, { x: 0, y: aroundY });
      if (horizontalOverlap && current.top >= obstacle.bottom + gutter) steer({ x: 0, y: -1 }, current.top - obstacle.bottom - gutter, { x: aroundX, y: 0 });
      if (horizontalOverlap && current.bottom <= obstacle.top - gutter) steer({ x: 0, y: 1 }, obstacle.top - gutter - current.bottom, { x: aroundX, y: 0 });
    }
    const strength = 2900 * influence ** 1.4;
    force.x *= strength;
    force.y *= strength;
  }

  const damping = Math.exp(-9 * dt);
  const nextVelocity = { x: (velocity.x + force.x * dt) * damping, y: (velocity.y + force.y * dt) * damping };
  const speed = magnitude(nextVelocity);
  if (speed > MAX_SPEED) { nextVelocity.x *= MAX_SPEED / speed; nextVelocity.y *= MAX_SPEED / speed; }
  if (speed < 0.4 && influence < 0.02) { nextVelocity.x = 0; nextVelocity.y = 0; }
  const next = {
    x: clamp(position.x + nextVelocity.x * dt, bounds.left + EDGE_MARGIN, Math.max(bounds.left + EDGE_MARGIN, bounds.right - EDGE_MARGIN - button.width)),
    y: clamp(position.y + nextVelocity.y * dt, bounds.top + EDGE_MARGIN, Math.max(bounds.top + EDGE_MARGIN, bounds.bottom - EDGE_MARGIN - button.height)),
  };
  if (obstacle) {
    const collision = sweptCollision(current, next, obstacle);
    if (collision) {
      const axis = collision.axis;
      // Keep the entire rendered frame on the clear side of the contacted wall;
      // retaining the tangent component creates sliding instead of a hard stop.
      next[axis] = position[axis] + (next[axis] - position[axis]) * Math.max(0, collision.time - 0.0001);
      nextVelocity[axis] = 0;
    }
  }
  if (next.x === position.x) nextVelocity.x = 0;
  if (next.y === position.y) nextVelocity.y = 0;
  return { position: next, velocity: nextVelocity };
}

export function useNoEscape({ arenaRef, buttonRef, obstacleRef, enabled, reducedMotion = false, onAttempt, onStatus }: UseNoEscapeOptions) {
  const offsetRef = useRef<EscapePoint>({ x: 0, y: 0 });
  const callbacks = useRef({ onAttempt, onStatus });
  const handlers = useRef<{
    down: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    click: (event?: ReactMouseEvent<HTMLButtonElement>) => void;
  }>({ down: () => {}, click: () => {} });
  const attempts = useRef(0);

  useEffect(() => { callbacks.current = { onAttempt, onStatus }; }, [onAttempt, onStatus]);

  useEffect(() => {
    const button = buttonRef.current;
    const arena = arenaRef.current;
    if (!enabled || !button || !arena) return;
    let frame: number | null = null;
    let previousTime = 0;
    let velocity: EscapePoint = { x: 0, y: 0 };
    let pointer: (EscapePoint & { kind: "mouse" | "touch" }) | null = null;
    let touchId: number | null = null;
    let touchRelease = Infinity;
    let armed = true;
    let suppressClickUntil = -Infinity;

    const announce = () => {
      attempts.current += 1;
      callbacks.current.onAttempt?.(attempts.current);
      callbacks.current.onStatus?.(STATUS_LINES[(attempts.current - 1) % STATUS_LINES.length]);
    };
    const geometry = () => {
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? (document.documentElement.clientWidth || window.innerWidth);
      const height = viewport?.height ?? window.innerHeight;
      // Transforms are written directly once per frame with no CSS easing.
      // Subtracting that exact rendered offset leaves the live layout origin.
      return { button: rect, origin: { x: rect.left - offsetRef.current.x, y: rect.top - offsetRef.current.y },
        bounds: { left, top, width, height, right: left + width, bottom: top + height },
        obstacle: obstacleRef?.current?.getBoundingClientRect() };
    };
    const tick = (now: number) => {
      frame = null;
      if (pointer?.kind === "touch" && touchId === null && now >= touchRelease) pointer = null;
      const layout = geometry();
      if (layout.bounds.width < layout.button.width + EDGE_MARGIN * 2 || layout.bounds.height < layout.button.height + EDGE_MARGIN * 2) return;
      const result = stepEscape({ ...layout, pointer, velocity, delta: previousTime ? (now - previousTime) / 1000 : 1 / 60 });
      velocity = result.velocity;
      const offset = { x: result.position.x - layout.origin.x, y: result.position.y - layout.origin.y };
      offsetRef.current = offset;
      button.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)`;
      previousTime = now;
      if (magnitude(velocity) > 0) frame = window.requestAnimationFrame(tick);
      else previousTime = 0;
    };
    const start = () => { if (!reducedMotion && frame === null) frame = window.requestAnimationFrame(tick); };
    const stop = () => {
      pointer = null; touchId = null; velocity = { x: 0, y: 0 }; previousTime = 0;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
    const move = (event: PointerEvent) => {
      if (reducedMotion) return;
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        if (touchId !== event.pointerId) return;
        pointer = { x: event.clientX, y: event.clientY, kind: "touch" };
        start();
        return;
      }
      if (event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      pointer = { x: event.clientX, y: event.clientY, kind: "mouse" };
      const distance = distanceFromPointer(button.getBoundingClientRect(), pointer);
      if (distance > INFLUENCE_RADIUS + 40) armed = true;
      if (distance < INFLUENCE_RADIUS && armed) { armed = false; announce(); }
      if (distance < INFLUENCE_RADIUS || magnitude(velocity) > 0) start();
    };
    const release = (event: PointerEvent) => {
      if (event.pointerId !== touchId) return;
      touchId = null;
      // A quick tap still gets a small continuous slip after the finger lifts.
      touchRelease = performance.now() + (event.type === "pointercancel" ? 0 : 180);
      start();
    };
    const leave = (event: PointerEvent) => { if (event.relatedTarget === null && pointer?.kind === "mouse") { pointer = null; start(); } };
    const resize = () => { if (offsetRef.current.x || offsetRef.current.y) start(); };
    const keyboard = (event: KeyboardEvent) => { if (["Tab", "Enter", " "].includes(event.key)) stop(); };
    const visibility = () => { if (document.hidden) stop(); };

    handlers.current = {
      down: event => {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        suppressClickUntil = performance.now() + 750;
        armed = false;
        announce();
        if (reducedMotion) return;
        const isTouch = event.pointerType === "touch" || event.pointerType === "pen";
        pointer = { x: event.clientX, y: event.clientY, kind: isTouch ? "touch" : "mouse" };
        if (isTouch) {
          touchId = event.pointerId; touchRelease = Infinity;
          try { button.setPointerCapture(event.pointerId); } catch { /* A synthetic/a11y event may have no active pointer. */ }
        }
        start();
      },
      click: event => {
        event?.preventDefault();
        if (event?.detail !== 0 && performance.now() < suppressClickUntil) return;
        // Keyboard/assistive activation stops motion and stays on this screen.
        stop();
        announce();
      },
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    window.addEventListener("pointerout", leave, { passive: true });
    window.addEventListener("keydown", keyboard);
    window.addEventListener("blur", stop);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(arena);
    observer?.observe(button);
    return () => {
      stop();
      handlers.current = { down: () => {}, click: () => {} };
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("pointerout", leave);
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("blur", stop);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize);
      document.removeEventListener("visibilitychange", visibility);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      observer?.disconnect();
    };
  }, [arenaRef, buttonRef, enabled, obstacleRef, reducedMotion]);

  return {
    onNoPointerDown: useCallback((event: ReactPointerEvent<HTMLButtonElement>) => handlers.current.down(event), []),
    onNoClick: useCallback((event?: ReactMouseEvent<HTMLButtonElement>) => handlers.current.click(event), []),
  };
}
