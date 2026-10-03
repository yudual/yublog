import { normalizeEmail, normalizeIp } from "../utils/ip";

/**
 * 滑动窗口限流器：记录每个 key 在窗口内的命中时间戳。
 * 命中时清理过期记录，保证窗口计数准确。
 */
class SlidingWindow {
  private hits = new Map<string, number[]>();

  private prune(key: string, windowMs: number): number[] {
    const now = Date.now();
    const arr = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length === 0) this.hits.delete(key);
    else this.hits.set(key, arr);
    return arr;
  }

  /** 当前窗口内已命中次数 */
  count(key: string, windowMs: number): number {
    return this.prune(key, windowMs).length;
  }

  /** 窗口内最早命中时间戳，用于计算 retryAfter；无记录返回 0 */
  oldest(key: string, windowMs: number): number {
    const arr = this.prune(key, windowMs);
    return arr.length > 0 ? arr[0] : 0;
  }

  /** 记录一次命中 */
  record(key: string): void {
    const now = Date.now();
    const arr = this.hits.get(key) || [];
    arr.push(now);
    this.hits.set(key, arr);
  }

  /** 清除某 key 的记录 */
  clear(key: string): void {
    this.hits.delete(key);
  }
}

/**
 * 违规追踪器：记录某 key 触发限流的次数。
 * 达到阈值则建议自动临时封禁。
 */
class ViolationTracker {
  private violations = new Map<string, { count: number; firstAt: number }>();
  private readonly windowMs: number;
  private readonly threshold: number;

  constructor(windowMs = 10 * 60 * 1000, threshold = 3) {
    this.windowMs = windowMs;
    this.threshold = threshold;
  }

  record(key: string): void {
    const now = Date.now();
    const v = this.violations.get(key);
    if (!v || now - v.firstAt > this.windowMs) {
      this.violations.set(key, { count: 1, firstAt: now });
      return;
    }
    v.count++;
  }

  /** 是否达到自动封禁阈值 */
  shouldAutoBan(key: string): boolean {
    const now = Date.now();
    const v = this.violations.get(key);
    if (!v) return false;
    if (now - v.firstAt > this.windowMs) {
      this.violations.delete(key);
      return false;
    }
    return v.count >= this.threshold;
  }

  reset(key: string): void {
    this.violations.delete(key);
  }
}

/** 评论限流参数 */
export const COMMENT_EMAIL_LIMIT = 2;
export const COMMENT_EMAIL_WINDOW = 10 * 1000;
export const COMMENT_IP_LIMIT = 10;
export const COMMENT_IP_WINDOW = 60 * 1000;

const emailWindow = new SlidingWindow();
const ipWindow = new SlidingWindow();
const emailViolations = new ViolationTracker();
const ipViolations = new ViolationTracker();

export interface RateLimitResult {
  allowed: boolean;
  /** 触发限流的原因 key，前端可据此区分提示 */
  reason?: "RATE_LIMIT_EMAIL" | "RATE_LIMIT_IP";
  /** 建议重试等待秒数 */
  retryAfter?: number;
  /** 是否建议自动临时封禁该 key */
  banKey?: { type: "email" | "ip"; value: string };
}

/**
 * 检查评论限流。命中即记录违规，成功由调用方调用 clearOnSuccess 重置。
 * 返回 allowed=false 时调用方应直接返回 429，不再写入数据库。
 */
export function checkCommentRate(rawEmail: string, rawIp: string): RateLimitResult {
  const email = normalizeEmail(rawEmail);
  const ip = normalizeIp(rawIp);

  const emailCount = emailWindow.count(email, COMMENT_EMAIL_WINDOW);
  if (emailCount >= COMMENT_EMAIL_LIMIT) {
    emailViolations.record(email);
    const oldest = emailWindow.oldest(email, COMMENT_EMAIL_WINDOW);
    const retryAfterMs = oldest > 0 ? COMMENT_EMAIL_WINDOW - (Date.now() - oldest) : COMMENT_EMAIL_WINDOW;
    const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const ban = emailViolations.shouldAutoBan(email);
    return {
      allowed: false,
      reason: "RATE_LIMIT_EMAIL",
      retryAfter,
      banKey: ban ? { type: "email", value: email } : undefined,
    };
  }

  const ipCount = ipWindow.count(ip, COMMENT_IP_WINDOW);
  if (ipCount >= COMMENT_IP_LIMIT) {
    ipViolations.record(ip);
    const oldest = ipWindow.oldest(ip, COMMENT_IP_WINDOW);
    const retryAfterMs = oldest > 0 ? COMMENT_IP_WINDOW - (Date.now() - oldest) : COMMENT_IP_WINDOW;
    const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const ban = ipViolations.shouldAutoBan(ip);
    return {
      allowed: false,
      reason: "RATE_LIMIT_IP",
      retryAfter,
      banKey: ban ? { type: "ip", value: ip } : undefined,
    };
  }

  return { allowed: true };
}

