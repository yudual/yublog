import { describe, it, expect } from "vitest";
import { getClientIp, normalizeEmail, normalizeIp } from "../src/utils/ip";
import type { Request } from "express";

/** 构造最小化的 mock Request，仅包含 getClientIp 读取的字段 */
function mockReq(headers: Record<string, string | string[] | undefined>, ip?: string, remoteAddress?: string) {
  return {
    headers,
    ip,
    connection: { remoteAddress },
  } as unknown as Request;
}

describe("getClientIp（XFF 伪造防护）", () => {
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

  it("无代理头时回退 req.ip", () => {
    const req = mockReq({}, "10.0.0.1");
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("最后回退 connection.remoteAddress", () => {
    const req = mockReq({}, undefined, "127.0.0.1");
    expect(getClientIp(req)).toBe("127.0.0.1");
  });

  it("无任何身份信息时返回 unknown", () => {
    expect(getClientIp(mockReq({}))).toBe("unknown");
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
