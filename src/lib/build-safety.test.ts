import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  .scripts as Record<string, string>;
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

describe("application build / schema migration separation", () => {
  it("generates Prisma and compiles without applying migrations", () => {
    expect(scripts.build).toBe("prisma generate && next build");
    expect(scripts.start).toBe("next start");
  });

  it("keeps migration deployment an explicit, separately authorized operation", () => {
    expect(scripts["db:migrate:deploy"]).toBe("prisma migrate deploy");
    expect(Object.entries(scripts).filter(([, command]) => /prisma\s+migrate/.test(command)))
      .toEqual([["db:migrate:deploy", "prisma migrate deploy"]]);
  });

  it("has no automatic install/build/start lifecycle hooks bypassing the safe build", () => {
    // Adding even a benign hook requires this safety test to be reviewed.
    for (const hook of [
      "preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare",
      "postprepare", "prebuild", "postbuild", "prestart", "poststart", "vercel-build",
      "predb:migrate:deploy", "postdb:migrate:deploy",
    ]) expect(scripts[hook], hook).toBeUndefined();
  });

  it("does not override the safe package build/install in Vercel configuration", () => {
    expect(vercel.buildCommand).toBeUndefined();
    expect(vercel.installCommand).toBeUndefined();
    expect(vercel.builds).toBeUndefined();
  });
});
