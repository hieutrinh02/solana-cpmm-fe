import {
    createAssociatedTokenAccountIdempotentInstruction,
    getAssociatedTokenAddressSync,
    getMint,
} from "@solana/spl-token";
import {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from "@solana/web3.js";

import { env } from "./env";
import type { MintMetadata, PoolRecord } from "./types";
import type { InjectedSolanaProvider } from "./wallet";

export const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ATA_PROGRAM_ID = new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const RENT_SYSVAR_ID = new PublicKey(
    "SysvarRent111111111111111111111111111111111",
);
export const CLOCK_SYSVAR_ID = new PublicKey(
    "SysvarC1ock11111111111111111111111111111111",
);

const SWAP_FEE_BPS = 3n;
const FEE_DENOMINATOR = 10_000n;

let sharedConnection: Connection | null = null;

export function getConnection(): Connection {
    if (!sharedConnection) {
        sharedConnection = new Connection(env.rpcUrl, "confirmed");
    }

    return sharedConnection;
}

export function encodeU64(value: bigint): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(value);
    return buffer;
}

export function getWalletAta(owner: PublicKey, mint: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
}

export function getPdaAta(owner: PublicKey, mint: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID, ATA_PROGRAM_ID);
}

export function createEnsureAtaInstruction(owner: PublicKey, mint: PublicKey): TransactionInstruction {
    return createAssociatedTokenAccountIdempotentInstruction(
        owner,
        getWalletAta(owner, mint),
        owner,
        mint,
        TOKEN_PROGRAM_ID,
        ATA_PROGRAM_ID,
    );
}

export async function fetchMintMetadata(
    connection: Connection,
    addresses: string[],
): Promise<MintMetadata[]> {
    const metadata = await Promise.all(
        addresses.map(async (address) => {
            const mint = await getMint(connection, new PublicKey(address), "confirmed", TOKEN_PROGRAM_ID);
            return {
                address,
                decimals: mint.decimals,
                supply: mint.supply,
            };
        }),
    );

    return metadata;
}

export async function fetchWalletTokenBalance(
    connection: Connection,
    owner: PublicKey,
    mint: PublicKey,
): Promise<bigint> {
    const ata = getWalletAta(owner, mint);

    try {
        const balance = await connection.getTokenAccountBalance(ata, "confirmed");
        return BigInt(balance.value.amount);
    } catch {
        return 0n;
    }
}

export async function fetchLivePoolReserves(
    connection: Connection,
    pool: PoolRecord,
): Promise<{ reserve0: string; reserve1: string }> {
    const [reserve0, reserve1] = await Promise.all([
        connection.getTokenAccountBalance(new PublicKey(pool.vault0Address), "confirmed"),
        connection.getTokenAccountBalance(new PublicKey(pool.vault1Address), "confirmed"),
    ]);

    return {
        reserve0: reserve0.value.amount,
        reserve1: reserve1.value.amount,
    };
}

export function quoteAddLiquidity(
    reserve0: bigint,
    reserve1: bigint,
    desired0: bigint,
    desired1: bigint,
): { amount0: bigint; amount1: bigint } {
    if (reserve0 === 0n || reserve1 === 0n) {
        return { amount0: desired0, amount1: desired1 };
    }

    const optimal1 = (desired0 * reserve1) / reserve0;
    if (optimal1 <= desired1) {
        return { amount0: desired0, amount1: optimal1 };
    }

    const optimal0 = (desired1 * reserve0) / reserve1;
    return { amount0: optimal0, amount1: desired1 };
}

export function computeAmountOut(
    amountIn: bigint,
    reserveIn: bigint,
    reserveOut: bigint,
): bigint {
    const amountInWithFee = amountIn * (FEE_DENOMINATOR - SWAP_FEE_BPS);
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;
    return denominator === 0n ? 0n : numerator / denominator;
}

export function quoteRemoveLiquidity(
    liquidity: bigint,
    reserve0: bigint,
    reserve1: bigint,
    totalSupply: bigint,
): { amount0: bigint; amount1: bigint } {
    if (liquidity === 0n || totalSupply === 0n) {
        return { amount0: 0n, amount1: 0n };
    }

    return {
        amount0: (liquidity * reserve0) / totalSupply,
        amount1: (liquidity * reserve1) / totalSupply,
    };
}

