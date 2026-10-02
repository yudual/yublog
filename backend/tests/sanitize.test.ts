import { describe, it, expect } from "vitest";
import { sanitizeCommentContent, sanitizeDisplayName, isProbablyEmail } from "../src/utils/sanitize";

describe("sanitizeCommentContent", () => {
  it("剥离存储型 XSS 标签（标签替换为空格，防止单词粘连）", () => {
    expect(sanitizeCommentContent("<script>alert(1)</script>你好")).toBe("alert(1) 你好");
  });

  it("剥离带属性的标签但保留文本", () => {
    expect(sanitizeCommentContent('<img src=x onerror=alert(1)>哈哈')).toBe("哈哈");
  });

  it("保留换行与常规表情码", () => {
    expect(sanitizeCommentContent("第一行[微笑]\n第二行")).toBe("第一行[微笑]\n第二行");
  });

  it("剥离控制字符但保留换行回车", () => {
    expect(sanitizeCommentContent("a\u0000b\u0007c\nd")).toBe("abc\nd");
  });

  it("压缩连续空格", () => {
    expect(sanitizeCommentContent("a    b")).toBe("a b");
  });

  it("非字符串输入返回空串", () => {
    expect(sanitizeCommentContent(undefined)).toBe("");
    expect(sanitizeCommentContent(null)).toBe("");
    expect(sanitizeCommentContent(42)).toBe("");
  });
});

describe("sanitizeDisplayName", () => {
  it("剥离标签与控制字符并截断", () => {
    expect(sanitizeDisplayName("<b>小</b>明")).toBe("小明");
    expect(sanitizeDisplayName("a".repeat(80))).toHaveLength(50);
  });

  it("非字符串返回空串", () => {
    expect(sanitizeDisplayName(undefined)).toBe("");
  });
});

describe("isProbablyEmail", () => {
  it("接受常规邮箱", () => {
    expect(isProbablyEmail("foo.bar@example.com")).toBe(true);
  });

  it("拒绝明显非法值", () => {
    expect(isProbablyEmail("not-an-email")).toBe(false);
    expect(isProbablyEmail("a b@c.com")).toBe(false);
    expect(isProbablyEmail(undefined)).toBe(false);
    expect(isProbablyEmail("")).toBe(false);
  });
});
