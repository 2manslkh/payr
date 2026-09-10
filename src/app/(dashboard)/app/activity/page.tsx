import { Activity } from "../../../../components/activity";
import { DashboardLogin } from "../../../../components/dashboard-login";
import { getDashboardSession } from "../../../../lib/auth/runtime";
export const metadata = { title: "Activity | Payr" };
export default async function ActivityPage() {
  if (!await getDashboardSession()) return <DashboardLogin />;
  return <Activity />;
}
