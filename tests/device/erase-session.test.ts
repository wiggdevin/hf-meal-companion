// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { eraseAccountStorage } from "@/lib/device/erase";

const ID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

describe("eraseAccountStorage", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it("removes the deleted account's unsent feedback draft from sessionStorage", () => {
    sessionStorage.setItem(`smc:u:${ID}:feedback-draft`, "my colitis flared after lunch");
    sessionStorage.setItem(`smc:u:${OTHER}:feedback-draft`, "other account's draft");
    localStorage.setItem(`smc:u:${ID}:prefs`, "{}");

    eraseAccountStorage(ID);

    expect(sessionStorage.getItem(`smc:u:${ID}:feedback-draft`)).toBeNull();
    expect(sessionStorage.getItem(`smc:u:${OTHER}:feedback-draft`)).toBe("other account's draft");
    expect(localStorage.getItem(`smc:u:${ID}:prefs`)).toBeNull();
  });
});
