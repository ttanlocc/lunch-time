// server/src/services/mailer.js
// Sends mail via Microsoft Graph. Two Graph modes + SMTP fallback.
//
// DELEGATED (no admin consent needed) — preferred for locked-down M365 tenants:
//   GRAPH_TENANT_ID, GRAPH_CLIENT_ID  (public client, "Allow public client flows" = Yes)
//   Delegated Mail.Send permission; user signs in once via scripts/graph-auth.mjs,
//   which stores a refresh token in data/graph-token.json. We rotate + persist it.
//
// APP (client-credentials, needs admin consent) — used if GRAPH_CLIENT_SECRET set:
//   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_SENDER
//   Application Mail.Send permission + admin consent.
//
// SMTP fallback (non-M365): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.resolve(__dirname, '../../../data/graph-token.json');
const SCOPE_DELEGATED = 'offline_access https://graph.microsoft.com/Mail.Send';

// ─── Refresh-token persistence (delegated mode) ─────────────────────────────
export function loadRefreshToken() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).refresh_token || null; }
  catch { return process.env.GRAPH_REFRESH_TOKEN || null; }
}
export function saveRefreshToken(refresh_token) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token, updated_at: new Date().toISOString() }, null, 2));
}

// ─── Capability checks ──────────────────────────────────────────────────────
export function isGraphDelegatedConfigured() {
  return Boolean(process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID && loadRefreshToken());
}
export function isGraphAppConfigured() {
  return Boolean(
    process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET && process.env.GRAPH_SENDER
  );
}
export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}
export function isMailConfigured() {
  return isGraphDelegatedConfigured() || isGraphAppConfigured() || isSmtpConfigured();
}

function tokenUrl() {
  return `https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`;
}

// ─── Token acquisition ──────────────────────────────────────────────────────
let _token = null; // { value, expiresAt }

async function getDelegatedToken() {
  if (_token && _token.expiresAt > Date.now() + 60_000) return _token.value;
  const body = new URLSearchParams({
    client_id: process.env.GRAPH_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: loadRefreshToken(),
    scope: SCOPE_DELEGATED,
  });
  if (process.env.GRAPH_CLIENT_SECRET) body.set('client_secret', process.env.GRAPH_CLIENT_SECRET);

  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph refresh failed: ${data.error || res.status} — ${data.error_description || ''}`.trim());
  // Microsoft rotates the refresh token — persist the new one or next run breaks.
  if (data.refresh_token) saveRefreshToken(data.refresh_token);
  _token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return _token.value;
}

async function getAppToken() {
  if (_token && _token.expiresAt > Date.now() + 60_000) return _token.value;
  const body = new URLSearchParams({
    client_id: process.env.GRAPH_CLIENT_ID,
    client_secret: process.env.GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph token failed: ${data.error || res.status} — ${data.error_description || ''}`.trim());
  _token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return _token.value;
}

// ─── Graph send ─────────────────────────────────────────────────────────────
async function sendViaGraph({ to, subject, html, text, attachments = [] }) {
  const delegated = isGraphDelegatedConfigured();
  const token = delegated ? await getDelegatedToken() : await getAppToken();
  // Delegated sends from the signed-in user (/me); app mode sends from GRAPH_SENDER.
  const endpoint = delegated
    ? 'https://graph.microsoft.com/v1.0/me/sendMail'
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.GRAPH_SENDER)}/sendMail`;

  const message = {
    subject,
    body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
    toRecipients: [{ emailAddress: { address: to } }],
  };
  if (attachments.length) {
    message.attachments = attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType,
      contentBytes: a.contentBase64,
      contentId: a.contentId,
      isInline: Boolean(a.inline),
    }));
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) {
    let detail = res.status;
    try { detail = (await res.json())?.error?.message || detail; } catch { /* ignore */ }
    throw new Error(`Graph sendMail failed: ${detail}`);
  }
  return { accepted: [to], transport: delegated ? 'graph-delegated' : 'graph-app' };
}

// ─── SMTP fallback ──────────────────────────────────────────────────────────
let _transporter;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.office365.com',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return _transporter;
}

// ─── Public API ─────────────────────────────────────────────────────────────
/** Send one email. Prefers Graph delegated → Graph app → SMTP. */
export async function sendMail({ to, subject, html, text, attachments = [] }) {
  if (isGraphDelegatedConfigured() || isGraphAppConfigured()) {
    return sendViaGraph({ to, subject, html, text, attachments });
  }
  if (isSmtpConfigured()) {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    return getTransporter().sendMail({
      from, to, subject, html, text,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.contentType,
        cid: a.contentId,
      })),
    });
  }
  throw new Error('Mail not configured (set GRAPH_* or SMTP_* env)');
}

/** Prove credentials work without sending. */
export async function verifyMail() {
  if (isGraphDelegatedConfigured()) { await getDelegatedToken(); return true; }
  if (isGraphAppConfigured()) { await getAppToken(); return true; }
  if (isSmtpConfigured()) return getTransporter().verify();
  throw new Error('Mail not configured (set GRAPH_* or SMTP_* env)');
}
