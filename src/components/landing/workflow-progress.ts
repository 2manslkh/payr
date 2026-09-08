/** Shared chapter positions keep the illustration, caption, and stage links in sync. */
export function workflowProgress(chapters: readonly HTMLElement[], viewportHeight: number, mobile: boolean) {
  const focus = viewportHeight * (mobile ? 0.63 : 0.5);
  const centers = chapters.map((chapter) => {
    const bounds = chapter.getBoundingClientRect();
    return bounds.top + bounds.height * 0.5;
  });
  let progress = 0;
  for (let index = 0; index < centers.length - 1; index++) {
    if (focus >= centers[index]) {
      progress = index + Math.min(1, Math.max(0, (focus - centers[index]) / Math.max(1, centers[index + 1] - centers[index])));
    }
  }
  return progress;
}
