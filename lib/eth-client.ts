import { createPublicClient, fallback, http } from "viem"
import { mainnet } from "viem/chains"

import { ETH_RPC_URLS } from "@/lib/constants"

const rpcTransports = ETH_RPC_URLS.map((url) =>
  http(url, {
    batch: { wait: 50 },
    timeout: 25_000,
  })
)

export const gorgezPublicClient = createPublicClient({
  chain: mainnet,
  transport: fallback(rpcTransports, {
    /** Re-run the fallback chain once if every endpoint failed */
    retryCount: 1,
    retryDelay: 150,
  }),
})
