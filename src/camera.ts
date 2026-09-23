import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import {
  createHandClassifier,
  DEFAULT_TUNING_CONFIG,
  type DetectedHand,
  type GestureFrame,
} from '@map-gesture-controls/core';

const VISION_VERSION = '0.10.35';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CAMERA_WAIT_MS = 30_000;
const VIDEO_WAIT_MS = 12_000;
const MODEL_WAIT_MS = 30_000;
const MIN_FRAME_INTERVAL_MS = 100;

type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

/** Release a resource if it arrives after the caller has stopped waiting. */
export function withTimeout<T>(
  pending: Promise<T>,
  durationMs: number,
  message: string,
  releaseLate?: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(message));
    }, durationMs);
    pending.then((value) => {
      if (timedOut) {
        try { releaseLate?.(value); } catch { /* A late resource is already unusable. */ }
      } else {
        clearTimeout(timer);
        resolve(value);
      }
    }, (error: unknown) => {
      if (!timedOut) {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

/** Camera and hand tracking with a CPU fallback when WebGL is unavailable. */
export class CameraGestureController {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private detector: HandLandmarker | null = null;
  private vision: VisionFileset | null = null;
  private delegate: 'GPU' | 'CPU' = 'GPU';
  private frameId: number | null = null;
  private closed = false;
  private lastVideoTime = -1;
  private lastFrameAt = 0;
  private failures = 0;
  private leftClassifier = createHandClassifier();
  private rightClassifier = createHandClassifier();

  constructor(
    private onFrame: (frame: GestureFrame) => void,
    private onVideo: (video: HTMLVideoElement) => void,
    private onProgress: (message: string) => void,
    private onFatal: (error: Error) => void,
  ) {}

  async start(): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera cần HTTPS hoặc localhost trên trình duyệt có hỗ trợ.');
    }
    let stream: MediaStream;
    try {
      stream = await withTimeout(navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      }), CAMERA_WAIT_MS, 'Camera chưa phản hồi. Kiểm tra quyền truy cập rồi thử lại.',
      (lateStream) => lateStream.getTracks().forEach((track) => track.stop()));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Camera chưa phản hồi')) throw error;
      throw new Error(cameraErrorMessage(error), { cause: error });
    }

    if (this.closed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
      if (this.closed) return;
      this.stop();
      this.onFatal(new Error('Camera vừa bị ngắt kết nối. Kiểm tra thiết bị rồi thử lại.'));
    }, { once: true }));
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.className = 'camera-video';
    video.srcObject = stream;
    this.video = video;
    this.onVideo(video);
    try {
      await withTimeout(video.play(), VIDEO_WAIT_MS, 'Camera chưa phát hình. Kiểm tra thiết bị rồi thử lại.');
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Camera chưa phát hình')) throw error;
      throw new Error('Không phát được hình camera. Hãy kiểm tra quyền camera và tải lại trang.', { cause: error });
    }
    if (this.closed) return;

    this.onProgress('Đang tải mô hình nhận diện bàn tay…');
    let vision: VisionFileset;
    try {
      vision = await FilesetResolver.forVisionTasks(WASM_URL);
    } catch (error) {
      throw new Error('Không tải được bộ xử lý cử chỉ. Kiểm tra kết nối Internet rồi thử lại.', { cause: error });
    }
    if (this.closed) return;
    this.vision = vision;

    const options = {
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: DEFAULT_TUNING_CONFIG.minDetectionConfidence,
      minHandPresenceConfidence: DEFAULT_TUNING_CONFIG.minPresenceConfidence,
      minTrackingConfidence: DEFAULT_TUNING_CONFIG.minTrackingConfidence,
    };
    try {
      this.detector = await createDetectorWithFallback(
        async (delegate) => {
          const detector = await withTimeout(HandLandmarker.createFromOptions(vision, {
            ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate },
          }), MODEL_WAIT_MS, `Khởi tạo nhận diện trên ${delegate} quá lâu.`, (late) => late.close());
          this.delegate = delegate;
          return detector;
        },
        () => { if (!this.closed) this.onProgress('Thiết bị không hỗ trợ GPU · đang chuyển sang CPU…'); },
      );
    } catch (error) {
      throw new Error('Không tải được mô hình bàn tay sau khi thử GPU và CPU. Kiểm tra mạng, tắt VPN/chặn CDN rồi thử lại.', { cause: error });
    }
    if (this.closed) {
      try { this.detector?.close(); } catch { /* Context may already be lost. */ }
      this.detector = null;
      return;
    }
    this.loop();
  }

  stop(): void {
    this.closed = true;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    try { this.detector?.close(); } catch { /* Context may already be lost. */ }
    this.detector = null;
    this.vision = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
  }

  private loop = (): void => {
    if (this.closed) return;
    const video = this.video;
    const now = performance.now();
    if (video && this.detector && video.readyState >= 2
      && video.currentTime !== this.lastVideoTime && now - this.lastFrameAt >= MIN_FRAME_INTERVAL_MS) {
      this.lastVideoTime = video.currentTime;
      this.lastFrameAt = now;
      try {
        this.onFrame(this.makeFrame(this.detector.detectForVideo(video, now)));
        this.failures = 0;
      } catch (error) {
        this.failures += 1;
        if (this.failures >= 3) {
          if (this.delegate === 'GPU') {
            void this.recoverOnCpu();
          } else {
            this.stop();
            this.onFatal(new Error('Theo dõi bàn tay bị gián đoạn trên CPU. Hãy thử lại hoặc đóng ứng dụng dùng camera.', { cause: error }));
          }
          return;
        }
      }
    }
    this.frameId = requestAnimationFrame(this.loop);
  };

  private async recoverOnCpu(): Promise<void> {
    this.onProgress('GPU bị gián đoạn · đang chuyển sang CPU…');
    try { this.detector?.close(); } catch { /* GPU context may already be lost. */ }
    this.detector = null;
    const vision = this.vision;
    if (!vision || this.closed) return;
    try {
      const detector = await withTimeout(HandLandmarker.createFromOptions(vision, {
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: DEFAULT_TUNING_CONFIG.minDetectionConfidence,
        minHandPresenceConfidence: DEFAULT_TUNING_CONFIG.minPresenceConfidence,
        minTrackingConfidence: DEFAULT_TUNING_CONFIG.minTrackingConfidence,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      }), MODEL_WAIT_MS, 'CPU khởi tạo quá lâu.', (late) => late.close());
      if (this.closed) { detector.close(); return; }
      this.detector = detector;
      this.delegate = 'CPU';
      this.failures = 0;
      this.lastVideoTime = -1;
      this.onProgress('Đã chuyển sang CPU · đưa bàn tay vào khung hình');
      this.loop();
    } catch (error) {
      if (this.closed) return;
      this.stop();
      this.onFatal(new Error('Nhận diện cử chỉ bị ngắt và CPU không khôi phục được. Hãy thử bật camera lại.', { cause: error }));
    }
  }

  private makeFrame(result: HandLandmarkerResult): GestureFrame {
    const hands: DetectedHand[] = result.landmarks.map((landmarks, index) => {
      const category = result.handedness[index]?.[0];
      const handedness = category?.categoryName === 'Left' ? 'Left' : 'Right';
      const classifier = handedness === 'Left' ? this.leftClassifier : this.rightClassifier;
      return {
        handedness,
        score: category?.score ?? 0,
        landmarks,
        gesture: classifier(landmarks),
      };
    });
    return {
      timestamp: performance.now(),
      hands,
      leftHand: hands.find((hand) => hand.handedness === 'Left') ?? null,
      rightHand: hands.find((hand) => hand.handedness === 'Right') ?? null,
    };
  }
}

/** Turn browser camera errors into short, actionable Vietnamese messages. */
export function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Bạn đã từ chối camera. Hãy cho phép camera trong cài đặt trình duyệt rồi thử lại.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'Không tìm thấy camera trên thiết bị này. Bạn vẫn có thể dùng bản đồ bằng chuột.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.';
    }
  }
  return 'Không mở được camera. Hãy kiểm tra kết nối camera và thử lại.';
}

/** Try the fast delegate first; use CPU when a device has no working WebGL. */
export async function createDetectorWithFallback<T>(
  create: (delegate: 'GPU' | 'CPU') => Promise<T>,
  onFallback: () => void,
): Promise<T> {
  try {
    return await create('GPU');
  } catch {
    onFallback();
    return create('CPU');
  }
}
