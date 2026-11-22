/**
 * Fast logging: the service worker receives a shared image (manifest `share_target`), keeps it in
 * its own cache for Today to pick up, and sends the window to the photo capture. Activation must
 * not delete that cache with the old shell caches.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { SHARE_CACHE, SHARED_IMAGE_KEY } from "@/lib/log/shared-image";

const SW_SOURCE = fs.readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");

function loadWorker(keys: string[] = []) {
  const stores = new Map<string, Map<string, Response>>();
  const deleted: string[] = [];
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (req: string | { url: string }, res: Response) => { store.set(typeof req === "string" ? req : req.url, res); },
      match: async (req: string | { url: string }) => store.get(typeof req === "string" ? req : req.url),
    };
  };
  const caches = { open, match: async () => undefined, keys: async () => keys,
    delete: async (key: string) => { deleted.push(key); return true; } };
  const listeners: Record<string, (event: unknown) => void> = {};
  const self = { addEventListener: (t: string, fn: (e: unknown) => void) => { listeners[t] = fn; },
    location: { origin: "https://hf.example" }, skipWaiting: () => {} };
  const context = { self, caches, fetch: async () => new Response("net"), URL, Response, Promise, console };
  vm.createContext(context);
  vm.runInContext(SW_SOURCE, context);
  return { listeners, stores, deleted };
}

function share(listeners: Record<string, (e: unknown) => void>, form: FormData) {
  const request = { method: "POST", mode: "navigate", url: "https://hf.example/log/share",
    formData: async () => form };
  let responded: Promise<Response> | undefined;
  listeners.fetch({ request, respondWith: (p: Promise<Response>) => { responded = p; } });
  return responded;
}

describe("the share target in the service worker", () => {
  it("keeps the shared image and opens the photo capture", async () => {
    const { listeners, stores } = loadWorker();
    const form = new FormData();
    form.append("image", new File([new Uint8Array([1, 2, 3])], "plate.jpg", { type: "image/jpeg" }));
    const response = await share(listeners, form);
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe("https://hf.example/?log=photo&shared=1");
    const kept = stores.get(SHARE_CACHE)?.get(SHARED_IMAGE_KEY);
    expect(kept?.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await kept!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("opens the photo capture without an image when the share held none", async () => {
    const { listeners, stores } = loadWorker();
    const form = new FormData();
    form.append("image", new File(["text"], "note.txt", { type: "text/plain" }));
    const response = await share(listeners, form);
    expect(response?.headers.get("location")).toBe("https://hf.example/?log=photo");
    expect(stores.get(SHARE_CACHE)?.size ?? 0).toBe(0);
  });

  it("leaves other POST requests alone", () => {
    const { listeners } = loadWorker();
    let responded = false;
    listeners.fetch({ request: { method: "POST", mode: "cors", url: "https://hf.example/api/log" },
      respondWith: () => { responded = true; } });
    expect(responded).toBe(false);
  });

  it("uses the same cache names as lib/log/shared-image.ts", () => {
    expect(SW_SOURCE).toContain(`const SHARE_CACHE = "${SHARE_CACHE}";`);
    expect(SW_SOURCE).toContain(`const SHARED_IMAGE_KEY = "${SHARED_IMAGE_KEY}";`);
  });

  it("does not delete the share cache when a new build activates", async () => {
    const { listeners, deleted } = loadWorker(["hf-shell-v2", SHARE_CACHE]);
    let done: Promise<unknown> | undefined;
    listeners.activate({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect(deleted).toEqual(["hf-shell-v2"]);
  });
});
