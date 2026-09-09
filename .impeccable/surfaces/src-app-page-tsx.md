---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/page.module.css","src/components/landing/workflow-story.tsx","src/components/landing/workflow-scene.tsx","src/components/landing/workflow.module.css","src/components/landing/roadmap.tsx","src/components/landing/roadmap.module.css"]
---

# Root Landing Page

## Scope and Outcome

Target: `src/app/page.tsx`. Mode: Persuade. Help independent developers understand the administrative problem after completing work, the invoice-to-settlement mechanism, and what is available now. Primary action: Sign in to Payr at `/login`.

## Approved Direction

The Living Document: large left-aligned headline and a dimensional invoice illustration; a problem section leads into a sticky, scroll-driven five-stage workflow. Precise invoice facts and matching proof are the focus. A small user-approved mascot supports the closing action. Preserve the current theme, live typography, and wordmark; no authentication or payment changes.

The user approved the full vision with explicit status labels, scroll-driven WebGL, and a supporting mascot. After two native Codex image-generation requests failed with network errors, the user explicitly chose **Build With Existing Assets**, approving this composition and waiving generated previews. No generated comp was approved because no comp was produced. Future generated artwork remains deferred, not silently replaced or claimed as shipped.

## Implementation Medium

- Header, headline, problem, stage explanations, capability rows, roadmap and CTAs: semantic server-rendered HTML and scoped CSS.
- Inert invoice illustration: countable document geometry and live decorative text, not an image-generation substitute represented as photography.
- Workflow: client-only Three.js, procedural document shaders, projected HTML lettering, a geometric wallet, and a verification seal. No live payment calls.
- Mascot: optimized derivative of the existing user-supplied reference; original generator is not recorded.

## Roadmap

The user-approved availability replacement is "Built today. Going further.": a connected four-stage timeline, horizontal on desktop and vertical below 760px. It preserves the existing typography, navy/light palette, and flat ruled layout. A filled check identifies built Arc Testnet capabilities; outlined markers and explicit Planned labels identify cross-chain CCTP/Relay collection, marketplace distribution and Answer Engine Optimization (AEO), and payment-history-informed invoice financing. Future routes, mainnet listings, and financing are intentions, not available services or committed dates.

Four decorative SVG diagrams have a finite, staggered CSS sequence triggered once when the section enters view, with keyboard-operable pause/resume and replay. Reduced motion disables the animations immediately; text and static artwork survive without JavaScript. No graphics dependency or payment behavior was added. Known non-blocking limitation: on mobile, lower milestones can finish animating before the visitor scrolls to them.

Roadmap verification: 13 focused homepage/roadmap unit tests, six desktop/mobile Chromium checks against a test-managed development server, TypeScript checking, targeted ESLint, and diff whitespace checks passed. Browser checks cover keyboard controls, finite animation completion, live reduced-motion changes, and 320px no-JavaScript readability without overflow. Desktop/mobile screenshots were inspected and independently reviewed with a pass and the mobile-motion caveat above. The mechanical design detector returned no findings. This is scoped development verification, not a new production build or full release gate.

## Boundaries and States

Dogfood refinements approved 8 September 2026: the decorative document title is "Service delivered." Line-item fills animate inside their rows, with no detached bars covering the header. The wallet step uses a locally served MetaMask logo and a decorative Pay button. Scroll progress presses the button, fades the wallet contents out, and fades a verification checkmark in; it never initializes a wallet SDK or submits a payment. The receipt finale is a full-size document layered over the invoice, bearing a user-requested red PAID stamp. This is an explicitly labeled illustrative future receipt, not an actual generated receipt or a new global meaning for error red.

The original landing release was based on v1.0.0. At the 9 September cleanup, released v1.3.0 includes client payments, reconciliation, four-tool MCP, and receipts. Copy separates these implemented capabilities from unproven live Claude/external-wallet rehearsal and disabled automatic email sending. Payments remain client-controlled on Arc Testnet, with Paid caused only by matching settlement verification. Demonstration records are illustrative and contain no live protected links or usable QR codes. See `docs/ops/r09-release.md` for current evidence; `docs/ops/landing-release.md` retains historical landing scope.

The explanation survives no JavaScript, reduced motion, failed WebGL, chunk failure, or context loss. A manual motion-off control restores static art. The renderer loads near visibility, caps pixel density, renders on demand, pauses offscreen/hidden, and disposes resources. Mobile uses a compact sticky scene with native document scrolling; reduced-motion mode removes sticky positioning and tall chapters.

## Verification

Homepage and workflow unit tests; desktop/mobile Playwright coverage for actual WebGL, context loss, motion toggling, reduced motion, no JavaScript, failed WebGL, narrow overflow, and keyboard entry. Inspect hero and workflow screenshots on desktop/mobile together; review the full page and preserve the global design contract.

Historical root-development evidence, not verification of this v1.0.0-based release checkout: on 8 September 2026 the broader working tree passed its production build, 18 focused browser tests, typecheck, and 1,779 unit tests with 13 skipped. Its unrelated wallet-balance warning and screenshot-review **ship** disposition belong to that earlier snapshot. Release gates and review results are recorded separately in `docs/ops/landing-release.md` and the release PR. Minor residual: capped mobile render resolution can show diagonal-edge stair-stepping. No field Core Web Vitals or 60fps claim was verified.
