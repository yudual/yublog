/** Return a safe external website URL, including legacy bare domains. */
export function toSafeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !url.hostname) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/** Return a safe remote or site-local image path for historical content. */
export function toSafeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return toSafeHttpUrl(raw);
}

/** Return a safe playable media URL, including historical site-local paths. */
export function toSafeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return toSafeHttpUrl(raw);
}
