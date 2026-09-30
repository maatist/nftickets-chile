import { formatUnits } from "viem";

/** Decimals used to render a settlement token by symbol in the mock UI. */
const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  USDC: 6,
};

/**
 * Format a smallest-unit decimal-string amount for display, using the token
 * symbol to determine decimals. Falls back to 18 decimals for unknown tokens.
 */
export function formatTokenAmount(amount: string, symbol: string): string {
  const decimals = TOKEN_DECIMALS[symbol] ?? 18;
  const value = formatUnits(BigInt(amount), decimals);
  return `${value} ${symbol}`;
}

/** Format an ISO-8601 date string as a short, locale-aware label. */
export function formatEventDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Truncate a 0x address to a compact `0x1234…abcd` form. */
export function shortenAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
