"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import type { PublicKey } from "@solana/web3.js";

import { getPhantomProvider, type InjectedSolanaProvider } from "@/lib/wallet";

type WalletContextValue = {
    provider: InjectedSolanaProvider | null;
    publicKey: PublicKey | null;
    connecting: boolean;
    hasPhantom: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
    const [provider, setProvider] = useState<InjectedSolanaProvider | null>(null);
    const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        const nextProvider = getPhantomProvider();
        setProvider(nextProvider);
        setPublicKey(nextProvider?.publicKey ?? null);

        if (!nextProvider?.on) {
            return;
        }

        const handleConnect = () => {
            setPublicKey(nextProvider.publicKey ?? null);
        };
        const handleDisconnect = () => {
            setPublicKey(null);
        };
        const handleAccountChanged = (value: PublicKey | null) => {
            setPublicKey(value);
        };

        nextProvider.on("connect", handleConnect);
        nextProvider.on("disconnect", handleDisconnect);
        nextProvider.on("accountChanged", handleAccountChanged);

        return () => {
            nextProvider.removeListener?.("connect", handleConnect);
            nextProvider.removeListener?.("disconnect", handleDisconnect);
            nextProvider.removeListener?.("accountChanged", handleAccountChanged);
        };
    }, []);

    const connect = async () => {
        if (!provider) {
            throw new Error("Phantom wallet was not found. Install Phantom to use this app.");
        }

        setConnecting(true);
        try {
            const result = await provider.connect();
            setPublicKey(result.publicKey ?? provider.publicKey ?? null);
        } finally {
            setConnecting(false);
        }
    };

    const disconnect = async () => {
        if (!provider) {
            return;
        }

        await provider.disconnect();
        setPublicKey(null);
    };

    return (
        <WalletContext.Provider
            value={{
                provider,
                publicKey,
                connecting,
                hasPhantom: Boolean(provider),
                connect,
                disconnect,
            }}
        >
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error("useWallet must be used within WalletProvider.");
    }

    return context;
}
