/**
 * Talents for AI — Telegram Bot
 * Handles: add job, edit copy, weekly report, approve/reject changes,
 *          job post drafting → Buffer (LinkedIn) + Telegram channel
 *
 * Setup:
 *   1. Copy .env.example → .env and fill in values
 *   2. npm install
 *   3. node bot.js
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron        = require('node-cron');
const wp          = require('./src/wordpress');
const report      = require('./src/report');
const jobs        = require('./src/jobs');
const state       = require('./src/state');
const earnings    = require('./src/earnings');
const postDrafter = require('./src/postDrafter');
const buffer      = require('./src/buffer');

const bot      = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const OWNER_ID = parseInt(process.env.TELEGRAM_OWNER_ID, 10);
const TG_CHANNEL = process.env.TELEGRAM_CHANNEL_ID; // e.g. @talentsforai or -100xxxxxxx

// ─── In-memory draft store (jobId → { linkedin, telegram, job }) ──────────────
const draftStore = new Map();

// ─── Auth guard ──────────────────────────────────────────────────────────────
function isOwner(msg) { return msg.from.id === OWNER_ID; }
function deny(msg)    { bot.sendMessage(msg.chat.id, '⛔ Unauthorised.'); }

// ─── /start + /help ──────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  if (!isOwner(msg)) return deny(msg);
  bot.sendMessage(msg.chat.id, [
    '👋 *Talents for AI Bot*',
    '',
    'Commands:',
    '`/newjobs` — fetch latest job listings to post',
    '`/addjob` — add a new job listing to WordPress',
    '`/editcopy` — edit homepage copy',
    '`/report` — get site report now',
    '`/earnings` — get SME earnings summary',
    '`/pending` — view pending changes',
    '`/help` — show this message',
  ].join('\n'), { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  if (!isOwner(msg)) return deny(msg);
  bot.sendMessage(msg.chat.id, [
    '📋 *Available commands*',
    '',
    '`/newjobs` — fetch latest job listings → pick which to draft posts for',
    '`/addjob` — start the add-job wizard',
    '`/editcopy <section> | <new text>` — edit a section',
    '   Sections: `hero_title`, `hero_sub`, `stats`, `hiw_step1`, `hiw_step2`, `hiw_step3`, `cta`',
    '`/report` — pull site report immediately',
    '`/pending` — list queued changes awaiting approval',
    '`/cancel` — cancel any active wizard',
  ].join('\n'), { parse_mode: 'Markdown' });
});

// ─── /newjobs — fetch job list ────────────────────────────────────────────────
bot.onText(/\/newjobs/, async (msg) => {
  if (!isOwner(msg)) return deny(msg);
  bot.sendMessage(msg.chat.id, '⏳ Fetching latest job listings...');
  try {
    const jobList = await postDrafter.getJobList();
    if (!jobList.length) {
      return bot.sendMessage(msg.chat.id, '📭 No job listings found.');
    }

    // Store job list in session
    state.set(msg.chat.id, { step: 'pick_jobs', jobList });

    const lines = jobList.map(j =>
      `*${j.index}.* ${j.title} _(${j.date})_\n   🔗 ${j.url}`
    );

    bot.sendMessage(msg.chat.id, [
      `📋 *Latest ${jobList.length} job listings:*`,
      '',
      lines.join('\n\n'),
      '',
      '👉 Reply with the numbers you want to draft posts for.',
      'Example: `pick 1 3 5` or just `1 3 5`',
    ].join('\n'), { parse_mode: 'Markdown', disable_web_page_preview: true });

  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ Failed to fetch jobs: ${e.message}`);
  }
});

// ─── /addjob wizard ──────────────────────────────────────────────────────────
bot.onText(/\/addjob/, (msg) => {
  if (!isOwner(msg)) return deny(msg);
  state.set(msg.chat.id, { step: 'job_title' });
  bot.sendMessage(msg.chat.id, '📝 *New job listing*\n\nStep 1/6 — Job title:', { parse_mode: 'Markdown' });
});

// ─── /editcopy ───────────────────────────────────────────────────────────────
bot.onText(/\/editcopy (.+)/, async (msg, match) => {
  if (!isOwner(msg)) return deny(msg);
  const parts = match[1].split('|').map(s => s.trim());
  if (parts.length < 2) {
    return bot.sendMessage(msg.chat.id, '⚠️ Format: `/editcopy <section> | <new text>`', { parse_mode: 'Markdown' });
  }
  const [section, newText] = parts;
  const valid = ['hero_title','hero_sub','stats','hiw_step1','hiw_step2','hiw_step3','cta'];
  if (!valid.includes(section)) {
    return bot.sendMessage(msg.chat.id, `⚠️ Unknown section. Valid sections:\n${valid.map(s => `• \`${s}\``).join('\n')}`, { parse_mode: 'Markdown' });
  }
  const changeId = state.queueChange({ type: 'copy', section, newText });
  const keyboard = { inline_keyboard: [[
    { text: '✅ Approve', callback_data: `approve_${changeId}` },
    { text: '❌ Reject',  callback_data: `reject_${changeId}` },
  ]]};
  bot.sendMessage(msg.chat.id, [
    `📝 *Copy change queued* (ID: \`${changeId}\`)`,
    '',
    `Section: \`${section}\``,
    `New text: _${newText}_`,
    '',
    'Approve to push to WordPress?',
  ].join('\n'), { reply_markup: keyboard });
});

// ─── /earnings ────────────────────────────────────────────────────────────────
bot.onText(/\/earnings/, async (msg) => {
  if (!isOwner(msg)) return deny(msg);
  bot.sendMessage(msg.chat.id, '⏳ Fetching earnings...');
  try {
    const text = await earnings.getEarnings();
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ Earnings failed: ${e.message}`);
  }
});

// ─── /report ─────────────────────────────────────────────────────────────────
bot.onText(/\/report/, async (msg) => {
  if (!isOwner(msg)) return deny(msg);
  bot.sendMessage(msg.chat.id, '⏳ Fetching report...');
  try {
    const text = await report.generate();
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ Report failed: ${e.message}`);
  }
});

// ─── /pending ────────────────────────────────────────────────────────────────
bot.onText(/\/pending/, (msg) => {
  if (!isOwner(msg)) return deny(msg);
  const pending = state.getPendingChanges();
  if (!pending.length) return bot.sendMessage(msg.chat.id, '✅ No pending changes.');
  const lines = pending.map(c =>
    `• \`${c.id}\` — ${c.type === 'copy' ? `copy › ${c.section}` : `job › ${c.data?.title || '?'}`} _(${c.createdAt})_`
  );
  bot.sendMessage(msg.chat.id, `📋 *Pending changes (${pending.length})*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
});

// ─── /cancel ─────────────────────────────────────────────────────────────────
bot.onText(/\/cancel/, (msg) => {
  if (!isOwner(msg)) return deny(msg);
  state.clear(msg.chat.id);
  bot.sendMessage(msg.chat.id, '🚫 Cancelled.');
});

// ─── Approve / Reject callbacks (WP changes) ─────────────────────────────────
bot.on('callback_query', async (query) => {
  if (query.from.id !== OWNER_ID) return;
  const data = query.data;

  // ── Draft post publish callbacks ──
  if (data.startsWith('pub_li_') || data.startsWith('pub_tg_') || data.startsWith('pub_both_')) {
    const parts = data.split('_');
    const action  = parts[0] + '_' + parts[1] + '_'; // 'pub_li_' etc
    const draftId = data.replace(/^pub_(li|tg|both)_/, '');
    const draft   = draftStore.get(draftId);

    if (!draft) {
      return bot.answerCallbackQuery(query.id, { text: 'Draft expired or not found.' });
    }

    try {
      const results = [];

      if (data.startsWith('pub_li_') || data.startsWith('pub_both_')) {
        await buffer.createLinkedInDraft(draft.linkedin);
        results.push('✅ LinkedIn draft created in Buffer');
      }

      if (data.startsWith('pub_tg_') || data.startsWith('pub_both_')) {
        if (!TG_CHANNEL) throw new Error('TELEGRAM_CHANNEL_ID not set in .env');
        await bot.sendMessage(TG_CHANNEL, draft.telegram);
        results.push('✅ Posted to Telegram channel');
      }

      bot.answerCallbackQuery(query.id, { text: results.join(' | ') });
      bot.editMessageText(
        `${results.join('\n')}\n\n_Draft ID: ${draftId}_`,
        { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'Markdown' }
      );
      draftStore.delete(draftId);
    } catch (e) {
      bot.answerCallbackQuery(query.id, { text: `❌ ${e.message}` });
      bot.sendMessage(query.message.chat.id, `❌ Publish failed: ${e.message}`);
    }
    return;
  }

  // ── WP approve/reject ──
  const [action, changeId] = data.split('_');
  const change = state.getChange(changeId);

  if (!change) {
    return bot.answerCallbackQuery(query.id, { text: 'Change not found or already processed.' });
  }

  if (action === 'approve') {
    try {
      if (change.type === 'copy') {
        await wp.updateCopySection(change.section, change.newText);
      } else if (change.type === 'job') {
        await wp.createJobPost(change.data);
      }
      state.resolveChange(changeId, 'approved');
      bot.answerCallbackQuery(query.id, { text: '✅ Pushed to WordPress!' });
      bot.editMessageText(`✅ *Approved & published* (ID: \`${changeId}\`)`, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
      });
    } catch (e) {
      bot.answerCallbackQuery(query.id, { text: `❌ Failed: ${e.message}` });
    }
  } else if (action === 'reject') {
    state.resolveChange(changeId, 'rejected');
    bot.answerCallbackQuery(query.id, { text: 'Rejected.' });
    bot.editMessageText(`❌ *Rejected* (ID: \`${changeId}\`)`, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
    });
  }
});

// ─── Helper: send draft to owner with approve/edit buttons ───────────────────
function sendDraftToOwner(chatId, draftId, jobTitle, linkedin, telegram) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Post Both',     callback_data: `pub_both_${draftId}` },
        { text: '📤 LinkedIn Only', callback_data: `pub_li_${draftId}` },
        { text: '📱 Telegram Only', callback_data: `pub_tg_${draftId}` },
      ]
    ]
  };

  const text = [
    `📝 Draft ready: ${jobTitle}`,
    '',
    '─── LINKEDIN ───',
    linkedin,
    '',
    '─── TELEGRAM ───',
    telegram,
    '',
    'To edit: reply with "edit li <new text>" or "edit tg <new text>"',
    `Draft ID: ${draftId}`,
  ].join('\n');

  bot.sendMessage(chatId, text, { reply_markup: keyboard });
}

// ─── General message handler (wizard steps + job picking + draft editing) ─────
bot.on('message', async (msg) => {
  if (!isOwner(msg)) return;
  if (!msg.text) return;
  if (msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const text   = msg.text.trim();
  const s      = state.get(chatId);

  // ── Job picking step ──────────────────────────────────────────────────────
  if (s?.step === 'pick_jobs') {
    const nums = text.replace(/^pick\s*/i, '')
      .split(/[\s,]+/)
      .map(n => parseInt(n, 10))
      .filter(n => !isNaN(n) && n >= 1);

    if (!nums.length) {
      return bot.sendMessage(chatId, '⚠️ Please reply with numbers, e.g. `1 3 5`', { parse_mode: 'Markdown' });
    }

    const selected = s.jobList.filter(j => nums.includes(j.index));
    if (!selected.length) {
      return bot.sendMessage(chatId, '⚠️ None of those numbers matched the list. Try again.');
    }

    state.clear(chatId);
    bot.sendMessage(chatId, `⏳ Fetching descriptions and drafting posts for *${selected.length}* job(s)...`, { parse_mode: 'Markdown' });

    try {
      const drafts = await postDrafter.draftPostsForJobs(selected);

      for (const d of drafts) {
        if (d.error) {
          bot.sendMessage(chatId, `❌ Failed to draft *${d.job.title}*: ${d.error}`, { parse_mode: 'Markdown' });
          continue;
        }

        const draftId = `d${Date.now()}_${d.job.index}`;
        draftStore.set(draftId, { linkedin: d.linkedin, telegram: d.telegram, job: d.job });

        sendDraftToOwner(chatId, draftId, d.job.title, d.linkedin, d.telegram);
      }
    } catch (e) {
      bot.sendMessage(chatId, `❌ Draft failed: ${e.message}`);
    }
    return;
  }

  // ── Draft editing: "edit li <text>" or "edit tg <text>" ──────────────────
  const editLiMatch = text.match(/^edit\s+li\s+(.+)/is);
  const editTgMatch = text.match(/^edit\s+tg\s+(.+)/is);

  if (editLiMatch || editTgMatch) {
    // Find most recent draft
    const draftId = [...draftStore.keys()].pop();
    if (!draftId) {
      return bot.sendMessage(chatId, '⚠️ No active draft found. Use `/newjobs` to start.');
    }
    const draft = draftStore.get(draftId);

    if (editLiMatch) {
      draft.linkedin = editLiMatch[1];
      bot.sendMessage(chatId, '✏️ LinkedIn post updated. Send another edit or use the buttons above to publish.', { parse_mode: 'Markdown' });
    } else {
      draft.telegram = editTgMatch[1];
      bot.sendMessage(chatId, '✏️ Telegram post updated. Send another edit or use the buttons above to publish.', { parse_mode: 'Markdown' });
    }

    // Re-show the updated draft
    const jobTitle = draft.job?.title || 'Job';
    sendDraftToOwner(chatId, draftId, jobTitle, draft.linkedin, draft.telegram);
    return;
  }

  // ── Wizard steps (addjob) ─────────────────────────────────────────────────
  if (s) {
    jobs.handleWizardStep(bot, msg, s, state);
  }
});

// ─── Weekly report cron (Monday 09:00 server time) ───────────────────────────
cron.schedule('0 9 * * 1', async () => {
  try {
    const text = await report.generate();
    bot.sendMessage(OWNER_ID, `📊 *Weekly report*\n\n${text}`, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(OWNER_ID, `❌ Weekly report failed: ${e.message}`);
  }
});

console.log('🤖 Talents for AI bot is running...');
