import { useId } from "react";

export function PayrWordmark() {
  const mask = useId();
  return (
    <span className="wordmark">
      <svg viewBox="0 0 330 330" aria-hidden="true" focusable="false">
        {/* Geometry derived from assets/brand/payr-icon.svg; reference remains unchanged. */}
        <defs>
          <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="330" height="330">
            <rect width="330" height="330" fill="white" />
            <path
              d="M84 164H170L151 142H202L251 188L193 233H142L169 210H77Z"
              fill="black"
              stroke="black"
              strokeWidth="18"
              strokeLinejoin="round"
            />
          </mask>
        </defs>
        <g fill="currentColor">
          <g mask={`url(#${mask})`}>
            <path d="M70 45H203C264 45 300 84 300 141C300 181 282 212 247 235L207 189C229 176 240 160 240 141C240 118 225 106 201 106H55L70 45Z" />
            <path d="M48 160C51 142 62 133 80 133H115L88 302H24L46 169C47 166 47 163 48 160Z" />
            <path d="M202 218L248 184L307 302H237L180 232L202 218Z" />
          </g>
          <path d="M84 164H170L151 142H202L251 188L193 233H142L169 210H77L84 164Z" />
        </g>
      </svg>
      <span>Payr</span>
    </span>
  );
}
