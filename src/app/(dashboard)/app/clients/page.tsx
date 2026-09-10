import { Clients } from "../../../../components/clients";
import { DashboardLogin } from "../../../../components/dashboard-login";
import { getDashboardSession } from "../../../../lib/auth/runtime";
export const metadata = { title: "Clients | Payr" };
export default async function ClientsPage() {
  if (!await getDashboardSession()) return <DashboardLogin />;
  return <Clients />;
}
