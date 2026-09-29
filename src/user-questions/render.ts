/**
 * 问题渲染 — AskUserQuestionItem[] → QQ markdown 文本
 *
 * 纯函数（core 层），无 I/O。渲染含匹配键尾注，入站匹配器据此识别回答。
 * 不透出 openid/群号等隐私字段。
 */
import type { AskSession } from './types.js';

/** 匹配键前缀：入站文本以此开头视为 ask 回答 */
export const ASK_MATCH_PREFIX = 'ask:';

/** 渲染一次 ask 请求为 QQ 消息文本 */
export function renderQuestions(matchKey: string, questions: AskSession[]): string {
  const lines: string[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    const heading = q.question.trim();
    lines.push(heading);
    if (q.options && q.options.length > 0) {
      q.options.forEach((label, j) => {
        lines.push(`${j + 1}. ${label}`);
      });
      lines.push(q.multiSelect
        ? '（可多选，回复选项编号或序号组合，如「1,3」）'
        : '（回复选项编号或直接输入你的答案）');
    } else {
      lines.push('（直接回复你的答案）');
    }
    if (i < questions.length - 1) lines.push('');
  }
  // 匹配键尾注：入站匹配器识别用；answerBody 提取时按行剔除本行
  lines.push(`〔回答时请以此开头：${matchKey}〕`);
  return lines.join('\n');
}

/**
 * 从入站文本提取匹配键与正文
 *
 * 命中规则：首行 trim 后以 `ask:` 开头。
 * 用户可只发 `ask:<key>` 后跟正文，或首行仅键、次行起为正文。
 *
 * @returns 未命中返回 null；命中返回键（小写归一）与正文（trim，可能为空）
 */
export function extractAnswer(
  text: string,
): { matchKey: string; answerBody: string } | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const first = (lines[0] ?? '').trim();
  if (!first.toLowerCase().startsWith(ASK_MATCH_PREFIX)) return null;
  const rest = lines.slice(1).join('\n').trim();
  // 首行形如 `ask:xxxx 答案正文`（同行跟正文）
  const inline = first.slice(ASK_MATCH_PREFIX.length);
  const inlineMatch = inline.match(/^(\S+)\s+([\s\S]+)$/);
  if (inlineMatch) {
    return { matchKey: inlineMatch[1]!.toLowerCase(), answerBody: inlineMatch[2]!.trim() };
  }
  // 首行仅键：正文在后续行
  const key = inline.trim();
  if (key) return { matchKey: key.toLowerCase(), answerBody: rest };
  return null;
}

/**
 * 把自由文本答案解析为单题答案结构
 *
 * 规则：
 * - 有选项时，纯编号/逗号分隔编号 → selected=对应标签（multiSelect=false 只取第一个编号）
 * - 其余 → selected=[] + custom=原文
 *
 * @returns 未命中任何选项且无编号时 custom 为原文；协议要求 custom 或 selected 至少其一
 */
export function parseFreeTextAnswer(
  answerBody: string,
  question: AskSession,
): { selected: string[]; custom?: string } {
  const body = answerBody.trim();
  const hasOptions = !!question.options && question.options.length > 0;

  if (hasOptions) {
    const nums = body
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{1,2}$/.test(s))
      .map((s) => parseInt(s, 10));
    // 仅当整体就是编号序列（如 "1"、"2,3"）才按编号解析，避免误吞「第1个方案是…」这类文本
    const isPureNumberList =
      nums.length > 0 &&
      body.split(/[,，、\s]+/).every((s) => /^\d{1,2}$/.test(s.trim()));
    if (isPureNumberList) {
      const picked = nums
        .slice(0, question.multiSelect ? nums.length : 1)
        .map((n) => question.options![n - 1])
        .filter((label): label is string => typeof label === 'string');
      if (picked.length > 0) return { selected: picked };
    }
  }
  return { selected: [], custom: body };
}

/**
 * 将入站答案按问题顺序分配
 *
 * 多题时按空行分段（协议上 ask_user_question 通常单题，多题尽力而为）。
 */
export function assignAnswers(
  answerBody: string,
  questions: AskSession[],
): Array<{ id: string; selected: string[]; custom?: string }> {
  if (questions.length === 0) return [];
  if (questions.length === 1) {
    const q = questions[0]!;
    const a = parseFreeTextAnswer(answerBody, q);
    return a.custom !== undefined
      ? [{ id: q.id, selected: a.selected, custom: a.custom }]
      : [{ id: q.id, selected: a.selected }];
  }
  const segments = answerBody.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return questions.map((q, i) => {
    const seg = segments[i] ?? '';
    const a = parseFreeTextAnswer(seg, q);
    return a.custom !== undefined
      ? { id: q.id, selected: a.selected, custom: a.custom }
      : { id: q.id, selected: a.selected };
  });
}
