---
name: Payr
description: Commit Ledger, a precise financial operations system for agent-created invoices and verifiable settlement.
---

<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->

# Design System: Payr

## Overview

**Creative North Star: "Commit Ledger"**

Payr treats every invoice as a versioned financial record: drafted, published, authorized, settled, and receipted. The interface must make that progression legible without collapsing the invoice's commercial lifecycle into its separate payment evidence. It should feel precise enough for financial work and familiar to developers without imitating a code editor or decorating the product with generic crypto motifs.

The visual system is a restrained, document-led workspace. Cool light surfaces carry routine operations; concentrated Payr Navy regions mark cryptographic proof and final settlement. Generous space establishes hierarchy, while ruled ledgers, aligned figures, and explicit state language preserve operational density.

The existing arrow-R monogram remains the recognizable mark. The production wordmark is refined and standardized as `Payr`; it must not retain the inconsistent `PayR` capitalization.

**Key Characteristics:**

- Document-led rather than card-led.
- Quiet routine surfaces with high-contrast proof moments.
- Tabular, aligned financial data and restrained rules.
- Commercial state and payment state shown as separate facts.
- Agent-first actions that lead to Claude rather than a duplicate invoice editor.

## Colors

The strategy is restrained: cool neutrals plus Payr Navy, with semantic colors reserved for actual state.

### Primary

- **Payr Navy** (`#071B3B`): brand mark, primary actions, navigation structure, focus treatment, and settlement-proof fields.

### Neutral

- **Cool Canvas** (`#F3F5F6`): application background and quiet grouped regions.
- **Document White** (`#FFFFFF`): invoice, receipt, table, and focused working surfaces.
- **Muted Ink** (`#68717D`): secondary labels and supporting metadata that still meet contrast requirements.
- **Ledger Rule** (`#DDE2E6`): dividers, field boundaries, and table structure.

### Semantic

- **Proof Green** (`#0F6B4F`): verified settlement and successful delivery only.
- **Attention Amber** (`#8A4B08`): action needed, approaching expiry, or delayed processing.
- **Failure Red** (`#B42318`): destructive actions, failed work, and blocking errors.

Each semantic ink exceeds WCAG AA contrast against Document White and Cool Canvas. On Payr Navy, use white text plus semantic wording or iconography rather than these semantic inks.

**The Proof Is Rare Rule.** Semantic color appears only when it communicates real state. It never decorates neutral content or substitutes for text and iconography.

**The Navy Field Rule.** Large dark regions are reserved for navigation and settlement proof; routine content remains light so proof retains visual authority.

## Typography

**Display and UI Font:** Satoshi Variable (with `Helvetica Neue`, Arial, sans-serif fallbacks)

**Proof Font:** Commit Mono (with `ui-monospace`, SFMono-Regular, Consolas, monospace fallbacks)

Satoshi provides a contemporary grotesk voice without turning Payr into a copy of the supplied references. Commit Mono is restricted to transaction hashes, block numbers, contract addresses, wallet addresses, and similarly technical evidence.

Self-host a pinned font file only with its redistribution license recorded in the repository. If either approved font cannot clear that gate before the design-foundation tranche, use its listed system fallback without a build-time or runtime network fetch.

### Hierarchy

- **Display:** Large, tightly composed page titles and critical financial totals; use sparingly.
- **Headline:** Section-level orientation and primary document identity.
- **Title:** Table groups, proof sections, and focused actions.
- **Body:** Compact but comfortable operational copy with a readable line length.
- **Label:** Sentence-case metadata and control labels; avoid ornamental uppercase tracking.
- **Financial Data:** Tabular figures with right-aligned amounts and unambiguous asset labels.

**The Evidence Type Rule.** Monospace means machine-verifiable evidence. Never use it as a generic technology aesthetic.

## Layout

The public landing page lives at `/`; authenticated application surfaces live under `/app`. Desktop application surfaces use a compact dark workspace rail and a flexible ledger canvas. The rail has no nested accordion hierarchy; destinations remain shallow and predictable: Overview, Invoices, Clients, Activity, Connections, and Settings. Primary content uses open ruled regions rather than a mosaic of floating cards.

Overview surfaces combine one receivables band, one ordered attention list, and one dark settlement-proof focal region. Invoice lists use a single toolbar and full-width ledger. Invoice details pair an immutable document view with a persistent proof rail. Protected payment and receipt surfaces remove dashboard chrome and prioritize the document, exact amount, payee, network, and next safe action.

At tablet widths the workspace rail collapses. On mobile, authenticated surfaces use a concise top bar and bottom navigation for Overview, Invoices, Clients, and Activity; Connections and Settings remain in the account menu. Ledger tables become stacked rows without losing labels, and the protected payment action remains reachable without obscuring invoice facts. Desktop and mobile are designed and verified together.

## Elevation & Depth

The system is flat by default. Hierarchy comes from tonal fields, rules, spacing, and type rather than ambient card shadows. Temporary menus and dialogs may use one restrained structural shadow; proof panels gain prominence through contrast, not glow.

**The Flat Ledger Rule.** Resting surfaces do not float. Shadow indicates temporary layering or interaction state only.

## Shapes

Controls and bounded surfaces use restrained, gently curved corners, provisionally in the 8-12px range until implementation establishes the exact scale. Tables and document regions favor straight rules and larger continuous planes. Pills are limited to compact statuses and environment labels; they are not the default button or container shape.

The arrow-R geometry may inform directional indicators and progress lines, but it must not become a repeated decorative motif. The refined wordmark must use `Payr` capitalization and preserve the monogram's forward-motion idea.

## Do's and Don'ts

### Do:

- **Do** separate commercial lifecycle, payment evidence, receipt generation, and delivery progress.
- **Do** align amounts, dates, and machine evidence for rapid scanning.
- **Do** reserve the strongest contrast for verified settlement and the current primary action.
- **Do** pair every semantic color with explicit text or iconography.
- **Do** meet WCAG AA contrast, visible focus, keyboard navigation, 44px touch targets, and reduced-motion preferences.

### Don't:

- **Don't** clone Request's pale oversized sidebar, generic blue action hierarchy, duplicate status tabs, or overlapping action menu.
- **Don't** copy Plasma's marketing compositions, product-card layouts, or monochrome pages directly.
- **Don't** use glass effects, crypto neon, decorative gradients, generic coin art, or a dashboard card mosaic.
- **Don't** embed a simulated Payr chatbot or add a browser invoice editor; creation remains agent-first.
- **Don't** expose Bills as an MVP capability or introduce batch/autonomous payment controls.
