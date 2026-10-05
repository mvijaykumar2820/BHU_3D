const fs = require('fs');

const query = `[out:json][timeout:25];
(
  way["building"](17.440,78.370,17.455,78.390);
  relation["building"](17.440,78.370,17.455,78.390);
);
out body geom;`;

async function fetchOverpass() {
  const url = 'https://overpass.openstreetmap.fr/api/interpreter';
  console.log('Fetching from', url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'data=' + encodeURIComponent(query)
    });
    
    const text = await res.text();
    if (!res.ok) {
      console.error('Error status:', res.status);
      console.error('Error response:', text.substring(0, 200));
      return;
    }
    
    const parsedData = JSON.parse(text);
    
    const buildings = parsedData.elements
      .filter(el => el.geometry && el.geometry.length >= 3)
      .map(el => ({
        id: el.id,
        tags: el.tags || {},
        geometry: el.geometry.map(pt => ({ lat: pt.lat, lng: pt.lon })),
      }));
    
    const output = {
      name: "HITEC City, Hyderabad",
      bounds: { s: 17.440, w: 78.370, n: 17.455, e: 78.390 },
      buildingCount: buildings.length,
      fetchedAt: new Date().toISOString(),
      buildings,
    };
    
    fs.mkdirSync('/Users/vijaykumar/Downloads/bhu-drishti-3d/src/data', { recursive: true });
    fs.writeFileSync('/Users/vijaykumar/Downloads/bhu-drishti-3d/src/data/hitec_city.json', JSON.stringify(output));
    console.log('Successfully saved to hitec_city.json. Building count:', buildings.length);
  } catch(e) {
    console.error('Exception:', e);
  }
}

fetchOverpass();
