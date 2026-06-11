# Talents for AI — Telegram Bot

Manage your WordPress site from Telegram. Add jobs, edit copy, get weekly reports, and approve changes — all from a single chat.

---

## Features

| Command | What it does |
|---|---|
| `/addjob` | 5-step wizard → creates a job listing in WordPress |
| `/editcopy hero_title \| New text` | Queue a copy change for approval |
| `/report` | Pull site report on demand |
| `/pending` | List changes awaiting your approval |
| Weekly cron | Auto-report every Monday at 09:00 |

---

## Setup

### 1. Get your Telegram user ID
Message [@userinfobot](https://t.me/userinfobot) — it replies with your numeric ID. Put it in `.env` as `TELEGRAM_OWNER_ID`.

### 2. Create WordPress Application Password
1. Go to **WP Admin → Users → Your Profile**
2. Scroll to **Application Passwords**
3. Name it `telegram-bot` → click **Add New**
4. Copy the password (spaces included) → paste into `.env` as `WP_APP_PASS`

### 3. Install the mu-plugin
Upload `scripts/tfai-bot-sync.php` to:
```
/public_html/wp-content/mu-plugins/tfai-bot-sync.php
```
Create the `mu-plugins` folder if it doesn't exist. The plugin loads automatically — no activation step.

### 4. Deploy the bot on Hostinger

#### Option A — Node.js app (recommended)
Hostinger supports Node.js apps via hPanel:

1. hPanel → **Websites → Manage → Node.js**
2. Set Node version to **18+**
3. Upload the bot folder (excluding `node_modules`) via File Manager or FTP
4. In the Node.js panel, set **Entry point** to `bot.js`
5. Click **Install dependencies** (runs `npm install`)
6. Create your `.env` file in the bot root (copy from `.env.example`)
7. Click **Restart**

#### Option B — VPS / SSH
```bash
ssh user@your-hostinger-vps
cd /home/user
git clone <your-repo> talentsforai-bot
cd talentsforai-bot
cp .env.example .env
nano .env          # fill in values
npm install
# Run persistently with PM2
npm install -g pm2
pm2 start bot.js --name tfai-bot
pm2 save
pm2 startup        # follow the printed command
```

---

## Using copy sections in WordPress

After installing the mu-plugin, use the shortcode anywhere in your pages or Generate Blocks HTML block:

```
[tfai_copy section="hero_title"]
[tfai_copy section="hero_sub"]
[tfai_copy section="hiw_step1"]
```

Or in PHP (theme/child theme):
```php
echo get_option('tfai_copy_hero_title', 'Default title here');
```

Available sections: `hero_title`, `hero_sub`, `stats`, `hiw_step1`, `hiw_step2`, `hiw_step3`, `cta`

---

## GA4 Setup (apply click tracking)

This is a one-time ~10 minute setup.

### 1. Enable GA4 Data API
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select (or create) a project
3. Search **"Google Analytics Data API"** → Enable it

### 2. Create a service account
1. Cloud Console → **IAM & Admin → Service Accounts** → **Create Service Account**
2. Name it `tfai-bot` → Continue → Done
3. Click the service account → **Keys** tab → **Add Key → Create new key → JSON**
4. Download the JSON file

### 3. Grant the service account access to GA4
1. Open [GA4](https://analytics.google.com) → Admin → **Property Access Management**
2. Click **+** → Add users → paste the service account email (`...@...iam.gserviceaccount.com`)
3. Role: **Viewer** → Add

### 4. Add credentials to .env
From the downloaded JSON file:
- `GA4_PROPERTY_ID` — from GA4 Admin → Property Settings → Property ID (numbers only)
- `GA4_CLIENT_EMAIL` — the `client_email` field in the JSON
- `GA4_PRIVATE_KEY` — the `private_key` field in the JSON (keep the `\n` characters as-is)

### 5. Install the click tracker
Upload `scripts/tfai-click-tracker.php` to `/wp-content/mu-plugins/`.
It auto-fires a `apply_click` GA4 event with the job title every time someone clicks Apply Now.

> **Note:** GA4 has a ~24–48h data delay for the Data API. Clicks from today may not appear until tomorrow.

---

Add your Plausible site ID and API key to `.env` for traffic stats in weekly reports. Free tier works fine. If you're not using Plausible, leave those fields blank — the report will just skip the traffic section.

---

## Security notes

- The bot only responds to your `TELEGRAM_OWNER_ID` — all other users get a silent deny
- WordPress Application Passwords are scoped to API use only — they don't allow login
- The mu-plugin endpoint requires `edit_posts` capability — no public access
- Keep `.env` out of version control (it's in `.gitignore`)

---

## File structure

```
talentsforai-bot/
├── bot.js              ← main entry point
├── package.json
├── .env.example        ← copy to .env
├── src/
│   ├── state.js        ← wizard sessions + change queue
│   ├── jobs.js         ← /addjob wizard
│   ├── wordpress.js    ← WP REST API calls
│   ├── ga4.js          ← GA4 Data API (apply clicks)
│   └── report.js       ← report builder
└── scripts/
    ├── tfai-bot-sync.php      ← upload to wp-content/mu-plugins/
    └── tfai-click-tracker.php ← upload to wp-content/mu-plugins/
```
