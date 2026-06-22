import { ethers } from "ethers";

/**
 * Logs and returns the on-chain gas footprint of a mined receipt for
 * performance metrics (blueprint §10), mirroring the `[perf]` timing
 * convention with a `[gas]` line. Handles both ethers v6 receipts
 * (gasUsed/gasPrice) and viem-style receipts (gasUsed/effectiveGasPrice),
 * where the numeric fields are BigInt.
 *
 * Returns { gasUsed, effectiveGasPriceGwei, costEth } so callers can persist
 * or aggregate the metric, or null if the receipt has no gas data.
 */
export function reportGas(label, receipt) {
  if (!receipt || receipt.gasUsed == null) {
    console.log(`[gas] ${label}: no receipt gas data`);
    return null;
  }

  const gasUsed = BigInt(receipt.gasUsed);
  const priceRaw = receipt.effectiveGasPrice ?? receipt.gasPrice;
  const effectiveGasPrice = priceRaw != null ? BigInt(priceRaw) : null;
  const costWei = effectiveGasPrice != null ? gasUsed * effectiveGasPrice : null;

  const out = {
    gasUsed: Number(gasUsed),
    effectiveGasPriceGwei:
      effectiveGasPrice != null ? Number(ethers.formatUnits(effectiveGasPrice, "gwei")) : null,
    costEth: costWei != null ? ethers.formatEther(costWei) : null,
  };

  console.log(
    `[gas] ${label}: ${out.gasUsed} gas` +
      (out.effectiveGasPriceGwei != null
        ? ` @ ${out.effectiveGasPriceGwei} gwei = ${out.costEth} ETH`
        : "")
  );
  return out;
}

// ponytail: one runnable self-check for the BigInt math + null handling.
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = reportGas("selfcheck", { gasUsed: 21000n, effectiveGasPrice: 2000000000n });
  console.assert(r.gasUsed === 21000, "gasUsed");
  console.assert(r.effectiveGasPriceGwei === 2, "gwei");
  console.assert(r.costEth === "0.000042", `costEth got ${r.costEth}`);
  console.assert(reportGas("empty", null) === null, "null receipt");
  console.log("gas.js self-check passed");
}
