declare const usdcDecimalBrand: unique symbol;
declare const nativeAtomicBrand: unique symbol;

export type UsdcDecimal = string & { readonly [usdcDecimalBrand]: true };
export type NativeAtomicAmount = bigint & { readonly [nativeAtomicBrand]: true };

export type ParsedUsdcAmount = Readonly<{
  decimal: UsdcDecimal;
  atomic: NativeAtomicAmount;
}>;

const NATIVE_USDC_SCALE = 10n ** 18n;
const USDC_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/;

export function parseUsdcAmount(input: string): ParsedUsdcAmount {
  if (!USDC_DECIMAL_PATTERN.test(input)) {
    throw new Error("Invalid USDC amount");
  }

  const [integerPart, fractionalPart = ""] = input.split(".");
  const atomic = BigInt(integerPart) * NATIVE_USDC_SCALE + BigInt(fractionalPart.padEnd(18, "0") || "0");

  if (atomic === 0n) {
    throw new Error("USDC amount must be positive");
  }

  const normalizedFraction = fractionalPart.replace(/0+$/, "");
  const decimal = (normalizedFraction === "" ? integerPart : `${integerPart}.${normalizedFraction}`) as UsdcDecimal;

  return {
    decimal,
    atomic: atomic as NativeAtomicAmount,
  };
}

export function formatNativeAtomicAmount(atomic: bigint): UsdcDecimal {
  if (atomic <= 0n) {
    throw new Error("Native atomic amount must be positive");
  }

  const integerPart = atomic / NATIVE_USDC_SCALE;
  const fractionalPart = (atomic % NATIVE_USDC_SCALE).toString().padStart(18, "0").replace(/0+$/, "");

  return (fractionalPart === "" ? integerPart.toString() : `${integerPart}.${fractionalPart}`) as UsdcDecimal;
}
