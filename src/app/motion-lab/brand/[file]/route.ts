import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves the proposed logo files (docs/brand/logo) to the motion lab, in
 * development only. A production build answers 404, like the lab itself.
 */
const FILE = /^abelkirar-[a-z0-9-]+\.(svg|png)$/;
const TYPES: Record<string, string> = { svg: "image/svg+xml", png: "image/png" };
const DIRECTORY = path.join(process.cwd(), "docs", "brand", "logo");

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const { file } = await params;
  if (!FILE.test(file)) return new Response(null, { status: 404 });
  try {
    const body = await readFile(path.join(DIRECTORY, file));
    return new Response(body, {
      headers: { "Content-Type": TYPES[file.split(".").pop() as string], "Cache-Control": "no-cache" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
