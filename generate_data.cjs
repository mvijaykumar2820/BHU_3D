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
  
  // Randomize building types and names for realism
  const types = ["commercial", "residential", "office", "retail", "hospital", "school", "industrial", "yes"];
  const bType = types[Math.floor(Math.random() * types.length)];
  
  let bName = undefined;
  let amenity = undefined;
  
  if (Math.random() > 0.4) {
    if (bType === "commercial" || bType === "office") bName = ["Tech Park", "Business Center", "Corporate Tower", "Innovation Hub"][Math.floor(Math.random() * 4)] + " " + i;
    else if (bType === "residential") bName = ["Heights", "Residency", "Apartments", "Villas"][Math.floor(Math.random() * 4)] + " " + i;
    else if (bType === "hospital") { bName = "City Hospital " + i; amenity = "hospital"; }
    else if (bType === "school") { bName = "Public School " + i; amenity = "school"; }
    else if (bType === "retail") { bName = "Shopping Mall " + i; amenity = "marketplace"; }
  } else if (bHeight > 60) {
    bName = "IT Tower " + i;
  }
  
  buildings.push({
    id: 9000000 + i,
    tags: {
      "building": bType,
      "height": bHeight.toFixed(1),
      "building:levels": Math.max(1, Math.floor(bHeight / 3)).toString(),
      "name": bName,
      "amenity": amenity
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
