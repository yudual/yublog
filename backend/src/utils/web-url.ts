/**
 * Normalize a user-provided website URL while allowing the legacy bare-domain
 * form (for example, "example.com") used by older comments.
 */
export function normalizeHttpUrl(value: unknown): string | null {
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

export function isValidHttpUrl(value: unknown): boolean {
  return value == null || value === "" || normalizeHttpUrl(value) !== null;
}

/** Normalize an image URL while retaining site-local paths such as /uploads/*. */
export function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return normalizeHttpUrl(raw);
}

export function isValidImageUrl(value: unknown): boolean {
  return value == null || value === "" || normalizeImageUrl(value) !== null;
}

export interface NormalizedLinkCard {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}

/** Validate and normalize the URL-bearing fields in an article link card. */
export function normalizeLinkCard(value: unknown): NormalizedLinkCard | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const source = value as Record<string, unknown>;
  if (typeof source.url !== "string" || !source.url.trim()) return null;
  const url = normalizeHttpUrl(source.url);
  if (!url) return null;

  const rawImage = source.image == null ? "" : source.image;
  if (rawImage !== "" && typeof rawImage !== "string") return null;
  const image = rawImage === "" ? "" : normalizeImageUrl(rawImage);
  if (image === null) return null;

  return {
    url,
    title: typeof source.title === "string" ? source.title : "",
    description: typeof source.description === "string" ? source.description : "",
    image,
    siteName: typeof source.siteName === "string" ? source.siteName : "",
  };
}

export function isValidLinkCard(value: unknown): boolean {
  return value == null || normalizeLinkCard(value) !== null;
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Parse and retain only safe social-link records. Email and QR values are supported. */
export function normalizeSocialLinks(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "[]";
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return "[]";
    const result = parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const type = typeof item.type === "string" ? item.type.trim().slice(0, 40) : "";
      const rawUrl = typeof item.url === "string" ? item.url.trim() : "";
      if (!type || !rawUrl) return [];
      const isEmail = type.toLowerCase() === "email";
      const url = isEmail
        ? (isEmailAddress(rawUrl.replace(/^mailto:/i, "")) ? rawUrl.replace(/^mailto:/i, "") : null)
        : (rawUrl.startsWith("/") && !rawUrl.startsWith("//") ? rawUrl : normalizeHttpUrl(rawUrl));
      if (!url) return [];
      return [{ type, url }];
    });
    return JSON.stringify(result.slice(0, 50));
  } catch {
    return "[]";
  }
}

export function isValidSocialLinks(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return true;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => {
      if (!item || typeof item !== "object") return false;
      const type = typeof item.type === "string" ? item.type.trim() : "";
      const url = typeof item.url === "string" ? item.url.trim() : "";
      if (!type || !url) return false;
      if (type.toLowerCase() === "email") return isEmailAddress(url.replace(/^mailto:/i, ""));
      return (url.startsWith("/") && !url.startsWith("//")) || normalizeHttpUrl(url) !== null;
    });
  } catch {
    return false;
  }
}
