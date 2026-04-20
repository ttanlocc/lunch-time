// server/src/services/menuParser.js

export function normalizeName(name) {
  return name.replace(/[:\-,]/g, '').trim().toLowerCase();
}

function parsePrice(raw) {
  const match = raw.match(/(\d+)k/i);
  return match ? parseInt(match[1]) * 1000 : 0;
}

export function parseMenuText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  const addons = {};

  let inExtras = false;
  let lastItemKey = null;

  for (const line of lines) {
    if (/^gọi thêm[:\s]/i.test(line)) {
      inExtras = true;
      lastItemKey = null;
      continue;
    }

    if (line.startsWith('-')) {
      const match = line.match(/^-\s+(.+?)\s+(\d+k(?:\/\S+)?)\s*$/i);
      if (!match) continue;
      const [, rawName, rawPrice] = match;
      const name = rawName.replace(/:$/, '').trim();
      const normalizedName = normalizeName(name);
      const price = parsePrice(rawPrice);
      const category = inExtras ? 'extra' : 'main';
      items.push({ name, normalizedName, price, category });
      lastItemKey = inExtras ? null : normalizedName;
    } else if (line.startsWith('+') && lastItemKey) {
      const match = line.match(/^\+\s+(.+?):\s*(\d+k(?:\/\S+)?)/i);
      if (!match) continue;
      const [, names, rawPrice] = match;
      const price = parsePrice(rawPrice);
      addons[lastItemKey] = names.split('||').map(n => ({
        name: n.trim(),
        price,
      }));
    }
  }

  return { items, addons };
}
