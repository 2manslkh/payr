import type { MetadataRoute } from "next";
import { discoveryOrigin } from "../lib/discovery";

export default function sitemap(): MetadataRoute.Sitemap {
  // Public pages only. Publishing an invoice must never add its bearer URL.
  return ["/", "/install"].map((path) => ({ url: `${discoveryOrigin()}${path}` }));
}
