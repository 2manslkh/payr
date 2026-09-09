# Deployment Evidence

The verified Arc testnet deployment is [`0x21bf4df6beb22edb1a71f6dc7b92ffbab122a49a`](https://testnet.arcscan.app/address/0x21bf4df6beb22edb1a71f6dc7b92ffbab122a49a), recorded in [`arc-testnet.json`](arc-testnet.json) from an authoritative successful creation receipt and contract read-back on 7 September 2026. The standalone `scripts/verify-deployment.ts` verifier independently confirmed it after deployment.

The verifier requires the locally compiled creation bytecode and exact constructor attestor to match the onchain creation transaction. It records only public chain/contract/attestor/transaction/block/bytecode-hash facts and a credential-free RPC host. It refuses to overwrite existing evidence. Run without `--write` to verify retained evidence again.

Never hand-enter placeholder metadata. Live deployment and payment require explicit operator approval; see `docs/ops/r07-settlement.md`.
