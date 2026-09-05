export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJson(_value: JsonValue): string {
  throw new Error("F1 implementation pending");
}
