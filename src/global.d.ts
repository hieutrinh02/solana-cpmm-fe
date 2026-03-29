import type { InjectedSolanaProvider } from "./lib/wallet";

declare global {
  interface Window {
    solana?: InjectedSolanaProvider;
  }
}
