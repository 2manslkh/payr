import Link from "next/link";
import { ConsoleError, errorMessage } from "./console-api";

export function PageHeading({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action}
    </header>
  );
}

export function RequestError({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert" aria-label="Request failed">
      <p>{errorMessage(error)}</p>
      <div className="actions">
        {retry && (
          <button type="button" className="button secondary" onClick={retry}>
            Retry
          </button>
        )}
        {error instanceof ConsoleError && error.status === 401 && (
          <Link className="button secondary" href="/login">
            Sign in again
          </Link>
        )}
      </div>
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <p>{label}</p>
      <div />
      <div />
      <div />
    </div>
  );
}

export function DateValue({ value }: { value: string | null }) {
  if (!value) return <>Never</>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>Unavailable</>;
  return (
    <time dateTime={value}>
      {date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      })}{" "}
      UTC
    </time>
  );
}
