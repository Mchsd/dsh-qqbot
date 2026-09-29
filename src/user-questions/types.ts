/**
 * user-questions 通道适配 — 类型定义
 *
 * 将 dsh `ctx.userQuestions` 能力缝桥接到 QQ 通道：问题渲染为 QQ 消息，
 * 用户下一条回复经入站匹配器回填 provider promise（进程内 resolve，
 * 无需 inbox 注入，绕开 agent-loop 缺陷①）。
 */

/** 单条 ask 配置（ask_user_question 一次调用） */
export interface AskSession {
  /** 问题 id（dsh AskUserQuestionItem.id，透传） */
  id: string;
  /** 问题文本 */
  question: string;
  /** 可选项标签 */
  options?: string[];
  /** 是否多选（影响答案解析） */
  multiSelect: boolean;
}

/** 一次 ask 请求的注册记录 */
export interface PendingQuestion {
  /** 匹配键：`ask:<uuid>`，经 state.ask 传给入站匹配器 */
  matchKey: string;
  /** 问题列表（通常 1 条，协议允许多条） */
  questions: AskSession[];
  /** 收集到的原始问题 id 顺序（回填用） */
  questionIds: string[];
  /** 提问所属会话 key（便于诊断） */
  sessionKey: string;
  /** 发送文本（已渲染，重发/诊断用） */
  rendered: string;
  /** 超时定时器 */
  timer: ReturnType<typeof setTimeout>;
  /** 完成处理：先于 settle 调用（幂等删除 + 清理） */
  claim(): void;
  /** resolve 回填 */
  resolve(answer: AskAnswer): void;
  /** reject（超时/中止） */
  reject(err: Error): void;
}

/** 回填给 dsh 的答案（对齐 AskUserQuestionAnswerItem） */
export interface AskAnswer {
  id: string;
  selected: string[];
  custom?: string;
}

/** 入站匹配器经 middleware state 拿到的回执闭包 */
export interface AskInboundState {
  /** 尝试投递答案；命中返回 true（调用方短路，不再进 LLM） */
  deliver(text: string): boolean;
}

/** provider.ask 收到的请求（dsh AskUserQuestionRequest 的结构化子集） */
export interface AskRequestLike {
  questions: Array<{
    id: string;
    question: string;
    options?: Array<{ label: string }>;
    multiSelect?: boolean;
  }>;
  signal?: AbortSignal;
}

/** userQuestions 服务的最小接口（注册 provider 用） */
export interface UserQuestionServiceLike {
  registerProvider(provider: { ask(request: AskRequestLike): Promise<{ answers: AskAnswer[] }> }): () => void;
}
