/** Tried in order by viem `fallback` transport (403/429/timeout → next URL) */
export const ETH_RPC_URLS = [
  "https://rpc.ankr.com/eth",
  "https://cloudflare-eth.com",
  "https://ethereum.publicnode.com",
  "https://1rpc.io/eth",
  "https://eth.drpc.org",
] as const

export const DROP_DED_GORGEZ = {
  address: "0x9c51a3cb5094b26aa1dcb380f3dc7e1a7c681c2d" as const,
  totalSupply: 8888,
  name: "DropDedGorgez",
} as const

export const SCAN_BATCH_SIZE = 50
export const SCAN_BATCH_DELAY_MS = 150
