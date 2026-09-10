import type { Metadata } from "next";
import { DashboardLogin } from "../../../components/dashboard-login";
import { AppNavigation, ConsoleIdentity } from "../../../components/app-navigation";
import { getDashboardSession } from "../../../lib/auth/runtime";
import { PayrPrivyProvider } from "../../../components/privy-provider";

export const metadata: Metadata = {
  title: "Workspace | Payr",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getDashboardSession();
  return (
    <PayrPrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID}><ConsoleIdentity session={session}>
      <div className="workspace">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AppNavigation loginConfigured={Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID)} />
        <main id="main-content" className="workspace-main" tabIndex={-1}>
          {session ? children : <DashboardLogin />}
        </main>
      </div>
    </ConsoleIdentity></PayrPrivyProvider>
  );
}
