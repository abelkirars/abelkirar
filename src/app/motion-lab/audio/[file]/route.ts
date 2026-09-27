import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves the lab's Kirar string samples in development only. Kept out of
 * public/ on purpose: a production build answers 404 here, exactly as for the
 * lab pages, so no new public files ship with the live site.
 */
const FILE = /^string-[1-5]\.(webm|mp3)$/;
const TYPES: Record<string, string> = { webm: "audio/webm", mp3: "audio/mpeg" };
const DIRECTORY = path.join(process.cwd(), "src", "app", "motion-lab", "_lab", "audio");

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const { file } = await params;
  if (!FILE.test(file)) return new Response(null, { status: 404 });
  const body = await readFile(path.join(DIRECTORY, file));
  return new Response(body, {
    headers: {
      "Content-Type": TYPES[file.split(".").pop() as string],
      "Cache-Control": "public, max-age=3600",
    },
  });
}
