// server/src/services/aiAnalyst.js
//
// The "words" layer. Takes the deterministic numbers from foodAnalyzer and asks
// MiniMax (via the Claude Agent SDK's Anthropic-compatible protocol) to phrase a
// short Vietnamese lunch suggestion. The model NEVER computes numbers — it only
// narrates the structured context it is handed.
//
// Config lives in the server process env (server/.env, gitignored), mapped into
// the SDK call's own `env` so it stays isolated from any other Anthropic client
// running on the same machine:
//   MINIMAX_BASE_URL   e.g. https://api.minimax.io/anthropic
//   MINIMAX_API_KEY    the MiniMax token
//   MINIMAX_MODEL      e.g. MiniMax-M3

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getSuggestionContext } from './foodAnalyzer.js';
import { getWeatherSnapshot, summarizeWeather } from './weather.js';
import { lunchDataMcpServer, LUNCH_DATA_SERVER_NAME, LUNCH_DATA_ALLOWED_TOOLS } from './dbTools.js';

const BASE_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/anthropic';
const API_KEY = process.env.MINIMAX_API_KEY || process.env.MINIMAX_AUTH_TOKEN;
const MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M3';

export function isAiConfigured() {
  return Boolean(API_KEY);
}

const SYSTEM_PROMPT = `Bạn là trợ lý AI phân tích dữ liệu ăn trưa cho một team ở Việt Nam.

Tin nhắn đầu tiên kèm sẵn 1 bản tóm tắt số liệu + thời tiết hiện tại để bạn có
điểm khởi đầu. Bạn còn có các tool ĐỌC (read-only, không thể sửa dữ liệu) để
tra cứu thêm nếu cần: get_overview, get_longest_uneaten, get_top_dishes,
get_rotation_suggestion, get_spending_stats, get_person_profile. Nếu cần đào
sâu hơn (vd xem hồ sơ 1 người cụ thể, hoặc khoảng thời gian khác), hãy GỌI TOOL
thay vì đoán — KHÔNG được bịa món ăn hay con số không có trong dữ liệu/tool.

Nhiệm vụ: viết gợi ý món ăn trưa hôm nay, ngắn gọn thân thiện bằng tiếng Việt.

Yêu cầu đầu ra:
- 2 đến 4 câu, giọng vui vẻ tự nhiên như đồng nghiệp rủ nhau ăn trưa.
- Nêu 1-2 món cụ thể nên ăn hôm nay, kèm lý do ngắn dựa trên số liệu thật.
- Nếu có dữ liệu thời tiết phù hợp để nhắc tới (vd trời mưa/nóng), có thể liên
  hệ tự nhiên — nhưng KHÔNG bịa thời tiết nếu không được cung cấp.
- Không markdown, không bullet, chỉ văn xuôi ngắn.`;

// Chat mode: Lex answers a specific member's questions about their own eating
// history. Identity + today's date are dynamic → injected into the USER prompt
// (see chatWithLex), NOT hardcoded here.
const CHAT_SYSTEM_PROMPT = `Bạn là Lex, trợ lý ăn trưa thân thiện của một team ở Việt Nam.

Người đang trò chuyện với bạn là một thành viên cụ thể (tên được cung cấp trong
tin nhắn). Khi họ nói "tôi/mình/em" là đang nói về CHÍNH họ — hãy tra dữ liệu của
đúng người đó.

Bạn có các tool ĐỌC (read-only, không thể sửa dữ liệu) để tra cứu:
get_person_orders, get_person_profile, get_person_debt, get_overview,
get_top_dishes, get_longest_uneaten, get_rotation_suggestion,
get_spending_stats. Câu hỏi về công nợ ("tôi nợ bao nhiêu", "nợ ngày nào") thì
dùng get_person_debt. Câu hỏi "đã trả tiền chưa" cho 1 khoảng thời gian thì dùng
get_person_orders và NHÌN CỜ paid của TỪNG bữa (1 = đã trả, 0 = chưa). Hãy GỌI TOOL để
lấy dữ liệu thật thay vì đoán — TUYỆT ĐỐI KHÔNG bịa món ăn, con số hay ngày tháng
không có trong dữ liệu/tool. Nếu dữ liệu không đủ để trả lời, cứ nói thẳng là chưa
có thông tin.

QUAN TRỌNG khi nói về thanh toán: phải nhất quán với dữ liệu. KHÔNG nói "chưa trả
đồng nào" nếu thực tế có bữa đã trả (paid=1). Nếu một số bữa đã trả và một số chưa,
hãy nói rõ bữa nào đã trả, bữa nào còn nợ — đừng gộp bừa.

Trả lời ngắn gọn, tự nhiên bằng tiếng Việt, văn xuôi thuần (không markdown, không
bullet), giọng vui vẻ như đồng nghiệp.`;

