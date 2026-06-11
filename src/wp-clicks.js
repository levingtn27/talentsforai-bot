const https = require('https');

const BASE   = process.env.WP_URL?.replace(/\/$/, '');
const TOKEN  = process.env.TFAI_BOT_SECRET;

async function getApplyClicks() {
  return new Promise((resolve, reject) => {
    const url  = new URL(`${BASE}/wp-json/tfai/v1/clicks`);
    const opts = {
      hostname: url.hostname,
      port:     443,
      path:     url.pathname,
      method:   'GET',
      headers:  { 'X-TFAI-Token': TOKEN },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(json.message || `HTTP ${res.statusCode}`));
          else resolve(Array.isArray(json) ? json : []);
        } catch { reject(new Error(`Non-JSON: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { getApplyClicks };
