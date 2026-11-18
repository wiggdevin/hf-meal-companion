import { describe, expect, it } from "vitest";
import { providerFallbackWorthTrying } from "@/lib/ai/provider-fallback";
import { worthGemini } from "@/lib/ai/capture";
import { worthGeminiFallback } from "@/lib/server/onboarding-extract";

const abort = (message: string) => Object.assign(new Error(message), { name: "AbortError" });
describe("provider fallback distinguishes cancellation from provider timeout", () => {
  it.each([providerFallbackWorthTrying, worthGemini, worthGeminiFallback])("keeps caller cancellation final", (predicate) => {
    for (const message of ["the caller stopped waiting for the model", "This operation was aborted"])
      expect(predicate(abort(message))).toBe(false);
    expect(predicate(abort("the provider did not answer within 5000ms"))).toBe(true);
    expect(predicate(abort("timed out"))).toBe(true);
  });
});
