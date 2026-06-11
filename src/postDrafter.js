/**
 * Post Drafter — Job Listing → LinkedIn + Telegram copy
 * Uses WP REST API + ACF fields directly. No HTML page fetching.
 */

const https = require('https');

const BASE = process.env.WP_URL?.replace(/\/$/, '');
const USER = process.env.WP_USER;
const PASS = process.env.WP_APP_PASS;
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

function wpFetch(path) {
  return new Promise((resolve, reject) => {
    const url  = new URL(`${BASE}${path}`);
    const opts = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Authorization': AUTH, 'Content-Type': 'application/json' },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Failed to parse WP response')); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('WP API timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function stripHtml(html) {
  return (html || '')
    .replace(/<li>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function getFlagEmoji(title) {
  const flags = {
    danish:'🇩🇰', norwegian:'🇳🇴', swedish:'🇸🇪', finnish:'🇫🇮',
    french:'🇫🇷', german:'🇩🇪', spanish:'🇪🇸', portuguese:'🇧🇷',
    italian:'🇮🇹', dutch:'🇳🇱', japanese:'🇯🇵', korean:'🇰🇷',
    chinese:'🇨🇳', arabic:'🇸🇦', hebrew:'🇮🇱', turkish:'🇹🇷',
    polish:'🇵🇱', czech:'🇨🇿', romanian:'🇷🇴', hungarian:'🇭🇺',
    greek:'🇬🇷', ukrainian:'🇺🇦', russian:'🇷🇺', vietnamese:'🇻🇳',
    thai:'🇹🇭', indonesian:'🇮🇩', malay:'🇲🇾', hindi:'🇮🇳',
    bengali:'🇧🇩', urdu:'🇵🇰', persian:'🇮🇷', swahili:'🇰🇪',
    filipino:'🇵🇭', tagalog:'🇵🇭', icelandic:'🇮🇸',
    medical:'🏥', doctor:'🏥', engineer:'⚙️', software:'💻',
    math:'📐', physics:'🔬', chemistry:'🧪', biology:'🧬',
    law:'⚖️', finance:'💹', data:'📊',
  };
  const lower = title.toLowerCase();
  for (const [key, emoji] of Object.entries(flags)) {
    if (lower.includes(key)) return emoji;
  }
  return '🌍';
}

function buildHashtags(title) {
  const tags = ['#AIJobs', '#RemoteWork'];
  const lower = title.toLowerCase();
  const langMap = {
    danish:['#Danish','#DanishJobs'], norwegian:['#Norwegian','#NordicJobs'],
    swedish:['#Swedish','#NordicJobs'], french:['#French','#FrenchJobs'],
    german:['#German','#GermanJobs'], spanish:['#Spanish','#SpanishJobs'],
    portuguese:['#Portuguese','#PortugueseJobs'], japanese:['#Japanese','#JapaneseJobs'],
    korean:['#Korean','#KoreanJobs'], arabic:['#Arabic','#ArabicJobs'],
    vietnamese:['#Vietnam','#VietnamJobs'], chinese:['#Chinese','#ChineseJobs'],
    turkish:['#Turkish','#TurkishJobs'], polish:['#Polish','#PolishJobs'],
    italian:['#Italian','#ItalianJobs'], dutch:['#Dutch','#DutchJobs'],
    greek:['#Greek','#GreekJobs'], hindi:['#Hindi','#IndiaJobs'],
    filipino:['#Filipino','#PhilippinesJobs'], tagalog:['#Filipino','#PhilippinesJobs'],
    icelandic:['#Icelandic','#IcelandJobs'], malay:['#Malay','#MalaysiaJobs'],
    indonesian:['#Indonesian','#IndonesiaJobs'],
  };
  const domainMap = {
    medical:['#MedicalJobs','#HealthcareAI'], doctor:['#MedicalJobs','#HealthcareAI'],
    engineer:['#EngineeringJobs','#TechJobs'], software:['#SoftwareJobs','#TechJobs'],
    math:['#MathJobs','#STEMJobs'], finance:['#FinanceJobs','#FinTech'],
    law:['#LegalJobs','#LegalTech'], data:['#DataScience','#DataJobs'],
  };
  for (const [key, tagList] of Object.entries(langMap)) {
    if (lower.includes(key)) { tags.push(...tagList); break; }
  }
  for (const [key, tagList] of Object.entries(domainMap)) {
    if (lower.includes(key)) { tags.push(...tagList); break; }
  }
  return [...new Set(tags)].slice(0, 5);
}

function extractBullets(text, max = 5) {
  if (!text) return [];
  return text.split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(l => l.length > 15 && l.length < 180)
    .slice(0, max);
}

function draftLinkedIn({ title, pay, location, content, applyUrl }) {
  const flag = getFlagEmoji(title);
  const hashtags = buildHashtags(title);
  const lines = extractBullets(content, 4);
  const roleLines = lines.length
    ? lines.map(b => `✅ ${b}`).join('\n')
    : `✅ Review and evaluate AI-generated content\n✅ Provide written feedback and corrections\n✅ Rate and compare AI model outputs`;

  return [
    `[HIRING] ${flag} ${title}!`,
    '',
    `${title}`,
    `🌍 ${location} | 💰 ${pay} | ⏰ Flexible hours`,
    '',
    `Here's what you'd actually be doing:`,
    roleLines,
    '',
    `Who this is for:`,
    `- Native or fluent speakers with a relevant professional background`,
    `- Strong English proficiency required (C1+)`,
    '',
    `How to apply:`,
    `1️⃣ Comment "Interested" under the post`,
    `2️⃣ DM me "${title.split(' ')[0]}"`,
    '',
    `Tag someone who'd be a great fit 👇`,
    '',
    hashtags.join(' '),
  ].join('\n');
}

function draftTelegram({ title, pay, location, content, applyUrl, jobPageUrl }) {
  const flag = getFlagEmoji(title);
  const bullets = extractBullets(content, 4);
  const reqLines = bullets.length
    ? bullets.map(b => `✅ ${b}`).join('\n')
    : `✅ Relevant subject matter expertise\n✅ Strong written English (C1+)\n✅ Reliable remote contractor`;

  const shortDesc = bullets.length
    ? bullets[0].slice(0, 180)
    : `AI labs need ${title.toLowerCase()} experts to review outputs and train AI models. Remote, flexible.`;

  return [
    `${flag} ${title} — ${pay}`,
    '',
    shortDesc,
    '',
    `💰 ${pay}`,
    `🌍 ${location}`,
    `⏰ Flexible hours`,
    `💸 Weekly payments via Deel`,
    '',
    `Requirements:`,
    reqLines,
    '',
    `Eligibility:`,
    `📍 Worldwide`,
    `⚠️ Deel eligibility required — check deel.com/global-payroll-and-compliance`,
    `⚠️ Pipeline role — no immediate project guaranteed. Qualified experts contacted first when work opens.`,
    '',
    `👉 Apply: ${jobPageUrl || applyUrl}`,
    '',
    `📲 Share to a friend if they could use an extra income stream`,
  ].join('\n');
}

async function getJobList() {
  const jobs = await wpFetch(`/wp-json/wp/v2/job?per_page=15&orderby=date&order=desc&status=publish`);
  if (!Array.isArray(jobs) || jobs.length === 0) throw new Error('No jobs found or WP API error');
  return jobs.map((job, i) => ({
    index:   i + 1,
    id:      job.id,
    title:   job.title?.rendered || 'Untitled',
    slug:    job.slug,
    url:     job.link,
    date:    job.date?.slice(0, 10) || '',
    pay:     job.acf?.pay_range || 'Competitive',
    location: job.acf?.country || 'Worldwide (Remote)',
    applyUrl: job.acf?.apply_url || job.link,
    content: stripHtml(job.content?.rendered || ''),
    source:  'tfa',
  }));
}

async function draftPostsForJobs(selectedJobs) {
  return selectedJobs.map(job => ({
    job,
    linkedin: draftLinkedIn(job),
    telegram: draftTelegram({ ...job, jobPageUrl: job.url }),
  }));
}

module.exports = { getJobList, draftPostsForJobs };
