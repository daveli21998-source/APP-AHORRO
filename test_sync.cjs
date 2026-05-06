const https = require('https');
const data = JSON.stringify({ action: 'sync_all' });
const req = https.request('https://script.google.com/macros/s/AKfycbx9VlhZUnq4ZFGkVtCywzlKBIlbuByNkVMeq9b8tW2ovb7dTvgZW_JYD4AA-vDMqMjyIQ/exec', {
  method: 'POST',
  headers: {
    'Content-Type': 'text/plain',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let chunks = '';
  res.on('data', chunk => chunks += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Headers:', res.headers, 'Body:', chunks));
});
req.on('error', console.error);
req.write(data);
req.end();
