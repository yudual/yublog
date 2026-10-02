/**
 * 服务端评论内容净化（纵深防御层）。
 *
 * 评论正文约定为纯文本（表情用 [code] 形式），前端渲染时统一转义；
 * 这里在写入前再剥离一次 HTML 标签与控制字符，确保即使某个渲染点
 * 遗漏转义也不会形成存储型 XSS。保留 \n \r，评论允许换行。
 */
export function sanitizeCommentContent(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** 昵称净化：剥标签 + 压缩空白 + 截断，用于点赞/评论显示名 */
export function sanitizeDisplayName(input: unknown, maxLength = 50): string {
  if (typeof input !== "string") return "";
  const cleaned = input
    .replace(/<[^>]*>/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLength);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 宽松邮箱格式校验（用于拒绝明显非法的输入，不追求 RFC 完整性） */
export function isProbablyEmail(input: unknown): input is string {
  return typeof input === "string" && input.length <= 254 && EMAIL_RE.test(input);
}
