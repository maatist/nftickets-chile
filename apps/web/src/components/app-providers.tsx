"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Client-side provider wrapper. Wires Wagmi (Base Sepolia) and React Query so
 * on-chain reads/writes are available throughout the app. The AuthProvider
 * abstraction (mock/privy) is resolved lazily via `getAuthProvider()` at the
 * call sites that need signing, so it is not mounted here.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
