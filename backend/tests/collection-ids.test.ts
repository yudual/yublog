import { describe, expect, it } from "vitest";
import { parseCollectionPostIds } from "../src/routes/posts";

describe("parseCollectionPostIds", () => {
  it("parses valid array of IDs", () => {
    const ids = ["id-1", "id-2", "id-3"];
    expect(parseCollectionPostIds(ids)).toEqual(["id-1", "id-2", "id-3"]);
  });

  it("parses valid JSON string array of IDs", () => {
    const ids = JSON.stringify(["id-1", "id-2"]);
    expect(parseCollectionPostIds(ids)).toEqual(["id-1", "id-2"]);
  });

  it("filters out empty or whitespace-only elements", () => {
    expect(parseCollectionPostIds(["id-1", "", "   ", "id-2"])).toEqual(["id-1", "id-2"]);
    expect(parseCollectionPostIds(JSON.stringify(["id-1", "", null, "id-2"]))).toEqual(["id-1", "id-2"]);
  });

  it("handles malformed JSON gracefully without throwing", () => {
    expect(parseCollectionPostIds("invalid json {")).toEqual([]);
    expect(parseCollectionPostIds("{ not an array }")).toEqual([]);
    expect(parseCollectionPostIds("")).toEqual([]);
    expect(parseCollectionPostIds("   ")).toEqual([]);
  });

  it("handles null, undefined, numbers, and boolean values gracefully", () => {
    expect(parseCollectionPostIds(null)).toEqual([]);
    expect(parseCollectionPostIds(undefined)).toEqual([]);
    expect(parseCollectionPostIds(123)).toEqual([]);
    expect(parseCollectionPostIds(true)).toEqual([]);
    expect(parseCollectionPostIds({})).toEqual([]);
  });

  it("handles JSON object instead of JSON array gracefully", () => {
    expect(parseCollectionPostIds(JSON.stringify({ key: "value" }))).toEqual([]);
    expect(parseCollectionPostIds(JSON.stringify(12345))).toEqual([]);
  });
});
