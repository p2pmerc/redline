import { describe, expect, it } from "vitest";
import { initialTheme } from "./use-theme";

const store = (value: string | null) => ({ getItem: () => value });

describe("initial theme", () => {
  it("is light on a first visit, whatever the OS prefers", () => {
    expect(initialTheme(store(null))).toBe("light");
  });
  it("keeps dark once the visitor chose it", () => {
    expect(initialTheme(store("dark"))).toBe("dark");
  });
  it("treats anything else as light", () => {
    expect(initialTheme(store("system"))).toBe("light");
  });
});
