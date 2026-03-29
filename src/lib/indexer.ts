import type { PoolApiResponse, PoolRecord } from "./types";

export async function fetchPools(): Promise<PoolRecord[]> {
    const response = await fetch("/api/pools", { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Failed to load pools from indexer.");
    }

    const json = (await response.json()) as PoolApiResponse;
    return json.data;
}
