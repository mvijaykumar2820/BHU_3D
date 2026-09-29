// Convert Lat/Lon to local 3D coordinates (Meters)
// Assuming a local tangent plane approximation for small city chunks

const EARTH_RADIUS = 6378137;

export function latLonToMeters(lat, lon, originLat, originLon) {
  const dLat = (lat - originLat) * (Math.PI / 180);
  const dLon = (lon - originLon) * (Math.PI / 180);
  
  // Z maps to North/South (negative Z is North in Three.js)
  const z = -(dLat * EARTH_RADIUS);
  
  // X maps to East/West
  const x = (dLon * EARTH_RADIUS * Math.cos(originLat * (Math.PI / 180)));
  
  return { x, z };
}
