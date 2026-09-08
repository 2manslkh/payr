import { describe, expect, it } from "vitest";
import { workflowProgress } from "./workflow-progress";

function chapter(top: number, height: number) {
  return { getBoundingClientRect: () => ({ top, height }) } as HTMLElement;
}

describe("workflowProgress", () => {
  it("uses viewport height, not width-dependent intersection margins", () => {
    const chapters = Array.from({ length: 5 }, (_, index) => chapter((index - 3) * 612 + 144, 612));
    expect(workflowProgress(chapters, 900, false)).toBe(3);
  });
  it("uses the reading area below the compact mobile scene", () => {
    const chapters = Array.from({ length: 5 }, (_, index) => chapter((index - 2) * 448 + 280, 448));
    expect(workflowProgress(chapters, 800, true)).toBe(2);
  });
  it("clamps the story before and after its chapters", () => {
    expect(workflowProgress([chapter(1000, 500), chapter(1500, 500)], 800, false)).toBe(0);
    expect(workflowProgress([chapter(-1000, 500), chapter(-500, 500)], 800, false)).toBe(1);
    expect(workflowProgress([], 800, false)).toBe(0);
  });
});
