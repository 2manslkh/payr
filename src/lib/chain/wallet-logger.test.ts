import { expect, it, vi } from "vitest";
import { createSilentWalletLogger } from "./wallet-logger";

it("supplies callable bindings on nested browser children without logging messages", () => {
  const info = vi.spyOn(console, "info"), log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error");
  try {
    const root = createSilentWalletLogger(), child = root.child({ context: "core" }), grandchild = child.child({ context: "relay", role: "transport" });
    expect(root.bindings()).toEqual({}); expect(child.bindings()).toEqual({ context: "core" });
    expect(grandchild.bindings()).toEqual({ context: "relay", role: "transport" });
    for (const logger of [root, child, grandchild]) { logger.info("test only"); logger.error("test only"); logger.trace("test only"); }
    expect(info).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  } finally { info.mockRestore(); log.mockRestore(); error.mockRestore(); }
});
