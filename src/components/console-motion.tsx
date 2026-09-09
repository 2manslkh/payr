"use client";

import { useEffect, useRef } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = element.current;
    if (!node || !window.IntersectionObserver) return;
    let visible = false;
    const update = () => { node.dataset.active = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div className={`skeleton ${className}`} aria-hidden="true" ref={element} />;
}

export function AnimatedNumber({ value }: { value: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const visual = useRef<HTMLSpanElement>(null);
  const size = useRef<HTMLSpanElement>(null);
  const previous = useRef(0n);
  useEffect(() => {
    const container = root.current;
    const preview = visual.current;
    const reservation = size.current;
    if (!container || !preview || !reservation || !/^\d+(\.\d{1,18})?$/.test(value)) return;
    const [whole, fraction = ""] = value.split(".");
    const scale = 10n ** 18n;
    const target = BigInt(whole) * scale + BigInt(fraction.padEnd(18, "0"));
    const from = previous.current;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function finish() {
      cancelAnimationFrame(frame);
      previous.current = target;
      container!.removeAttribute("data-animating");
      preview!.textContent = "";
      reservation!.textContent = "";
    }
    if (!preference || preference.matches || document.hidden || from === target) {
      finish();
      return;
    }
    // Only time/easing use floating point. Financial values stay exact integers.
    reservation.textContent = `${(from > target ? from : target) / scale}${fraction.length ? `.${"0".repeat(fraction.length)}` : ""}`;
    const started = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - started) / 720);
      if (progress >= 1) { finish(); return; }
      const eased = BigInt(Math.round((1 - (1 - progress) ** 4) * 10_000));
      const current = from + (target - from) * eased / 10_000n;
      previous.current = current;
      const decimals = fraction.length ? `.${(current % scale).toString().padStart(18, "0").slice(0, fraction.length)}` : "";
      preview!.textContent = `${current / scale}${decimals}`;
      container!.setAttribute("data-animating", "true");
      frame = requestAnimationFrame(tick);
    }
    const reduce = () => { if (preference!.matches) finish(); };
    const hide = () => { if (document.hidden) finish(); };
    frame = requestAnimationFrame(tick);
    preference.addEventListener("change", reduce);
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelAnimationFrame(frame);
      container.removeAttribute("data-animating");
      preview.textContent = "";
      reservation.textContent = "";
      preference.removeEventListener("change", reduce);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [value]);
  return <span className="animated-number" ref={root}>
    <span data-number-value>{value}</span>
    <span className="animated-number-preview" aria-hidden="true" ref={visual} />
    <span data-number-size aria-hidden="true" ref={size} />
  </span>;
}
