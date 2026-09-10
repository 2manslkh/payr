import { Settings } from "../../../../components/settings";
import { DashboardLogin } from "../../../../components/dashboard-login";
import { getDashboardSession } from "../../../../lib/auth/runtime";
export const metadata = { title: "Settings | Payr" };
export default async function SettingsPage() {
  if (!await getDashboardSession()) return <DashboardLogin />;
  return <Settings />;
}
