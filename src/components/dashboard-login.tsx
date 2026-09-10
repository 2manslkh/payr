import { PrivyLoginContent } from "./privy-login";

export function DashboardLogin() {
  return (
    <section className="dashboard-login" aria-labelledby="dashboard-login-title">
      <div>
        <h1 id="dashboard-login-title">Login to connect to your Payr dashboard</h1>
        <PrivyLoginContent configured={Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID)} />
        <noscript>Enable JavaScript to sign in securely through Privy.</noscript>
      </div>
    </section>
  );
}
