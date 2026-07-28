// server/src/services/dbTools.js
//
// Exposes the order-history database to the AI analyst as Agent SDK tools —
// letting the model decide what to look up instead of us pre-computing every
// possible slice. Read-only is enforced two ways:
//   1. Every handler runs against getReadonlyDb() (SQLite opened with
//      { readonly: true } — writes throw SQLITE_READONLY at the engine level).
//   2. No tool here wraps anything that mutates data — only the existing
//      foodAnalyzer.js query functions, which are themselves SELECT-only.
// There is intentionally no "run arbitrary SQL" tool: only these fixed,
// parameterised lookups are reachable from the model.

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getReadonlyDb } from '../db/index.js';
import {
  getOverview,
  getLongestUneaten,
  getTopDishes,
  getRotationSuggestion,
  getSpendingStats,
  getPersonProfile,
  getPersonOrders,
} from './foodAnalyzer.js';
import { getPersonDebt } from './debtCalculator.js';

const asJson = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const readOnly = { annotations: { readOnlyHint: true } };

// Kept as an explicit list (not introspected from the tool objects) so the
// allowedTools names below are guaranteed correct regardless of the SDK's
// internal object shape.
const TOOL_NAMES = [
  'get_overview',
  'get_longest_uneaten',
  'get_top_dishes',
  'get_rotation_suggestion',
  'get_spending_stats',
  'get_person_profile',
  'get_person_orders',
  'get_person_debt',
];

const tools = [
  tool(
    'get_overview',
    'Số liệu tổng quan: tổng số bữa đã ăn, số người, số món khác nhau, tổng chi tiêu, khoảng ngày có dữ liệu.',
    {},
    async () => asJson(getOverview(getReadonlyDb())),
    readOnly,
  ),

  tool(
    'get_longest_uneaten',
    'Danh sách món ăn lâu chưa được gọi lại nhất, sắp theo số ngày chưa ăn giảm dần. Món chưa từng được ăn cũng xuất hiện (days_since = null).',
    {
      person: z.string().optional().describe('Chỉ tính riêng cho 1 người (theo tên). Bỏ trống = tính cho cả team.'),
      limit: z.number().int().min(1).max(50).optional().describe('Số món trả về, mặc định 15'),
    },
    async ({ person, limit }) => asJson(getLongestUneaten({ person: person ?? null, limit: limit ?? 15 }, getReadonlyDb())),
    readOnly,
  ),

  tool(
    'get_top_dishes',
    'Món được gọi nhiều nhất, có thể giới hạn trong N ngày gần đây để xem xu hướng gần đây thay vì toàn bộ lịch sử.',
    {
      limit: z.number().int().min(1).max(50).optional().describe('Số món trả về, mặc định 10'),
      sinceDays: z.number().int().min(1).optional().describe('Chỉ tính đơn trong N ngày gần đây (tuỳ chọn, mặc định toàn bộ lịch sử)'),
    },
    async ({ limit, sinceDays }) => asJson(getTopDishes({ limit: limit ?? 10, sinceDays: sinceDays ?? null }, getReadonlyDb())),
    readOnly,
  ),

  tool(
    'get_rotation_suggestion',
    'Món từng được nhiều người thích (ăn nhiều lần) nhưng lâu rồi không ai gọi lại — ứng viên tốt nhất để gợi ý "xoay tua" lại thực đơn.',
    {
      limit: z.number().int().min(1).max(50).optional().describe('Số món trả về, mặc định 8'),
      minTimes: z.number().int().min(1).optional().describe('Số lần ăn tối thiểu để tính là "từng phổ biến", mặc định 3'),
      staleDays: z.number().int().min(1).optional().describe('Số ngày tối thiểu chưa ăn lại để tính là "lâu rồi", mặc định 14'),
    },
    async ({ limit, minTimes, staleDays }) => asJson(getRotationSuggestion({
      limit: limit ?? 8, minTimes: minTimes ?? 3, staleDays: staleDays ?? 14,
    }, getReadonlyDb())),
    readOnly,
  ),

  tool(
    'get_spending_stats',
    'Chi tiêu: tổng theo từng người (sắp giảm dần) và tổng theo từng tháng (6 tháng gần nhất).',
    {},
    async () => asJson(getSpendingStats(getReadonlyDb())),
    readOnly,
  ),

  tool(
    'get_person_profile',
    'Hồ sơ ăn uống của 1 người cụ thể: món khoái khẩu (ăn nhiều nhất), tổng số bữa, tổng chi tiêu, và trong số món khoái khẩu của riêng người đó thì món nào lâu rồi họ chưa ăn lại.',
    {
      name: z.string().describe('Tên người cần tra cứu (so khớp không phân biệt hoa/thường)'),
    },
    async ({ name }) => asJson(getPersonProfile(name, getReadonlyDb())),
    readOnly,
  ),

  tool(
    'get_person_orders',
    'Lịch sử các bữa 1 người đã ăn trong 1 khoảng ngày: trả về từng ngày kèm tên món, loại, giá, và cờ paid (1 = ngày đó ĐÃ trả tiền, 0 = chưa). Dùng để trả lời "ngày X người đó có ăn không / ăn món gì", "tuần trước ăn gì", và "đã trả tiền chưa" (nhìn cờ paid từng bữa). Nếu bỏ trống from/to sẽ lấy toàn bộ.',
    {
      name: z.string().describe('Tên người cần tra (không phân biệt hoa/thường)'),
      from: z.string().optional().describe('Ngày bắt đầu YYYY-MM-DD (tuỳ chọn)'),
      to: z.string().optional().describe('Ngày kết thúc YYYY-MM-DD (tuỳ chọn)'),
    },
    async ({ name, from, to }) => asJson(getPersonOrders(name, { from: from ?? null, to: to ?? null }, getReadonlyDb())),
    readOnly,
  ),

  tool(
    'get_person_debt',
    'Công nợ ăn trưa hiện tại của 1 người: tổng số tiền còn nợ (total_amount) và danh sách từng ngày chưa trả (unpaid_days: date + amount). Đã trừ ngày đã trả và ngày được loại. total_amount = 0 nghĩa là không nợ gì. Dùng để trả lời "tôi còn nợ bao nhiêu / nợ những ngày nào".',
    {
      name: z.string().describe('Tên người cần tra (không phân biệt hoa/thường)'),
    },
    async ({ name }) => asJson(getPersonDebt(name, getReadonlyDb())),
    readOnly,
  ),
];

export const LUNCH_DATA_SERVER_NAME = 'lunch_data';

export const lunchDataMcpServer = createSdkMcpServer({
  name: LUNCH_DATA_SERVER_NAME,
  version: '1.0.0',
  tools,
});

export const LUNCH_DATA_ALLOWED_TOOLS = TOOL_NAMES.map(name => `mcp__${LUNCH_DATA_SERVER_NAME}__${name}`);
