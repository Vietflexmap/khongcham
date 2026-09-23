import { describe, expect, it } from 'vitest';
import { googleMapEmbed, googleMapsUrl, parsePoint, streetViewEmbed, streetViewUrl } from './map-links';

describe('coordinate links without an API key', () => {
  it('uses the actual Google place coordinate after the viewport position', () => {
    expect(parsePoint('https://www.google.com/maps/place/foo/@11,107,16z/data=!3d10.8259065!4d106.6144391'))
      .toEqual({ lat: 10.8259065, lng: 106.6144391 });
    expect(parsePoint('10.8259065, 106.6144391')).toEqual({ lat: 10.8259065, lng: 106.6144391 });
    expect(parsePoint('99, 106')).toBeNull();
    expect(parsePoint('https://maps.app.goo.gl/short')).toBeNull();
  });

  it('gives map, street view and external Maps the same coordinate', () => {
    const point = { lat: 10.8259065, lng: 106.6144391 };
    expect(new URL(googleMapEmbed(point, 16)).searchParams.get('q')).toBe('10.8259065,106.6144391');
    expect(new URL(streetViewEmbed(point)).searchParams.get('cbll')).toBe('10.8259065,106.6144391');
    expect(new URL(googleMapsUrl(point, 16)).searchParams.get('center')).toBe('10.8259065,106.6144391');
    expect(new URL(streetViewUrl(point)).searchParams.get('viewpoint')).toBe('10.8259065,106.6144391');
    expect(googleMapEmbed(point, 16)).not.toContain('key=');
  });
});
