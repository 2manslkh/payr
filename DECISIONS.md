# Decisions

Record choices that are consequential, hard to reverse, or likely to be questioned later. Do not use this as a daily activity log.

| Date | Decision | Reason | Alternatives rejected | Revisit when |
| --- | --- | --- | --- | --- |
| 2026-09-03 | Optimize for one credible end-to-end journey and a reliable three-minute demo | Hackathon judging rewards clarity and proof more than incomplete breadth | Broad feature set; sponsor-integration collage | The core journey is proven and schedule has slack |
| 2026-09-04 | Build Payr for independent developers billing crypto-native international clients | Keng has firsthand evidence of the invoicing, currency-access, and receipt problem | Autonomous accounts payable; generic A2A/A2C protocol | Repeated freelancer use is disproven |
| 2026-09-04 | The agent drafts and publishes after explicit freelancer approval; the client controls payment from an existing wallet | Preserves agent value without unsafe or scope-heavy autonomous spending | Agent-controlled payer wallet; approval-free publication | Core human-paid flow is proven and additional time exists |
| 2026-09-04 | Use saved sender/client profiles; prompt only for client, work, amount, and due date | Minimizes repetitive data entry without unreliable public-data scraping | Every field in each prompt; web-scraped legal data | User testing shows setup cost exceeds saved time |
| 2026-09-04 | Keep complete invoice data offchain and publish only a salted commitment plus settlement metadata | Protects business details while preserving tamper evidence and reconciliation | Public invoice record; invoice NFT | A specific disclosure/composability need appears |
| 2026-09-04 | Settle exact native USDC through a minimal Arc contract | Enables single-transaction payment, replay protection, and deterministic invoice-linked events | Direct wallet transfer; escrow; ERC-20 approval flow | Arc testnet behavior invalidates the native-value path |
| 2026-09-04 | Make Payr API/MCP-first and demo it in Claude | Avoids building a decorative chat UI while showing an accessible agent workflow | Telegram-only agent; custom prompt dashboard; API-only demo | Claude connector cannot be made reliable within its timebox |
| 2026-09-04 | Target Arc DeFi first; make Arc mainnet launch and Bazantic conditional; exclude Privy and Arc autonomous-agent tracks | Aligns sponsor claims with the actual freelancer workflow and eligibility | Sponsor collage; mislabeling invoice creation as autonomous spending | Core Arc flow is stable and remaining capacity is verified |
| 2026-09-04 | Describe the document as a generic commercial invoice/payment request | Jurisdiction-specific tax compliance is unvalidated and outside the build budget | Global or country-specific tax-compliance claims | Qualified legal/tax review is obtained |
