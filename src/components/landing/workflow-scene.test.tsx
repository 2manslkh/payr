import { cleanup, render } from "@testing-library/react";
import { StrictMode, createRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import WorkflowScene from "./workflow-scene";

const renderers = vi.hoisted(() => [] as { canvas: HTMLCanvasElement; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; forceContextLoss: ReturnType<typeof vi.fn> }[]);

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  return {
    ...three,
    WebGLRenderer: class {
      debug = {};
      outputColorSpace = "";
      setClearColor = vi.fn();
      setPixelRatio = vi.fn();
      setSize = vi.fn();
      render = vi.fn((scene: import("three").Scene, camera: import("three").Camera) => {
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
      });
      dispose = vi.fn();
      forceContextLoss: ReturnType<typeof vi.fn>;
      constructor({ canvas }: { canvas: HTMLCanvasElement }) {
        // WEBGL_lose_context delivers its event asynchronously, after cleanup may finish.
        this.forceContextLoss = vi.fn(() => setTimeout(() => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })), 0));
        renderers.push({ canvas, render: this.render, dispose: this.dispose, forceContextLoss: this.forceContextLoss });
      }
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  renderers.length = 0;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(550);
  vi.stubGlobal("IntersectionObserver", class {
    disconnected = false;
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { setTimeout(() => { if (!this.disconnected) this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }, 0); }
    disconnect() { this.disconnected = true; }
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("keeps rendering when Strict Mode replays effects and the retired context emits a late loss event", async () => {
  const track = createRef<HTMLDivElement>();
  track.current = document.createElement("div");
  const onFailure = vi.fn();
  const onReady = vi.fn();
  const { container, unmount } = render(<StrictMode><WorkflowScene track={track} onFailure={onFailure} onReady={onReady} /></StrictMode>);
  await act(() => vi.advanceTimersByTimeAsync(100));

  expect(renderers).toHaveLength(2);
  expect(onFailure).not.toHaveBeenCalled();
  expect(onReady).toHaveBeenCalledWith(true);
  expect(container.querySelectorAll("canvas")).toHaveLength(1);
  expect(renderers[1].render).toHaveBeenCalled();
  unmount();
  expect(renderers.every((renderer) => renderer.dispose.mock.calls.length === 1 && renderer.forceContextLoss.mock.calls.length === 1)).toBe(true);
});
