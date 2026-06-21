const https = require('https');

const data = JSON.stringify({ lat: -5.23628246, lng: -47.038958735 });

const options = {
  hostname: 'agromind-dados.agromindpro.workers.dev',
  path: '/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(body);
      console.log(JSON.stringify(json, null, 2));
    } catch(e) {
      console.log(body);
    }
  });
});

req.on('error', (e) => console.error('Erro:', e.message));
req.write(data);
req.end();