/**
 * Generate today's suggestion text. Returns { text, source, model, context, weather }.
 * `source` is 'ai' when MiniMax produced it, 'fallback' when it was assembled
 * deterministically (AI unconfigured or errored). Weather is fetched (cached,
 * ~30min TTL) regardless of AI availability since the fallback text uses it too.
 */
export async function generateDailySuggestion(context = getSuggestionContext()) {
  const weather = await getWeatherSnapshot();

  if (!isAiConfigured()) {
    return { text: fallbackSuggestion(context, weather), source: 'fallback', model: null, context, weather };
  }

  const userPrompt = `Đây là số liệu khởi điểm cho hôm nay (${context.generatedFor}):

${JSON.stringify(sliceForPrompt(context), null, 2)}

Thời tiết hiện tại: ${weather ? summarizeWeather(weather) : 'không lấy được dữ liệu thời tiết, bỏ qua phần này.'}

Nếu cần thêm dữ liệu để gợi ý chính xác hơn, hãy gọi các tool đã cung cấp.
Sau đó viết gợi ý món trưa cho hôm nay.`;

  try {
    const text = await runModel(userPrompt);
    if (!text || !text.trim()) {
      return { text: fallbackSuggestion(context, weather), source: 'fallback', model: MODEL, context, weather };
    }
    return { text: text.trim(), source: 'ai', model: MODEL, context, weather };
  } catch (err) {
    console.error('[aiAnalyst] MiniMax call failed, using fallback:', err?.message || err);
    return { text: fallbackSuggestion(context, weather), source: 'fallback', model: MODEL, context, weather, error: String(err?.message || err) };
  }
}

/**
 * Chat với Lex: answer one member's free-form question about their own eating
 * history. Unlike the daily suggestion (which pre-bundles a numeric snapshot),
 * chat hands the model only the question + who's asking + today's date, then
 * lets it CALL the read-only tools (esp. get_person_orders/get_person_profile)
 * to fetch exactly what it needs. `history` is the recent transcript
 * ([{ role: 'user'|'lex', text }]) so follow-up questions keep context.
 * Returns { text, source, model } — `source` is 'ai' when MiniMax answered,
 * 'fallback' when AI is unconfigured or errored.
 */
export async function chatWithLex({ name, message, history = [], taste = null }) {
  if (!isAiConfigured()) {
    return { text: 'Chat với Lex chưa được bật (thiếu cấu hình AI).', source: 'fallback', model: null, widgets: [] };
  }

  // Compact prior transcript so follow-ups ("còn hôm kia thì sao?") have context.
  const transcript = (history || [])
    .filter(m => m && m.text)
    .map(m => `${m.role === 'lex' ? 'Lex' : name}: ${m.text}`)
    .join('\n');

  const userPrompt = `Hôm nay là ${today()} (YYYY-MM-DD). Người đang hỏi tên là "${name}".`
    + (taste ? `\nKhẩu vị của ${name}: ${taste} (ưu tiên gợi ý hợp khẩu vị này khi được hỏi nên ăn gì).` : '')
    + (transcript ? `\n\nCác câu đã trao đổi trước đó:\n${transcript}` : '')
    + `\n\nCâu hỏi: ${message}`;

  try {
    // capture collects tool_use blocks + their tool_result payloads so we can
    // render the underlying data as receipt slips alongside Lex's prose answer.
    const capture = { toolUses: [], toolResults: {} };
    const text = await runModel(userPrompt, CHAT_SYSTEM_PROMPT, capture);
    const widgets = buildWidgets(capture);
    if (!text || !text.trim()) {
      return { text: 'Xin lỗi, Lex chưa trả lời được câu này. Thử hỏi lại nhé.', source: 'fallback', model: MODEL, widgets: [] };
    }
    return { text: text.trim(), source: 'ai', model: MODEL, widgets };
  } catch (err) {
    console.error('[aiAnalyst] chatWithLex failed:', err?.message || err);
    return { text: 'Xin lỗi, Lex chưa trả lời được câu này. Thử hỏi lại nhé.', source: 'fallback', model: MODEL, widgets: [], error: String(err?.message || err) };
  }
}

