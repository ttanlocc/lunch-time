// server/src/services/debtReminder.js
// Builds and sends the per-person "you still owe lunch money" email.
// The email embeds a VietQR whose addInfo is "Lunch <Name>" and amount is the
// person's full outstanding total — exactly the transfer the SePay webhook
// auto-matches (Layer 2 in routes/webhook.js), so paying from the email clears
// the debt with no manual marking.
import { getAccumulatedDebts } from './debtCalculator.js';
import { sendMail, isMailConfigured } from './mailer.js';
import { pickReminderLine, pickThankYouLine, pickClearedLine } from './reminderMessages.js';

// Bank config — keep in sync with client/.env (VITE_BANK_*). Server env wins.
const BANK_CODE    = process.env.BANK_CODE    || 'MB';
const BANK_ACCOUNT = process.env.BANK_ACCOUNT || 'VQRQAJMOM6380';
const ACCOUNT_NAME = process.env.ACCOUNT_NAME || 'LUNCH TEAM';

// Pink-pastel palette — mirrors client DebtPage so emails feel like the web app.
// Email-safe solid hex only (no rgba/vars — Outlook strips them).
const C = {
  cream:    '#fbf7f3', // page bg
  paper:    '#ffffff', // card
  warm:     '#fbf6f1', // soft inner panel
  ink:      '#2b2235', // primary text
  inkSoft:  '#6b5d75', // secondary
  inkMute:  '#a89aae', // muted / tiny labels
  border:   '#ece1e8', // hairline (rose-gray)
  rose:     '#fbe7ee', // light pink fill (avatar, pill)
  magenta:  '#c47899', // pink accent
  magInk:   '#a55c7d', // deep rose — amounts, CTA
  amberBg:  '#f6e8d6', // peach pill bg ("X ngày")
  amberInk: '#a9763f', // text on peach
  sage:     '#e0eee5', // success fill
  emerald:  '#5b9b7f', // success text
};
const LABEL = `font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${C.inkMute};font-weight:600;`;
const MONO = `font-family:'SF Mono',Consolas,'Courier New',monospace;`;

