import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
  if (!session) redirect("/login");
  return (
    <PayrPrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID}><ConsoleIdentity session={session}>
      <div className="workspace">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AppNavigation />
        <main id="main-content" className="workspace-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </ConsoleIdentity></PayrPrivyProvider>
  );
}
