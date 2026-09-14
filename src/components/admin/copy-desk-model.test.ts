import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { copyPages, saveCopyChanges, type CopyChange } from "./copy-desk-model";

const shutdown: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(shutdown.splice(0).map((close) => close())); });

async function endpoint(handle: (body: { changes: CopyChange[] }, response: ServerResponse, request: IncomingMessage) => void) {
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    response.setHeader("Content-Type", "application/json");
    handle(JSON.parse(body), response, request);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  shutdown.push(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  const request: typeof fetch = (url, init) => fetch(`http://127.0.0.1:${address.port}${url}`, init);
  return request;
}

describe("Copy Desk", () => {
  it("keeps every namespace reachable, including future additions", () => {
    const sections = ["hero", "nav", "emails", "futureSection"].map((id) => ({ id, label: id, fields: [] }));
    expect(copyPages(sections).flatMap((page) => page.sections).sort()).toEqual(sections.map((section) => section.id).sort());
    expect(copyPages(sections)[0].id).toBe("home");
  });

  it("sends both languages as separate edits over HTTP and confirms only successful responses", async () => {
    const received: CopyChange[] = [];
    const request = await endpoint((body, response, req) => {
      expect(req.method).toBe("PUT");
      expect(req.url).toBe("/api/admin/content");
      received.push(...body.changes);
      response.end(JSON.stringify({ ok: true }));
    });
    const changes: CopyChange[] = [{ locale: "en", key: "hero.title", value: "New title" }, { locale: "am", key: "hero.title", value: "የክራር ትምህርት" }];
    const confirmed: CopyChange[] = [];
    await saveCopyChanges(changes, (batch) => confirmed.push(...batch), request);
    expect(received).toEqual(changes);
    expect(confirmed).toEqual(changes);
  });

  it.each(["http", "disconnect"])("preserves the first confirmed batch when the next fails: %s", async (failure) => {
    let calls = 0;
    const request = await endpoint((_body, response) => {
      if (++calls === 1) return void response.end(JSON.stringify({ ok: true }));
      if (failure === "disconnect") return response.destroy();
      response.statusCode = 503;
      response.end(JSON.stringify({ error: "Database unavailable" }));
    });
    const changes: CopyChange[] = Array.from({ length: 101 }, (_, index) => ({ locale: "en", key: `field.${index}`, value: `Text ${index}` }));
    const confirmed: CopyChange[] = [];
    await expect(saveCopyChanges(changes, (batch) => confirmed.push(...batch), request)).rejects.toThrow();
    expect(confirmed).toEqual(changes.slice(0, 100));
    expect(calls).toBe(2);
  });
});
