import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { WorkflowStory } from "./workflow-story";

vi.mock("next/dynamic", () => ({
  default: () => function MockScene({ onReady, onFailure }: { onReady: (ready: boolean) => void; onFailure: (failed: boolean) => void }) {
    useEffect(() => { onReady(true); }, [onReady]);
    return <button data-testid="scene" onClick={() => onFailure(true)}>Simulate renderer failure</button>;
  },
}));

let reduced = false;
let motionChange: () => void;
let observers: { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }[];

beforeEach(() => {
  reduced = false;
  observers = [];
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener: (_: string, change: () => void) => { motionChange = change; }, removeEventListener: vi.fn() }));
  vi.stubGlobal("IntersectionObserver", class {
    disconnect = vi.fn();
    observe = vi.fn();
    constructor(callback: IntersectionObserverCallback) { observers.push({ callback, disconnect: this.disconnect }); }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function nearViewport() {
  act(() => observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
}
function story() {
  return render(<WorkflowStory><article data-workflow-step="0" id="confirm-work">Confirmed work</article><article data-workflow-step="4" id="close-loop">Receipts are coming next</article></WorkflowStory>);
}

describe("WorkflowStory", () => {
  it("keeps the complete explanation and static illustration before the renderer loads", () => {
    const { container } = story();
    expect(screen.queryByTestId("scene")).toBeNull();
    expect(container.querySelector('[data-renderer="static"]')).not.toBeNull();
    expect(screen.getByText("Confirmed work")).toBeDefined();
    expect(screen.getByText("Receipts are coming next")).toBeDefined();
    expect(screen.getByRole("link", { name: "Receipt" }).getAttribute("href")).toBe("#close-loop");
  });
  it("loads near the viewport and lets the user turn motion off and back on", () => {
    const { container } = story();
    nearViewport();
    expect(screen.getByTestId("scene")).toBeDefined();
    expect(container.querySelector('[data-renderer="webgl"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Turn off animation" }));
    expect(screen.queryByTestId("scene")).toBeNull();
    expect(container.querySelector('[data-renderer="static"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enable animation" }));
    expect(screen.getByTestId("scene")).toBeDefined();
  });
  it("never loads WebGL for reduced motion and responds to preference changes", () => {
    reduced = true;
    story();
    nearViewport();
    expect(screen.queryByTestId("scene")).toBeNull();
    expect(screen.getByText("Reduced motion")).toBeDefined();
    act(() => { reduced = false; motionChange(); });
    expect(screen.getByTestId("scene")).toBeDefined();
    act(() => { reduced = true; motionChange(); });
    expect(screen.queryByTestId("scene")).toBeNull();
  });
  it("restores the static illustration on renderer failure", () => {
    const { container } = story();
    nearViewport();
    fireEvent.click(screen.getByTestId("scene"));
    expect(screen.queryByTestId("scene")).toBeNull();
    expect(container.querySelector('[data-renderer="static"]')).not.toBeNull();
    expect(screen.getByText("Static illustration")).toBeDefined();
    expect(screen.getByText("Receipts are coming next")).toBeDefined();
  });
  it("disconnects its observers on unmount", () => {
    const { unmount } = story();
    unmount();
    expect(observers).toHaveLength(1);
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
  });
});
