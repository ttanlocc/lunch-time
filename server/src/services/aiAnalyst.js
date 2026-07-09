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
async function runModel(prompt) {
  let finalText = '';
  const assistantChunks = [];

  for await (const message of query({
    prompt,
    options: {
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
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
      }
    }
    if (message.type === 'result' && typeof message.result === 'string') {
      finalText = message.result;
    }
  }

  return finalText || assistantChunks.join('').trim();
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
