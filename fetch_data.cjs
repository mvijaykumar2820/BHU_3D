const fs = require('fs');
const https = require('https');

const query = `[out:json][timeout:25];
(
  way["building"](17.440,78.370,17.455,78.390);
  relation["building"](17.440,78.370,17.455,78.390);
);
out body geom;`;

const data = new URLSearchParams();
data.append('data', query);

const options = {
  hostname: 'overpass-api.de',
  port: 443,
  path: '/api/interpreter',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(data.toString())
  }
};

const req = https.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    try {
      const parsedData = JSON.parse(responseData);
      fs.writeFileSync('/Users/vijaykumar/Downloads/bhu-drishti-3d/src/data/hitec_city.json', JSON.stringify(parsedData));
      console.log('Successfully saved to hitec_city.json');
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      console.error('Response:', responseData.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write(data.toString());
req.end();
