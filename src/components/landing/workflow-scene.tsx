"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { workflowProgress } from "./workflow-progress";
import styles from "./workflow.module.css";

const vertexShader = `
  varying vec2 vUv;
  varying float vLift;
  uniform float uBend;
  void main() {
    vUv = uv;
    vec3 p = position;
    vLift = pow(uv.y, 3.0) * sin(uv.x * 3.14159) * uBend;
    p.z += vLift;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

// Geometric document rules, not rasterized UI: all explanatory text stays in HTML.
const fragmentShader = `
  varying vec2 vUv;
  varying float vLift;
  uniform float uProgress;
  uniform float uProof;
  uniform float uReceipt;
  uniform float uOpacity;
  uniform vec3 uNavy;
  float rect(vec2 p, vec2 center, vec2 halfSize) {
    vec2 d = abs(p - center) - halfSize;
    return 1.0 - smoothstep(-0.001, 0.002, max(d.x, d.y));
  }
  void main() {
    vec2 p = vUv;
    vec3 navy = uNavy;
    vec3 white = vec3(0.99, 0.995, 1.0);
    vec3 base = mix(white, navy, uProof);
    vec3 ink = mix(navy, vec3(0.82, 0.89, 0.96), uProof);
    float printed = uProof;
    float lines = rect(p, vec2(0.25,0.88), vec2(0.14,0.012)) * printed;
    lines += rect(p, vec2(0.77,0.88), vec2(0.1,0.008)) * 0.45 * printed;
    lines += rect(p, vec2(0.39,0.73), vec2(0.28,0.024)) * printed;
    lines += rect(p, vec2(0.3,0.66), vec2(0.19,0.006)) * 0.35 * printed;
    for (int i = 0; i < 4; i++) {
      float y = 0.52 - float(i) * 0.069;
      // Fill each line inside its own row, never over the document header.
      float fill = mix(0.2, 1.0, smoothstep(float(i) * 0.14, 0.55 + float(i) * 0.14, uProgress));
      float width = 0.42 * fill;
      lines += rect(p, vec2(0.11 + width * 0.5,y), vec2(width * 0.5,0.005)) * 0.30;
      lines += rect(p, vec2(0.77,y), vec2(0.1,0.005)) * 0.65;
      lines += rect(p, vec2(0.49,y-0.023), vec2(0.38,0.0007)) * 0.20;
    }
    lines += rect(p, vec2(0.63,0.17), vec2(0.24,0.018)) * printed;
    lines += rect(p, vec2(0.24,0.09), vec2(0.13,0.004)) * 0.45 * printed;
    float reveal = smoothstep(0.0, 0.7, uProgress + (1.0 - p.y) * 0.2);
    vec3 color = mix(base, ink, clamp(lines,0.0,1.0) * mix(reveal,1.0,uProof));
    float sweep = exp(-pow((p.y - (uProgress - 0.6) * 1.8) * 32.0, 2.0));
    color = mix(color, vec3(0.73,0.82,0.91), sweep * 0.35 * (1.0-uProof));
    color *= 1.0 - vLift * 0.17;
    // The receipt is an illustrative preview; the surrounding chapter labels it upcoming.
    color = mix(color, vec3(0.90,0.93,0.95), uReceipt * 0.12);
    gl_FragColor = vec4(color,uOpacity);
    #include <colorspace_fragment>
  }
