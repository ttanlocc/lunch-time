import cron from 'node-cron';
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import { getDb } from './db/index.js';
import { broadcast } from './services/sse.js';
import { buildMenuCard } from './teams/cardBuilder.js';

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
}
