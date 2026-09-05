import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppNavigation, ConsoleIdentity } from "../../../components/app-navigation";
import { getDashboardSession } from "../../../lib/auth/runtime";

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
    <ConsoleIdentity session={{ workspaceId: session.workspaceId, ownerWallet: session.ownerWallet }}>
      <div className="workspace">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AppNavigation />
        <main id="main-content" className="workspace-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </ConsoleIdentity>
  );
}
