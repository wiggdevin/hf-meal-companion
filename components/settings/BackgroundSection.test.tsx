// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bindAccount, unbindAccount } from "@/lib/device/account";
import { readGround } from "@/lib/design/ground-pref";
import BackgroundSection from "./BackgroundSection";

describe("Settings › Background", () => {
  let h: ReturnType<typeof bindAccount>;
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.ground;
    h = bindAccount("user-a");
  });
  afterEach(() => { cleanup(); unbindAccount(); });

  it("lists two grounds with White on", () => {
    render(<BackgroundSection />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["White", "Black"]);
    expect(screen.getByRole("radio", { name: "White" }).getAttribute("aria-checked")).toBe("true");
  });

  it("paints and keeps the choice for this account only", () => {
    render(<BackgroundSection />);
    fireEvent.click(screen.getByRole("radio", { name: "Black" }));
    expect(document.documentElement.dataset.ground).toBe("black");
    expect(screen.getByRole("radio", { name: "Black" }).getAttribute("aria-checked")).toBe("true");
    expect(readGround(h)).toBe("black");
    unbindAccount();
    expect(readGround(bindAccount("user-b"))).toBe("white");
  });

  it("reads a stored four-ground choice as its two-ground twin", () => {
    localStorage.setItem("smc:u:user-a:ground", "mist");
    expect(readGround(h)).toBe("black");
  });

  it("moves with the arrow keys and keeps one tab stop", () => {
    render(<BackgroundSection />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1]);
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(document.documentElement.dataset.ground).toBe("black");
    expect(screen.getByRole("radio", { name: "Black" }).tabIndex).toBe(0);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Black" }), { key: "ArrowLeft" });
    expect(document.documentElement.dataset.ground).toBe("white");
  });
});