export function createAddLiquidityInstruction(args: {
    programId: PublicKey;
    payer: PublicKey;
    pair: PublicKey;
    payerToken0: PublicKey;
    payerToken1: PublicKey;
    vault0: PublicKey;
    vault1: PublicKey;
    lpMint: PublicKey;
    payerLp: PublicKey;
    lockedLp: PublicKey;
    admin: PublicKey;
    adminLp: PublicKey;
    amount0Desired: bigint;
    amount1Desired: bigint;
    amount0Min: bigint;
    amount1Min: bigint;
}): TransactionInstruction {
    const data = Buffer.concat([
        Buffer.from([2]),
        encodeU64(args.amount0Desired),
        encodeU64(args.amount1Desired),
        encodeU64(args.amount0Min),
        encodeU64(args.amount1Min),
    ]);

    return new TransactionInstruction({
        programId: args.programId,
        keys: [
            { pubkey: args.payer, isSigner: true, isWritable: true },
            { pubkey: args.pair, isSigner: false, isWritable: true },
            { pubkey: args.payerToken0, isSigner: false, isWritable: true },
            { pubkey: args.payerToken1, isSigner: false, isWritable: true },
            { pubkey: args.vault0, isSigner: false, isWritable: true },
            { pubkey: args.vault1, isSigner: false, isWritable: true },
            { pubkey: args.lpMint, isSigner: false, isWritable: true },
            { pubkey: args.payerLp, isSigner: false, isWritable: true },
            { pubkey: args.lockedLp, isSigner: false, isWritable: true },
            { pubkey: args.admin, isSigner: false, isWritable: false },
            { pubkey: args.adminLp, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
            { pubkey: CLOCK_SYSVAR_ID, isSigner: false, isWritable: false },
        ],
        data,
    });
}

export function createSwapInstruction(args: {
    programId: PublicKey;
    user: PublicKey;
    pair: PublicKey;
    userToken0: PublicKey;
    userToken1: PublicKey;
    vault0: PublicKey;
    vault1: PublicKey;
    amount0Out: bigint;
    amount1Out: bigint;
}): TransactionInstruction {
    const data = Buffer.concat([
        Buffer.from([3]),
        encodeU64(args.amount0Out),
        encodeU64(args.amount1Out),
    ]);

    return new TransactionInstruction({
        programId: args.programId,
        keys: [
            { pubkey: args.user, isSigner: true, isWritable: true },
            { pubkey: args.pair, isSigner: false, isWritable: true },
            { pubkey: args.userToken0, isSigner: false, isWritable: true },
            { pubkey: args.userToken1, isSigner: false, isWritable: true },
            { pubkey: args.vault0, isSigner: false, isWritable: true },
            { pubkey: args.vault1, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: CLOCK_SYSVAR_ID, isSigner: false, isWritable: false },
        ],
        data,
    });
}

export function createRemoveLiquidityInstruction(args: {
    programId: PublicKey;
    payer: PublicKey;
    pair: PublicKey;
    mint0: PublicKey;
    mint1: PublicKey;
    payerToken0: PublicKey;
    payerToken1: PublicKey;
    vault0: PublicKey;
    vault1: PublicKey;
    lpMint: PublicKey;
    payerLp: PublicKey;
    admin: PublicKey;
    adminLp: PublicKey;
    liquidity: bigint;
    amount0Min: bigint;
    amount1Min: bigint;
}): TransactionInstruction {
    const data = Buffer.concat([
        Buffer.from([4]),
        encodeU64(args.liquidity),
        encodeU64(args.amount0Min),
        encodeU64(args.amount1Min),
    ]);

    return new TransactionInstruction({
        programId: args.programId,
        keys: [
            { pubkey: args.payer, isSigner: true, isWritable: true },
            { pubkey: args.pair, isSigner: false, isWritable: true },
            { pubkey: args.mint0, isSigner: false, isWritable: false },
            { pubkey: args.mint1, isSigner: false, isWritable: false },
            { pubkey: args.payerToken0, isSigner: false, isWritable: true },
            { pubkey: args.payerToken1, isSigner: false, isWritable: true },
            { pubkey: args.vault0, isSigner: false, isWritable: true },
            { pubkey: args.vault1, isSigner: false, isWritable: true },
            { pubkey: args.lpMint, isSigner: false, isWritable: true },
            { pubkey: args.payerLp, isSigner: false, isWritable: true },
            { pubkey: args.admin, isSigner: false, isWritable: false },
            { pubkey: args.adminLp, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: RENT_SYSVAR_ID, isSigner: false, isWritable: false },
            { pubkey: CLOCK_SYSVAR_ID, isSigner: false, isWritable: false },
        ],
        data,
    });
}

export async function sendWalletTransaction(
    provider: InjectedSolanaProvider,
    connection: Connection,
    transaction: Transaction,
): Promise<string> {
    const latest = await connection.getLatestBlockhash("confirmed");
    transaction.feePayer = provider.publicKey ?? undefined;
    transaction.recentBlockhash = latest.blockhash;

    const signed = await provider.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(
        {
            signature,
            blockhash: latest.blockhash,
            lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        "confirmed",
    );

    return signature;
}

export function getReservePair(pool: PoolRecord): { reserve0: bigint; reserve1: bigint } {
    return {
        reserve0: BigInt(pool.reserve0),
        reserve1: BigInt(pool.reserve1),
    };
}
