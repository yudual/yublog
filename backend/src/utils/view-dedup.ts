/**
 * 阅读量去重（单实例内存版）：同一 visitorId + postId 在 TTL 窗口内只计一次。
 *
 * - 进程重启清零可接受（阅读量为统计值，允许少量误差）；
 * - 多实例/Serverless 部署时此去重各自独立，如需严格去重请改用 Redis 等共享存储；
 * - 容量兜底：超限时先清理过期条目，仍超限则整体清空，防止内存膨胀。
 */
const TTL_MS = 6 * 60 * 60 * 1000; // 6 小时内同一访客重复打开不重复计数
const SEEN_MAX = 50_000;

const seen = new Map<string, number>();

export function shouldCountView(visitorId: string | undefined, postId: string): boolean {
  const key = `${visitorId || "anon"}:${postId}`;
  const now = Date.now();

  if (seen.size > SEEN_MAX) {
    for (const [k, t] of seen) {
      if (now - t > TTL_MS) seen.delete(k);
    }
    if (seen.size > SEEN_MAX) seen.clear();
  }

  const last = seen.get(key);
  if (last !== undefined && now - last < TTL_MS) {
    return false;
  }
  seen.set(key, now);
  return true;
}
