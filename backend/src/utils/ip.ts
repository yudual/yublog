import type { Request } from "express";
import net from "node:net";

const DEFAULT_TRUSTED_PROXY_IPS = ["127.0.0.1", "::1"];

function normalizeIpCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let candidate = value.trim();
  if (!candidate) return null;
  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    candidate = candidate.slice(1, -1);
  }
  return net.isIP(candidate) ? normalizeIp(candidate) : null;
}

function trustedProxyIps(): Set<string> {
  const configured = (process.env.TRUSTED_PROXY_IPS || "")
    .split(",")
    .map((value) => normalizeIpCandidate(value))
    .filter((value): value is string => Boolean(value));
  return new Set(configured.length > 0 ? configured : DEFAULT_TRUSTED_PROXY_IPS);
}

function requestPeerIp(req: Request): string | null {
  return normalizeIpCandidate(req.socket?.remoteAddress || req.connection?.remoteAddress);
}

function isTrustedProxy(req: Request): boolean {
  const peer = requestPeerIp(req);
  return Boolean(peer && trustedProxyIps().has(peer));
}

/**
 * 从 Express 请求中提取客户端真实 IP。
 * 只有来自 TRUSTED_PROXY_IPS 的直接上游才可以提供代理头；直连后端时
 * 一律忽略这些头，避免调用方伪造 IP 绕过限流或污染地区识别。
 * 代理头优先级：EdgeOne/Cloudflare > X-Real-IP > XFF（取最后一跳）。
 *
 * 生产反向代理必须设置 TRUSTED_PROXY_IPS（通常包含本机 Nginx 的 127.0.0.1）。
 * 不配置时默认只信任本机回环地址，远程直连请求仍不会获得代理头信任。
 */
export function getClientIp(req: Request): string {
  const canTrustProxyHeaders = isTrustedProxy(req);

  // 1. CDN 代理透传真实客户端 IP：EdgeOne (eo-real-ip) 与 Cloudflare (cf-connecting-ip)
  if (canTrustProxyHeaders) {
    const eoRealIp = normalizeIpCandidate(req.headers["eo-real-ip"]);
    if (eoRealIp) return eoRealIp;
    const cfConnectingIp = normalizeIpCandidate(req.headers["cf-connecting-ip"]);
    if (cfConnectingIp) return cfConnectingIp;

    // 2. Nginx 设置的 X-Real-IP
    const xRealIp = normalizeIpCandidate(req.headers["x-real-ip"]);
    if (xRealIp) return xRealIp;

    // 3. X-Forwarded-For 最后一跳（Nginx 追加）
    const xff = req.headers["x-forwarded-for"];
    const xffList = typeof xff === "string" ? xff.split(",") : Array.isArray(xff) ? xff : [];
    const lastHop = xffList
      .map((value) => normalizeIpCandidate(value))
      .filter((value): value is string => Boolean(value))
      .pop();
    if (lastHop) return lastHop;
  }

  const expressIp = normalizeIpCandidate(req.ip);
  if (expressIp) return expressIp;
  return requestPeerIp(req) || "unknown";
}

/** 邮箱标准化：小写 + trim，作为限流和黑名单的 key */
export function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

/** IP 标准化：去掉 IPv6 前缀 ::ffff: 让 v4/v6 对齐 */
export function normalizeIp(ip: string): string {
  const value = String(ip || "").trim();
  if (!value) return "unknown";
  if (value.startsWith("::ffff:")) return value.slice(7);
  return value;
}
