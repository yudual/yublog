import { describe, it, expect } from "vitest";
import { getClientIp, normalizeEmail, normalizeIp } from "../src/utils/ip";
import { isPublicIp } from "../src/utils/ssrf-guard";
import type { Request } from "express";

/** 构造最小化的 mock Request，仅包含 getClientIp 读取的字段 */
function mockReq(
  headers: Record<string, string | string[] | undefined>,
  ip?: string,
  remoteAddress: string | null = "127.0.0.1"
) {
  return {
    headers,
    ip,
    socket: remoteAddress ? { remoteAddress } : undefined,
    connection: remoteAddress ? { remoteAddress } : undefined,
  } as unknown as Request;
}

describe("getClientIp（XFF 伪造防护）", () => {
  it("优先取 EdgeOne CDN 透传的 eo-real-ip", () => {
    const req = mockReq({
      "eo-real-ip": "114.114.114.114",
      "x-real-ip": "43.175.168.192", // EdgeOne 节点 IP
      "x-forwarded-for": "114.114.114.114, 43.175.168.192",
    });
    expect(getClientIp(req)).toBe("114.114.114.114");
  });

  it("无 eo-real-ip 时优先取 Cloudflare 透传的 cf-connecting-ip", () => {
    const req = mockReq({
      "cf-connecting-ip": "1.1.1.1",
      "x-real-ip": "172.68.0.1",
      "x-forwarded-for": "1.1.1.1, 172.68.0.1",
    });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });

  it("优先取 nginx 覆盖写入的 X-Real-IP", () => {
    const req = mockReq({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "1.2.3.4, 203.0.113.7",
    });
    expect(getClientIp(req)).toBe("203.0.113.7");
  });

  it("无 X-Real-IP 时取 XFF 最后一跳（nginx 追加的真实 IP），而非可伪造的第一跳", () => {
    const req = mockReq({ "x-forwarded-for": "1.2.3.4, 198.51.100.9" });
    expect(getClientIp(req)).toBe("198.51.100.9");
  });

  it("单个 XFF 条目正常返回", () => {
    const req = mockReq({ "x-forwarded-for": "198.51.100.9" });
    expect(getClientIp(req)).toBe("198.51.100.9");
  });

  it("XFF 为数组时同样取最后一项", () => {
    const req = mockReq({ "x-forwarded-for": ["1.2.3.4", "198.51.100.9"] });
    expect(getClientIp(req)).toBe("198.51.100.9");
  });

  it("直连非受信任 IP 时忽略伪造的代理头", () => {
    const req = mockReq(
      {
        "eo-real-ip": "114.114.114.114",
        "cf-connecting-ip": "1.1.1.1",
        "x-real-ip": "8.8.8.8",
        "x-forwarded-for": "9.9.9.9",
      },
      undefined,
      "203.0.113.50"
    );
    expect(getClientIp(req)).toBe("203.0.113.50");
  });

  it("无代理头时回退 req.ip", () => {
    const req = mockReq({}, "10.0.0.1", null);
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("最后回退 connection.remoteAddress", () => {
    const req = mockReq({}, undefined, "127.0.0.1");
    expect(getClientIp(req)).toBe("127.0.0.1");
  });

  it("无任何身份信息时返回 unknown", () => {
    expect(getClientIp(mockReq({}, undefined, null))).toBe("unknown");
  });
});

describe("normalizeEmail / normalizeIp", () => {
  it("邮箱标准化：去空格 + 小写", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("IP 标准化：剥离 IPv6 映射前缀", () => {
    expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
    expect(normalizeIp("192.168.1.1")).toBe("192.168.1.1");
    expect(normalizeIp("")).toBe("unknown");
  });
});

describe("SSRF IP 防护", () => {
  it.each([
    "::1",
    "0:0:0:0:0:0:0:1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "::ffff:c0a8:0101",
    "fc00::1",
    "fd12:3456:789a::1",
    "fe80::1",
    "ff02::1",
  ])("拒绝内网或特殊 IPv6 地址 %s", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each(["2001:4860:4860::8888", "::ffff:8.8.8.8"])("允许公网 IPv6 地址 %s", (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });
});
