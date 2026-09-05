declare const usdcDecimalBrand: unique symbol;
declare const nativeAtomicBrand: unique symbol;

export type UsdcDecimal = string & { readonly [usdcDecimalBrand]: true };
export type NativeAtomicAmount = bigint & { readonly [nativeAtomicBrand]: true };

export type ParsedUsdcAmount = Readonly<{
  decimal: UsdcDecimal;
  atomic: NativeAtomicAmount;
}>;

export function parseUsdcAmount(_input: string): ParsedUsdcAmount {
  throw new Error("F1 implementation pending");
}

export function formatNativeAtomicAmount(_atomic: bigint): UsdcDecimal {
  throw new Error("F1 implementation pending");
}
