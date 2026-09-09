"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./roadmap.module.css";

const milestones = [
  { title: "The foundation is built.", status: "Built on Arc Testnet", description: "From Claude invoice tools to client-approved USDC payments and verified receipts.", detail: "Workspace & clients / Protected PDFs & payment links / Verified reconciliation & receipt PDFs", label: "Invoice to verified payment" },
  { title: "Collect across chains.", status: "Planned / Cross-chain", description: "CCTP for cross-chain USDC. Relay for broader token routing. One invoice, more ways to pay.", detail: "Working toward any chain and currency, subject to supported routes and assets.", label: "Many routes, one invoice" },
  { title: "Be where agents look.", status: "Planned / Discovery", description: "List the Payr skill on agent marketplaces, including Arc Agentic Marketplace on mainnet.", detail: "Answer Engine Optimization (AEO) to help AI assistants discover and recommend Payr.", label: "A skill built to be found" },
  { title: "Put invoices to work.", status: "Planned / Credit", description: "Tokenize invoices and unlock financing against eligible billable amounts.", detail: "Credit eligibility informed by past payment behavior. Financing is not guaranteed.", label: "Payment history informs credit" },
];

export function Roadmap() {
  const section = useRef<HTMLElement>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const element = section.current;
    if (!element || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setStarted(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={section} id="roadmap" className={styles.roadmap} aria-labelledby="roadmap-title" data-started={started} data-paused={paused}>
      <div className={styles.heading}>
        <div><h2 id="roadmap-title">Built today.<br /> <span>Going further.</span></h2></div>
        <div className={styles.intro}><p>From verified invoices to cross-chain payments, agent discovery, and invoice-backed credit.</p>
          <div className={styles.controls}>{started && <>
            <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? "Resume motion" : "Pause motion"}</button>
            <button type="button" onClick={() => { setReplay(replay + 1); setPaused(false); }}>Replay</button>
          </>}</div>
        </div>
      </div>
      <ol className={styles.timeline} key={replay}>
        {milestones.map((milestone, index) => <li key={milestone.title} className={styles.milestone}>
          <div className={styles.station}><span className={styles.marker} aria-hidden="true">{index === 0 ? <svg viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-8" stroke="currentColor" strokeWidth="1.8" /></svg> : `0${index + 1}`}</span><span>{milestone.status}</span></div>
          <figure className={styles.figure}>
            <RoadmapDiagram stage={index} />
            <figcaption>{milestone.label}</figcaption>
          </figure>
          <h3>{milestone.title}</h3>
          <p>{milestone.description}</p>
          <p className={styles.detail}>{milestone.detail}</p>
        </li>)}
      </ol>
      <div className={styles.notes}>
        <p><strong>Testnet, not a mainnet financial service.</strong> Full live Claude and external-wallet acceptance checks remain outstanding. Automatic receipt sending remains disabled.</p>
        <p>Future milestones show direction,<br />not committed release dates.</p>
      </div>
    </section>
  );
}

function RoadmapDiagram({ stage }: { stage: number }) {
  return <svg className={styles.diagram} viewBox="0 0 240 170" fill="none" aria-hidden="true">
    {stage === 0 && <>
      <rect x="21" y="26" width="86" height="116" rx="4" className={styles.paper} />
      <text x="34" y="48">Invoice</text><path d="M34 62h59M34 76h42M34 88h51M34 100h32" className={styles.rule} />
      <path d="M107 87h28v-33h25M135 87v37h25" className={styles.route} />
      <g className={styles.arrive}><rect x="160" y="36" width="59" height="36" rx="4" className={styles.proof} /><path d="m179 53 7 7 13-13" stroke="white" strokeWidth="2" />
      <rect x="160" y="103" width="59" height="42" rx="4" className={styles.paper} /><path d="M172 117h35M172 128h25" className={styles.rule} /></g>
    </>}
    {stage === 1 && <>
      <path d="M75 38h25q16 0 16 16v22q0 10 16 10h23M75 86h80M75 134h25q16 0 16-16V96q0-10 16-10" className={styles.route} />
      {[26, 74, 122].map((y, index) => <g key={y}><rect x="14" y={y} width="61" height="25" rx="12" className={styles.paper} /><text x="44" y={y + 16} textAnchor="middle">{["USDC", "Tokens", "Chains"][index]}</text></g>)}
      <g className={styles.arrive}><rect x="155" y="53" width="71" height="68" rx="4" className={styles.paper} /><text x="190" y="79" textAnchor="middle">Payr</text><path d="M170 92h41M170 102h27" className={styles.rule} /></g>
      <circle cx="116" cy="86" r="5" className={styles.packet} />
    </>}
    {stage === 2 && <>
      <path d="M79 85h35V43h30M114 85h30M114 85v42h30" className={styles.route} />
      <rect x="13" y="55" width="66" height="62" rx="4" className={styles.paper} /><text x="46" y="82" textAnchor="middle">Payr</text><text x="46" y="99" textAnchor="middle" className={styles.smallText}>skill</text>
      <g className={styles.arrive}>{[27, 69, 111].map((y, index) => <g key={y}><rect x="144" y={y} width="85" height="32" rx="4" className={styles.paper} /><text x="186" y={y + 20} textAnchor="middle">{["Arc mainnet", "Marketplaces", "AI discovery"][index]}</text></g>)}</g>
    </>}
    {stage === 3 && <>
      <rect x="15" y="36" width="68" height="87" rx="4" className={styles.paper} /><text x="49" y="59" textAnchor="middle">Invoice</text><path d="M28 73h42M28 84h30M28 95h37" className={styles.rule} />
      <path d="M83 80h27M139 80h22M124 95v40H48" className={styles.route} />
      <path d="m124 62 16 9v18l-16 9-16-9V71Z" className={styles.paper} /><path d="m117 80 5 5 9-10" stroke="currentColor" strokeWidth="1.5" />
      <g className={styles.arrive}><rect x="161" y="52" width="67" height="56" rx="4" className={styles.paper} /><text x="194" y="77" textAnchor="middle">Eligible</text><text x="194" y="93" textAnchor="middle">financing</text></g>
      {[49, 70, 91].map(x => <circle key={x} cx={x} cy="135" r="4" className={styles.history} />)}
    </>}
  </svg>;
}
