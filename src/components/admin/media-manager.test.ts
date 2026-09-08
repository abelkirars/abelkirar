import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaManager } from "./media-manager";

describe("website media editor", () => {
  it("allows saving published details without choosing a new file", () => {
    const html = renderToStaticMarkup(createElement(MediaManager, { initialMedia: {
      "home-performance": { url: "https://example.com/performance.mp4", title: "Kirar performance", transcript: "A hymn.", mimeType: "video/mp4" },
    } }));
    const save = html.match(/<button\b[^>]*>Save details<\/button>/)?.[0];
    expect(save).toBeDefined();
    expect(save).not.toMatch(/\sdisabled(?:=|\s|>)/);
    const input = html.match(/<input\b[^>]*id="home-performance-file"[^>]*>/)?.[0];
    expect(input).toBeDefined();
    expect(input).not.toMatch(/\srequired(?:=|\s|>)/);
  });

  it("requires a file for an unpublished placement", () => {
    const html = renderToStaticMarkup(createElement(MediaManager, { initialMedia: {} }));
    expect(html).not.toContain("Save details");
    const uploads = html.match(/<button\b[^>]*>Upload and publish<\/button>/g);
    expect(uploads).toHaveLength(4);
    for (const upload of uploads!) expect(upload).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html.match(/<input\b[^>]*id="home-performance-file"[^>]*>/)?.[0]).toMatch(/\srequired(?:=|\s|>)/);
  });
});
