/**
 * Multi-step wizard for adding a new job listing
 *
 * Steps:
 *   1. job_title
 *   2. job_location
 *   3. job_pay
 *   4. job_description
 *   5. job_apply_url
 *   6. job_confirm  (shows preview → Approve/Reject)
 */

const STEPS = ['job_title','job_location','job_pay','job_description','job_apply_url','job_confirm'];

const PROMPTS = {
  job_title:       'Step 1/5 — *Job title*\nExamples: `Senior Python Engineer`, `French/English Bilingual Expert`',
  job_location:    'Step 2/5 — *Location*\nExamples: `Worldwide (Remote)`, `Italy (Remote)`',
  job_pay:         'Step 3/5 — *Pay rate*\nExamples: `up to $48/h`, `$15–$30/h`',
  job_description: 'Step 4/5 — *Short description* (2–3 sentences shown on the card)',
  job_apply_url:   'Step 5/5 — *Apply URL*\nPaste the full sme.careers/apply link with your referral:',
};

function handleWizardStep(bot, msg, session, state) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  switch (session.step) {
    case 'job_title':
      state.set(chatId, { ...session, title: text, step: 'job_location' });
      bot.sendMessage(chatId, PROMPTS.job_location, { parse_mode: 'Markdown' });
      break;

    case 'job_location':
      state.set(chatId, { ...session, location: text, step: 'job_pay' });
      bot.sendMessage(chatId, PROMPTS.job_pay, { parse_mode: 'Markdown' });
      break;

    case 'job_pay':
      state.set(chatId, { ...session, pay: text, step: 'job_description' });
      bot.sendMessage(chatId, PROMPTS.job_description, { parse_mode: 'Markdown' });
      break;

    case 'job_description':
      state.set(chatId, { ...session, description: text, step: 'job_apply_url' });
      bot.sendMessage(chatId, PROMPTS.job_apply_url, { parse_mode: 'Markdown' });
      break;

    case 'job_apply_url': {
      const data = {
        title:       session.title,
        location:    session.location,
        pay:         session.pay,
        description: session.description,
        applyUrl:    text,
      };
      state.set(chatId, { ...session, applyUrl: text, step: 'job_confirm' });

      const changeId = state.queueChange({ type: 'job', data });
      const preview = [
        `📋 *Job preview* (ID: \`${changeId}\`)`,
        '',
        `*${data.title}*`,
        `📍 ${data.location}`,
        `💰 ${data.pay}`,
        '',
        `_${data.description}_`,
        '',
        `🔗 ${data.applyUrl}`,
        '',
        'Publish this job to your WordPress site?',
      ].join('\n');

      const keyboard = {
        inline_keyboard: [[
          { text: '✅ Publish', callback_data: `approve_${changeId}` },
          { text: '❌ Discard', callback_data: `reject_${changeId}` },
        ]]
      };
      bot.sendMessage(chatId, preview, { parse_mode: 'Markdown', reply_markup: keyboard });
      state.clear(chatId);
      break;
    }

    default:
      break;
  }
}

module.exports = { handleWizardStep };
