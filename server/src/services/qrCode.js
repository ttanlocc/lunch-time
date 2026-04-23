export function buildQrCode(personName, week, year) {
  const slug = personName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 10);
  return `LUNCH-${slug}-W${week}-${year}`;
}

export function parseQrCode(text) {
  if (!text) return null;
  const m = text.match(/LUNCH-([A-Z0-9]+)-W(\d+)-(\d{4})/i);
  if (!m) return null;
  return {
    qrCode: m[0].toUpperCase(),
    nameSlug: m[1].toUpperCase(),
    week: parseInt(m[2]),
    year: parseInt(m[3]),
  };
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array(n + 1).fill(0).map((_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function extractSenderName(text) {
  if (!text) return null;
  const m = text.match(/CT\s+tu\s+\d+\s+([A-Z][A-Z\s]+?)\s+toi\s+/i);
  if (m) return m[1].trim();
  return null;
}
