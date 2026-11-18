import { afterEach, describe, expect, it, vi } from "vitest";
import { withDeadline } from "@/lib/ai/call";
import { isCallerCancellation } from "@/lib/ai/failures";
import { providerFallbackWorthTrying } from "@/lib/ai/provider-fallback";

afterEach(() => vi.useRealTimers());
describe("provider deadline origin survives transport cancellation", () => {
  it("reports the known provider timeout when the SDK immediately rejects on abort", async () => {
    vi.useFakeTimers();
    const aborted = vi.fn();
    const pending = withDeadline(10, (signal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted();
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    })).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    const error = await pending;
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ name: "AbortError", message: "the provider did not answer within 10ms" });
    expect(isCallerCancellation(error)).toBe(false);
    expect(providerFallbackWorthTrying(error)).toBe(true);
  });
});