/** 评论提交成功后调用：记录一次成功命中，邮箱违规计数清零（原谅正常用户） */
export function recordCommentSuccess(rawEmail: string, rawIp: string): void {
  const email = normalizeEmail(rawEmail);
  const ip = normalizeIp(rawIp);
  emailWindow.record(email);
  ipWindow.record(ip);
  // 正常用户连续回复成功后清零违规计数，避免历史误伤累积
  emailViolations.reset(email);
  ipViolations.reset(ip);
}

/** 暴露给外部用于自动封禁后重置对应追踪器 */
export function resetViolations(type: "email" | "ip", value: string): void {
  if (type === "email") emailViolations.reset(normalizeEmail(value));
  else ipViolations.reset(normalizeIp(value));
}

/** 认证接口限流参数：登录 15 分钟内每 IP 最多 10 次；注册每小时每 IP 最多 5 次 */
export const AUTH_LOGIN_IP_LIMIT = 10;
export const AUTH_LOGIN_IP_WINDOW = 15 * 60 * 1000;
export const AUTH_REGISTER_IP_LIMIT = 5;
export const AUTH_REGISTER_IP_WINDOW = 60 * 60 * 1000;

/** 视频重解析限流：10 分钟内每 IP 最多 30 次（正常播放只在链接过期时触发） */
export const VIDEO_REFRESH_IP_LIMIT = 30;
export const VIDEO_REFRESH_IP_WINDOW = 10 * 60 * 1000;

/** 视频代理限流：避免代理接口被当作无限流量转发器使用。 */
export const VIDEO_PROXY_IP_LIMIT = 120;
export const VIDEO_PROXY_IP_WINDOW = 60 * 1000;

/** 点赞限流参数：1 分钟内单 IP 最多 30 次点赞/取消点赞（防止恶意脚本无限刷赞打穿数据库） */
export const LIKE_IP_LIMIT = 30;
export const LIKE_IP_WINDOW = 60 * 1000;

/** 点赞昵称更新限流：1 分钟内单 IP 最多 10 次（update-name 无强鉴权，防批量枚举） */
export const LIKE_RENAME_IP_LIMIT = 10;
export const LIKE_RENAME_IP_WINDOW = 60 * 1000;

/** 访客通知查询限流：1 分钟内单 IP 最多 20 次（防邮箱枚举探测） */
export const NOTIFY_IP_LIMIT = 20;
export const NOTIFY_IP_WINDOW = 60 * 1000;

const authLoginWindow = new SlidingWindow();
const authRegisterWindow = new SlidingWindow();
const videoRefreshWindow = new SlidingWindow();
const videoProxyWindow = new SlidingWindow();
const likeWindow = new SlidingWindow();
const likeRenameWindow = new SlidingWindow();
const notifyWindow = new SlidingWindow();

const IP_RATE_RULES = {
  login: { window: authLoginWindow, limit: AUTH_LOGIN_IP_LIMIT, windowMs: AUTH_LOGIN_IP_WINDOW },
  register: { window: authRegisterWindow, limit: AUTH_REGISTER_IP_LIMIT, windowMs: AUTH_REGISTER_IP_WINDOW },
  "video-refresh": { window: videoRefreshWindow, limit: VIDEO_REFRESH_IP_LIMIT, windowMs: VIDEO_REFRESH_IP_WINDOW },
  "video-proxy": { window: videoProxyWindow, limit: VIDEO_PROXY_IP_LIMIT, windowMs: VIDEO_PROXY_IP_WINDOW },
  like: { window: likeWindow, limit: LIKE_IP_LIMIT, windowMs: LIKE_IP_WINDOW },
  "like-rename": { window: likeRenameWindow, limit: LIKE_RENAME_IP_LIMIT, windowMs: LIKE_RENAME_IP_WINDOW },
  notify: { window: notifyWindow, limit: NOTIFY_IP_LIMIT, windowMs: NOTIFY_IP_WINDOW },
} as const;

export type IpRateKind = keyof typeof IP_RATE_RULES;

/**
 * 按 IP 限流（登录/注册防暴力破解；视频重解析防第三方接口被刷）。
 * 请求进入即记录；失败重试由窗口自然过期恢复。
 */
export function checkIpRate(kind: IpRateKind, rawIp: string): { allowed: boolean; retryAfter?: number } {
  const ip = normalizeIp(rawIp);
  const { window, limit, windowMs } = IP_RATE_RULES[kind];
  if (window.count(ip, windowMs) >= limit) {
    const oldest = window.oldest(ip, windowMs);
    const retryAfterMs = oldest > 0 ? windowMs - (Date.now() - oldest) : windowMs;
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  window.record(ip);
  return { allowed: true };
}
