/** Coordinate-based embed URLs adapted from Vietflexmap/xemduong (app.js).
 * The legacy Google iframe endpoints do not expose map events to this page.
 */
export type MapPoint = { lat: number; lng: number };

export function validPoint(point: MapPoint): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

export function parsePoint(input: string): MapPoint | null {
  const value = input.trim();
  const placePairs = [...value.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  const patterns = [
    /(?:[?&](?:query|q|ll|center|viewpoint|cbll)=)(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];
  const match = placePairs.at(-1) || patterns.map((pattern) => value.match(pattern)).find(Boolean);
  if (!match) return null;
  const point = { lat: Number(match[1]), lng: Number(match[2]) };
  return validPoint(point) ? point : null;
}

function safePoint(point: MapPoint): string {
  if (!validPoint(point)) throw new RangeError('Tọa độ không hợp lệ');
  return `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`;
}

export function googleMapEmbed(point: MapPoint, zoom: number, satellite = true): string {
  const params = new URLSearchParams({
    q: safePoint(point), z: String(Math.round(Math.max(1, Math.min(21, zoom)))),
    t: satellite ? 'k' : 'm', hl: 'vi', output: 'embed',
  });
  return `https://maps.google.com/maps?${params}`;
}

export function streetViewEmbed(point: MapPoint, heading = 90): string {
  const params = new URLSearchParams({
    layer: 'c', cbll: safePoint(point),
    cbp: `12,${Math.round(heading)},0,0,5`, hl: 'vi', source: 'embed', output: 'svembed',
  });
  return `https://maps.google.com/maps?${params}`;
}

export function googleMapsUrl(point: MapPoint, zoom: number, satellite = true): string {
  const params = new URLSearchParams({
    api: '1', map_action: 'map', center: safePoint(point),
    zoom: String(Math.round(Math.max(1, Math.min(21, zoom)))), basemap: satellite ? 'satellite' : 'roadmap',
  });
  return `https://www.google.com/maps/@?${params}`;
}

export function streetViewUrl(point: MapPoint): string {
  const params = new URLSearchParams({ api: '1', map_action: 'pano', viewpoint: safePoint(point) });
  return `https://www.google.com/maps/@?${params}`;
}

export function googleEarthUrl(point: MapPoint): string {
  return `https://earth.google.com/web/search/${safePoint(point)}`;
}
