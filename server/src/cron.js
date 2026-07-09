import cron from 'node-cron';
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import { getDb } from './db/index.js';
import { broadcast } from './services/sse.js';
import { buildMenuCard } from './teams/cardBuilder.js';
import { sendDebtReminders } from './services/debtReminder.js';
import { isMailConfigured } from './services/mailer.js';
import { isLastWorkingDayOfMonth } from './services/holidays.js';

function makeAdapter() {
  return new CloudAdapter(
    new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: process.env.TEAMS_APP_ID,
      MicrosoftAppPassword: process.env.TEAMS_APP_SECRET,
      MicrosoftAppType: 'MultiTenant',
    })
  );
}

async function sendDailyMenuCard() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const ref = db.prepare('SELECT * FROM bot_conversation WHERE id = 1').get();
  if (!ref) {
    console.log('[cron] No bot conversation reference saved yet — skipping menu send');
    return;
  }

  const menuItems = db.prepare(`
    SELECT mi.id, mi.name, mi.price, mi.category
    FROM daily_menu dm
    JOIN menu_items mi ON mi.id = dm.menu_item_id
    WHERE dm.date = ? AND dm.is_available = 1
    ORDER BY mi.category, mi.name
  `).all(today);

  if (menuItems.length === 0) {
    console.log('[cron] No menu for today — skipping Teams card send');
    return;
  }

  const card = buildMenuCard(menuItems);
  const adapter = makeAdapter();

  const conversationRef = {
    serviceUrl: ref.service_url,
    conversation: { id: ref.conversation_id, tenantId: ref.tenant_id },
    bot: { id: process.env.TEAMS_APP_ID },
  };

  await adapter.continueConversationAsync(
    process.env.TEAMS_APP_ID,
    conversationRef,
    async (context) => {
      await context.sendActivity({
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: card,
        }],
      });
    }
  );

  console.log(`[cron] Menu card sent to Teams for ${today}`);
}

export function startCron() {
  cron.schedule('0 11 * * 1-5', () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('UPDATE daily_menu SET is_locked = 1 WHERE date = ?').run(today);
    broadcast('order_locked', { date: today, reason: 'auto' });
    console.log(`[cron] Orders locked for ${today}`);
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  cron.schedule('30 7 * * 1-5', () => {
    sendDailyMenuCard().catch(err => console.error('[cron] sendDailyMenuCard error:', err));
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  // Friday 16:00 — email every debtor who has an email on file with their
  // outstanding lunch total + a pay-now QR. Skips quietly if mail isn't set up.
  cron.schedule('0 16 * * 5', () => {
    runDebtReminders('weekly');
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  // Last WORKING day of month 18:00 — friendly month-end "chốt sổ" nudge. Payday
  // is the last day of month, but if that's a weekend OR public holiday the real
  // payday shifts to the working day immediately before (so the mail lands when
  // people are at work + just got paid). Run daily and let the guard fire on the
  // single matching day — robust even when Tết pushes the last working day early.
  cron.schedule('0 18 * * *', () => {
    if (isLastWorkingDayOfMonth(vnNow())) runDebtReminders('month_end');
  }, { timezone: 'Asia/Ho_Chi_Minh' });
}

// Current date in Asia/Ho_Chi_Minh, as a Date whose local fields read as VN time.
function vnNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
}

function runDebtReminders(occasion) {
  // One-off kill switch: REMINDER_SKIP_DATES is a comma-separated list of
  // YYYY-MM-DD (VN time) to skip. Self-expiring — only the listed dates are
  // skipped, so it never affects future months. Leave the date in or remove it.
  const today = vnNow().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const skip = (process.env.REMINDER_SKIP_DATES || '').split(',').map(s => s.trim());
  if (skip.includes(today)) {
    console.log(`[cron] Debt reminder (${occasion}) skipped — ${today} in REMINDER_SKIP_DATES`);
    return;
  }
  if (!isMailConfigured()) {
    console.log(`[cron] Debt reminder (${occasion}) skipped — mail not configured`);
    return;
  }
  sendDebtReminders(getDb(), { occasion })
    .then(r => console.log(`[cron] Debt reminders (${occasion}): ${r.sent.length} sent, ${r.skipped.length} skipped`))
    .catch(err => console.error(`[cron] sendDebtReminders (${occasion}) error:`, err));
}
