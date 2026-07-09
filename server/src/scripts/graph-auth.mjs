// server/src/scripts/graph-auth.mjs
// One-time interactive sign-in to mint a delegated Graph refresh token for the
// lunch debt-reminder mailer. No admin consent needed — you consent for yourself.
//
// Run from the server/ dir:
//   GRAPH_TENANT_ID=<tenant> GRAPH_CLIENT_ID=<client> node src/scripts/graph-auth.mjs
//
// It prints a URL + code; open the URL, enter the code, sign in as the sender
// mailbox (loc.tran@nois.vn) and approve. The refresh token is saved to
// data/graph-token.json, which the server reads on every send.
import { saveRefreshToken } from '../services/mailer.js';

const TENANT = process.env.GRAPH_TENANT_ID;
const CLIENT = process.env.GRAPH_CLIENT_ID;
const SCOPE = 'offline_access https://graph.microsoft.com/Mail.Send';

if (!TENANT || !CLIENT) {
  console.error('Set GRAPH_TENANT_ID and GRAPH_CLIENT_ID env vars first.');
  process.exit(1);
}

const base = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  // 1. Request a device code
  const dcRes = await fetch(`${base}/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT, scope: SCOPE }),
  });
  const dc = await dcRes.json();
  if (!dcRes.ok) {
    console.error('devicecode error:', dc.error, dc.error_description);
    process.exit(1);
  }

  console.log('\n' + '─'.repeat(60));
  console.log(dc.message); // "To sign in, open https://microsoft.com/devicelogin and enter CODE..."
  console.log('─'.repeat(60) + '\n');

  // 2. Poll for the token
  const interval = (dc.interval || 5) * 1000;
  const deadline = Date.now() + (dc.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    const tRes = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: CLIENT,
        device_code: dc.device_code,
      }),
    });
    const t = await tRes.json();

    if (tRes.ok && t.refresh_token) {
      saveRefreshToken(t.refresh_token);
      console.log('✅ Done — refresh token saved to data/graph-token.json');
      console.log('   You can now send reminders. Restart the server if it was running.');
      return;
    }
    if (t.error === 'authorization_pending') continue; // keep waiting
    if (t.error === 'slow_down') { await sleep(interval); continue; }
    console.error('token error:', t.error, t.error_description);
    process.exit(1);
  }
  console.error('Timed out waiting for sign-in.');
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