`;

type Props = { track: RefObject<HTMLDivElement | null>; onReady: (ready: boolean) => void; onFailure: (failed: boolean) => void };

export default function WorkflowScene({ track, onReady, onFailure }: Props) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const documentLabel = useRef<HTMLDivElement>(null);
  const receiptLabel = useRef<HTMLDivElement>(null);
  const walletLabel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host || !track.current) return;
    if (!("ResizeObserver" in window)) { onFailure(true); return; }
    // Strict Mode replays effects. A retired context must not poison the next renderer's canvas.
    const element = document.createElement("canvas");
    element.className = styles.canvas;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: element, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      onFailure(true);
      return;
    }
    host.appendChild(element);

    let disposed = false;
    let frame = 0;
    let lastFrameTime = 0;
    let visible = false;
    let announced = false;
    let progress = 0;
    let targetProgress = 0;
    let tilt = 0;
    let targetTilt = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-3.2, 3.2, 3.2, -3.2, 0.1, 50);
    camera.position.z = 10;
    renderer.setClearColor(0xf3f5f6, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.debug.onShaderError = () => onFailure(true);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const documentGeometry = new THREE.PlaneGeometry(2.45, 3.35, 32, 40);
    geometries.push(documentGeometry);

    function paper(proof = false, receipt = false) {
      const material = new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: { uBend: { value: 0.2 }, uProgress: { value: 0 }, uProof: { value: proof ? 1 : 0 }, uReceipt: { value: receipt ? 1 : 0 }, uOpacity: { value: 1 }, uNavy: { value: new THREE.Color(0x071b3b) } },
        transparent: receipt,
        side: THREE.DoubleSide,
      });
      materials.push(material);
      return new THREE.Mesh(documentGeometry, material);
    }

    const assembly = new THREE.Group();
    scene.add(assembly);
    const shadowGeometry = new THREE.PlaneGeometry(5.5, 5.7);
    const shadowMaterial = new THREE.ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
      fragmentShader: "varying vec2 vUv; void main(){ vec2 d=max(abs(vUv-0.5)-vec2(0.12,0.17),0.0); gl_FragColor=vec4(0.027,0.106,0.231,exp(-dot(d,d)*70.0)*0.12); }",
      transparent: true, depthWrite: false,
    });
    geometries.push(shadowGeometry);
    materials.push(shadowMaterial);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.set(0.26, -0.43, -1.1);
    assembly.add(shadow);
    const proof = paper(true);
    assembly.add(proof);
    const backingMaterial = new THREE.MeshBasicMaterial({ color: 0xd9e1e8, side: THREE.DoubleSide });
    materials.push(backingMaterial);
    const backing = new THREE.Mesh(documentGeometry, backingMaterial);
    backing.position.set(-0.15, -0.1, -0.12);
    backing.rotation.z = 0.055;
    assembly.add(backing);
    const invoice = paper();
    assembly.add(invoice);
    const receipt = paper(false, true);
    assembly.add(receipt);

    const wallet = new THREE.Group();
    wallet.position.set(1.75, 0.35, 0.35);
    assembly.add(wallet);

    const pathGeometry = new THREE.BufferGeometry().setFromPoints(new THREE.CubicBezierCurve3(
      new THREE.Vector3(-2.6, -1.8, -0.8), new THREE.Vector3(-1.1, -2.8, -0.8), new THREE.Vector3(2.8, -2.2, -0.8), new THREE.Vector3(2.6, 1.4, -0.8),
    ).getPoints(96));
    const pathMaterial = new THREE.LineDashedMaterial({ color: 0xb0bfce, dashSize: 0.035, gapSize: 0.09 });
    geometries.push(pathGeometry);
    materials.push(pathMaterial);
    const path = new THREE.Line(pathGeometry, pathMaterial);
    path.computeLineDistances();
    scene.add(path);

    const chapters = Array.from(track.current.querySelectorAll<HTMLElement>("[data-workflow-step]"));
    const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const clamp = THREE.MathUtils.clamp;
    function placeLabel(mesh: THREE.Object3D, label: HTMLDivElement, width = 245, height = 335) {
      corners[0].set(-width / 200, height / 200, 0.01);
      corners[1].set(width / 200, height / 200, 0.01);
      corners[2].set(-width / 200, -height / 200, 0.01);
      for (const point of corners) {
        point.applyMatrix4(mesh.matrixWorld).project(camera);
        point.x = (point.x * 0.5 + 0.5) * element.clientWidth;
        point.y = (-point.y * 0.5 + 0.5) * element.clientHeight;
      }
      const [a, b, c] = corners;
      label.style.transform = `matrix(${(b.x-a.x)/width},${(b.y-a.y)/width},${(c.x-a.x)/height},${(c.y-a.y)/height},${a.x},${a.y})`;
    }
    function measureProgress() {
      targetProgress = workflowProgress(chapters, window.innerHeight, window.innerWidth <= 720);
    }

    function render(time: number) {
      frame = 0;
      if (disposed || !visible || document.hidden) return;
      const delta = lastFrameTime ? Math.min(0.25, (time - lastFrameTime) / 1000) : 1 / 60;
      lastFrameTime = time;
      progress = THREE.MathUtils.damp(progress, targetProgress, 9, delta);
      tilt = THREE.MathUtils.damp(tilt, targetTilt, 8, delta);
      const publish = clamp(progress, 0, 1);
      const pay = THREE.MathUtils.smoothstep(progress, 1.3, 2.5);
      const verify = THREE.MathUtils.smoothstep(progress, 2.55, 3.15);
      const close = THREE.MathUtils.smoothstep(progress, 3.4, 4);
      assembly.rotation.set(-0.14 + tilt * 0.2, -0.27 + tilt, -0.09 + publish * 0.025);
      assembly.position.set(-0.2 - pay * 0.25, 0.12, 0);
      assembly.scale.setScalar(1.05 + publish * 0.025);
      invoice.material.uniforms.uProgress.value = progress;
      invoice.material.uniforms.uBend.value = 0.8 * (1 - publish) + 0.13;
      proof.material.uniforms.uProgress.value = progress;
      proof.material.uniforms.uBend.value = 0.05;
      proof.position.set(0.24 + pay * 1.2 * (1 - close), -0.18 - pay * 0.23 * (1 - close), -0.3);
      proof.rotation.z = -0.05 - pay * 0.12 * (1 - close);
      proof.scale.setScalar(0.97 - pay * 0.06);
      const approval = THREE.MathUtils.smoothstep(progress, 1.35, 1.8) * (1 - close);
      const press = THREE.MathUtils.smoothstep(progress, 2.08, 2.22) * (1 - THREE.MathUtils.smoothstep(progress, 2.3, 2.4));
      const dismiss = THREE.MathUtils.smoothstep(progress, 2.35, 2.85);
      const approach = THREE.MathUtils.smoothstep(progress, 1.9, 2.08);
      receipt.visible = close > 0.001;
      receipt.position.set(0.12 + (1 - close) * 0.5, 0.12 + (1 - close) * 0.55, 0.4);
      receipt.rotation.z = -0.035;
      receipt.material.uniforms.uOpacity.value = close;
      receipt.material.uniforms.uProgress.value = 1;
      receipt.material.uniforms.uBend.value = 0.05;
      try {
        renderer.render(scene, camera);
        // Orthographic projection maps the semantic document lettering onto its 3D plane.
        if (documentLabel.current) {
          placeLabel(invoice, documentLabel.current);
          documentLabel.current.style.visibility = close > 0.001 ? "hidden" : "visible";
        }
        if (receiptLabel.current) {
          placeLabel(receipt, receiptLabel.current);
          receiptLabel.current.style.visibility = receipt.visible ? "visible" : "hidden";
          receiptLabel.current.style.opacity = String(close);
        }
        if (walletLabel.current) {
          placeLabel(wallet, walletLabel.current, 180, 192);
          walletLabel.current.style.visibility = approval > 0.001 ? "visible" : "hidden";
          walletLabel.current.style.opacity = String(approval);
          walletLabel.current.style.setProperty("--wallet-content-opacity", String(1 - dismiss));
          walletLabel.current.style.setProperty("--wallet-check-opacity", String(verify));
          walletLabel.current.style.setProperty("--wallet-press", String(press));
          walletLabel.current.style.setProperty("--wallet-pointer-opacity", String(approach * (1 - dismiss)));
          walletLabel.current.style.setProperty("--wallet-pointer-offset", `${(1 - approach) * 18}px`);
          walletLabel.current.dataset.paymentState = verify > 0.99 ? "verified" : progress >= 2.08 ? "clicked" : "review";
        }
        element!.dataset.frameState = Math.abs(progress - targetProgress) < 0.005 ? "settled" : "moving";
        if (!announced) { announced = true; onReady(true); }
      } catch {
        onFailure(true);
        return;
      }
      if (Math.abs(progress - targetProgress) > 0.0005 || Math.abs(tilt - targetTilt) > 0.0005) schedule();
      else lastFrameTime = 0;
    }

    function schedule() {
      if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(render);
    }
    function onScroll() { measureProgress(); schedule(); }
    function resize() {
      const width = element!.clientWidth;
      const height = element!.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const halfHeight = Math.max(2.7, 3.05 / aspect);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      measureProgress();
      schedule();
    }
    function onPointer(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      const r = element!.getBoundingClientRect();
      targetTilt = clamp(((event.clientX - r.left) / r.width - 0.5) * 0.12, -0.06, 0.06);
      schedule();
    }
    function resetPointer() { targetTilt = 0; schedule(); }
    function visibilityChange() {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastFrameTime = 0; }
      else { measureProgress(); schedule(); }
    }
    function contextLost(event: Event) { event.preventDefault(); onReady(false); onFailure(true); }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) { measureProgress(); schedule(); }
      else { cancelAnimationFrame(frame); frame = 0; lastFrameTime = 0; }
    });
    const resizeObserver = new ResizeObserver(resize);
    observer.observe(element);
    resizeObserver.observe(element);
    element.addEventListener("webglcontextlost", contextLost);
    element.addEventListener("pointermove", onPointer);
    element.addEventListener("pointerleave", resetPointer);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", visibilityChange);
    resize();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      element.removeEventListener("webglcontextlost", contextLost);
      element.removeEventListener("pointermove", onPointer);
      element.removeEventListener("pointerleave", resetPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibilityChange);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      element.remove();
    };
  }, [track, onReady, onFailure]);

  return <>
    <div ref={canvasHost} className={styles.canvas} aria-hidden="true" />
    <div ref={documentLabel} className={styles.canvasDocument} aria-hidden="true" data-invoice-label>
      <div className={styles.canvasDocumentHeader}><strong>Payr</strong><span>Invoice</span></div>
      <span className={styles.canvasDocumentNumber}>PAYR-0042</span>
      <span className={styles.canvasDocumentTitle}>Service delivered.</span>
      <div className={styles.canvasDocumentTotal}><span>Invoice total</span><strong>2,400.00 <small>USDC</small></strong></div>
      <span className={styles.canvasDocumentFooter}>Protected payment link</span>
    </div>
    <div ref={receiptLabel} className={styles.canvasDocument} aria-hidden="true" data-receipt-preview>
      <div className={styles.canvasDocumentHeader}><strong>Payr</strong><span>Receipt</span></div>
      <span className={styles.canvasDocumentNumber}>For invoice PAYR-0042</span>
      <span className={styles.canvasDocumentTitle}>Service delivered.</span>
      <span className={styles.paidStamp}>PAID</span>
      <div className={styles.canvasDocumentTotal}><span>Amount paid</span><strong>2,400.00 <small>USDC</small></strong></div>
      <span className={styles.canvasDocumentFooter}>Illustrative receipt / Coming next</span>
    </div>
    <div ref={walletLabel} className={styles.walletPreview} aria-hidden="true" data-wallet-preview>
      <div className={styles.walletContents} data-wallet-contents>
        <div className={styles.walletBrand}>
          {/* A local decorative brand asset; no wallet SDK is initialized. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/metamask-fox.svg" width={28} height={28} alt="" />
          <strong>MetaMask</strong>
        </div>
        <span className={styles.walletNetwork}>Arc Testnet</span>
        <span className={styles.walletAmount}>2,400.00 <small>USDC</small></span>
        <span className={styles.walletPay} data-wallet-pay>Pay</span>
        <small className={styles.walletFootnote}>Illustrative payment</small>
      </div>
      <svg className={styles.walletPointer} width="24" height="28" viewBox="0 0 24 28" fill="none"><path d="m3 2 17 13-8 1-4 8L3 2Z" fill="#071B3B" stroke="white" strokeWidth="2" strokeLinejoin="round" /></svg>
      <div className={styles.walletCheck} data-wallet-check><svg viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="1.5" /><path d="m24 40 11 11 22-24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg><span>Payment verified</span></div>
    </div>
  </>;
}
