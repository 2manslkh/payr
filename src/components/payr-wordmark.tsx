export function PayrWordmark() {
  return (
    <span className="wordmark" role="img" aria-label="Payr">
      <span>Pay</span>
      {/* A static image avoids inline placeholder styles on nonce-CSP protected pages. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/payr-mark-v2.png" width={36} height={36} alt="" />
    </span>
  );
}
