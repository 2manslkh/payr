// Resolve from explicit input, never import-time configuration or a bearer query string.
export function payrEmailLogo(origin: string): string {
  let logoUrl: string;
  try {
    const url = new URL(origin);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port !== "";
    if ((!local && url.protocol !== "https:") || url.username || url.password || /[\s\\\u0000-\u001f\u007f]/.test(origin)) {
      return "Payr";
    }
    logoUrl = new URL("/brand/payr-mark-v2.png", url.origin).href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  } catch { return "Payr"; }
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;color:#071B3B;font-family:Helvetica,Arial,sans-serif;font-size:28px;line-height:28px;font-weight:600">Pay</td>
<td width="28" height="28" style="width:28px;height:28px;vertical-align:middle;font-size:0;line-height:0"><img src="${logoUrl}" width="28" height="28" alt="r" style="display:block;width:28px;height:28px;max-width:28px;max-height:28px;border:0"></td>
</tr></table>`;
}
