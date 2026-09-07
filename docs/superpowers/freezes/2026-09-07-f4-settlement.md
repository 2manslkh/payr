# F4 Settlement Interfaces

R07 working interface, implemented sequentially in the primary workspace. No implementation fanout or release is authorized by this file. Before fanout, commit the interface and failing contract tests and confirm remaining human capacity under the orchestration plan.

- Domain: `Payr`, version `1`, verified Arc testnet chain `5042002`, exact contract frozen at publication.
- Primary type: `PayrPayment(bytes32 invoiceKey,bytes32 documentCommitment,address payee,uint256 amount,uint64 authorizationValidUntil,uint64 payableUntil)`.
- Domain fields, in order: `string name`, `string version`, `uint256 chainId`, `address verifyingContract`.
- `payInvoice` arguments are the six message fields in that order, then `bytes signature`; exact native 18-decimal USDC is supplied as value.
- `InvoicePaid(bytes32 indexed invoiceKey,bytes32 documentCommitment,address indexed payer,address indexed payee,uint256 amount)` is the sole payment event. Payer is `msg.sender`, not an attested field.
- Immutable nonzero `attestor`; `paid(bytes32)` replay key; no admin, upgrades, escrow, receive, fallback or withdrawal.
- Contract accepts through authorization deadline, requires authorization deadline strictly before payable deadline, and rejects at payable deadline. Service requires a strictly future authorization second, following the implementation plan's stricter safe window.
- TypeScript uses bigint internally. HTTP domain chain ID is a number; amount and both message deadlines are decimal integer strings. `types` includes the exact `EIP712Domain` map.
- `POST /api/invoice/[slug]/authorize` accepts no payload bytes, including zero-byte streams supplied by Next's Node adapter. The first nonempty chunk is rejected; waiting for EOF is bounded to five seconds. Existing purpose-bound bearer verification and database-backed IP/token/global admission apply. No cookie authority or client-supplied payment facts are accepted.
- Signatures recover to the configured onchain attestor. Persistence uses the existing service-only RPC and records digest/signature hash, never signature bytes. Authorization is not settlement.
- Testnet local signing requires explicit signer mode, opt-in, `PAYR_MONEY_MODE=testnet`, and chain binding. A hosted production web environment may serve testnet; production-money signing is forbidden.
- The publication default plus explicit `PAYR_RETAINED_SETTLEMENT_CONTRACTS` allowlist select trusted deployments. Signing reads the attestor from the invoice's frozen contract, not the current publication default. Keep the same attestor and retain older deployments while invoices remain payable; attestor-key rotation needs a separately reviewed key registry.
- Deployment metadata is written only after authoritative receipt/code/attestor read-back. No placeholder deployment JSON is provided. Deployment and payer broadcasts remain explicit human-operated live gates.
- Operator submission caps maximum gas cost at `0.1 testnet USDC` and durably journals the public transaction identity before broadcast. The exclusive `0600` `.operator-payment.json` file contains no signature, raw signed transaction, private key, or bearer. `--recover` performs keyless read-only transaction/event/canonical-block/balance verification and never resubmits. Retain the journal after success or ambiguity.

The generated ABI lives in `src/lib/chain/abi.ts`; `node scripts/export-contract-abi.mjs --check` detects drift against Foundry output. OpenZeppelin is pinned to 5.4.0 in the package lock, compiler to 0.8.30, and EVM target to Paris.
