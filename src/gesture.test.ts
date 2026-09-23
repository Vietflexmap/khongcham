import { describe, expect, it } from 'vitest';
import type { GestureFrame, GestureType } from '@map-gesture-controls/core';
import { OneHandGesture } from './gesture';

function frame(time: number, gesture: GestureType | null, x = 0.5, y = 0.5): GestureFrame {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  const hand = gesture ? { handedness: 'Right' as const, score: 1, gesture, landmarks } : null;
  return { timestamp: time, hands: hand ? [hand] : [], leftHand: null, rightHand: hand };
}

describe('one-hand control', () => {
  it('requires a steady open palm before any movement', () => {
    const engine = new OneHandGesture();
    expect(engine.update(frame(0, 'fist')).status).toBe('calibrating');
    engine.update(frame(100, 'openPalm'));
    expect(engine.update(frame(600, 'openPalm', 0.55)).status).toBe('calibrating');
    expect(engine.update(frame(1200, 'openPalm', 0.55)).status).toBe('calibrating');
    expect(engine.update(frame(1301, 'openPalm', 0.55)).status).toBe('ready');
  });

  it('maps fist movement to pan and pinch movement up to zoom in', () => {
    const engine = new OneHandGesture();
    engine.update(frame(0, 'openPalm'));
    engine.update(frame(710, 'openPalm'));
    engine.update(frame(750, 'fist'));
    engine.update(frame(900, 'fist'));
    const pan = engine.update(frame(940, 'fist', 0.45));
    expect(pan.action?.kind).toBe('pan');
    if (pan.action?.kind === 'pan') expect(pan.action.dx).toBeGreaterThan(0);
    engine.update(frame(1000, 'pinch'));
    engine.update(frame(1140, 'pinch'));
    const zoom = engine.update(frame(1180, 'pinch', 0.45, 0.45));
    expect(zoom.action?.kind).toBe('zoom');
    if (zoom.action?.kind === 'zoom') expect(zoom.action.delta).toBeGreaterThan(0);
  });

  it('drops the lock when the hand leaves the frame', () => {
    const engine = new OneHandGesture();
    engine.update(frame(0, 'openPalm'));
    engine.update(frame(710, 'openPalm'));
    expect(engine.update(frame(800, null)).status).toBe('no-hand');
    expect(engine.update(frame(900, 'fist')).action).toBeNull();
  });
});
