import path from "path";

export const DIRECT_UPLOAD_RULES = {
  image: {
    mimes: new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]),
    extensions: new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]),
    maxSize: 20 * 1024 * 1024,
  },
  video: {
    mimes: new Set(["video/quicktime", "video/mp4", "video/webm", "video/3gpp", "video/3gp", "video/x-m4v"]),
    extensions: new Set([".mp4", ".mov", ".webm", ".3gp", ".m4v"]),
    maxSize: 100 * 1024 * 1024,
  },
  audio: {
    mimes: new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "audio/mp4", "audio/flac", "audio/opus"]),
    extensions: new Set([".mp3", ".wav", ".ogg", ".aac", ".m4a", ".flac", ".opus"]),
    maxSize: 50 * 1024 * 1024,
  },
  lyric: {
    mimes: new Set(["text/plain", "text/x-lrc", "application/x-lrc", "application/octet-stream"]),
    extensions: new Set([".lrc"]),
    maxSize: 1 * 1024 * 1024,
  },
  file: {
    mimes: new Set<string>(),
    extensions: new Set<string>(),
    maxSize: 50 * 1024 * 1024,
  },
} as const;

export type DirectUploadKind = keyof typeof DIRECT_UPLOAD_RULES;

export function getDirectUploadRule(kind: unknown, filename: unknown, mimeType: unknown) {
  if (typeof kind !== "string" || !(kind in DIRECT_UPLOAD_RULES)) {
    throw new Error("不支持的上传类型");
  }
  if (typeof filename !== "string" || !filename.trim() || filename.length > 255) {
    throw new Error("文件名无效");
  }
  if (typeof mimeType !== "string" || !mimeType) {
    throw new Error("文件类型无效");
  }

  const rule = DIRECT_UPLOAD_RULES[kind as DirectUploadKind];
  const ext = path.extname(filename).toLowerCase();
  if (kind === "file") {
    const blocked = new Set(["text/html", "application/javascript", "application/xhtml+xml", "image/svg+xml"]);
    if (blocked.has(mimeType)) throw new Error("不支持此文件类型");
  } else if (!rule.mimes.has(mimeType) || !rule.extensions.has(ext)) {
    throw new Error("文件扩展名或 MIME 类型不被允许");
  }
  return { kind: kind as DirectUploadKind, rule };
}