// Build the chat user-prompt (shared by the buffered + streaming paths).
function buildChatPrompt({ name, message, history = [], taste = null }) {
  const transcript = (history || [])
    .filter(m => m && m.text)
    .map(m => `${m.role === 'lex' ? 'Lex' : name}: ${m.text}`)
    .join('\n');
  return `Hôm nay là ${today()} (YYYY-MM-DD). Người đang hỏi tên là "${name}".`
    + (taste ? `\nKhẩu vị của ${name}: ${taste} (ưu tiên gợi ý hợp khẩu vị này khi được hỏi nên ăn gì).` : '')
    + (transcript ? `\n\nCác câu đã trao đổi trước đó:\n${transcript}` : '')
    + `\n\nCâu hỏi: ${message}`;
}

/**
 * Streaming twin of chatWithLex. Same tools/guardrails/capture, but text is
 * pushed to `onDelta(chunk)` token-by-token as the model writes, so the client
 * can render the answer live instead of waiting ~8s for the first byte. Returns
 * the same final { text, source, model, widgets } once the turn completes.
 */
export async function chatWithLexStream({ name, message, history = [], taste = null }, callbacks = {}) {
  if (!isAiConfigured()) {
    return { text: 'Chat với Lex chưa được bật (thiếu cấu hình AI).', source: 'fallback', model: null, widgets: [] };
  }
  const userPrompt = buildChatPrompt({ name, message, history, taste });
  try {
    const capture = { toolUses: [], toolResults: {} };
    const text = await runModelStream(userPrompt, CHAT_SYSTEM_PROMPT, capture, callbacks);
    const widgets = buildWidgets(capture);
    if (!text || !text.trim()) {
      return { text: 'Xin lỗi, Lex chưa trả lời được câu này. Thử hỏi lại nhé.', source: 'fallback', model: MODEL, widgets: [] };
    }
    return { text: text.trim(), source: 'ai', model: MODEL, widgets };
  } catch (err) {
    console.error('[aiAnalyst] chatWithLexStream failed:', err?.message || err);
    return { text: 'Xin lỗi, Lex chưa trả lời được câu này. Thử hỏi lại nhé.', source: 'fallback', model: MODEL, widgets: [], error: String(err?.message || err) };
  }
}

// Map captured lunch_data tool calls → receipt-slip descriptors for the client.
// Each tool_use is matched to its tool_result (by tool_use_id); the result text
// is the JSON our dbTools produced via asJson. Bad/odd payloads are skipped
// (never thrown) and the whole list is capped so a chatty model can't flood the
// thread.
function buildWidgets(capture) {
  const HUMANIZE = {
    get_overview: 'Tổng quan',
    get_longest_uneaten: 'Món lâu chưa ăn',
    get_top_dishes: 'Món ăn nhiều nhất',
    get_rotation_suggestion: 'Gợi ý xoay tua',
    get_spending_stats: 'Chi tiêu',
  };
  const widgets = [];
  for (const tu of capture.toolUses) {
    if (widgets.length >= 3) break;
    const raw = capture.toolResults[tu.id];
    if (raw == null) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue; // odd/unparseable payload → skip this widget, never throw
    }
    const short = tu.name.replace(/^mcp__lunch_data__/, '');
    if (short === 'get_person_orders') {
      const { from, to } = tu.input || {};
      const title = from || to ? `Bữa ${from || '…'} → ${to || '…'}` : 'Các bữa đã ăn';
      widgets.push({ type: 'orders', title, data });
    } else if (short === 'get_person_debt') {
      widgets.push({ type: 'debt', title: 'Công nợ', data });
    } else if (short === 'get_person_profile') {
      widgets.push({ type: 'profile', title: 'Hồ sơ ăn uống', data });
    } else {
      widgets.push({ type: 'generic', title: HUMANIZE[short] || short, data });
    }
  }
  return widgets;
}

