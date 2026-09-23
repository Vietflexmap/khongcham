import type { GestureFrame, GestureType } from '@map-gesture-controls/core';

export type GestureAction =
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'zoom'; delta: number };

export type GestureResult = {
  action: GestureAction | null;
  status: 'no-hand' | 'calibrating' | 'ready' | 'panning' | 'zooming' | 'idle';
};

type Point = { x: number; y: number };

const CALIBRATE_MS = 700;
const ACTION_DWELL_MS = 130;
const STABLE_RADIUS = 0.024;
const PAN_DEADZONE = 0.0015;
const ZOOM_DEADZONE = 0.0015;
const SMOOTHING = 0.4;

/** One-hand gesture adapter built on map-gesture-controls' MediaPipe classifier. */
export class OneHandGesture {
  private calibrated = false;
  private stableFrom: number | null = null;
  private stablePoint: Point | null = null;
  private pose: GestureType | null = null;
  private poseFrom = 0;
  private previous: Point | null = null;
  private smoothed: Point | null = null;

  reset(): void {
    this.calibrated = false;
    this.stableFrom = null;
    this.stablePoint = null;
    this.pose = null;
    this.previous = null;
    this.smoothed = null;
  }

  /** Return a movement only after an open hand has stayed still long enough. */
  update(frame: GestureFrame): GestureResult {
    if (frame.hands.length !== 1 || frame.hands[0].landmarks.length < 21) {
      this.reset();
      return { action: null, status: 'no-hand' };
    }

    const hand = frame.hands[0];
    const wrist = hand.landmarks[0];
    const point = { x: wrist.x, y: wrist.y };

    if (hand.gesture === 'openPalm') {
      this.pose = null;
      this.previous = null;
      this.smoothed = null;
      if (!this.stablePoint || distance(this.stablePoint, point) > STABLE_RADIUS) {
        this.stablePoint = point;
        this.stableFrom = frame.timestamp;
        this.calibrated = false;
      } else if (this.stableFrom !== null && frame.timestamp - this.stableFrom >= CALIBRATE_MS) {
        this.calibrated = true;
      }
      return { action: null, status: this.calibrated ? 'ready' : 'calibrating' };
    }

    if (!this.calibrated) return { action: null, status: 'calibrating' };

    if (hand.gesture !== 'fist' && hand.gesture !== 'pinch') {
      this.pose = null;
      this.previous = null;
      this.smoothed = null;
      return { action: null, status: 'idle' };
    }

    const status = hand.gesture === 'fist' ? 'panning' : 'zooming';
    if (this.pose !== hand.gesture) {
      this.pose = hand.gesture;
      this.poseFrom = frame.timestamp;
      this.previous = null;
      this.smoothed = null;
      return { action: null, status };
    }

    if (frame.timestamp - this.poseFrom < ACTION_DWELL_MS) {
      return { action: null, status };
    }

    this.smoothed = this.smoothed
      ? {
          x: SMOOTHING * point.x + (1 - SMOOTHING) * this.smoothed.x,
          y: SMOOTHING * point.y + (1 - SMOOTHING) * this.smoothed.y,
        }
      : point;
    const previous = this.previous;
    if (!previous) {
      this.previous = this.smoothed;
      return { action: null, status };
    }

    // Mirrored camera preview: moving to the user's right reduces raw video x.
    const dx = previous.x - this.smoothed.x;
    const dy = this.smoothed.y - previous.y;
    if (hand.gesture === 'fist') {
      if (Math.hypot(dx, dy) < PAN_DEADZONE) return { action: null, status };
      this.previous = this.smoothed;
      return {
        action: { kind: 'pan', dx: clamp(dx, -0.055, 0.055), dy: clamp(dy, -0.055, 0.055) },
        status,
      };
    }

    if (Math.abs(dy) < ZOOM_DEADZONE) return { action: null, status };
    this.previous = this.smoothed;
    return { action: { kind: 'zoom', delta: clamp(-dy * 8, -0.12, 0.12) }, status };
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
