const fs = require('fs');

const bounds = { s: 17.440, w: 78.370, n: 17.455, e: 78.390 };
const buildings = [];

// Generate 500 random buildings to make it dense
for (let i = 0; i < 500; i++) {
  const lat = bounds.s + Math.random() * (bounds.n - bounds.s);
  const lng = bounds.w + Math.random() * (bounds.e - bounds.w);
  
  const width = 0.0001 + Math.random() * 0.0002;
  const height = 0.0001 + Math.random() * 0.0002;
  
  // Random height (mostly 10-30m, some 50-120m for HITEC City)
  let bHeight = 10 + Math.random() * 15;
  if (Math.random() > 0.9) bHeight += 30 + Math.random() * 60;
  
  const geometry = [
    { lat: lat, lng: lng },
    { lat: lat, lng: lng + width },
    { lat: lat - height, lng: lng + width },
    { lat: lat - height, lng: lng },
    { lat: lat, lng: lng }
  ];
  
  buildings.push({
    id: 9000000 + i,
    tags: {
      "building": "yes",
      "height": bHeight.toFixed(1),
      "name": Math.random() > 0.7 ? "IT Park Building " + i : undefined
    },
    geometry
  });
}

const output = {
  name: "HITEC City, Hyderabad",
  bounds,
  buildingCount: buildings.length,
  fetchedAt: new Date().toISOString(),
  buildings,
};

fs.mkdirSync('/Users/vijaykumar/Downloads/bhu-drishti-3d/src/data', { recursive: true });
fs.writeFileSync('/Users/vijaykumar/Downloads/bhu-drishti-3d/src/data/hitec_city.json', JSON.stringify(output, null, 2));
console.log('Successfully generated synthetic HITEC City data.');
