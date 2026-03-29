"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { shortenAddress } from "@/lib/format";
import { useWallet } from "./wallet-provider";

const navItems = [
    { href: "/add-liquidity", label: "Add Liquidity" },
    { href: "/swap", label: "Swap" },
    { href: "/remove-liquidity", label: "Remove Liquidity" },
];

export function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { hasPhantom, publicKey, connecting, connect, disconnect } = useWallet();

    return (
        <div className="min-h-screen w-full px-4 pb-14 pt-3 sm:px-6">
            <header className="relative flex min-h-16 items-center">
                <div className="pr-4 text-2xl font-semibold text-slate-900">
                    Solana CPMM
                </div>

                <nav className="absolute left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 shadow-sm">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${pathname === item.href
                                    ? "bg-slate-900 text-white"
                                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="ml-auto flex items-center justify-end">
                    {publicKey ? (
                        <button
                            className="min-w-[124px] rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                            onClick={() => void disconnect()}
                        >
                            {shortenAddress(publicKey.toBase58(), 4)}
                        </button>
                    ) : (
                        <>
                            {hasPhantom ? (
                                <button
                                    className="min-w-[124px] rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => void connect()}
                                    disabled={connecting}
                                >
                                    {connecting ? "Connecting..." : "Connect Wallet"}
                                </button>
                            ) : (
                                <button
                                    className="min-w-[124px] rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                                    type="button"
                                >
                                    Install Phantom
                                </button>
                            )}
                        </>
                    )}
                </div>
            </header>

            <main className="mx-auto mt-5 flex max-w-6xl flex-col gap-3">{children}</main>
        </div>
    );
}
