import { privateDocumentError } from "../../../../lib/documents/private-response";

export function GET() {
  return privateDocumentError(503);
}
