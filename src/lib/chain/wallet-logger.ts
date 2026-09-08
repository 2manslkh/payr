import pino, { type Bindings, type ChildLoggerOptions, type Logger } from "pino";

const silent = () => {};

// Pino browser children use an internal bindings object; WalletConnect expects
// Node-style bindings(). Preserve the internal object and suppress credentials.
export function createSilentWalletLogger(): Logger {
  function wrap(logger: Logger, context: Bindings): Logger {
    return new Proxy(logger, {
      get(target, property) {
        if (property === "bindings") return () => ({ ...context });
        if (["trace", "debug", "info", "warn", "error", "fatal", "silent"].includes(String(property))) return silent;
        if (property === "child") return (bindings: Bindings, options?: ChildLoggerOptions) =>
          wrap(target.child(bindings, { ...options, level: "silent" }), { ...context, ...bindings });
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  return wrap(pino({ level: "silent" }), {});
}
