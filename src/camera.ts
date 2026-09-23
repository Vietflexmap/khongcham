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

/** Camera and hand tracking with a CPU fallback when WebGL is unavailable. */
export class CameraGestureController {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private detector: HandLandmarker | null = null;
  private frameId: number | null = null;
  private closed = false;
  private lastVideoTime = -1;
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
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (error) {
      throw new Error(cameraErrorMessage(error), { cause: error });
    }

    if (this.closed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.className = 'camera-video';
    video.srcObject = stream;
    this.video = video;
    this.onVideo(video);
    try {
      await video.play();
    } catch (error) {
      throw new Error('Không phát được hình camera. Hãy kiểm tra quyền camera và tải lại trang.', { cause: error });
    }
    if (this.closed) return;

    this.onProgress('Đang tải mô hình nhận diện bàn tay…');
    let vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
    try {
      vision = await FilesetResolver.forVisionTasks(WASM_URL);
    } catch (error) {
      throw new Error('Không tải được bộ xử lý cử chỉ. Kiểm tra kết nối Internet rồi thử lại.', { cause: error });
    }
    if (this.closed) return;

    const options = {
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: DEFAULT_TUNING_CONFIG.minDetectionConfidence,
      minHandPresenceConfidence: DEFAULT_TUNING_CONFIG.minPresenceConfidence,
      minTrackingConfidence: DEFAULT_TUNING_CONFIG.minTrackingConfidence,
    };
    try {
      this.detector = await createDetectorWithFallback(
        (delegate) => HandLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
        }),
        () => { if (!this.closed) this.onProgress('Thiết bị không hỗ trợ GPU · đang chuyển sang CPU…'); },
      );
    } catch (error) {
      throw new Error('Không khởi tạo được nhận diện cử chỉ. Hãy thử Chrome/Edge mới và kiểm tra kết nối.', { cause: error });
    }
    if (this.closed) {
      this.detector?.close();
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
    this.detector?.close();
    this.detector = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
  }

  private loop = (): void => {
    if (this.closed) return;
    this.frameId = requestAnimationFrame(this.loop);
    const video = this.video;
    if (!video || !this.detector || video.readyState < 2 || video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    try {
      this.onFrame(this.makeFrame(this.detector.detectForVideo(video, performance.now())));
      this.failures = 0;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= 3) {
        this.stop();
        this.onFatal(new Error('Theo dõi bàn tay bị gián đoạn. Hãy bật camera lại.', { cause: error }));
      }
    }
  };

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
