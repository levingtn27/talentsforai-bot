/**
 * WordPress REST API helpers
 *
 * Requires:
 *   WP_URL        — e.g. https://talentsforai.com
 *   WP_USER       — WordPress username (Application Passwords user)
 *   WP_APP_PASS   — Application Password (Settings → Users → Application Passwords)
 *
 * The "copy sections" feature uses a Custom Options page or ACF fields.
 * See README for the companion wp-sync.php mu-plugin that exposes
 * /wp-json/tfai/v1/copy endpoints for each section.
 */

const https = require('https');
const http  = require('http');

const BASE   = process.env.WP_URL?.replace(/\/$/, '');
const USER   = process.env.WP_USER;
const PASS   = process.env.WP_APP_PASS;
const AUTH   = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

// ─── Low-level fetch ──────────────────────────────────────────────────────────
function wpFetch(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url  = new URL(`${BASE}${path}`);
    const mod  = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Authorization': AUTH,
        'Content-Type':  'application/json',
      },
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(json.message || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch {
          reject(new Error(`Non-JSON response: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Create a job post ────────────────────────────────────────────────────────
// Uses the WP Jobs Manager CPT slug 'job_listing'.
// Falls back to standard 'post' if the CPT isn't registered.
async function createJobPost({ title, location, pay, description, applyUrl }) {
  const content = [
    `<p>${description}</p>`,
    `<p><strong>Location:</strong> ${location}</p>`,
    `<p><strong>Pay:</strong> ${pay}</p>`,
    `<p><a href="${applyUrl}" class="apply-btn">Apply Now</a></p>`,
  ].join('\n');

  return wpFetch('/wp-json/wp/v2/job_listing', 'POST', {
    title,
    content,
    status: 'publish',
    meta: {
      _job_location:  location,
      _job_salary:    pay,
      _application:   applyUrl,
    },
  }).catch(() =>
    // fallback to standard post if CPT not available
    wpFetch('/wp-json/wp/v2/posts', 'POST', {
      title,
      content,
      status: 'draft',  // safer fallback — review before publishing
    })
  );
}

// ─── Update a copy section ────────────────────────────────────────────────────
// Uses the companion mu-plugin endpoint: /wp-json/tfai/v1/copy
async function updateCopySection(section, newText) {
  return wpFetch('/wp-json/tfai/v1/copy', 'POST', { section, text: newText });
}

// ─── Get recent posts (for report) ───────────────────────────────────────────
async function getRecentPosts(perPage = 5) {
  return wpFetch(`/wp-json/wp/v2/job?per_page=${perPage}&orderby=date&order=desc`);
}

module.exports = { createJobPost, updateCopySection, getRecentPosts, wpFetch };
