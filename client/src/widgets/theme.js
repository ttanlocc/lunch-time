// client/src/widgets/theme.js
//
// Shared design tokens for the widget library. Same hex values as
// DebtPage.jsx / HistoryPage.jsx / InsightsPage.jsx, centralised here (not
// duplicated into each of the ~12 eventual widget files). InsightsPage.jsx keeps
// its own local copy for the sections that stay outside the library.

export const C = {
  bg:          '#fbf7f3',
  paper:       '#ffffff',
  paperWarm:   '#fbf6f1',
  ink:         '#2b2235',
  inkSoft:     '#6b5d75',
  inkMute:     '#a89aae',
  hl:          'rgba(43,34,53,0.07)',
  hlStrong:    'rgba(43,34,53,0.12)',
  rose:        '#fbe7ee',
  magenta:     '#e8a8c4',
  magentaInk:  '#a55c7d',
  magentaDeep: '#c47899',
  violet:      '#b8a4d4',
  emerald:     '#8fc1ab',
  emeraldDeep: '#5b9b7f',
  emeraldInk:  '#065f46',
  amber:       '#d4a373',
  amberSoft:   '#f6e8d6',
};

const AVATAR_PALETTES = [
  { bg: '#fce7f3', text: '#be185d' },
  { bg: '#dbeafe', text: '#1e40af' },
  { bg: '#d1fae5', text: '#065f46' },
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#ede9fe', text: '#5b21b6' },
  { bg: '#fee2e2', text: '#991b1b' },
  { bg: '#e0f2fe', text: '#0c4a6e' },
  { bg: '#f0fdf4', text: '#14532d' },
  { bg: '#fdf4ff', text: '#701a75' },
  { bg: '#fff7ed', text: '#9a3412' },
];

export function getPalette(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

export function getInitial(name) {
  const parts = (name || '?').trim().split(' ').filter(Boolean);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}
