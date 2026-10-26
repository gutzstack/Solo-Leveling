import { describe, expect, it } from "vitest";
import { ibmToNumber } from "../scripts/benchmarks/xpt";

/** Encode a JS number as an 8-byte IBM hexadecimal float (test helper). */
function toIbm(v: number): Uint8Array {
  const out = new Uint8Array(8);
  if (v === 0) return out;
  const sign = v < 0 ? 0x80 : 0;
  let x = Math.abs(v);
  let exp = 64;
  while (x >= 1) {
    x /= 16;
    exp += 1;
  }
  while (x < 1 / 16) {
    x *= 16;
    exp -= 1;
  }
  let mant = Math.round(x * 2 ** 56);
  out[0] = sign | exp;
  for (let i = 7; i >= 1; i--) {
    out[i] = mant % 256;
    mant = Math.floor(mant / 256);
  }
  return out;
}

describe("SAS XPORT IBM floats", () => {
  it.each([1, 0.5, 72, 175.7, -3.25, 1e6, 0.000123])("round-trips %s", (v) => {
    expect(ibmToNumber(toIbm(v))).toBeCloseTo(v, 9);
  });
  it("decodes zero and SAS missing values", () => {
    expect(ibmToNumber(new Uint8Array(8))).toBe(0);
    expect(ibmToNumber(Uint8Array.from([0x2e, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(ibmToNumber(Uint8Array.from([0x41 + 1, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
  it("decodes the known pattern for 1.0 (0x41100000…)", () => {
    expect(ibmToNumber(Uint8Array.from([0x41, 0x10, 0, 0, 0, 0, 0, 0]))).toBe(1);
  });
});
