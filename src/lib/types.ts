export type PoolRecord = {
    pairAddress: string;
    factoryAddress: string;
    token0Mint: string;
    token1Mint: string;
    vault0Address: string;
    vault1Address: string;
    lpMint: string;
    reserve0: string;
    reserve1: string;
    kLast: string;
    price0CumulativeLast: string;
    price1CumulativeLast: string;
    blockTimestampLast: number;
    discoveredAt: number;
    updatedAt: number;
};

export type PoolApiResponse = {
    data: PoolRecord[];
};

export type MintMetadata = {
    address: string;
    decimals: number;
    supply?: bigint;
};

export type ActionMode = "add" | "swap" | "remove";
