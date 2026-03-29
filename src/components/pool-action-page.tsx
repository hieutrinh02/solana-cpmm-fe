"use client";

import { createTransferInstruction } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useEffect, useState } from "react";

import { useWallet } from "@/components/wallet-provider";
import { env } from "@/lib/env";
import { fetchPools } from "@/lib/indexer";
import { formatTokenAmount, parseTokenAmount, shortenAddress } from "@/lib/format";
import {
    computeAmountOut,
    createAddLiquidityInstruction,
    createEnsureAtaInstruction,
    createRemoveLiquidityInstruction,
    createSwapInstruction,
    fetchLivePoolReserves,
    fetchWalletTokenBalance,
    fetchMintMetadata,
    getConnection,
    getPdaAta,
    getReservePair,
    getWalletAta,
    quoteAddLiquidity,
    quoteRemoveLiquidity,
    sendWalletTransaction,
} from "@/lib/solana";
import type { ActionMode, MintMetadata, PoolRecord } from "@/lib/types";

type PoolActionPageProps = {
    mode: ActionMode;
};

type TxState = {
    kind: "idle" | "pending" | "success" | "error";
    message: string;
    signature?: string;
};

type MintState = {
    mint0: MintMetadata;
    mint1: MintMetadata;
    lpMint: MintMetadata;
};

type WalletBalances = {
    token0: bigint;
    token1: bigint;
    lp: bigint;
};

const modeContent: Record<ActionMode, { title: string; cta: string }> = {
    add: {
        title: "Add Liquidity",
        cta: "Submit Add Liquidity",
    },
    swap: {
        title: "Swap",
        cta: "Submit Swap",
    },
    remove: {
        title: "Remove Liquidity",
        cta: "Submit Remove Liquidity",
    },
};

