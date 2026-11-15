import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inventoryCases, runLine, type EvalLine } from "@/scripts/ai-eval";

const boundary = vi.hoisted(() => ({ propose: vi.fn(), sign: vi.fn(), put: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/server/capture", () => ({ proposeDraft: boundary.propose }));
vi.mock("@/lib/server/media", () => ({ signUpload: boundary.sign, deleteMedia: boundary.remove }));
vi.mock("@/lib/capture/upload", () => ({ putSignedUpload: boundary.put }));
const database = {} as SupabaseClient;
const path = "media/test-user/77777777-7777-4777-8777-777777777777.png";
let directory: string;
function fixture(): EvalLine {
  const media = join(directory, "label.png");
  writeFileSync(media, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2vXYAAAAASUVORK5CYII=", "base64"));
  return { method: "label", slot: "meal-1", localDate: "2026-11-14", media, expect: [] };
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "capture-media-"));
  vi.resetAllMocks();
  boundary.sign.mockResolvedValue({ path, uploadUrl: "https://example.test/upload", expiresInSeconds: 60 });
  boundary.put.mockResolvedValue(null);
  boundary.remove.mockResolvedValue(undefined);
  boundary.propose.mockResolvedValue({ draftId: "draft", method: "label", items: [], notes: [],
    spend: { usedToday: 0, softCap: 0 } });
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("live-only fixture boundary", () => {
  it("passes an uploaded owned path to capture and cleans it after success", async () => {
    const line = fixture();
    const result = await runLine(database, database, "test-user", line, inventoryCases([line])[0]);
    expect(boundary.propose).toHaveBeenCalledWith(database, database, "test-user", {
      method: "label", slot: "meal-1", localDate: "2026-11-14", tz: "UTC", mediaPath: path,
    });
    expect(boundary.remove).toHaveBeenCalledWith(database, path);
    expect(result.status).toBe("unlabelled");
  });

  it("cleans a signed fixture without blaming an ambiguous service error on the provider", async () => {
    const line = fixture();
    boundary.propose.mockRejectedValue(Object.assign(new Error("provider down"), { code: "provider_unavailable" }));
    const result = await runLine(database, database, "test-user", line, inventoryCases([line])[0]);
    expect(result.status).toBe("service_unavailable");
    expect(result.errorCode).toBe("provider_unavailable");
    expect(boundary.remove).toHaveBeenCalledWith(database, path);
  });

  it("does not classify spend or duplicate refusal as a provider failure", async () => {
    const line = fixture();
    boundary.propose.mockRejectedValue(Object.assign(new Error("budget refused"), { code: "spend_cap" }));
    const result = await runLine(database, database, "test-user", line, inventoryCases([line])[0]);
    expect(result.status).toBe("capture_failure");
    expect(result.errorCode).toBe("spend_cap");
  });

  it("cleans an upload failure without invoking the provider", async () => {
    const line = fixture();
    boundary.put.mockResolvedValue(503);
    const result = await runLine(database, database, "test-user", line, inventoryCases([line])[0]);
    expect(result.status).toBe("setup_failure");
    expect(result.captureInvoked).toBe(false);
    expect(boundary.propose).not.toHaveBeenCalled();
    expect(boundary.remove).toHaveBeenCalledWith(database, path);
  });

  it("retains the successful case when temporary media cleanup fails", async () => {
    const line = fixture();
    boundary.remove.mockRejectedValue(new Error("storage unavailable"));
    const result = await runLine(database, database, "test-user", line, inventoryCases([line])[0]);
    expect(result.status).toBe("unlabelled");
    expect(result.cleanupError).toContain("cleanup failed");
  });

  it('distinguishes post-draft identity evaluation failure from upload setup failure', async () => {
    const line = fixture();
    boundary.propose.mockResolvedValue({ draftId: 'draft', method: 'label', notes: [],
      spend: { usedToday: 0, softCap: 0 }, items: [{ label: 'milk', grams: 100,
        foodRefId: 'ref-milk', autoResolved: true, alternatives: [] }] });
    const failedReads = { from: () => ({ select: () => ({ in: async () => ({ data: null,
      error: { message: 'local boundary unavailable' } }) }) }) } as unknown as SupabaseClient;
    const result = await runLine(failedReads, database, 'test-user', line, inventoryCases([line])[0]);
    expect(result.status).toBe('evaluation_failure');
    expect(result.captureInvoked).toBe(true);
    expect(boundary.remove).toHaveBeenCalledWith(database, path);
  });
});
