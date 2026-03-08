const STROOPS_PER_XLM = 10_000_000n;

export function stroopsToXLM(stroops: bigint | number | string): string {
  const s = BigInt(stroops);
  const whole = s / STROOPS_PER_XLM;
  const frac = s % STROOPS_PER_XLM;
  return `${whole}.${frac.toString().padStart(7, "0")}`;
}

export function xlmToStroops(xlm: string): bigint {
  const [whole, frac = ""] = xlm.trim().split(".");
  const fracPadded = frac.padEnd(7, "0").slice(0, 7);
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(fracPadded || "0");
}

export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatXLM(xlm: string): string {
  const [whole, frac] = xlm.split(".");
  const trimmedFrac = frac?.replace(/0+$/, "") || "0";
  return `${whole}.${trimmedFrac}`;
}