export function PoolActionPage({ mode }: PoolActionPageProps) {
    const connection = getConnection();
    const { provider, publicKey } = useWallet();

    const [pools, setPools] = useState<PoolRecord[]>([]);
    const [loadingPools, setLoadingPools] = useState(true);
    const [poolError, setPoolError] = useState<string | null>(null);
    const [selectedPairAddress, setSelectedPairAddress] = useState("");
    const [mintState, setMintState] = useState<MintState | null>(null);
    const [mintError, setMintError] = useState<string | null>(null);
    const [walletBalances, setWalletBalances] = useState<WalletBalances | null>(null);

    const [amount0Input, setAmount0Input] = useState("");
    const [amount1Input, setAmount1Input] = useState("");
    const [amountInInput, setAmountInInput] = useState("");
    const [liquidityInput, setLiquidityInput] = useState("");
    const [direction, setDirection] = useState<"0to1" | "1to0">("0to1");
    const [txState, setTxState] = useState<TxState>({ kind: "idle", message: "" });

    const selectedPool = pools.find((pool) => pool.pairAddress === selectedPairAddress) ?? null;

    useEffect(() => {
        void refreshView();
    }, []);

    useEffect(() => {
        if (!pools.length || selectedPairAddress) {
            return;
        }

        setSelectedPairAddress(pools[0].pairAddress);
    }, [pools, selectedPairAddress]);

    useEffect(() => {
        if (!selectedPool) {
            setMintState(null);
            setWalletBalances(null);
            return;
        }

        let active = true;

        const loadMintState = async () => {
            setMintError(null);
            try {
                const [mint0, mint1, lpMint] = await fetchMintMetadata(connection, [
                    selectedPool.token0Mint,
                    selectedPool.token1Mint,
                    selectedPool.lpMint,
                ]);
                if (active) {
                    setMintState({ mint0, mint1, lpMint });
                }
            } catch (error) {
                if (active) {
                    setMintState(null);
                    setMintError(error instanceof Error ? error.message : "Failed to load mint metadata.");
                }
            }
        };

        void loadMintState();

        return () => {
            active = false;
        };
    }, [connection, selectedPool]);

    useEffect(() => {
        if (!publicKey || !selectedPool || !mintState) {
            setWalletBalances(null);
            return;
        }

        let active = true;

        const loadWalletBalances = async () => {
            const [token0, token1, lp] = await Promise.all([
                fetchWalletTokenBalance(connection, publicKey, new PublicKey(selectedPool.token0Mint)),
                fetchWalletTokenBalance(connection, publicKey, new PublicKey(selectedPool.token1Mint)),
                fetchWalletTokenBalance(connection, publicKey, new PublicKey(selectedPool.lpMint)),
            ]);

            if (active) {
                setWalletBalances({ token0, token1, lp });
            }
        };

        void loadWalletBalances();

        return () => {
            active = false;
        };
    }, [connection, mintState, publicKey, selectedPool]);

    useEffect(() => {
        if (txState.kind !== "success" && txState.kind !== "error") {
            return;
        }

        const timeout = window.setTimeout(() => {
            setTxState({ kind: "idle", message: "" });
        }, 5000);

        return () => {
            window.clearTimeout(timeout);
        };
    }, [txState]);

    async function refreshView() {
        setLoadingPools(true);
        setPoolError(null);
        setMintError(null);

        try {
            const indexedPools = await fetchPools();
            const nextSelectedPairAddress = selectedPairAddress || indexedPools[0]?.pairAddress || "";
            const selectedIndexedPool =
                indexedPools.find((pool) => pool.pairAddress === nextSelectedPairAddress) ?? null;

            let nextPools = indexedPools;

            if (selectedIndexedPool) {
                const liveReserves = await fetchLivePoolReserves(connection, selectedIndexedPool);
                nextPools = indexedPools.map((pool) =>
                    pool.pairAddress === selectedIndexedPool.pairAddress
                        ? {
                            ...pool,
                            reserve0: liveReserves.reserve0,
                            reserve1: liveReserves.reserve1,
                        }
                        : pool,
                );
            }

            setPools(nextPools);

            if (!selectedPairAddress && nextSelectedPairAddress) {
                setSelectedPairAddress(nextSelectedPairAddress);
            }

            const nextSelectedPool =
                nextPools.find((pool) => pool.pairAddress === nextSelectedPairAddress) ?? null;

            if (!nextSelectedPool) {
                setMintState(null);
                setWalletBalances(null);
                return;
            }

            const [mint0, mint1, lpMint] = await fetchMintMetadata(connection, [
                nextSelectedPool.token0Mint,
                nextSelectedPool.token1Mint,
                nextSelectedPool.lpMint,
            ]);

            setMintState({ mint0, mint1, lpMint });

            if (publicKey) {
                const [token0, token1, lp] = await Promise.all([
                    fetchWalletTokenBalance(connection, publicKey, new PublicKey(nextSelectedPool.token0Mint)),
                    fetchWalletTokenBalance(connection, publicKey, new PublicKey(nextSelectedPool.token1Mint)),
                    fetchWalletTokenBalance(connection, publicKey, new PublicKey(nextSelectedPool.lpMint)),
                ]);
                setWalletBalances({ token0, token1, lp });
            } else {
                setWalletBalances(null);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to refresh data.";
            setPoolError(message);
        } finally {
            setLoadingPools(false);
        }
    }

    async function handleSubmit() {
        if (!provider || !publicKey) {
            setTxState({ kind: "error", message: "Connect a Solana wallet first." });
            return;
        }

        if (!selectedPool || !mintState) {
            setTxState({ kind: "error", message: "Select a pool first." });
            return;
        }

        setTxState({ kind: "pending", message: "Building transaction..." });

        try {
            const programId = new PublicKey(env.programId);
            const adminAuthority = new PublicKey(env.programAdminAuthority);
            const wallet = publicKey;
            const pair = new PublicKey(selectedPool.pairAddress);
            const mint0 = new PublicKey(selectedPool.token0Mint);
            const mint1 = new PublicKey(selectedPool.token1Mint);
            const vault0 = new PublicKey(selectedPool.vault0Address);
            const vault1 = new PublicKey(selectedPool.vault1Address);
            const lpMint = new PublicKey(selectedPool.lpMint);
            const reservePair = getReservePair(selectedPool);
            const payerToken0 = getWalletAta(wallet, mint0);
            const payerToken1 = getWalletAta(wallet, mint1);
            const payerLp = getWalletAta(wallet, lpMint);
            const adminLp = getWalletAta(adminAuthority, lpMint);
            const transaction = new Transaction();

            if (mode === "add") {
                const amount0Desired = parseTokenAmount(amount0Input, mintState.mint0.decimals);
                const amount1Desired = parseTokenAmount(amount1Input, mintState.mint1.decimals);
                const quoted = quoteAddLiquidity(
                    reservePair.reserve0,
                    reservePair.reserve1,
                    amount0Desired,
                    amount1Desired,
                );

                transaction.add(
                    createAddLiquidityInstruction({
                        programId,
                        payer: wallet,
                        pair,
                        payerToken0,
                        payerToken1,
                        vault0,
                        vault1,
                        lpMint,
                        payerLp,
                        lockedLp: getPdaAta(pair, lpMint),
                        admin: adminAuthority,
                        adminLp,
                        amount0Desired,
                        amount1Desired,
                        amount0Min: quoted.amount0,
                        amount1Min: quoted.amount1,
                    }),
                );
            }

            if (mode === "swap") {
                const isZeroToOne = direction === "0to1";
                const inputMint = isZeroToOne ? mintState.mint0 : mintState.mint1;
                const amountIn = parseTokenAmount(amountInInput, inputMint.decimals);
                const reserveIn = isZeroToOne ? reservePair.reserve0 : reservePair.reserve1;
                const reserveOut = isZeroToOne ? reservePair.reserve1 : reservePair.reserve0;
                const amountOut = computeAmountOut(amountIn, reserveIn, reserveOut);

                transaction.add(
                    createEnsureAtaInstruction(wallet, mint0),
                    createEnsureAtaInstruction(wallet, mint1),
                    createTransferInstruction(
                        isZeroToOne ? payerToken0 : payerToken1,
                        isZeroToOne ? vault0 : vault1,
                        wallet,
                        amountIn,
                    ),
                    createSwapInstruction({
                        programId,
                        user: wallet,
                        pair,
                        userToken0: payerToken0,
                        userToken1: payerToken1,
                        vault0,
                        vault1,
                        amount0Out: isZeroToOne ? 0n : amountOut,
                        amount1Out: isZeroToOne ? amountOut : 0n,
                    }),
                );
            }

            if (mode === "remove") {
                const liquidity = parseTokenAmount(liquidityInput, mintState.lpMint.decimals);

                transaction.add(
                    createRemoveLiquidityInstruction({
                        programId,
                        payer: wallet,
                        pair,
                        mint0,
                        mint1,
                        payerToken0,
                        payerToken1,
                        vault0,
                        vault1,
                        lpMint,
                        payerLp,
                        admin: adminAuthority,
                        adminLp,
                        liquidity,
                        amount0Min: 0n,
                        amount1Min: 0n,
                    }),
                );
            }

            setTxState({ kind: "pending", message: "Awaiting wallet signature..." });
            const signature = await sendWalletTransaction(provider, connection, transaction);
            setTxState({
                kind: "success",
                message: "Transaction confirmed on devnet.",
                signature,
            });
            await refreshView();
        } catch (error) {
            setTxState({
                kind: "error",
                message: error instanceof Error ? error.message : "Transaction failed.",
            });
        }
    }

    const preview = buildPreview({
        mode,
        pool: selectedPool,
        mintState,
        amount0Input,
        amount1Input,
        amountInInput,
        liquidityInput,
        direction,
    });
    const canSubmit = canSubmitAction({
        mode,
        provider,
        publicKey,
        pool: selectedPool,
        mintState,
        amount0Input,
        amount1Input,
        amountInInput,
        liquidityInput,
        direction,
    });

    return (
        <section className="flex justify-center pt-10 sm:pt-14">
            <div className="flex w-full max-w-[520px] flex-col gap-4">
                <div className="flex items-center justify-end">
                    <button
                        className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-slate-900"
                        onClick={() => void refreshView()}
                        aria-label="Refresh data"
                        title="Refresh data"
                    >
                        ↻
                    </button>
                </div>

                <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                    <label className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-slate-700">Pool</span>
                        <select
                            value={selectedPairAddress}
                            onChange={(event) => setSelectedPairAddress(event.target.value)}
                            disabled={loadingPools || !pools.length}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                        >
                            {pools.map((pool) => (
                                <option key={pool.pairAddress} value={pool.pairAddress}>
                                    {shortenAddress(pool.token0Mint)} / {shortenAddress(pool.token1Mint)}
                                </option>
                            ))}
                        </select>
                    </label>

                    {loadingPools ? <p className="text-sm text-slate-500">Loading pools from the indexer...</p> : null}
                    {poolError ? <p className="text-sm text-rose-600">{poolError}</p> : null}
                    {mintError ? <p className="text-sm text-rose-600">{mintError}</p> : null}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Token0</span>
                            <strong className="text-base font-semibold text-slate-900">
                                {selectedPool && mintState
                                    ? formatTokenAmount(BigInt(selectedPool.reserve0), mintState.mint0.decimals)
                                    : "-"}
                            </strong>
                            <span className="font-mono text-xs text-slate-500">
                                {selectedPool ? shortenAddress(selectedPool.token0Mint) : "Select pool"}
                            </span>
                        </div>
                        <div className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Token1</span>
                            <strong className="text-base font-semibold text-slate-900">
                                {selectedPool && mintState
                                    ? formatTokenAmount(BigInt(selectedPool.reserve1), mintState.mint1.decimals)
                                    : "-"}
                            </strong>
                            <span className="font-mono text-xs text-slate-500">
                                {selectedPool ? shortenAddress(selectedPool.token1Mint) : "Select pool"}
                            </span>
                        </div>
                    </div>

                    {mode === "add" ? (
                        <>
                            <label className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">You deposit token0</span>
                                <input
                                    value={amount0Input}
                                    onChange={(event) => setAmount0Input(event.target.value)}
                                    placeholder="100"
                                    className="border-0 bg-transparent p-0 text-[2rem] font-semibold tracking-[-0.04em] text-slate-900 outline-none"
                                />
                                <span className="font-mono text-xs text-slate-500">
                                    {selectedPool ? shortenAddress(selectedPool.token0Mint) : "Token0"}
                                </span>
                                {mintState && walletBalances ? (
                                    <span className="text-xs text-slate-500">
                                        Balance: {formatTokenAmount(walletBalances.token0, mintState.mint0.decimals)}
                                    </span>
                                ) : null}
                            </label>
                            <div className="mx-auto -my-1 grid h-10 w-10 place-items-center rounded-full border-4 border-white bg-slate-100 text-base font-bold text-slate-700 shadow-sm">
                                +
                            </div>
                            <label className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">You deposit token1</span>
                                <input
                                    value={amount1Input}
                                    onChange={(event) => setAmount1Input(event.target.value)}
                                    placeholder="100"
                                    className="border-0 bg-transparent p-0 text-[2rem] font-semibold tracking-[-0.04em] text-slate-900 outline-none"
                                />
                                <span className="font-mono text-xs text-slate-500">
                                    {selectedPool ? shortenAddress(selectedPool.token1Mint) : "Token1"}
                                </span>
                                {mintState && walletBalances ? (
                                    <span className="text-xs text-slate-500">
                                        Balance: {formatTokenAmount(walletBalances.token1, mintState.mint1.decimals)}
                                    </span>
                                ) : null}
                            </label>
                        </>
                    ) : null}

                    {mode === "swap" ? (
                        <>
                            <label className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-slate-700">Direction</span>
                                <select
                                    value={direction}
                                    onChange={(event) => setDirection(event.target.value as "0to1" | "1to0")}
                                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
                                >
                                    <option value="0to1">Token0 to Token1</option>
                                    <option value="1to0">Token1 to Token0</option>
                                </select>
                            </label>
                            <label className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">You pay</span>
                                <input
                                    value={amountInInput}
                                    onChange={(event) => setAmountInInput(event.target.value)}
                                    placeholder="25"
                                    className="border-0 bg-transparent p-0 text-[2rem] font-semibold tracking-[-0.04em] text-slate-900 outline-none"
                                />
                                <span className="font-mono text-xs text-slate-500">
                                    {selectedPool
                                        ? direction === "0to1"
                                            ? shortenAddress(selectedPool.token0Mint)
                                            : shortenAddress(selectedPool.token1Mint)
                                        : "Select pool"}
                                </span>
                                {mintState && walletBalances ? (
                                    <span className="text-xs text-slate-500">
                                        Balance: {formatTokenAmount(
                                            direction === "0to1" ? walletBalances.token0 : walletBalances.token1,
                                            direction === "0to1" ? mintState.mint0.decimals : mintState.mint1.decimals,
                                        )}
                                    </span>
                                ) : null}
                            </label>
                            <div className="mx-auto -my-1 grid h-10 w-10 place-items-center rounded-full border-4 border-white bg-slate-100 text-base font-bold text-slate-700 shadow-sm">
                                ↓
                            </div>
                            <div className="flex min-h-[104px] flex-col justify-center gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Estimated receive</span>
                                <PreviewText preview={preview} />
                            </div>
                        </>
                    ) : null}

                    {mode === "remove" ? (
                        <label className="flex flex-col gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">LP to burn</span>
                            <input
                                value={liquidityInput}
                                onChange={(event) => setLiquidityInput(event.target.value)}
                                placeholder="10"
                                className="border-0 bg-transparent p-0 text-[2rem] font-semibold tracking-[-0.04em] text-slate-900 outline-none"
                            />
                            <span className="font-mono text-xs text-slate-500">
                                {selectedPool ? shortenAddress(selectedPool.lpMint) : "LP Mint"}
                            </span>
                            {mintState && walletBalances ? (
                                <span className="text-xs text-slate-500">
                                    Balance: {formatTokenAmount(walletBalances.lp, mintState.lpMint.decimals)}
                                </span>
                            ) : null}
                        </label>
                    ) : null}

                    {preview && mode !== "swap" ? (
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <PreviewText preview={preview} />
                        </div>
                    ) : null}

                    <button
                        className="w-full rounded-3xl bg-slate-900 px-4 py-4 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void handleSubmit()}
                        disabled={!canSubmit || txState.kind === "pending"}
                    >
                        {txState.kind === "pending"
                            ? txState.message || "Processing..."
                            : publicKey
                                ? modeContent[mode].cta
                                : "Connect Wallet"}
                    </button>

                </div>
            </div>
            {txState.kind !== "idle" && txState.kind !== "pending" ? (
                <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))]">
                    <div
                        className={`relative overflow-hidden flex flex-col gap-2 rounded-3xl border px-4 py-3 shadow-[0_24px_80px_rgba(15,23,42,0.16)] ${txState.kind === "success"
                                ? "border-emerald-200 bg-white"
                                : "border-rose-200 bg-white"
                            }`}
                    >
                        <p
                            className={`text-sm font-semibold ${txState.kind === "success" ? "text-emerald-800" : "text-rose-700"
                                }`}
                        >
                            {txState.message}
                        </p>
                        {txState.signature ? (
                            <a
                                href={`https://solscan.io/tx/${txState.signature}?cluster=devnet`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-slate-700 hover:text-slate-900"
                            >
                                View transaction
                            </a>
                        ) : null}
                        <div
                            className="absolute bottom-0 left-0 h-1 animate-[toast-progress_5s_linear_forwards] bg-slate-900/60"
                            style={{ width: "100%" }}
                        />
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function buildPreview(args: {
    mode: ActionMode;
    pool: PoolRecord | null;
    mintState: MintState | null;
    amount0Input: string;
    amount1Input: string;
    amountInInput: string;
    liquidityInput: string;
    direction: "0to1" | "1to0";
}): string {
    try {
        if (!args.pool || !args.mintState) {
            return "";
        }

        const { reserve0, reserve1 } = getReservePair(args.pool);

        if (args.mode === "add" && args.amount0Input && args.amount1Input) {
            const desired0 = parseTokenAmount(args.amount0Input, args.mintState.mint0.decimals);
            const desired1 = parseTokenAmount(args.amount1Input, args.mintState.mint1.decimals);
            const quoted = quoteAddLiquidity(reserve0, reserve1, desired0, desired1);
            return `Deposit ${formatTokenAmount(quoted.amount0, args.mintState.mint0.decimals)} / ${formatTokenAmount(quoted.amount1, args.mintState.mint1.decimals)}`;
        }

        if (args.mode === "swap" && args.amountInInput) {
            const isZeroToOne = args.direction === "0to1";
            const amountIn = parseTokenAmount(
                args.amountInInput,
                isZeroToOne ? args.mintState.mint0.decimals : args.mintState.mint1.decimals,
            );
            const amountOut = computeAmountOut(
                amountIn,
                isZeroToOne ? reserve0 : reserve1,
                isZeroToOne ? reserve1 : reserve0,
            );
            return `Receive about ${formatTokenAmount(amountOut, isZeroToOne ? args.mintState.mint1.decimals : args.mintState.mint0.decimals)}`;
        }

        if (args.mode === "remove" && args.liquidityInput) {
            const liquidity = parseTokenAmount(args.liquidityInput, args.mintState.lpMint.decimals);
            const quoted = quoteRemoveLiquidity(
                liquidity,
                reserve0,
                reserve1,
                args.mintState.lpMint.supply ?? 0n,
            );
            return `Expected receive ${formatTokenAmount(quoted.amount0, args.mintState.mint0.decimals)} / ${formatTokenAmount(quoted.amount1, args.mintState.mint1.decimals)}`;
        }
    } catch (error) {
        return error instanceof Error ? error.message : "";
    }

    return "";
}

function canSubmitAction(args: {
    mode: ActionMode;
    provider: ReturnType<typeof useWallet>["provider"];
    publicKey: ReturnType<typeof useWallet>["publicKey"];
    pool: PoolRecord | null;
    mintState: MintState | null;
    amount0Input: string;
    amount1Input: string;
    amountInInput: string;
    liquidityInput: string;
    direction: "0to1" | "1to0";
}): boolean {
    if (!args.provider || !args.publicKey || !args.pool || !args.mintState) {
        return false;
    }

    try {
        if (args.mode === "add") {
            parseTokenAmount(args.amount0Input, args.mintState.mint0.decimals);
            parseTokenAmount(args.amount1Input, args.mintState.mint1.decimals);
            return true;
        }

        if (args.mode === "swap") {
            parseTokenAmount(
                args.amountInInput,
                args.direction === "0to1" ? args.mintState.mint0.decimals : args.mintState.mint1.decimals,
            );
            return true;
        }

        parseTokenAmount(args.liquidityInput, args.mintState.lpMint.decimals);
        return true;
    } catch {
        return false;
    }
}

function PreviewText({ preview }: { preview: string }) {
    const [label, amount] = splitPreview(preview);

    return (
        <p className="text-sm leading-6 text-slate-600">
            {label ? <span>{label} </span> : null}
            {amount ? <strong className="font-semibold text-slate-900">{amount}</strong> : null}
        </p>
    );
}

function splitPreview(preview: string): [string, string] {
    const match = preview.match(/^(.*?)(\d[\d./ ]*)$/);
    if (!match) {
        return [preview, ""];
    }

    return [match[1].trimEnd(), match[2].trim()];
}
