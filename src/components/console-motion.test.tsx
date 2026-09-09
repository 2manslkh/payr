import { act, cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnimatedNumber, Skeleton } from "./console-motion";

let reduce: () => void;
let frame: FrameRequestCallback;
const preference = { matches: false, addEventListener: vi.fn((_event, listener) => { reduce = listener; }), removeEventListener: vi.fn() };
beforeEach(() => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("matchMedia", vi.fn(() => preference));
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback) => { frame = callback; return 1; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  preference.matches = false;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("server renders the exact final value without depending on motion or JavaScript", () => {
  const html = renderToStaticMarkup(<AnimatedNumber value="9007199254740993.000000000000000001" />);
  expect(html).toContain('data-number-value="true">9007199254740993.000000000000000001');
  expect(html).not.toContain("data-animating");
});
it("animates exact integer math while keeping accessible final text stable", () => {
  const { container } = render(<AnimatedNumber value="9007199254740993.000000000000000001" />);
  act(() => frame(360));
  expect(container.querySelector("[data-animating]")).not.toBeNull();
  expect(container.querySelector("[data-number-value]")?.textContent).toBe("9007199254740993.000000000000000001");
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("8444249301319680.937500000000000000");
  act(() => frame(720));
  expect(container.textContent).toBe("9007199254740993.000000000000000001");
  expect(container.querySelector("[data-animating]")).toBeNull();
});
it("updates from the previous amount, including decreases, and cancels on unmount", () => {
  const { container, rerender, unmount } = render(<AnimatedNumber value="1000" />);
  act(() => frame(720));
  rerender(<AnimatedNumber value="0" />);
  act(() => frame(0));
  expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("1000");
  expect(container.querySelector("[data-number-size]")?.textContent).toBe("1000");
  act(() => frame(720));
  expect(container.textContent).toBe("0");
  unmount();
  expect(cancelAnimationFrame).toHaveBeenCalled();
});
it("skips reduced motion and responds immediately when the preference changes", () => {
  preference.matches = true;
  const { container, rerender } = render(<AnimatedNumber value="12" />);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  preference.matches = false;
  rerender(<AnimatedNumber value="24" />);
  act(() => frame(360));
  preference.matches = true;
  act(() => reduce());
  expect(container.textContent).toBe("24");
  expect(container.querySelector("[data-animating]")).toBeNull();
});
it("pauses skeletons offscreen and while the document is hidden", () => {
  let intersection: (entries: { isIntersecting: boolean }[]) => void;
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof intersection) { intersection = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  const { container, unmount } = render(<Skeleton />);
  act(() => intersection([{ isIntersecting: true }]));
  expect(container.firstElementChild?.getAttribute("data-active")).toBe("true");
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(container.firstElementChild?.getAttribute("data-active")).toBe("false");
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
