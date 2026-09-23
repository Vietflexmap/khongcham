import { describe, expect, it, vi } from 'vitest';
import { cameraErrorMessage, createDetectorWithFallback, withTimeout } from './camera';

describe('camera error guidance', () => {
  it('explains permission and missing-camera errors without exposing internal MediaPipe text', () => {
    expect(cameraErrorMessage(new DOMException('Denied', 'NotAllowedError'))).toContain('từ chối camera');
    expect(cameraErrorMessage(new DOMException('Missing', 'NotFoundError'))).toContain('Không tìm thấy camera');
    expect(cameraErrorMessage(new Error('kGpuService failure'))).not.toContain('kGpuService');
  });

  it('retries CPU when GPU initialization fails', async () => {
    const delegates: string[] = [];
    let fallback = 0;
    const detector = await createDetectorWithFallback(async (delegate) => {
      delegates.push(delegate);
      if (delegate === 'GPU') throw new Error('WebGL unavailable');
      return { delegate };
    }, () => { fallback += 1; });
    expect(delegates).toEqual(['GPU', 'CPU']);
    expect(fallback).toBe(1);
    expect(detector.delegate).toBe('CPU');
  });

  it('stops waiting for a stuck model and frees a late camera resource', async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (value: { id: number }) => void;
      const pending = new Promise<{ id: number }>((done) => { resolve = done; });
      const released: number[] = [];
      const result = withTimeout(pending, 300, 'Quá thời gian', (value) => released.push(value.id));
      const rejection = expect(result).rejects.toThrow('Quá thời gian');
      await vi.advanceTimersByTimeAsync(300);
      await rejection;
      resolve({ id: 1 });
      await Promise.resolve();
      expect(released).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });
});
