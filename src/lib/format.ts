export function shortenAddress(address: string, visible = 4): string {
    return `${address.slice(0, visible)}...${address.slice(-visible)}`;
}

function getBaseUnit(decimals: number): bigint {
    return 10n ** BigInt(decimals);
}

export function parseTokenAmount(value: string, decimals: number): bigint {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error("Amount is required.");
    }

    if (!/^\d+(\.\d+)?$/.test(normalized)) {
        throw new Error("Amount must be a positive number.");
    }

    const [wholePart, fractionPart = ""] = normalized.split(".");
    if (fractionPart.length > decimals) {
        throw new Error(`Amount has too many decimal places for a ${decimals}-decimals mint.`);
    }

    const whole = BigInt(wholePart);
    const fraction = (fractionPart + "0".repeat(decimals)).slice(0, decimals);

    return whole * getBaseUnit(decimals) + BigInt(fraction || "0");
}

export function formatTokenAmount(
    rawAmount: bigint,
    decimals: number,
    maxFractionDigits = Math.min(decimals, 6),
): string {
    const negative = rawAmount < 0n;
    const absolute = negative ? -rawAmount : rawAmount;
    const baseUnit = getBaseUnit(decimals);
    const whole = absolute / baseUnit;
    const fraction = absolute % baseUnit;

    if (decimals === 0) {
        return `${negative ? "-" : ""}${whole.toString()}`;
    }

    const fractionText = fraction
        .toString()
        .padStart(decimals, "0")
        .slice(0, maxFractionDigits)
        .replace(/0+$/, "");

    return `${negative ? "-" : ""}${whole.toString()}${fractionText ? `.${fractionText}` : ""}`;
}
