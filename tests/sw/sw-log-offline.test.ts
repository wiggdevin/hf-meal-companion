import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Fast logging: `/log?mode=…` must work offline. The real public/sw.js runs in a sandbox: with the
 * network down it sends a `/log` navigation on to `/?log=…`, which the cached shell answers.
 */
const SW_SOURCE = fs.readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");

function loadServiceWorker(fetchImpl: (req: unknown) => Promise<Response>) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const self = {
    addEventListener: (type: string, fn: (event: unknown) => void) => { listeners[type] = fn; },
    location: { origin: "https://hf.example" },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  const caches = { open: async () => ({ put: async () => {} }), match: async () => undefined };
  const context = { self, caches, fetch: fetchImpl, URL, URLSearchParams, Response, Promise, console };
  vm.createContext(context);
  vm.runInContext(SW_SOURCE, context);
  return listeners;
}

function navigate(listeners: Record<string, (event: unknown) => void>, url: string) {
  let responded: Promise<Response> | undefined;
  listeners.fetch({ request: { method: "GET", url, mode: "navigate" },
    respondWith: (p: Promise<Response>) => { responded = p; } });
  return responded!;
}

const offline = async () => { throw new TypeError("network offline"); };

describe("the service worker's /log navigation", () => {
  it("passes the server's answer through when online", async () => {
    const listeners = loadServiceWorker(async () => new Response("", { status: 307 }));
    const res = await navigate(listeners, "https://hf.example/log?mode=voice");
    expect(res.status).toBe(307);
  });

  it("offline, sends /log?mode=voice&slot=meal-2 on to Today's own request", async () => {
    const res = await navigate(loadServiceWorker(offline), "https://hf.example/log?mode=voice&slot=meal-2");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://hf.example/?log=voice&slot=meal-2");
  });

  it("offline, drops values it does not know instead of forwarding them", async () => {
    const res = await navigate(loadServiceWorker(offline), "https://hf.example/log?mode=evil&slot=%3Cscript%3E");
    expect(res.headers.get("location")).toBe("https://hf.example/?log=open");
  });
});
