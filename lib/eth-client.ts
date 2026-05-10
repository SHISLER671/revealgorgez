import { createPublicClient, http } from "viem"
import { mainnet } from "viem/chains"

import { DROP_DED_GORGEZ } from "@/lib/constants"

export const gorgezPublicClient = createPublicClient({
  chain: mainnet,
  transport: http(DROP_DED_GORGEZ.rpcUrl, {
    batch: { wait: 50 },
    retryCount: 2,
  }),
})
