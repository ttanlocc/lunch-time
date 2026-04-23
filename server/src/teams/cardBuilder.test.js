import { describe, it, expect } from 'vitest';
import { buildMenuCard, buildConfirmedCard } from './cardBuilder.js';

const sampleItems = [
  { id: 1, name: 'Cơm sườn', price: 35000, category: 'Cơm' },
  { id: 2, name: 'Cơm gà', price: 30000, category: 'Cơm' },
  { id: 3, name: 'Bún bò', price: 30000, category: 'Bún' },
];

describe('buildMenuCard', () => {
  it('returns valid Adaptive Card with correct type', () => {
    const card = buildMenuCard(sampleItems);
    expect(card.type).toBe('AdaptiveCard');
    expect(card['$schema']).toBe('http://adaptivecards.io/schemas/adaptive-card.json');
    expect(card.version).toBe('1.4');
  });

  it('groups items by category', () => {
    const card = buildMenuCard(sampleItems);
    const bodyText = JSON.stringify(card.body);
    expect(bodyText).toContain('Cơm');
    expect(bodyText).toContain('Bún');
  });

  it('creates one Action.Submit per menu item', () => {
    const card = buildMenuCard(sampleItems);
    const actions = card.actions;
    expect(actions).toHaveLength(3);
    expect(actions[0].type).toBe('Action.Submit');
    expect(actions[0].data.menu_item_id).toBe(1);
  });

  it('formats price in Vietnamese dong', () => {
    const card = buildMenuCard(sampleItems);
    const bodyText = JSON.stringify(card.body);
    expect(bodyText).toContain('35k');
  });
});

describe('buildConfirmedCard', () => {
  it('shows confirmation message with person name and item name', () => {
    const card = buildConfirmedCard('An', 'Cơm sườn');
    const bodyText = JSON.stringify(card.body);
    expect(bodyText).toContain('An');
    expect(bodyText).toContain('Cơm sườn');
    expect(bodyText).toContain('✅');
  });
});
