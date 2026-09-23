import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GestureFrame } from '@map-gesture-controls/core';
import { CameraGestureController } from './camera';
import { OneHandGesture, type GestureResult } from './gesture';
import './style.css';

const START: L.LatLngExpression = [10.7379, 106.7260];
const START_ZOOM = 13;
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Thiếu phần tử giao diện: ${id}`);
  return found as T;
}

const startButton = element<HTMLButtonElement>('camera-start');
const stopButton = element<HTMLButtonElement>('camera-stop');
const cameraPill = element<HTMLElement>('camera-pill');
const cameraStatus = element<HTMLElement>('gesture-status');
const videoContainer = element<HTMLElement>('video-container');
const videoEmpty = element<HTMLElement>('video-empty');
const googleForm = element<HTMLFormElement>('google-form');
const googleKey = element<HTMLInputElement>('google-key');
const googleSetup = element<HTMLElement>('google-setup');
const googleError = element<HTMLElement>('google-error');
const googleSync = element<HTMLElement>('google-sync');
const earthLink = element<HTMLAnchorElement>('earth-link');
const mapsLink = element<HTMLAnchorElement>('maps-link');

const osm = L.map('map-osm', {
  zoomControl: false,
  zoomSnap: 0,
  zoomDelta: 0.5,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  worldCopyJump: true,
  preferCanvas: true,
}).setView(START, START_ZOOM);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  maxZoom: MAX_ZOOM,
}).addTo(osm);
L.control.zoom({ position: 'topright' }).addTo(osm);

let googleMap: google.maps.Map | null = null;
let lastForward: { lat: number; lng: number; zoom: number } | null = null;
let forwardPending = false;
let syncTimer: number | null = null;
let engine: CameraGestureController | null = null;
let starting = false;
let cameraSession = 0;
let gesture = new OneHandGesture();
let lastStatus = '';

function refreshReadout(): void {
  const center = osm.getCenter();
  const lat = center.lat.toFixed(5);
  const lng = center.lng.toFixed(5);
  const zoom = osm.getZoom().toFixed(1);
  element('osm-coordinates').textContent = `${lat}° N · ${lng}° E`;
  element('view-readout').textContent = `TỌA ĐỘ ${lat}° N, ${lng}° E · ZOOM ${zoom}`;
  // Earth accepts coordinates in its search interface. It opens separately;
  // its camera altitude is not controlled by this page.
  earthLink.href = `https://earth.google.com/web/search/${lat},${lng}`;
  const mapsParams = new URLSearchParams({
    api: '1', map_action: 'map', center: `${lat},${lng}`,
    zoom: String(Math.round(osm.getZoom())), basemap: 'satellite',
  });
  mapsLink.href = `https://www.google.com/maps/@?${mapsParams}`;
}

function syncToGoogle(): void {
  if (!googleMap) return;
  const center = osm.getCenter();
  const zoom = osm.getZoom();
  lastForward = { lat: center.lat, lng: center.lng, zoom };
  const current = googleMap.getCenter();
  if (!current || Math.abs(current.lat() - center.lat) > 0.000001 || Math.abs(current.lng() - center.lng) > 0.000001) {
    forwardPending = true;
    googleMap.setCenter({ lat: center.lat, lng: center.lng });
  }
  if (Math.abs((googleMap.getZoom() ?? zoom) - zoom) > 0.02) {
    forwardPending = true;
    googleMap.setZoom(zoom);
  }
}

function onOsmMove(): void {
  refreshReadout();
  if (syncTimer !== null) return;
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    syncToGoogle();
  }, 90);
}

osm.on('move zoom', onOsmMove);
refreshReadout();

function setStatus(result: GestureResult): void {
  const messages: Record<GestureResult['status'], string> = {
    'no-hand': 'Đưa một bàn tay mở vào khung hình',
    calibrating: 'Giữ bàn tay mở và ổn định để lấy mốc…',
    ready: 'Đã lấy mốc · Nắm tay để pan, chụm ngón để zoom',
    panning: 'Đang di chuyển bản đồ',
    zooming: 'Đang phóng to / thu nhỏ',
    idle: 'Tạm dừng · Mở tay để lấy mốc mới',
  };
  if (result.status === lastStatus) return;
  lastStatus = result.status;
  cameraStatus.textContent = messages[result.status];
  cameraStatus.dataset.mode = result.status;
}

function handleFrame(frame: GestureFrame): void {
  const result = gesture.update(frame);
  setStatus(result);
  if (result.action?.kind === 'pan') {
    const size = osm.getSize();
    // panBy moves the map content opposite its pixel offset.
    osm.panBy([-result.action.dx * size.x * 1.4, -result.action.dy * size.y * 1.4], { animate: false });
  } else if (result.action?.kind === 'zoom') {
    osm.setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, osm.getZoom() + result.action.delta)), { animate: false });
  }
}

