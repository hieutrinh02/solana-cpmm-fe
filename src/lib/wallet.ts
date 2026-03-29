import type { PublicKey, Transaction } from "@solana/web3.js";

type ConnectOptions = {
    onlyIfTrusted?: boolean;
};

type ConnectResult = {
    publicKey: PublicKey;
};

type AccountChangedHandler = (publicKey: PublicKey | null) => void;
type VoidHandler = () => void;

export type InjectedSolanaProvider = {
    isPhantom?: boolean;
    publicKey?: PublicKey | null;
    connect: (options?: ConnectOptions) => Promise<ConnectResult>;
    disconnect: () => Promise<void>;
    signTransaction: (transaction: Transaction) => Promise<Transaction>;
    on?: (
        event: "connect" | "disconnect" | "accountChanged",
        handler: AccountChangedHandler | VoidHandler,
    ) => void;
    removeListener?: (
        event: "connect" | "disconnect" | "accountChanged",
        handler: AccountChangedHandler | VoidHandler,
    ) => void;
};

export function getPhantomProvider(): InjectedSolanaProvider | null {
    if (typeof window === "undefined") {
        return null;
    }

    const provider = window.solana;
    if (!provider?.isPhantom) {
        return null;
    }

    return provider;
}
