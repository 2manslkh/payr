import { expect, it } from "vitest";
import { isCountryCode } from "./country";
import { addressSchema } from "../identity/contracts";

it.each(["GB", "US", "SG", "AX", "BQ", "SS", "ZW"])("accepts assigned ISO country %s in profile entry", (countryCode) => {
  expect(isCountryCode(countryCode)).toBe(true);
  expect(addressSchema.safeParse({ line1: "1 Road", city: "City", postalCode: "1", countryCode }).success).toBe(true);
});
it.each(["UK", "ZZ", "EU", "XK", "AA", "gb"])("rejects non-ISO country %s before profile persistence", (countryCode) => {
  expect(isCountryCode(countryCode)).toBe(false);
  expect(addressSchema.safeParse({ line1: "1 Road", city: "City", postalCode: "1", countryCode }).success).toBe(false);
});
