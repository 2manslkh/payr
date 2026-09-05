import { isIP } from "node:net";

export function normalizeIp(ip: string): string | null {
  if (typeof ip !== "string" || ip.includes("%") || !isIP(ip)) return null;
  if (isIP(ip) === 4) return ip;
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (!mapped) return normalized;
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}
