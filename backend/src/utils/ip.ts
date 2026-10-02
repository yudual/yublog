import type { Request } from "express";

/**
 * 从 Express 请求中提取客户端真实 IP。
 * 优先级：X-Real-IP > X-Forwarded-For（取最后一跳）> req.ip > connection.remoteAddress
 *
 * 安全说明：XFF 的左侧条目可被客户端伪造（curl -H "X-Forwarded-For: 1.2.3.4"）。
 * 生产 nginx 配置为 proxy_set_header X-Real-IP $remote_addr（覆盖客户端伪造值）
 * 和 X-Forwarded-For $proxy_add_x_forwarded_for（把真实 IP 追加到末尾），
 * 因此必须取 X-Real-IP 或 XFF 的最后一个条目，绝不能取第一个。
 */
export function getClientIp(req: Request): string {
  // 1. CDN 代理透传真实客户端 IP：EdgeOne (eo-real-ip) 与 Cloudflare (cf-connecting-ip)
  const eoRealIp = req.headers["eo-real-ip"];
  if (typeof eoRealIp === "string" && eoRealIp.trim().length > 0) {
    return eoRealIp.trim();
  }
  const cfConnectingIp = req.headers["cf-connecting-ip"];
  if (typeof cfConnectingIp === "string" && cfConnectingIp.trim().length > 0) {
    return cfConnectingIp.trim();
  }

  // 2. Nginx 设置的 X-Real-IP
  const xRealIp = req.headers["x-real-ip"];
  if (typeof xRealIp === "string" && xRealIp.length > 0) {
    return xRealIp.trim();
  }

  // 3. X-Forwarded-For 最后一跳（Nginx 追加）
  const xff = req.headers["x-forwarded-for"];
  const xffList = typeof xff === "string" ? xff.split(",") : Array.isArray(xff) ? xff : [];
  const lastHop = xffList.map((s) => s.trim()).filter(Boolean).pop();
  if (lastHop) {
    return lastHop;
  }
  if (req.ip) return req.ip;
  const remote = req.connection?.remoteAddress;
  return remote || "unknown";
}

/** 邮箱标准化：小写 + trim，作为限流和黑名单的 key */
export function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

/** IP 标准化：去掉 IPv6 前缀 ::ffff: 让 v4/v6 对齐 */
export function normalizeIp(ip: string): string {
  if (!ip) return "unknown";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}
