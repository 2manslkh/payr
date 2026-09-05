# Payr

Payr turns confirmed independent work into an immutable invoice and treats verified Arc settlement as separate evidence that can produce a receipt.

## Language

**Workspace**:
The tenant owned by one freelancer wallet and containing that freelancer's private billing records.
_Avoid_: Account, organization

**Sender Profile**:
The confirmed issuer identity, payout destination, numbering prefix, and defaults used when publishing an invoice.
_Avoid_: Agent profile, payee profile

**Client**:
The billed person or organization whose confirmed details appear on an invoice.
_Avoid_: Customer, payer account

**Invoice**:
The commercial record for confirmed work, with a lifecycle independent from payment evidence.
_Avoid_: Bill, payment

**Invoice Version**:
An immutable snapshot of invoice facts; revisions append versions rather than replacing earlier facts.
_Avoid_: Edit, mutable invoice

**Publication Attempt**:
The durable publication workflow that permanently reserves a number and, when finalized, freezes one approved invoice version into artifacts.
_Avoid_: Upload, render job

**Commercial State**:
The invoice lifecycle value `draft`, `published`, `voided`, or `expired`; it never represents payment.
_Avoid_: Invoice status

**Settlement**:
Immutable evidence of a verified `InvoicePaid` event from the configured Arc chain and contract.
_Avoid_: Transaction submission, wallet callback, authorization

**Payment Status**:
The derived `unpaid` or `paid` value determined only by whether a settlement exists.
_Avoid_: Commercial state

**Display Status**:
The user-facing status; `Paid` takes precedence when a settlement exists, while the commercial state remains independently visible.
_Avoid_: Stored status

**Access Link**:
A deterministic bearer credential for one published invoice or ready receipt, reconstructed from stored token metadata.
_Avoid_: Public URL, slug record

**Receipt**:
The immutable document generated from an invoice and its verified settlement.
_Avoid_: Payment confirmation

**Delivery**:
One logical receipt email destination per normalized recipient, retaining whether that address represents the issuer, client, or both across retry attempts.
_Avoid_: Role email
