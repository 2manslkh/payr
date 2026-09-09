"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { InvoiceIllustration } from "./invoice-illustration";
import { workflowProgress } from "./workflow-progress";
import styles from "./workflow.module.css";

const WorkflowScene = dynamic(() => import("./workflow-scene"), { ssr: false });
const stages = [
  { id: "confirm-work", label: "Confirm", caption: "Confirmed details. A clear starting point." },
  { id: "publish-invoice", label: "Publish", caption: "One approved, protected invoice." },
  { id: "approve-payment", label: "Pay", caption: "Client-controlled wallet approval." },
  { id: "verify-settlement", label: "Verify", caption: "Settlement matched to the invoice." },
  { id: "close-loop", label: "Receipt", caption: "" },
];

function subscribeMotion(change: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}
function prefersReducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
function serverReducedMotion() { return true; }

class SceneBoundary extends Component<{ children: ReactNode; onFailure: (failed: boolean) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(true); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function WorkflowStory({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const chapters = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [motionOff, setMotionOff] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(0);
  const reduced = useSyncExternalStore(subscribeMotion, prefersReducedMotion, serverReducedMotion);
  const animate = near && !reduced && !motionOff && !failed;
  const webgl = animate && ready;

  useEffect(() => {
    if (!root.current || !chapters.current || !("IntersectionObserver" in window)) return;
    const preload = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); preload.disconnect(); }
    }, { rootMargin: "600px" });
    preload.observe(root.current);
    const elements = Array.from(chapters.current.querySelectorAll<HTMLElement>("[data-workflow-step]"));
    let frame = 0;
    function update() {
      frame = 0;
      setActive(Math.round(workflowProgress(elements, window.innerHeight, window.innerWidth <= 720)));
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    const resize = "ResizeObserver" in window ? new ResizeObserver(() => {
      if (root.current && panel.current) root.current.style.setProperty("--workflow-panel-height", `${panel.current.getBoundingClientRect().height}px`);
      schedule();
    }) : null;
    if (panel.current) resize?.observe(panel.current);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    schedule();
    return () => { preload.disconnect(); resize?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, []);

  return (
    <div className={styles.story} ref={root} data-motion={animate ? "enabled" : "static"}>
      <div className={styles.visualColumn} ref={panel}>
        <div className={styles.visualFrame} data-renderer={webgl ? "webgl" : "static"}>
          <div className={styles.staticScene}><InvoiceIllustration /></div>
          {animate && <SceneBoundary onFailure={setFailed}><WorkflowScene track={chapters} onReady={setReady} onFailure={setFailed} /></SceneBoundary>}
        </div>
        {(!webgl || stages[active].caption) && <div className={styles.sceneCaption}><span>{webgl ? stages[active].caption : "One invoice. A connected record."}</span></div>}
        <nav className={styles.stageNav} aria-label="Workflow stages">
          {stages.map((stage, index) => <a key={stage.id} href={`#${stage.id}`} aria-current={active === index ? "step" : undefined}>{stage.label}</a>)}
        </nav>
        <div className={styles.motionControl}>
          {!reduced && !failed && near ? <button type="button" onClick={() => { setReady(false); setMotionOff(!motionOff); }} aria-pressed={motionOff}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">{motionOff ? <path d="m5 3 7 5-7 5V3Z" stroke="currentColor" /> : <path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="1.5" />}</svg>
            {motionOff ? "Enable animation" : "Turn off animation"}
          </button> : <span>{reduced ? "Reduced motion" : "Static illustration"}</span>}
          <span>{webgl ? "Scroll to explore" : "Every step is explained below"}</span>
        </div>
      </div>
      <div className={styles.chapters} ref={chapters}>{children}</div>
    </div>
  );
}
