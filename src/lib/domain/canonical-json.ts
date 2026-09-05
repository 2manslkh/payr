export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJson(value: JsonValue): string {
  const ancestors = new WeakSet<object>();

  function serialize(current: unknown): string {
    if (current === null) {
      return "null";
    }

    switch (typeof current) {
      case "boolean":
        return current ? "true" : "false";
      case "number":
        if (!Number.isFinite(current)) {
          throw new TypeError("Canonical JSON numbers must be finite");
        }
        return JSON.stringify(current);
      case "string":
        return JSON.stringify(current);
      case "object":
        break;
      default:
        throw new TypeError("Canonical JSON contains an unsupported value");
    }

    if (ancestors.has(current)) {
      throw new TypeError("Canonical JSON cannot contain cycles");
    }

    if (Object.getOwnPropertySymbols(current).length !== 0) {
      throw new TypeError("Canonical JSON objects cannot have symbol keys");
    }

    ancestors.add(current);

    try {
      if (Array.isArray(current)) {
        const ownNames = Object.getOwnPropertyNames(current);
        if (ownNames.length !== current.length + 1) {
          throw new TypeError("Canonical JSON arrays must be dense and contain only indexed values");
        }

        const values: string[] = [];
        for (let index = 0; index < current.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
            throw new TypeError("Canonical JSON arrays must be dense data arrays");
          }
          values.push(serialize(descriptor.value));
        }
        return `[${values.join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("Canonical JSON objects must be plain objects");
      }

      const keys = Object.keys(current).sort();
      if (Object.getOwnPropertyNames(current).length !== keys.length) {
        throw new TypeError("Canonical JSON objects cannot have non-enumerable properties");
      }

      return `{${keys
        .map((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(current, key);
          if (descriptor === undefined || !("value" in descriptor)) {
            throw new TypeError("Canonical JSON objects must contain data properties");
          }
          return `${JSON.stringify(key)}:${serialize(descriptor.value)}`;
        })
        .join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  }

  return serialize(value);
}
