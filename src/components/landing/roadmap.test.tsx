import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Roadmap } from "./roadmap";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Roadmap", () => {
  it("separates implemented testnet features from three planned milestones without JavaScript enhancement", () => {
    render(<Roadmap />);
    const roadmap = screen.getByRole("region", { name: "Built today. Going further." });
    const milestones = within(roadmap).getAllByRole("listitem");
    expect(milestones).toHaveLength(4);
    expect(milestones.map(item => within(item).getByRole("heading").textContent)).toEqual([
      "The foundation is built.", "Collect across chains.", "Be where agents look.", "Put invoices to work.",
    ]);
    expect(within(milestones[0]).getByText("Built on Arc Testnet")).toBeDefined();
    expect(within(roadmap).getAllByText(/^Planned \//)).toHaveLength(3);
    expect(roadmap.textContent).toContain("CCTP");
    expect(roadmap.textContent).toContain("Relay");
    expect(roadmap.textContent).toContain("Arc Agentic Marketplace on mainnet");
    expect(roadmap.textContent).toContain("Answer Engine Optimization (AEO)");
    expect(roadmap.textContent).toContain("Financing is not guaranteed");
    expect(roadmap.textContent).toContain("Automatic receipt sending remains disabled");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("starts once on entry, supports pause/resume and replay, and cleans up its observer", () => {
    let enter: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { enter = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const { unmount } = render(<Roadmap />);
    const roadmap = screen.getByRole("region");
    expect(roadmap.dataset.started).toBe("false");
    act(() => enter([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(roadmap.dataset.started).toBe("true");
    expect(disconnect).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(roadmap.dataset.paused).toBe("true");
    expect(screen.getByRole("button", { name: "Resume motion" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Resume motion" }));
    expect(roadmap.dataset.paused).toBe("false");
    const oldList = screen.getByRole("list");
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByRole("list")).not.toBe(oldList);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
