import { describe, expect, it } from "vitest";
import { shortAccount } from "./near-account";

describe("shortAccount", () => {
  it("keeps short named accounts whole", () => expect(shortAccount("ada.testnet")).toBe("ada.testnet"));
  it("truncates long named accounts in the middle", () => expect(shortAccount("p2pmerch.redline-escrow.testnet")).toBe("p2pmerch.…w.testnet"));
  it("truncates implicit accounts", () => expect(shortAccount("a".repeat(58) + "123456")).toBe("aaaaaa…123456"));
});
