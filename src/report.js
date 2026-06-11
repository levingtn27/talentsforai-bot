/**
 * Report generator
 * Pulls: top viewed jobs, apply button clicks, site uptime check
 *
 * Data sources:
 *   - WordPress REST API (recent jobs, post view counts if Jetpack/WP-Statistics active)
 *   - Simple HTTP ping for uptime
 *   - Optional: Plausible or GA4 if configured (see env vars)
 */

const https    = require('https');
const http     = require('http');
const wp       = require('./wordpress');
const wpClicks = require('./wp-clicks');

const SITE_URL = process.env.WP_URL?.replace(/\/$/, '');

// ─── Uptime check ─────────────────────────────────────────────────────────────
function checkUptime(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const mod   = url.startsWith('https') ? https : http;
    const req   = mod.get(url, (res) => {
      const ms = Date.now() - start;
      resolve({ up: res.statusCode < 500, statusCode: res.statusCode, ms });
      res.resume();
    });
    req.on('error', () => resolve({ up: false, statusCode: 0, ms: 0 }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ up: false, statusCode: 'timeout', ms: 0 }); });
  });
}

// ─── Main report builder ──────────────────────────────────────────────────────
async function generate() {
  const lines = [];
  const now   = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  lines.push(`📊 *Site Report — ${now}*`);
  lines.push('');

  // 1. Uptime
  const uptime = await checkUptime(SITE_URL);
  const uptimeEmoji = uptime.up ? '🟢' : '🔴';
  const uptimeText  = uptime.up
    ? `Online (${uptime.ms}ms response, HTTP ${uptime.statusCode})`
    : `⚠️ Site may be down (${uptime.statusCode})`;
  lines.push(`*Uptime*`);
  lines.push(`${uptimeEmoji} ${uptimeText}`);
  lines.push('');

  // 2. Recent job listings
  try {
    const posts = await wp.getRecentPosts(5);
    if (posts && posts.length) {
      lines.push('*Recent job listings*');
      posts.forEach((p, i) => {
        const title = p.title?.rendered || p.slug || 'Untitled';
        const date  = p.date ? p.date.slice(0, 10) : '';
        lines.push(`${i + 1}. ${title} _(${date})_`);
      });
    } else {
      lines.push('*Recent job listings*\nNo posts found or CPT not accessible.');
    }
  } catch (e) {
    lines.push(`*Recent job listings*\n⚠️ Could not fetch: ${e.message}`);
  }
  lines.push('');

  // 3. Apply button clicks (stored in WordPress by click tracker plugin)
  try {
    const clicks = await wpClicks.getApplyClicks();
    if (!clicks.length) {
      lines.push('*Apply clicks*');
      lines.push('No clicks recorded yet. Make sure `tfai-click-tracker.php` is in mu-plugins.');
    } else {
      lines.push('*Apply clicks this week*');
      clicks.slice(0, 10).forEach((row, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▸';
        const trend = row.this_week > row.last_week ? '↑' : row.this_week < row.last_week ? '↓' : '→';
        lines.push(`${medal} ${row.job_title} — *${row.this_week}* this week ${trend} (${row.total_clicks} total)`);
      });
    }
  } catch (e) {
    lines.push(`*Apply clicks*\n⚠️ ${e.message}`);
  }
  lines.push('');

  lines.push(`_Generated at ${new Date().toISOString()}_`);
  return lines.join('\n');
}

module.exports = { generate };
