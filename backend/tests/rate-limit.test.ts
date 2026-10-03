import { describe, it, expect } from "vitest";
import { checkIpRate } from "../src/middleware/rateLimit";

describe("checkIpRate（滑动窗口）", () => {
  it("窗口内达到上限后拒绝并给出重试秒数", () => {
    // like：60 秒内每 IP 最多 30 次；用唯一 IP 避免用例间串扰
    const ip = `10.99.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < 30; i++) {
      expect(checkIpRate("like", ip).allowed).toBe(true);
    }
    const blocked = checkIpRate("like", ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("不同 IP 互不影响", () => {
    const lastOctet = Math.floor(Math.random() * 250);
    const a = `10.98.0.${lastOctet}`;
    const b = `10.98.1.${lastOctet}`;
    for (let i = 0; i < 10; i++) checkIpRate("like-rename", a);
    expect(checkIpRate("like-rename", a).allowed).toBe(false);
    expect(checkIpRate("like-rename", b).allowed).toBe(true);
  });
});