/**
 * Build a clean env for the SDK subprocess. We must NOT blindly inherit the
 * parent env: when this server runs inside (or is launched from) a Claude Code
 * session, vars like CLAUDE_CODE_* / CLAUDECODE make the spawned CLI prefer the
 * host's OAuth credentials and ignore our MINIMAX token → 401. Strip them so the
 * child authenticates purely with the token we pass. (In normal pm2/production
 * runs these vars are absent, so this is a harmless no-op there.)
 */
function buildChildEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.startsWith('CLAUDE_CODE_') || k === 'CLAUDECODE' || k === 'CLAUDE_AGENT_SDK_VERSION') {
      delete env[k];
    }
  }
  env.ANTHROPIC_BASE_URL = BASE_URL;
  env.ANTHROPIC_AUTH_TOKEN = API_KEY;
  env.ANTHROPIC_API_KEY = API_KEY;
  return env;
}

/**
 * Single-turn-or-more call to MiniMax through the Agent SDK. The only tools
 * available are our own read-only lunch_data tools (dbTools.js); every
 * built-in harness tool (Bash, Read/Write/Edit, WebFetch/WebSearch, Task...)
 * is explicitly disallowed, and no settings/other MCP are loaded
 * (settingSources:[] also stops CLAUDE.md/memory from leaking into the
 * prompt). maxTurns > 1 leaves room for a couple of tool round-trips before
 * the model writes its final answer.
 */
async function runModel(prompt, systemPrompt = SYSTEM_PROMPT, capture = null) {
  let finalText = '';
  const assistantChunks = [];

  for await (const message of query({
    prompt,
    options: {
      model: MODEL,
      systemPrompt,
      maxTurns: 6,
      allowedTools: [...LUNCH_DATA_ALLOWED_TOOLS],
      disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task'],
      settingSources: [],
      mcpServers: { [LUNCH_DATA_SERVER_NAME]: lunchDataMcpServer },
      env: buildChildEnv(),
    },
  })) {
    if (message.type === 'assistant' && Array.isArray(message.message?.content)) {
      for (const block of message.message.content) {
        if (block.type === 'text') assistantChunks.push(block.text);
        if (capture && block.type === 'tool_use') {
          capture.toolUses.push({ id: block.id, name: block.name, input: block.input });
        }
      }
    }
    // Tool results arrive on 'user'-type messages as tool_result blocks; match
    // them back to the tool_use by tool_use_id. The result text is the JSON our
    // dbTools produced via asJson.
    if (capture && message.type === 'user' && Array.isArray(message.message?.content)) {
      for (const block of message.message.content) {
        if (block.type === 'tool_result') {
          const c = block.content;
          const textPart = Array.isArray(c)
            ? c.filter(p => p?.type === 'text').map(p => p.text).join('')
            : (typeof c === 'string' ? c : '');
          capture.toolResults[block.tool_use_id] = textPart;
        }
      }
    }
    if (message.type === 'result' && typeof message.result === 'string') {
      finalText = message.result;
    }
  }

  return finalText || assistantChunks.join('').trim();
}

/**
 * Streaming variant of runModel. With includePartialMessages the SDK emits
 * `stream_event` messages carrying the raw Anthropic streaming events; we relay
 * text_delta chunks to callbacks.onDelta as they arrive, and announce each
 * lunch_data tool call via callbacks.onTool (for the client's "Lex đang tra…"
 * status). Tool capture (for receipt slips) works exactly as in runModel. The
 * final assembled text is still returned once the turn completes.
 */
