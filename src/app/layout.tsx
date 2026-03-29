import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

import { AppShell } from "@/components/app-shell";
import { WalletProvider } from "@/components/wallet-provider";

export const metadata: Metadata = {
    title: "Solana CPMM Frontend",
    description: "Frontend for add liquidity, swap, and remove liquidity.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: ReactNode;
}>) {
    return (
        <html lang="en">
            <body>
                <WalletProvider>
                    <AppShell>{children}</AppShell>
                </WalletProvider>
            </body>
        </html>
    );
}
