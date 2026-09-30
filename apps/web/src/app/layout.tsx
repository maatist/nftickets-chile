import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export const metadata: Metadata = {
  title: "NFTickets Chile",
  description:
    "Decentralized event ticketing — ERC-1155 tickets, on-chain resale caps, dynamic EIP-712 QR verification.",
  manifest: "/manifest.json",
  applicationName: "NFTickets Chile",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "NFTickets Chile",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
