/**
 * GA4 Data API — apply_click event query
 *
 * Required env vars:
 *   GA4_PROPERTY_ID   — numeric ID from GA4 Admin → Property Settings (e.g. 123456789)
 *   GA4_CLIENT_EMAIL  — service account email (from Google Cloud JSON key)
 *   GA4_PRIVATE_KEY   — service account private key (from JSON key, newlines as \n)
 *
 * Setup guide (one-time, ~10 min):
 *   See README section "GA4 Setup"
 */

const https = require('https');

const PROPERTY_ID  = process.env.GA4_PROPERTY_ID;
const CLIENT_EMAIL = process.env.GA4_CLIENT_EMAIL;
const PRIVATE_KEY  = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n');

// ─── Minimal JWT / OAuth2 for service accounts ───────────────────────────────
const crypto = require('crypto');

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss:   CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = base64url(sign.sign(PRIVATE_KEY));
  return `${header}.${payload}.${sig}`;
}

function getAccessToken() {
  return new Promise((resolve, reject) => {
    const jwt  = makeJwt();
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const req  = https.request({
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) resolve(json.access_token);
          else reject(new Error(json.error_description || 'Token error'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── GA4 Data API request ─────────────────────────────────────────────────────
function ga4Request(token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'analyticsdata.googleapis.com',
      path:     `/v1beta/properties/${PROPERTY_ID}:runReport`,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Public: get apply clicks per job (last N days) ──────────────────────────
async function getApplyClicks(days = 7) {
  if (!PROPERTY_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    return null; // GA4 not configured
  }

  const token = await getAccessToken();

  const response = await ga4Request(token, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'customEvent:job_title' }],
    metrics:    [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        stringFilter: { matchType: 'EXACT', value: 'apply_click' },
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 20,
  });

  if (!response.rows || !response.rows.length) return [];

  return response.rows.map(row => ({
    jobTitle: row.dimensionValues[0].value || '(unknown)',
    clicks:   parseInt(row.metricValues[0].value, 10) || 0,
  }));
}

module.exports = { getApplyClicks };
