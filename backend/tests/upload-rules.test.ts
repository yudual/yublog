import { describe, expect, it } from "vitest";
import { getDirectUploadRule } from "../src/utils/upload-rules";

describe("upload-rules validation", () => {
  it("allows valid image formats", () => {
    const result = getDirectUploadRule("image", "avatar.jpg", "image/jpeg");
    expect(result.kind).toBe("image");
    expect(result.rule.maxSize).toBe(20 * 1024 * 1024);
  });

  it("allows valid audio and video formats", () => {
    expect(getDirectUploadRule("video", "clip.mp4", "video/mp4").kind).toBe("video");
    expect(getDirectUploadRule("audio", "song.mp3", "audio/mpeg").kind).toBe("audio");
    expect(getDirectUploadRule("lyric", "song.lrc", "text/plain").kind).toBe("lyric");
  });

  it("rejects mismatched extensions and MIME types", () => {
    expect(() => getDirectUploadRule("image", "avatar.exe", "image/jpeg")).toThrow("文件扩展名或 MIME 类型不被允许");
    expect(() => getDirectUploadRule("image", "avatar.jpg", "application/x-msdownload")).toThrow("文件扩展名或 MIME 类型不被允许");
  });

  it("blocks dangerous file types in generic file uploads", () => {
    expect(() => getDirectUploadRule("file", "index.html", "text/html")).toThrow("不支持此文件类型");
    expect(() => getDirectUploadRule("file", "script.js", "application/javascript")).toThrow("不支持此文件类型");
    expect(() => getDirectUploadRule("file", "evil.svg", "image/svg+xml")).toThrow("不支持此文件类型");
  });

  it("rejects invalid kinds or empty filenames", () => {
    expect(() => getDirectUploadRule("invalid_kind", "file.txt", "text/plain")).toThrow("不支持的上传类型");
    expect(() => getDirectUploadRule("image", "", "image/jpeg")).toThrow("文件名无效");
    expect(() => getDirectUploadRule("image", "photo.jpg", "")).toThrow("文件类型无效");
  });
});
