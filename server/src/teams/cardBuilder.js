export function buildMenuCard(menuItems) {
  const today = new Date().toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  const byCategory = {};
  for (const item of menuItems) {
    const cat = item.category || 'Khác';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  const body = [
    {
      type: 'TextBlock',
      text: `🍱 Menu hôm nay — ${today}`,
      weight: 'Bolder',
      size: 'Medium',
      wrap: true,
    },
  ];

  for (const [category, items] of Object.entries(byCategory)) {
    body.push({ type: 'TextBlock', text: category, weight: 'Bolder', spacing: 'Medium' });
    body.push({
      type: 'ColumnSet',
      columns: items.map(item => ({
        type: 'Column',
        width: 'auto',
        items: [{
          type: 'TextBlock',
          text: `${item.name} — ${Math.round(item.price / 1000)}k`,
          size: 'Small',
          wrap: true,
        }],
      })),
    });
  }

  const actions = menuItems.map(item => ({
    type: 'Action.Submit',
    title: `${item.name} ${Math.round(item.price / 1000)}k`,
    data: { menu_item_id: item.id, action: 'order' },
  }));

  return {
    type: 'AdaptiveCard',
    '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body,
    actions,
  };
}

export function buildConfirmedCard(personName, itemName) {
  return {
    type: 'AdaptiveCard',
    '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: `✅ **${personName}** đã chọn **${itemName}**`,
        wrap: true,
        size: 'Medium',
      },
      {
        type: 'TextBlock',
        text: 'Vào web để thêm món phụ hoặc huỷ order.',
        wrap: true,
        size: 'Small',
        isSubtle: true,
      },
    ],
  };
}
