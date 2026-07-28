// server/src/services/chatLog.js
//
// Append-only JSONL event log for Lex chat, for later analysis/optimization:
// what people ask, which tools Lex calls, ai-vs-fallback rate, and latency
// (time-to-first-token + total). One line per COMPLETED turn — not per delta —
// so the file stays analysable (jq/duckdb/pandas) without drowning in tokens.
//
// Logging must NEVER affect the chat: every write is fire-and-forget and every
// error is swallowed. File lives next to the sqlite db (repo /data), override
// with LEX_CHAT_LOG.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = process.env.LEX_CHAT_LOG || path.resolve(__dirname, '../../../data/lex-chat.jsonl');

function append(record) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n';
    fs.appendFile(LOG_PATH, line, () => {});
  } catch {
    /* never let telemetry break chat */
  }
}

/**
 * Append one completed turn. Shape (all optional except thread_id/turn_id/name):
 *   { thread_id, turn_id, name, question, answer, source, model,
 *     tools:[toolName], widgets:[type], ttft_ms, duration_ms, streamed, error }
 * `type:'turn'` + `ts` (ISO) are added automatically.
 */
export function logChatTurn(record) {
  append({ type: 'turn', ...record });
}

/**
 * Append a user 👍/👎 on a turn. { thread_id, turn_id, name, rating:'up'|'down' }.
 * Correlate with the turn record by turn_id to find what people disliked.
 */
export function logChatFeedback(record) {
  append({ type: 'feedback', ...record });
}

export function getChatLogPath() {
  return LOG_PATH;
}
