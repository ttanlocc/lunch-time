import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { broadcast } from '../services/sse.js';
import { buildConfirmedCard } from '../teams/cardBuilder.js';

const auth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.TEAMS_APP_ID,
  MicrosoftAppPassword: process.env.TEAMS_APP_SECRET,
  MicrosoftAppType: 'MultiTenant',
});

const adapter = new CloudAdapter(auth);

adapter.onTurnError = async (context, error) => {
  console.error('[bot] onTurnError:', error);
  await context.sendActivity('Đã xảy ra lỗi. Vui lòng thử lại.');
};

export const botRouter = Router();

botRouter.post('/', (req, res) => {
  adapter.process(req, res, async (context) => {
    const { type, from, value } = context.activity;

    if (type === 'conversationUpdate') {
      const ref = context.activity;
      const db = getDb();
      db.prepare(`
        INSERT INTO bot_conversation (id, service_url, conversation_id, tenant_id, updated_at)
        VALUES (1, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          service_url = excluded.service_url,
          conversation_id = excluded.conversation_id,
          tenant_id = excluded.tenant_id,
          updated_at = excluded.updated_at
      `).run(
        ref.serviceUrl,
        ref.conversation.id,
        ref.conversation.tenantId ?? null,
      );
      console.log('[bot] Conversation reference saved');
      return;
    }

    if (type === 'invoke' && value?.action === 'order') {
      const personName = from.name;
      const menuItemId = value.menu_item_id;

      if (!personName || !menuItemId) {
        await context.sendActivity('Thiếu thông tin order.');
        return;
      }

      const db = getDb();
      const today = new Date().toISOString().slice(0, 10);

      const isLocked = db.prepare(
        'SELECT is_locked FROM daily_menu WHERE date = ? LIMIT 1'
      ).get(today)?.is_locked === 1;

      if (isLocked) {
        await context.sendActivity('⛔ Order hôm nay đã khoá rồi.');
        return;
      }

      const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(menuItemId);
      if (!menuItem) {
        await context.sendActivity('Món này không tồn tại.');
        return;
      }

      db.transaction(() => {
        const existing = db.prepare(
          'SELECT id FROM orders WHERE person_name = ? AND date = ?'
        ).all(personName, today);
        for (const o of existing) {
          db.prepare('DELETE FROM order_addons WHERE order_id = ?').run(o.id);
          db.prepare('DELETE FROM orders WHERE id = ?').run(o.id);
        }
        db.prepare(
          'INSERT INTO orders (person_name, menu_item_id, date, price) VALUES (?, ?, ?, ?)'
        ).run(personName, menuItemId, today, menuItem.price ?? 0);
      })();

      const updatedOrders = db.prepare(
        `SELECT o.id, o.person_name, mi.name as item_name, mi.price, mi.category
         FROM orders o JOIN menu_items mi ON mi.id = o.menu_item_id
         WHERE o.person_name = ? AND o.date = ?`
      ).all(personName, today);

      broadcast('order_submitted', { person_name: personName, orders: updatedOrders });

      const confirmedCard = buildConfirmedCard(personName, menuItem.name);
      await context.updateActivity({
        id: context.activity.replyToId,
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: confirmedCard,
        }],
      });
    }
  });
});
