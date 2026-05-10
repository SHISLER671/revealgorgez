import type { Metadata, Viewport } from "next"
import { Geist_Mono, Orbitron, DM_Sans } from "next/font/google"

import "./globals.css"

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const orbitron = Orbitron({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "RevealGorgez — DropDedGorgez NFT Reveal Checker",
  description:
    "Know before you snipe. Check DropDedGorgez (8888 skeleton PFPs) reveal status via tokenURI — no wallet required.",
  applicationName: "RevealGorgez",
  authors: [{ name: "RevealGorgez" }],
  keywords: [
    "DropDedGorgez",
    "NFT",
    "Ethereum",
    "reveal",
    "tokenURI",
    "skeleton",
    "PFP",
  ],
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { color: "#0a0a0a" },
  ],
  colorScheme: "dark",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark ${dmSans.variable} ${orbitron.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  )
}
