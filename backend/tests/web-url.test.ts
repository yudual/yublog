import { describe, expect, it } from "vitest";
import {
  isValidImageUrl,
  isValidLinkCard,
  isValidSocialLinks,
  normalizeHttpUrl,
  normalizeLinkCard,
  normalizeSocialLinks,
} from "../src/utils/web-url";

describe("web URL validation", () => {
  it("accepts HTTPS and legacy bare domains, but rejects dangerous schemes and credentials", () => {
    expect(normalizeHttpUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeHttpUrl("data:text/html,hello")).toBeNull();
    expect(normalizeHttpUrl("https://user:pass@example.com")).toBeNull();
    expect(normalizeHttpUrl("//evil.example/path")).toBeNull();
    expect(normalizeHttpUrl("/uploads/a.webp")).toBeNull();
  });

  it("normalizes link cards to the model shape", () => {
    expect(normalizeLinkCard({ url: "example.com", title: 123 })).toEqual({
      url: "https://example.com/",
      title: "",
      description: "",
      image: "",
      siteName: "",
    });
  });

  it("allows local image paths but not protocol-relative paths", () => {
    expect(isValidImageUrl("/uploads/a.webp")).toBe(true);
    expect(isValidImageUrl("https://cdn.example/a.webp")).toBe(true);
    expect(isValidImageUrl("//cdn.example/a.webp")).toBe(false);
    expect(isValidImageUrl("javascript:alert(1)")).toBe(false);
  });

  it("validates nested link-card URLs", () => {
    expect(isValidLinkCard({ url: "example.com", image: "/uploads/card.webp" })).toBe(true);
    expect(normalizeLinkCard({ url: "example.com", image: "/uploads/card.webp" })).toMatchObject({
      url: "https://example.com/",
      image: "/uploads/card.webp",
    });
    expect(isValidLinkCard({ url: "javascript:alert(1)" })).toBe(false);
    expect(isValidLinkCard({ url: "https://example.com", image: "data:image/svg+xml,<svg>" })).toBe(false);
  });

  it("normalizes only safe social-link records", () => {
    const input = JSON.stringify([
      { type: "github", url: "github.com/dual" },
      { type: "email", url: "me@example.com" },
      { type: "bad", url: "javascript:alert(1)" },
    ]);
    expect(isValidSocialLinks(input)).toBe(false);
    expect(normalizeSocialLinks(input)).toBe(JSON.stringify([
      { type: "github", url: "https://github.com/dual" },
      { type: "email", url: "me@example.com" },
    ]));
  });
});
