/**
 * SME Earnings fetcher
 * Uses SuperAnnotate's internal API — no browser/SSO needed
 *
 * Flow:
 *   1. POST to generate-token (no auth required) → get internal_token
 *   2. GET annotations/download with token → parse earnings JSON
 *   3. GET onboarding bonuses from same endpoint
 */

const https = require('https');

const TEAM_ID    = 33412;
const PROJECT_ID = 257624;
const ITEM_ID    = 175173718;
const USER_ROLE  = 2608;

// ─── Low-level HTTPS request ──────────────────────────────────────────────────
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Step 1: Get internal token ───────────────────────────────────────────────
async function getToken() {
  const res = await request({
    hostname: 'api.superannotate.com',
    path:     '/generate-token',
    method:   'POST',
    headers:  {
      'Content-Type': 'application/json; charset=UTF-8',
      'Referer':      'https://app.superannotate.com/',
      'Origin':       'https://app.superannotate.com',
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  }, { team_id: TEAM_ID, project_id: PROJECT_ID, user_role: USER_ROLE });

  if (!res.data?.internal_token) {
    throw new Error(`Could not get token: ${JSON.stringify(res.data)}`);
  }
  return res.data.internal_token;
}

// ─── Step 2: Fetch earnings data ──────────────────────────────────────────────
async function fetchEarningsData(token) {
  const res = await request({
    hostname: 'assets-provider.superannotate.com',
    path:     `/api/v4/items/${ITEM_ID}/annotations/download?team_id=${TEAM_ID}&project_id=${PROJECT_ID}&project_type=8`,
    method:   'GET',
    headers:  {
      'Authorization': `Bearer ${token}`,
      'Referer':       'https://app.superannotate.com/',
      'Origin':        'https://app.superannotate.com',
      'User-Agent':    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  return res.data;
}

// ─── Step 3: Parse and format earnings ───────────────────────────────────────
function parseEarnings(rawData) {
  // The data is a JSON array of annotation objects
  // We need to find the one that contains the earnings table
  const dataStr = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);

  // Extract commissions rows
  const commissionsMatch = dataStr.match(/"rows":\[([^\]]+)\]/g);
  if (!commissionsMatch) return null;

  let commissionRows = [];
  let bonusRows = [];

  for (const match of commissionsMatch) {
    try {
      const rows = JSON.parse(`[${match.slice(8, -1)}]`);
      if (rows[0]?.commissions !== undefined) commissionRows = rows;
      if (rows[0]?.referral_earning !== undefined) bonusRows = rows;
    } catch {}
  }

  // Also look for bonus data pattern
  const bonusMatch = dataStr.match(/"referral_earning":\s*[\d.]+/g);

  return { commissionRows, bonusRows };
}

// ─── Main: get earnings summary ───────────────────────────────────────────────
async function getEarnings() {
  const token   = await getToken();
  const rawData = await fetchEarningsData(token);
  const parsed  = parseEarnings(rawData);

  if (!parsed) {
    throw new Error('Could not parse earnings data from response');
  }

  const { commissionRows } = parsed;

  if (!commissionRows.length) {
    return '💰 *SME Earnings*\n\nNo earnings data found.';
  }

  // Group by month
  const byMonth = {};
  for (const row of commissionRows) {
    if (!byMonth[row.month_year]) {
      byMonth[row.month_year] = { earnings: 0, commissions: 0, candidates: [] };
    }
    byMonth[row.month_year].earnings    += row.earnings || 0;
    byMonth[row.month_year].commissions += row.commissions || 0;
    byMonth[row.month_year].candidates.push({
      name:        row.email || row.name,
      earnings:    row.earnings,
      commissions: row.commissions,
    });
  }

  // Build message
  const lines = ['💰 *SME Earnings Summary*', ''];

  // Total across all months
  const totalEarnings    = commissionRows.reduce((s, r) => s + (r.earnings || 0), 0);
  const totalCommissions = commissionRows.reduce((s, r) => s + (r.commissions || 0), 0);
  lines.push(`*Total commission earned: $${totalCommissions.toFixed(2)}*`);
  lines.push(`Total expert earnings: $${totalEarnings.toFixed(2)}`);
  lines.push('');

  // Monthly breakdown
  lines.push('*Monthly breakdown:*');
  for (const [month, data] of Object.entries(byMonth).reverse()) {
    lines.push(`\n📅 ${month}`);
    lines.push(`  Expert earnings: $${data.earnings.toFixed(2)}`);
    lines.push(`  Your commission: $${data.commissions.toFixed(2)}`);
    lines.push(`  Candidates: ${data.candidates.length}`);
  }

  lines.push('');
  lines.push(`_Updated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}_`);

  return lines.join('\n');
}

module.exports = { getEarnings };
