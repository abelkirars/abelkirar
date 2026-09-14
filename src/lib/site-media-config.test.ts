import { describe, expect, it } from "vitest";
import { allowedMedia, MAX_MEDIA_BYTES, mediaFileType, mediaAccept } from "./site-media-config";

describe("iPhone website video uploads", () => {
  it("accepts QuickTime videos in both video placements", () => {
    expect(allowedMedia("home-performance", "video/quicktime", 1000)).toBe(true);
    expect(allowedMedia("course-sample", "video/quicktime", 1000)).toBe(true);
  });
  it("still rejects oversized videos and videos in the photo placement", () => {
    expect(allowedMedia("home-performance", "video/quicktime", MAX_MEDIA_BYTES + 1)).toBe(false);
    expect(allowedMedia("teacher-photo", "video/quicktime", 1000)).toBe(false);
  });
  it("recognizes uppercase iPhone filenames when Files omits the MIME type", () => {
    expect(mediaFileType({ name: "IMG_1234.MOV", type: "" })).toBe("video/quicktime");
    expect(mediaFileType({ name: "IMG_1234.MOV", type: "application/octet-stream" })).toBe("video/quicktime");
    expect(mediaFileType({ name: "fake.mov", type: "application/pdf" })).toBe("application/pdf");
    expect(mediaAccept("home-performance")).toContain(".mov");
  });
});