async function runModelStream(prompt, systemPrompt, capture, callbacks = {}) {
  const { onDelta, onTool } = callbacks;
  let finalText = '';
  const streamed = [];

  for await (const message of query({
    prompt,
    options: {
      model: MODEL,
      systemPrompt,
      maxTurns: 6,
      allowedTools: [...LUNCH_DATA_ALLOWED_TOOLS],
      disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task'],
      settingSources: [],
      mcpServers: { [LUNCH_DATA_SERVER_NAME]: lunchDataMcpServer },
      env: buildChildEnv(),
      includePartialMessages: true,
    },
  })) {
    // Live text tokens.
    if (message.type === 'stream_event') {
      const ev = message.event;
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
        streamed.push(ev.delta.text);
        onDelta?.(ev.delta.text);
      }
      continue;
    }
    // Full assistant message → capture tool_use + announce it.
    if (message.type === 'assistant' && Array.isArray(message.message?.content)) {
      for (const block of message.message.content) {
        if (block.type === 'tool_use') {
          capture.toolUses.push({ id: block.id, name: block.name, input: block.input });
          onTool?.(block.name.replace(/^mcp__lunch_data__/, ''));
        }
      }
    }
    if (message.type === 'user' && Array.isArray(message.message?.content)) {
      for (const block of message.message.content) {
        if (block.type === 'tool_result') {
          const c = block.content;
          const textPart = Array.isArray(c)
            ? c.filter(p => p?.type === 'text').map(p => p.text).join('')
            : (typeof c === 'string' ? c : '');
          capture.toolResults[block.tool_use_id] = textPart;
        }
      }
    }
    if (message.type === 'result' && typeof message.result === 'string') {
      finalText = message.result;
    }
  }

  return finalText || streamed.join('').trim();
}

// Local YYYY-MM-DD (same convention foodAnalyzer uses for orders.date). Small
// self-contained copy so chat has "today" without importing analytics internals.
function today() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

// Trim the context so we only send compact, relevant slices to the model.
function sliceForPrompt(ctx) {
  const pick = (arr, keys) => (arr || []).map(o => Object.fromEntries(keys.map(k => [k, o[k]])));
  return {
    date: ctx.generatedFor,
    longestUneaten: pick(ctx.longestUneaten, ['name', 'category', 'days_since', 'times_eaten']),
    rotationCandidates: pick(ctx.rotationCandidates, ['name', 'category', 'days_since', 'times_eaten']),
    recentTop: pick(ctx.recentTop, ['name', 'times_eaten']),
  };
}

// Deterministic suggestion when AI is unavailable — still useful.
function fallbackSuggestion(ctx, weather) {
  const rot = ctx.rotationCandidates?.[0];
  const stale = ctx.longestUneaten?.find(d => d.days_since != null);
  const parts = [];
  if (weather?.current) {
    const { temperature_c: t, condition, precipitation_mm } = weather.current;
    if (precipitation_mm > 0 || /mưa|dông/.test(condition)) {
      parts.push(`Trời đang ${condition} (${t}°C), món nước nóng chắc hợp đấy.`);
    } else if (t >= 33) {
      parts.push(`Trời nóng ${t}°C, ăn gì mát mát cho đỡ ngán nhé.`);
    }
  }
  if (rot) {
    parts.push(`Hôm nay thử "${rot.name}" nhé — cả team khá thích (đã ăn ${rot.times_eaten} lần) mà ${rot.days_since} ngày rồi chưa đụng tới.`);
  }
  if (stale && (!rot || stale.name !== rot.name)) {
    parts.push(`Hoặc "${stale.name}" cũng đã ${stale.days_since} ngày chưa ai gọi.`);
  }
  if (!parts.length) parts.push('Chưa đủ dữ liệu để gợi ý — hãy đặt vài bữa nữa nhé!');
  return parts.join(' ');
}
