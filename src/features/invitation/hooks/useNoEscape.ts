"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface EscapePoint {
  x: number;
  y: number;
}

export interface EscapeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface EscapeSolverInput {
  arena: EscapeRect;
  button: EscapeRect;
  pointer: EscapePoint;
  /** A rectangle the NO button should make room for, normally the YES CTA. */
  obstacle?: EscapeRect | null;
  /** How often it has already escaped in this question screen. */
  attempt: number;
  reducedMotion?: boolean;
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

export interface UseNoEscapeResult {
  /** Use as a transform; the button remains in normal keyboard/tab order. */
  offset: EscapePoint;
  onArenaPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onNoPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onNoClick: (event?: ReactMouseEvent<HTMLButtonElement>) => void;
}

const ARENA_PADDING = 8;
const OBSTACLE_GUTTER = 12;
const PROXIMITY_RADIUS = 124;
const REARM_RADIUS = PROXIMITY_RADIUS + 30;
const ESCAPE_COOLDOWN_MS = 340;

const STATUS_LINES = [
  "Nice try — it has places to be.",
  "That button is feeling a little shy.",
  "Nope is currently unavailable. ♡",
  "It politely declined being clicked.",
];

function toEscapeRect(rect: DOMRect): EscapeRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function distance(a: EscapePoint, b: EscapePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rotate(vector: EscapePoint, radians: number): EscapePoint {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

function overlaps(
  first: EscapeRect,
  second: EscapeRect,
  gutter = 0,
): boolean {
  return !(
    first.right + gutter <= second.left ||
    first.left >= second.right + gutter ||
    first.bottom + gutter <= second.top ||
    first.top >= second.bottom + gutter
  );
}

function candidateRect(
  left: number,
  top: number,
  button: EscapeRect,
): EscapeRect {
  return {
    left,
    top,
    width: button.width,
    height: button.height,
    right: left + button.width,
    bottom: top + button.height,
  };
}

/** Swept AABB: test the entire straight CSS transition against an expanded YES. */
function routeCollides(button: EscapeRect, target: EscapeRect, obstacle: EscapeRect): boolean {
  let enter = 0;
  let leave = 1;
  const axes = [
    [button.left, target.left - button.left, obstacle.left - button.width - OBSTACLE_GUTTER, obstacle.right + OBSTACLE_GUTTER],
    [button.top, target.top - button.top, obstacle.top - button.height - OBSTACLE_GUTTER, obstacle.bottom + OBSTACLE_GUTTER],
  ];
  for (const [origin, delta, min, max] of axes) {
    if (Math.abs(delta) < 0.0001) {
      if (origin <= min || origin >= max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const last = (max - origin) / delta;
    enter = Math.max(enter, Math.min(first, last));
    leave = Math.min(leave, Math.max(first, last));
    if (enter >= leave) return false;
  }
  return enter < 1 && leave > 0;
}

/**
 * Pure, deterministic solver used by the cursor and touch interactions. It
 * favours space away from the approaching pointer, stays inside the arena and
 * gives the YES control a generous berth. It never relies on teleporty random
 * positions, so each escape reads as an intentional route.
 */
export function chooseEscapePosition(input: EscapeSolverInput): EscapePoint {
  const { arena, button, pointer, obstacle, attempt, reducedMotion = false } = input;
  if (reducedMotion) return { x: button.left, y: button.top };
  const buttonCenter = {
    x: button.left + button.width / 2,
    y: button.top + button.height / 2,
  };
  const awayDistance = distance(buttonCenter, pointer);
  const fallbackAngle = ((attempt * 53 + 31) * Math.PI) / 180;
  const away =
    awayDistance > 0.5
      ? {
          x: (buttonCenter.x - pointer.x) / awayDistance,
          y: (buttonCenter.y - pointer.y) / awayDistance,
        }
      : { x: Math.cos(fallbackAngle), y: Math.sin(fallbackAngle) };

  const travel = Math.min(72 + Math.min(attempt, 5) * 12, 132);
  const angularOffsets = [0, 0.34, -0.34, 0.7, -0.7, 1.08, -1.08, Math.PI];
  const minLeft = arena.left + ARENA_PADDING;
  const maxLeft = Math.max(minLeft, arena.right - ARENA_PADDING - button.width);
  const minTop = arena.top + ARENA_PADDING;
  const maxTop = Math.max(minTop, arena.bottom - ARENA_PADDING - button.height);

  let best = { x: button.left, y: button.top, score: Number.NEGATIVE_INFINITY };

  for (const angularOffset of angularOffsets) {
    const direction = rotate(away, angularOffset);
    const left = clamp(button.left + direction.x * travel, minLeft, maxLeft);
    const top = clamp(button.top + direction.y * travel, minTop, maxTop);
    const candidate = candidateRect(left, top, button);
    const center = {
      x: candidate.left + candidate.width / 2,
      y: candidate.top + candidate.height / 2,
    };
    const edgeClearance = Math.min(
      candidate.left - arena.left,
      arena.right - candidate.right,
      candidate.top - arena.top,
      arena.bottom - candidate.bottom,
    );
    const routeDistance = distance(center, buttonCenter);
    const pointerDistance = distance(center, pointer);
    const directionAlignment = direction.x * away.x + direction.y * away.y;
    if (obstacle && (overlaps(candidate, obstacle, OBSTACLE_GUTTER) || routeCollides(button, candidate, obstacle))) continue;

    // Keep the original deterministic direction/distance scoring, but never
    // accept a colliding route even when all other candidates are constrained.
    const score =
      pointerDistance * 3 +
      edgeClearance * 0.55 +
      routeDistance * 0.22 +
      directionAlignment * 18;

    if (score > best.score) best = { x: left, y: top, score };
  }

  return { x: best.x, y: best.y };
}

function hasFinePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function measureLayout(arena: HTMLElement, button: HTMLButtonElement) {
  const parent = button.offsetParent instanceof HTMLElement ? button.offsetParent : arena;
  const parentRect = parent.getBoundingClientRect();
  const scaleX = parent.offsetWidth ? parentRect.width / parent.offsetWidth : 1;
  const scaleY = parent.offsetHeight ? parentRect.height / parent.offsetHeight : 1;
  const style = window.getComputedStyle(button);
  const left = Number.parseFloat(style.left);
  const top = Number.parseFloat(style.top);
  // Layout offsets never contain the in-flight transform. The old calculation
  // subtracted a rendered DOMRect from a target offset and counted easing twice.
  const base = {
    x: parentRect.left + (parent.clientLeft + (Number.isFinite(left) ? left : button.offsetLeft)) * scaleX,
    y: parentRect.top + (parent.clientTop + (Number.isFinite(top) ? top : button.offsetTop)) * scaleY,
  };
  const rect = toEscapeRect(arena.getBoundingClientRect());
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const bounds = {
    left: Math.max(rect.left, viewportLeft),
    top: Math.max(rect.top, viewportTop),
    right: Math.min(rect.right, viewportLeft + (viewport?.width ?? window.innerWidth)),
    bottom: Math.min(rect.bottom, viewportTop + (viewport?.height ?? window.innerHeight)),
  };
  return { base, scaleX: scaleX || 1, scaleY: scaleY || 1,
    arena: { ...bounds, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top } };
}

export function useNoEscape({
  arenaRef,
  buttonRef,
  obstacleRef,
  enabled,
  reducedMotion = false,
  onAttempt,
  onStatus,
}: UseNoEscapeOptions): UseNoEscapeResult {
  const [offset, setOffset] = useState<EscapePoint>({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const attemptsRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const queuedPointerRef = useRef<EscapePoint | null>(null);
  const approachArmedRef = useRef(true);
  const lastEscapeRef = useRef(Number.NEGATIVE_INFINITY);
  const suppressClickUntilRef = useRef(Number.NEGATIVE_INFINITY);

  const announceAttempt = useCallback(() => {
    attemptsRef.current += 1;
    const attempt = attemptsRef.current;
    onAttempt?.(attempt);
    onStatus?.(STATUS_LINES[(attempt - 1) % STATUS_LINES.length]);
    return attempt;
  }, [onAttempt, onStatus]);

  const escapeFrom = useCallback(
    (pointer: EscapePoint, countAttempt: boolean) => {
      const arena = arenaRef.current;
      const button = buttonRef.current;
      if (!enabled || !arena || !button) return;
      const now = performance.now();
      if (now - lastEscapeRef.current < ESCAPE_COOLDOWN_MS) return;
      lastEscapeRef.current = now;

      const attempt = countAttempt ? announceAttempt() : attemptsRef.current;
      if (reducedMotion) return;
      const buttonRect = toEscapeRect(button.getBoundingClientRect());
      const layout = measureLayout(arena, button);
      if (layout.arena.width < buttonRect.width + ARENA_PADDING * 2 ||
        layout.arena.height < buttonRect.height + ARENA_PADDING * 2) return;
      const target = chooseEscapePosition({
        arena: layout.arena,
        button: buttonRect,
        pointer,
        obstacle: obstacleRef?.current
          ? toEscapeRect(obstacleRef.current.getBoundingClientRect())
          : null,
        attempt,
        reducedMotion,
      });

      const next = {
        x: (target.x - layout.base.x) / layout.scaleX,
        y: (target.y - layout.base.y) / layout.scaleY,
      };

      if (
        Math.abs(next.x - offsetRef.current.x) < 1 &&
        Math.abs(next.y - offsetRef.current.y) < 1
      ) {
        return;
      }

      offsetRef.current = next;
      setOffset(next);
    },
    [
      announceAttempt,
      arenaRef,
      buttonRef,
      enabled,
      obstacleRef,
      reducedMotion,
    ],
  );

  const onArenaPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || reducedMotion || event.pointerType !== "mouse" || !hasFinePointer()) {
        return;
      }

      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const pointer = { x: event.clientX, y: event.clientY };
      const pointerDistance = distance(center, pointer);
      if (pointerDistance > REARM_RADIUS) {
        approachArmedRef.current = true;
        queuedPointerRef.current = null;
        return;
      }
      if (pointerDistance > PROXIMITY_RADIUS || !approachArmedRef.current ||
        performance.now() - lastEscapeRef.current < ESCAPE_COOLDOWN_MS) return;

      approachArmedRef.current = false;
      queuedPointerRef.current = pointer;
      if (animationFrameRef.current !== null) return;
      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        const queued = queuedPointerRef.current;
        queuedPointerRef.current = null;
        if (queued) escapeFrom(queued, true);
      });
    },
    [buttonRef, enabled, escapeFrom, reducedMotion],
  );

  const onNoPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!enabled || (event.button !== undefined && event.button !== 0)) return;
      event.preventDefault();
      suppressClickUntilRef.current = performance.now() + 750;
      approachArmedRef.current = false;
      escapeFrom({ x: event.clientX, y: event.clientY }, true);
    },
    [enabled, escapeFrom],
  );

  const onNoClick = useCallback((event?: ReactMouseEvent<HTMLButtonElement>) => {
    if (!enabled) return;
    if (event?.detail !== 0 && performance.now() < suppressClickUntilRef.current) return;
    // Keyboard and assistive-technology activation keep the focused control
    // stationary. Pointer activation was already handled by pointerdown.
    announceAttempt();
  }, [announceAttempt, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const arena = arenaRef.current;
    const button = buttonRef.current;
    if (!arena || !button) return;
    let resizeFrame: number | null = null;
    let restoreFrame: number | null = null;
    let previousTransition: string | null = null;
    const restoreTransition = () => {
      if (previousTransition !== null) button.style.transition = previousTransition;
      previousTransition = null;
      restoreFrame = null;
    };
    const constrain = () => {
      resizeFrame = null;
      const layout = measureLayout(arena, button);
      const rect = toEscapeRect(button.getBoundingClientRect());
      // A completely scrolled-off arena needs no escape position. Recheck when
      // it reenters the viewport rather than pulling the button into content.
      if (layout.arena.width < rect.width + ARENA_PADDING * 2 || layout.arena.height < rect.height + ARENA_PADDING * 2) return;
      const x = clamp(layout.base.x + offsetRef.current.x * layout.scaleX,
        layout.arena.left + ARENA_PADDING, layout.arena.right - ARENA_PADDING - rect.width);
      const y = clamp(layout.base.y + offsetRef.current.y * layout.scaleY,
        layout.arena.top + ARENA_PADDING, layout.arena.bottom - ARENA_PADDING - rect.height);
      let next = { x: (x - layout.base.x) / layout.scaleX, y: (y - layout.base.y) / layout.scaleY };
      const obstacle = obstacleRef?.current?.getBoundingClientRect();
      if (obstacle && overlaps(candidateRect(x, y, rect), toEscapeRect(obstacle), OBSTACLE_GUTTER)) {
        // Responsive layout changes may move YES under a previous target. This
        // correction is immediate, so find a clear slot inside the new bounds.
        const minX = layout.arena.left + ARENA_PADDING;
        const maxX = layout.arena.right - ARENA_PADDING - rect.width;
        const minY = layout.arena.top + ARENA_PADDING;
        const maxY = layout.arena.bottom - ARENA_PADDING - rect.height;
        const slots = [
          { x: clamp(layout.base.x, minX, maxX), y: clamp(layout.base.y, minY, maxY) },
          { x: minX, y: minY }, { x: maxX, y: minY },
          { x: minX, y: maxY }, { x: maxX, y: maxY },
        ];
        const clear = slots.find((slot) => !overlaps(candidateRect(slot.x, slot.y, rect), toEscapeRect(obstacle), OBSTACLE_GUTTER));
        if (!clear) return;
        next = { x: (clear.x - layout.base.x) / layout.scaleX, y: (clear.y - layout.base.y) / layout.scaleY };
      }
      if (Math.abs(next.x - offsetRef.current.x) < 0.1 && Math.abs(next.y - offsetRef.current.y) < 0.1) return;
      offsetRef.current = next;
      // Resizing is a bounds correction, not a new escape: update immediately
      // so the old animation cannot carry the button outside a narrowed card.
      if (restoreFrame !== null) window.cancelAnimationFrame(restoreFrame);
      if (previousTransition === null) previousTransition = button.style.transition;
      button.style.transition = "none";
      button.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
      setOffset(next);
      restoreFrame = window.requestAnimationFrame(restoreTransition);
    };
    const schedule = () => {
      if (resizeFrame === null) resizeFrame = window.requestAnimationFrame(constrain);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(arena);
    observer?.observe(button);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      if (restoreFrame !== null) window.cancelAnimationFrame(restoreFrame);
      restoreTransition();
    };
  }, [arenaRef, buttonRef, enabled, obstacleRef]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      queuedPointerRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      attemptsRef.current = 0;
      offsetRef.current = { x: 0, y: 0 };
      approachArmedRef.current = true;
      lastEscapeRef.current = Number.NEGATIVE_INFINITY;
      suppressClickUntilRef.current = Number.NEGATIVE_INFINITY;
      queueMicrotask(() => {
        setOffset((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
      });
    }
  }, [enabled]);

  return { offset, onArenaPointerMove, onNoPointerDown, onNoClick };
}
