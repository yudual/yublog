import { promises as dns } from "dns";
import net from "net";

/**
 * SSRF 防护：校验目标 URL 是否为可公网访问的 http/https 地址。
 * 拒绝内网/链路本地/元数据地址（127.0.0.1、169.254.169.254、10.x、::1 等），
 * 包括通过域名解析到内网 IP 的情况。解析失败按私有处理（fail closed）。
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("无效的 URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https 协议");
  }
  if (parsed.username || parsed.password) {
    throw new Error("不支持携带凭据的 URL");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("不允许访问内网地址");
  }

  // IP 字面量直接检查；域名则解析后检查所有地址
  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error("不允许访问内网地址");
    return parsed;
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("域名解析失败");
  }
  if (records.length === 0 || records.some((r) => !isPublicIp(r.address))) {
    throw new Error("不允许访问内网地址");
  }
  return parsed;
}

export function isPublicIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPublicIPv4(ip);
  if (family === 6) return isPublicIPv6(ip);
  return false;
}

function isPublicIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false; // 本机/内网
  if (a === 169 && b === 254) return false; // 链路本地（含云元数据 169.254.169.254）
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12
  if (a === 192 && b === 168) return false; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return false; // 基准测试保留段
  if (a >= 224) return false; // 组播与保留段
  return true;
}

function isPublicIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  const groups = parseIPv6Groups(addr);
  if (!groups) return false;

  // IPv4-mapped IPv6（包括 ::ffff:7f00:1 这种十六进制写法）必须按 IPv4 规则检查。
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPublicIPv4(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);
  }

  // 未指定地址和 loopback 的压缩、展开写法都不能访问。
  const isZero = groups.every((group) => group === 0);
  const isLoopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  if (isZero || isLoopback) return false;

  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 唯一本地
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 链路本地
  if ((first & 0xff00) === 0xff00) return false; // ff00::/8 组播
  if (first === 0x2001 && groups[1] === 0x0db8) return false; // 文档保留段
  return true;
}

/** 将合法的 IPv6 文本展开为 8 个 16 位分组。 */
function parseIPv6Groups(addr: string): number[] | null {
  if (addr.includes(".")) {
    const separator = addr.lastIndexOf(":");
    if (separator < 0) return null;
    const ipv4 = addr.slice(separator + 1);
    const parts = ipv4.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    const ipv4Groups = [parts[0] * 256 + parts[1], parts[2] * 256 + parts[3]];
    addr = `${addr.slice(0, separator)}:${ipv4Groups.map((group) => group.toString(16)).join(":")}`;
  }

  if (addr.split("::").length > 2) return null;
  const [head, tail] = addr.includes("::") ? addr.split("::") : [addr, ""];
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const groups = [...headGroups, ...tailGroups];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;

  const fill = addr.includes("::") ? 8 - groups.length : 0;
  if (fill < 0 || (!addr.includes("::") && groups.length !== 8) || (addr.includes("::") && fill === 0)) return null;
  return [...headGroups, ...Array(fill).fill("0"), ...tailGroups].map((group) => parseInt(group, 16));
}
