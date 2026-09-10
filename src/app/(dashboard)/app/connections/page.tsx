import { Connections } from "../../../../components/connections";
export const metadata = { title: "Connections | Payr" };
export default function ConnectionsPage() {
  return <Connections gatewayOnly={process.env.PAYR_AGENT_GATEWAY_ONLY === "true"} />;
}
