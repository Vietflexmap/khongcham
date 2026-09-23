import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GestureFrame } from '@map-gesture-controls/core';
import { CameraGestureController } from './camera';
import { OneHandGesture, type GestureResult } from './gesture';
import { googleEarthUrl, googleMapEmbed, googleMapsUrl, parsePoint, streetViewEmbed, streetViewUrl } from './map-links';
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
const mapFrame = element<HTMLIFrameElement>('map-google');
const streetFrame = element<HTMLIFrameElement>('street-view');
const mapOverlay = element<HTMLElement>('google-pan-layer');
const streetStatus = element<HTMLElement>('street-status');
const earthLink = element<HTMLAnchorElement>('earth-link');
const mapsLink = element<HTMLAnchorElement>('maps-link');
const streetLink = element<HTMLAnchorElement>('street-link');
const locationForm = element<HTMLFormElement>('location-form');
const locationInput = element<HTMLInputElement>('location-input');
const locationStatus = element<HTMLElement>('location-status');

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

let syncTimer: number | null = null;
let satellite = true;
let lastGoogleUrl = '';
let lastStreetUrl = '';
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
  earthLink.href = googleEarthUrl(center);
  mapsLink.href = googleMapsUrl(center, osm.getZoom());
  streetLink.href = streetViewUrl(center);
}

function syncToGoogle(force = false): void {
  const center = osm.getCenter();
  const point = { lat: center.lat, lng: center.lng };
  const nextMap = googleMapEmbed(point, osm.getZoom(), satellite);
  const nextStreet = streetViewEmbed(point);
  if (force || nextMap !== lastGoogleUrl) {
    mapFrame.src = nextMap;
    lastGoogleUrl = nextMap;
  }
  if (force || nextStreet !== lastStreetUrl) {
    streetStatus.textContent = 'Đang cập nhật điểm xem…';
    streetFrame.src = nextStreet;
    lastStreetUrl = nextStreet;
  }
}

function onOsmMove(): void {
  refreshReadout();
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    syncToGoogle();
  }, 850);
}

osm.on('move zoom', onOsmMove);
refreshReadout();
syncToGoogle();

streetFrame.addEventListener('load', () => {
  streetStatus.textContent = 'Street View tại tọa độ bản đồ';
});

element<HTMLButtonElement>('map-type-button').addEventListener('click', () => {
  satellite = !satellite;
  const button = element<HTMLButtonElement>('map-type-button');
  button.textContent = satellite ? 'Vệ tinh' : 'Đường phố';
  button.setAttribute('aria-pressed', String(satellite));
  element('map-type-label').textContent = satellite ? 'ẢNH VỆ TINH' : 'BẢN ĐỒ ĐƯỜNG';
  syncToGoogle();
});
element<HTMLButtonElement>('street-reload').addEventListener('click', () => syncToGoogle(true));

// An iframe is cross-origin. A transparent control surface keeps pointer and wheel
// interactions on the Google pane in the same map state as camera/Leaflet input.
let pointer: { id: number; x: number; y: number } | null = null;
mapOverlay.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  mapOverlay.setPointerCapture(event.pointerId);
  mapOverlay.classList.add('dragging');
});
mapOverlay.addEventListener('pointermove', (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  osm.panBy([-dx, -dy], { animate: false });
});
function endPointer(event: PointerEvent): void {
  if (pointer?.id !== event.pointerId) return;
  pointer = null;
  mapOverlay.classList.remove('dragging');
}
mapOverlay.addEventListener('pointerup', endPointer);
mapOverlay.addEventListener('pointercancel', endPointer);
mapOverlay.addEventListener('wheel', (event) => {
  event.preventDefault();
  osm.setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, osm.getZoom() + (event.deltaY < 0 ? 0.5 : -0.5))), { animate: false });
}, { passive: false });

locationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const point = parsePoint(locationInput.value);
  if (!point) {
    locationStatus.textContent = 'Nhập tọa độ hợp lệ hoặc liên kết Google Maps có tọa độ.';
    locationStatus.classList.add('error');
    return;
  }
  locationStatus.classList.remove('error');
  osm.setView([point.lat, point.lng], Math.max(16, osm.getZoom()), { animate: false });
  locationStatus.textContent = `Đã chuyển đến ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}.`;
});

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
