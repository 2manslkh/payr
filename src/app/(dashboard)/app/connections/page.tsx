import { Connections } from "../../../../components/connections";
import { DashboardLogin } from "../../../../components/dashboard-login";
import { getDashboardSession } from "../../../../lib/auth/runtime";
export const metadata = { title: "Connections | Payr" };
export default async function ConnectionsPage() {
  if (!await getDashboardSession()) return <DashboardLogin />;
  return <Connections gatewayOnly={process.env.PAYR_AGENT_GATEWAY_ONLY === "true"} />;
}
