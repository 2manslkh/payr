# Root Landing Page

## Scope and Outcome

Target: `src/app/page.tsx`. Mode: Persuade. Help independent developers understand the administrative problem after completing work, the invoice-to-settlement mechanism, and what is available now. Primary action: Sign in to Payr at `/login`.

## Approved Direction

The Living Document: large left-aligned headline and a dimensional invoice illustration; a problem section leads into a sticky, scroll-driven five-stage workflow. Precise invoice facts and matching proof are the focus. A small user-approved mascot supports the closing action. Preserve the current theme, live typography, and wordmark; no authentication or payment changes.

The user approved the full vision with explicit status labels, scroll-driven WebGL, and a supporting mascot. After two native Codex image-generation requests failed with network errors, the user explicitly chose **Build With Existing Assets**, approving this composition and waiving generated previews. No generated comp was approved because no comp was produced. Future generated artwork remains deferred, not silently replaced or claimed as shipped.

## Implementation Medium

- Header, headline, problem, stage explanations, capability rows, availability and CTAs: semantic server-rendered HTML and scoped CSS.
- Inert invoice illustration: countable document geometry and live decorative text, not an image-generation substitute represented as photography.
- Workflow: client-only Three.js, procedural document shaders, projected HTML lettering, a geometric wallet, and a verification seal. No live payment calls.
- Mascot: optimized derivative of the existing user-supplied reference; original generator is not recorded.

## Boundaries and States

Dogfood refinements approved 8 September 2026: the decorative document title is "Service delivered." Line-item fills animate inside their rows, with no detached bars covering the header. The wallet step uses a locally served MetaMask logo and a decorative Pay button. Scroll progress presses the button, fades the wallet contents out, and fades a verification checkmark in; it never initializes a wallet SDK or submits a payment. The receipt finale is a full-size document layered over the invoice, bearing a user-requested red PAID stamp. This is an explicitly labeled illustrative future receipt, not an actual generated receipt or a new global meaning for error red.

This release is based on v1.0.0: authoring is API-first and settlement authorization/operator-payment proof exists. Client wallet payments, automatic reconciliation, Claude creation, and automatic receipts are upcoming in this release. Intended payments are client-controlled on Arc Testnet, with Paid caused only by matching settlement verification. Demonstration records are labeled illustrative and contain no live protected links or usable QR codes. See `docs/ops/landing-release.md` for release scope.

The explanation survives no JavaScript, reduced motion, failed WebGL, chunk failure, or context loss. A manual motion-off control restores static art. The renderer loads near visibility, caps pixel density, renders on demand, pauses offscreen/hidden, and disposes resources. Mobile uses a compact sticky scene with native document scrolling; reduced-motion mode removes sticky positioning and tall chapters.

## Verification

Homepage and workflow unit tests; desktop/mobile Playwright coverage for actual WebGL, context loss, motion toggling, reduced motion, no JavaScript, failed WebGL, narrow overflow, and keyboard entry. Inspect hero and workflow screenshots on desktop/mobile together; review the full page and preserve the global design contract.

Historical root-development evidence, not verification of this v1.0.0-based release checkout: on 8 September 2026 the broader working tree passed its production build, 18 focused browser tests, typecheck, and 1,779 unit tests with 13 skipped. Its unrelated wallet-balance warning and screenshot-review **ship** disposition belong to that earlier snapshot. Release gates and review results are recorded separately in `docs/ops/landing-release.md` and the release PR. Minor residual: capped mobile render resolution can show diagonal-edge stair-stepping. No field Core Web Vitals or 60fps claim was verified.
