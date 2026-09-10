import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Sign in | Payr", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ link?: string | string[] }> }) {
  const { link } = await searchParams;
  redirect(link === "1" ? "/app?link=1" : "/app");
}