function stopCamera(): void {
  cameraSession += 1;
  engine?.stop();
  engine = null;
  starting = false;
  gesture.reset();
  lastStatus = '';
  videoContainer.querySelector('video')?.remove();
  videoEmpty.hidden = false;
  startButton.disabled = false;
  stopButton.disabled = true;
  cameraPill.textContent = 'CAMERA TẮT';
  cameraPill.classList.remove('is-live');
  cameraStatus.textContent = 'Camera đã tắt';
  delete cameraStatus.dataset.mode;
}

startButton.addEventListener('click', async () => {
  if (starting || engine) return;
  const session = ++cameraSession;
  starting = true;
  startButton.disabled = true;
  stopButton.disabled = false;
  cameraPill.textContent = 'ĐANG KHỞI TẠO';
  cameraStatus.textContent = 'Đang yêu cầu quyền truy cập camera…';
  const next = new CameraGestureController(
    handleFrame,
    (video) => {
      if (session !== cameraSession) return;
      videoContainer.prepend(video);
      videoEmpty.hidden = true;
    },
    (message) => { if (session === cameraSession) cameraStatus.textContent = message; },
    (error) => {
      if (session !== cameraSession) return;
      stopCamera();
      cameraStatus.textContent = error.message;
    },
  );
  engine = next;
  try {
    await next.start();
    if (session !== cameraSession) return;
    gesture = new OneHandGesture();
    cameraPill.textContent = 'CAMERA ĐANG BẬT';
    cameraPill.classList.add('is-live');
    cameraStatus.textContent = 'Đưa một bàn tay mở vào khung hình';
  } catch (error) {
    if (session !== cameraSession) return;
    stopCamera();
    cameraStatus.textContent = error instanceof Error ? error.message : 'Không thể khởi động camera.';
  } finally {
    if (session === cameraSession) starting = false;
  }
});
stopButton.addEventListener('click', stopCamera);
window.addEventListener('pagehide', stopCamera);

/** Load Google's official Maps JavaScript API only after an API key is provided. */
function loadGoogleMaps(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const callbackName = '__vietflexGoogleReady';
    const scope = window as unknown as Record<string, unknown>;
    let settled = false;
    const script = document.createElement('script');
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      delete scope[callbackName];
      if (error) reject(error);
      else resolve();
    };
    const timeout = window.setTimeout(() => finish(new Error('Hết thời gian tải Google Maps. Kiểm tra kết nối mạng.')), 20000);
    scope[callbackName] = () => finish();
    scope.gm_authFailure = () => {
      finish(new Error('API key không hợp lệ hoặc bị giới hạn sai tên miền. Hãy kiểm tra cấu hình Google Cloud và tải lại trang.'));
      showGoogleError('Google Maps từ chối khóa API. Kiểm tra Maps JavaScript API, thanh toán, HTTP referrer rồi tải lại trang.');
    };
    script.onerror = () => finish(new Error('Không tải được Google Maps JavaScript API. Kiểm tra kết nối và tải lại trang.'));
    const params = new URLSearchParams({ key, v: 'weekly', language: 'vi', loading: 'async', callback: callbackName });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    document.head.append(script);
  });
}

function showGoogleError(message: string): void {
  googleSetup.hidden = false;
  googleError.hidden = false;
  googleError.textContent = message;
  googleSync.textContent = 'KHÔNG THỂ KẾT NỐI';
}

googleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const key = googleKey.value.trim();
  if (!key) return;
  const submit = googleForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  googleError.hidden = true;
  googleSync.textContent = 'ĐANG KẾT NỐI…';
  try {
    await loadGoogleMaps(key);
    const center = osm.getCenter();
    googleMap = new google.maps.Map(element('map-google'), {
      center: { lat: center.lat, lng: center.lng },
      zoom: osm.getZoom(),
      mapTypeId: 'satellite',
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
    });
    lastForward = { lat: center.lat, lng: center.lng, zoom: osm.getZoom() };
    googleMap.addListener('idle', () => {
      const current = googleMap?.getCenter();
      const zoom = googleMap?.getZoom();
      if (!current || zoom === undefined) return;
      if (forwardPending) {
        forwardPending = false;
        return;
      }
      const lat = current.lat();
      const lng = current.lng();
      if (lastForward && Math.abs(lastForward.lat - lat) < 0.00002 && Math.abs(lastForward.lng - lng) < 0.00002 && Math.abs(lastForward.zoom - zoom) < 0.11) return;
      osm.setView([lat, lng], zoom, { animate: false });
    });
    googleKey.value = '';
    googleSetup.hidden = true;
    googleSync.innerHTML = '<span class="live-dot"></span> ĐỒNG BỘ HAI CHIỀU';
    syncToGoogle();
  } catch (error) {
    showGoogleError(error instanceof Error ? error.message : 'Không thể tải Google Maps.');
  } finally {
    if (submit) submit.disabled = false;
  }
});
