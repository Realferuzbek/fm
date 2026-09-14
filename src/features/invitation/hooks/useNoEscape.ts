"use client";

import {
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
  onNoClick: () => void;
}

const ARENA_PADDING = 8;
const OBSTACLE_GUTTER = 12;
const PROXIMITY_RADIUS = 124;

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

/**
 * Pure, deterministic solver used by the cursor and touch interactions. It
 * favours space away from the approaching pointer, stays inside the arena and
 * gives the YES control a generous berth. It never relies on teleporty random
 * positions, so each escape reads as an intentional route.
 */
export function chooseEscapePosition(input: EscapeSolverInput): EscapePoint {
  const { arena, button, pointer, obstacle, attempt, reducedMotion = false } = input;
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

  const travel = reducedMotion
    ? 34
    : Math.min(72 + Math.min(attempt, 5) * 12, 132);
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
    const collidesWithObstacle = obstacle
      ? overlaps(candidate, obstacle, OBSTACLE_GUTTER)
      : false;

    // A collision loses decisively; otherwise, cursor distance dominates and
    // boundary breathing room breaks ties near card edges.
    const score =
      pointerDistance * 3 +
      edgeClearance * 0.55 +
      routeDistance * 0.22 +
      directionAlignment * 18 -
      (collidesWithObstacle ? 100_000 : 0);

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

      const attempt = countAttempt ? announceAttempt() : attemptsRef.current;
      const buttonRect = toEscapeRect(button.getBoundingClientRect());
      const target = chooseEscapePosition({
        arena: toEscapeRect(arena.getBoundingClientRect()),
        button: buttonRect,
        pointer,
        obstacle: obstacleRef?.current
          ? toEscapeRect(obstacleRef.current.getBoundingClientRect())
          : null,
        attempt,
        reducedMotion,
      });

      // getBoundingClientRect includes the current transform. Convert the
      // absolute target back to the transform delta the button expects.
      const next = {
        x: offsetRef.current.x + (target.x - buttonRect.left),
        y: offsetRef.current.y + (target.y - buttonRect.top),
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
      if (distance(center, pointer) > PROXIMITY_RADIUS) return;

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
      if (!enabled || event.pointerType === "mouse") return;
      event.preventDefault();
      escapeFrom({ x: event.clientX, y: event.clientY }, true);
    },
    [enabled, escapeFrom],
  );

  const onNoClick = useCallback(() => {
    if (!enabled) return;
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    // Keyboard-generated clicks have no pointer position; using the button's
    // centre creates a predictable bounded nudge without stealing focus.
    escapeFrom(
      { x: rect.left + rect.width / 2 - 1, y: rect.top + rect.height / 2 - 1 },
      true,
    );
  }, [buttonRef, enabled, escapeFrom]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      attemptsRef.current = 0;
      offsetRef.current = { x: 0, y: 0 };
      setOffset({ x: 0, y: 0 });
      queueMicrotask(() => {
        setOffset((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
      });
    }
  }, [enabled]);

  return { offset, onArenaPointerMove, onNoPointerDown, onNoClick };
}