function slugName(name) {
  return String(name)
    .replace(/Đ/g, 'D').replace(/đ/g, 'd')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

function fmtVnd(n) {
  return `${Math.round(n).toLocaleString('en-US')}đ`;
}

export function buildQrUrl(amount, content) {
  return `https://img.vietqr.io/image/${BANK_CODE}-${BANK_ACCOUNT}-qr_only.png`
    + `?amount=${amount}`
    + `&addInfo=${encodeURIComponent(content)}`
    + `&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
}

// Stable content-id for the inline QR image (per message).
const QR_CID = 'lunchqr';

export function buildReminderEmail({ person_name, total_amount, unpaid_days }, occasion = 'weekly') {
  const qrContent = `Lunch ${slugName(person_name)}`;
  const qrUrl = buildQrUrl(total_amount, qrContent);
  const amount = fmtVnd(total_amount);
  const nDays = unpaid_days.length;
  const funLine = pickReminderLine(occasion);

  // Keep the amount OUT of the subject — a money figure in the subject line is a
  // strong financial-phishing signal (Defender/EOP quarantines on it). The amount
  // still appears prominently in the body.
  const subject = occasion === 'month_end'
    ? `🍂 Lunch — chốt sổ cơm cuối tháng nha`
    : `🍱 Lunch — nhắc nhẹ tiền ăn trưa`;

  // First line is the inbox preview snippet — lead with the friendly line.
  const text = [
    `${funLine}`,
    ``,
    `Cậu ơi (${person_name}), cậu còn ${amount} (${nDays} ngày) tiền ăn trưa nha.`,
    ``,
    `Cách trả: quét QR trong email, hoặc chuyển khoản`,
    `  ${BANK_CODE} · ${ACCOUNT_NAME} · ${BANK_ACCOUNT}`,
    `  Nội dung: ${qrContent}   |   Số tiền: ${amount}`,
    `Tớ tự xác nhận sau khi nhận tiền nha.`,
    ``,
    `Thương cậu, — Lunch 🍱`,
  ].join('\n');

  const initial = person_name.trim().charAt(0).toUpperCase();

  // Email-client-safe (table-based, inline hex, bulletproof button). Pink-pastel
  // palette mirrors the web DebtPage so the mail feels like the same product.
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="460" cellpadding="0" cellspacing="0" border="0" style="width:460px;max-width:100%;background:${C.paper};border:1px solid ${C.border};border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

      <!-- header: doc label + person -->
      <tr><td style="padding:22px 26px 0;">
        <div style="${LABEL}">🍱 Lunch · nhắc cậu nè</div>
      </td></tr>
      <tr><td style="padding:14px 26px 4px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:13px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td width="50" height="50" align="center" valign="middle" bgcolor="${C.rose}" style="width:50px;height:50px;background:${C.rose};border-radius:50%;color:${C.magInk};font-size:24px;font-weight:700;">${initial}</td>
            </tr></table>
          </td>
          <td valign="middle">
            <div style="font-size:19px;font-weight:700;color:${C.ink};line-height:1.2;">${person_name}</div>
            <div style="font-size:12px;color:${C.inkMute};margin-top:3px;">${nDays} ngày chưa thanh toán</div>
          </td>
        </tr></table>
      </td></tr>

      <!-- friendly line -->
      <tr><td style="padding:14px 26px 2px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.rose};border-radius:10px;">
          <tr><td style="padding:12px 16px;font-size:14px;color:${C.magInk};line-height:1.5;">${funLine}</td></tr>
        </table>
      </td></tr>

      <!-- amount -->
      <tr><td style="padding:16px 26px 6px;">
        <div style="${LABEL}">Tổng còn nợ</div>
        <div style="font-size:36px;font-weight:800;color:${C.magInk};letter-spacing:-0.5px;margin-top:4px;">${amount}</div>
      </td></tr>

      <!-- divider -->
      <tr><td style="padding:6px 26px;"><div style="border-top:1px solid ${C.border};"></div></td></tr>

      <!-- QR -->
      <tr><td align="center" style="padding:8px 26px 2px;">
        <img src="cid:${QR_CID}" alt="VietQR ${qrContent}" width="176" height="176"
             style="display:block;border:1px solid ${C.border};border-radius:12px;" />
        <div style="font-size:11px;color:${C.inkMute};margin-top:10px;letter-spacing:0.04em;">Quét QR để trả · SePay tự xác nhận</div>
      </td></tr>

      <!-- bank info -->
      <tr><td style="padding:16px 26px 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.warm};border:1px solid ${C.border};border-radius:10px;">
          <tr><td style="padding:14px 16px;">
            <div style="${LABEL}">Ngân hàng</div>
            <div style="font-size:14px;color:${C.ink};font-weight:600;margin:2px 0 10px;">${BANK_CODE} · ${ACCOUNT_NAME}</div>
            <div style="${LABEL}">Số tài khoản</div>
            <div style="font-size:14px;color:${C.ink};${MONO}letter-spacing:0.04em;margin:2px 0 10px;">${BANK_ACCOUNT}</div>
            <div style="${LABEL}">Nội dung</div>
            <div style="font-size:14px;color:${C.magInk};font-weight:700;${MONO}margin-top:2px;">${qrContent}</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- spacer before signature (CTA link removed to avoid URL-reputation flags) -->
      <tr><td style="padding:8px 26px 0;"></td></tr>

      <!-- signature -->
      <tr><td style="padding:0 26px 22px;">
        <div style="border-top:1px solid ${C.border};padding-top:14px;font-size:13px;color:${C.inkSoft};">Thương cậu,<br/><span style="color:${C.magInk};font-weight:700;">— Lunch 🍱</span></div>
      </td></tr>

    </table>
  </td></tr>
</table>`;

  return { subject, html, text, qrContent, qrUrl, qrCid: QR_CID };
}

// Receipt email sent after SePay confirms a transfer. Closes the loop: the
// person who got a reminder now gets a "got it, thanks" with their remaining
// balance (and a pay-now QR if they still owe something).
export function buildPaymentReceiptEmail({ person_name, amount_received, remaining }) {
  const recv = fmtVnd(amount_received);
  const cleared = remaining <= 0;
  const qrContent = `Lunch ${slugName(person_name)}`;
  const qrUrl = remaining > 0 ? buildQrUrl(remaining, qrContent) : null;
  // Pick one warm thank-you line and reuse it in both the plaintext preview and
  // the HTML card so they always match for this message. When fully cleared,
  // also pick a "sạch nợ" celebration line for the green box.
  const thanks = pickThankYouLine();
  const clearedLine = cleared ? pickClearedLine() : null;

  const subject = cleared
    ? `✅ Đã nhận ${recv} — cậu hết nợ tiền ăn trưa rồi!`
    : `✅ Đã nhận ${recv} — còn lại ${fmtVnd(remaining)}`;

  // Lead the preview snippet with the receipt status.
  const text = [
    cleared
      ? `✅ Đã nhận ${recv} — cậu hết nợ tiền ăn trưa rồi!`
      : `✅ Đã nhận ${recv} — còn lại ${fmtVnd(remaining)}.`,
    ``,
    `Cậu ơi ${person_name}!`,
    thanks,
    cleared ? clearedLine : `Cậu quét QR trong email hoặc CK nội dung "${qrContent}" để trả nốt nha.`,
    ``,
    `— Lunch 🍱`,
  ].join('\n');

  const remainingBlock = cleared
    ? `<tr><td style="padding:6px 26px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.sage};border-radius:10px;">
          <tr><td align="center" style="padding:16px;font-size:15px;color:${C.emerald};font-weight:700;line-height:1.4;">
            🎉 ${clearedLine}
          </td></tr>
        </table>
      </td></tr>`
    : `<tr><td style="padding:6px 26px;"><div style="border-top:1px solid ${C.border};"></div></td></tr>
      <tr><td style="padding:8px 26px 4px;">
        <div style="${LABEL}">Còn lại chưa thanh toán</div>
        <div style="font-size:28px;font-weight:800;color:${C.magInk};margin-top:4px;">${fmtVnd(remaining)}</div>
      </td></tr>
      <tr><td align="center" style="padding:10px 26px 4px;">
        <img src="cid:${QR_CID}" alt="VietQR ${qrContent}" width="160" height="160"
             style="display:block;border:1px solid ${C.border};border-radius:12px;" />
        <div style="font-size:11px;color:${C.inkMute};margin-top:9px;letter-spacing:0.04em;">Quét để trả nốt phần còn lại · Nội dung <span style="${MONO}color:${C.magInk};font-weight:700;">${qrContent}</span></div>
      </td></tr>`;

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="460" cellpadding="0" cellspacing="0" border="0" style="width:460px;max-width:100%;background:${C.paper};border:1px solid ${C.border};border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

      <tr><td style="padding:22px 26px 0;">
        <div style="${LABEL}">🍱 Lunch · biên nhận</div>
      </td></tr>

      <tr><td style="padding:14px 26px 4px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:13px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td width="50" height="50" align="center" valign="middle" bgcolor="${C.sage}" style="width:50px;height:50px;background:${C.sage};border-radius:50%;color:${C.emerald};font-size:24px;font-weight:700;">✓</td>
            </tr></table>
          </td>
          <td valign="middle">
            <div style="font-size:17px;font-weight:700;color:${C.ink};line-height:1.2;">Tớ nhận được rồi, ${person_name} ơi!</div>
            <div style="font-size:12px;color:${C.inkMute};margin-top:3px;line-height:1.35;">${thanks}</div>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:18px 26px 6px;">
        <div style="${LABEL}">Số tiền đã nhận</div>
        <div style="font-size:34px;font-weight:800;color:${C.emerald};letter-spacing:-0.5px;margin-top:4px;">${recv}</div>
      </td></tr>

      ${remainingBlock}

      <tr><td align="center" style="padding:20px 26px 24px;">
        <div style="font-size:13px;color:${C.inkSoft};">Hẹn cậu bữa trưa sau nha 💛<br/><span style="color:${C.magInk};font-weight:700;">— Lunch 🍱</span></div>
      </td></tr>

    </table>
  </td></tr>
</table>`;

  return { subject, html, text, qrContent, qrUrl, qrCid: QR_CID };
}

/**
 * Fire-and-forget receipt email after a payment is confirmed. Looks up the
 * person's email + their remaining balance, sends a receipt. Safe to call
 * without awaiting from the webhook — never throws.
 */
export async function sendPaymentConfirmation(db, personName, amountReceived) {
  try {
    if (!isMailConfigured()) return;
    const row = db.prepare('SELECT email, active, notify_receipt FROM people WHERE lower(name) = lower(?)').get(personName);
    const email = row?.email;
    if (!email || row.active === 0 || row.notify_receipt === 0) return;

    const debt = getAccumulatedDebts(db).find(d => d.person_name.trim().toLowerCase() === personName.trim().toLowerCase());
    const remaining = debt?.total_amount || 0;

    const mail = buildPaymentReceiptEmail({ person_name: personName, amount_received: amountReceived, remaining });
    const attachments = [];
    if (mail.qrUrl) {
      const qr = await fetchQrAttachment(mail.qrUrl, mail.qrCid);
      if (qr) attachments.push(qr);
    }
    await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, attachments });
  } catch (err) {
    console.error('[receipt] failed for', personName, '-', err.message);
  }
}

// Fetch the QR PNG and return it as an inline attachment descriptor, so the
// image embeds in the email body (Outlook blocks remote <img> from unknown
// senders, but renders inline cid: attachments). Returns null on failure —
// the email still sends, just without the embedded QR.
async function fetchQrAttachment(qrUrl, cid) {
  try {
    const res = await fetch(qrUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      filename: 'lunch-qr.png',
      contentType: 'image/png',
      contentBase64: buf.toString('base64'),
      contentId: cid,
      inline: true,
    };
  } catch {
    return null;
  }
}

/**
 * Send a reminder to every debtor who has an email on file.
 * @param {import('better-sqlite3').Database} db
 * @param {object} [opts]
 * @param {string} [opts.only]   send to a single person_name only (manual button)
 * @param {boolean} [opts.dryRun] build but don't actually send
 * @param {string} [opts.occasion] 'weekly' (default) or 'month_end' — picks the tone/subject
 * @returns {Promise<{sent: Array, skipped: Array, configured: boolean}>}
 */
export async function sendDebtReminders(db, opts = {}) {
  const { only = null, dryRun = false, occasion = 'weekly' } = opts;
  const configured = isMailConfigured();

  // Which per-type flag this run respects. Falls back to weekly's flag for any
  // unexpected occasion so a typo can't silently bypass opt-outs.
  const typeFlag = occasion === 'month_end' ? 'notify_monthend' : 'notify_weekly';

  // name(lower) -> { email, active, + per-type flag }, from the people directory
  const emailMap = new Map(
    db.prepare('SELECT name, email, active, notify_weekly, notify_monthend FROM people').all()
      .map(p => [String(p.name).trim().toLowerCase(), { email: p.email, active: p.active, typeOn: p[typeFlag] }])
  );

  let debts = getAccumulatedDebts(db);
  if (only) {
    const target = only.trim().toLowerCase();
    debts = debts.filter(d => d.person_name.trim().toLowerCase() === target);
  }

  const sent = [];
  const skipped = [];

  for (const debt of debts) {
    const entry = emailMap.get(debt.person_name.trim().toLowerCase());
    const email = entry?.email;
    if (!email) {
      skipped.push({ person_name: debt.person_name, total_amount: debt.total_amount, reason: 'no_email' });
      continue;
    }
    if (entry.active === 0) {
      skipped.push({ person_name: debt.person_name, total_amount: debt.total_amount, reason: 'inactive' });
      continue;
    }
    if (entry.typeOn === 0) {
      skipped.push({ person_name: debt.person_name, total_amount: debt.total_amount, reason: `opted_out_${occasion}` });
      continue;
    }

    const mail = buildReminderEmail(debt, occasion);
    if (dryRun || !configured) {
      skipped.push({
        person_name: debt.person_name, total_amount: debt.total_amount, email,
        reason: dryRun ? 'dry_run' : 'smtp_not_configured',
      });
      continue;
    }

    try {
      const qr = await fetchQrAttachment(mail.qrUrl, mail.qrCid);
      await sendMail({
        to: email, subject: mail.subject, html: mail.html, text: mail.text,
        attachments: qr ? [qr] : [],
      });
      sent.push({ person_name: debt.person_name, total_amount: debt.total_amount, email });
    } catch (err) {
      skipped.push({
        person_name: debt.person_name, total_amount: debt.total_amount, email,
        reason: 'send_failed', error: err.message,
      });
    }
  }

  return { sent, skipped, configured };
}
