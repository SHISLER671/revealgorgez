"use server"

import { gorgezPublicClient } from "@/lib/eth-client"
import {
  assertTokenId,
  imageUrlFromMetadata,
  isRevealedMetadata,
  loadMetadataFromTokenURI,
} from "@/lib/metadata"
import { erc721TokenUriAbi } from "@/lib/token-uri-abi"
import { DROP_DED_GORGEZ, SCAN_BATCH_SIZE } from "@/lib/constants"

export type CheckTokenResult = {
  tokenId: number
  revealed: boolean
  tokenURI: string | null
  metadata: Record<string, unknown> | null
  imageUrl: string | null
  error?: string
}

export async function checkTokenAction(tokenId: number): Promise<CheckTokenResult> {
  assertTokenId(tokenId)
  try {
    const tokenURI = await gorgezPublicClient.readContract({
      address: DROP_DED_GORGEZ.address,
      abi: erc721TokenUriAbi,
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    })

    const { metadata, error: metaErr } = await loadMetadataFromTokenURI(tokenURI)
    const revealed = isRevealedMetadata(metadata)
    const imageUrl = revealed ? imageUrlFromMetadata(metadata) : null

    return {
      tokenId,
      revealed,
      tokenURI,
      metadata,
      imageUrl,
      ...(metaErr ? { error: metaErr } : {}),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chain read failed"
    return {
      tokenId,
      revealed: false,
      tokenURI: null,
      metadata: null,
      imageUrl: null,
      error: msg,
    }
  }
}

export type ScanBatchResult = {
  startId: number
  endId: number
  revealedInBatch: number
  unrevealedInBatch: number
  unrevealedIds: number[]
  nextStart: number | null
  errors: string[]
}

export async function scanBatchAction(startId: number): Promise<ScanBatchResult> {
  if (!Number.isInteger(startId) || startId < 1 || startId > DROP_DED_GORGEZ.totalSupply) {
    throw new Error("Invalid scan start")
  }

  const endId = Math.min(startId + SCAN_BATCH_SIZE - 1, DROP_DED_GORGEZ.totalSupply)
  const ids = Array.from({ length: endId - startId + 1 }, (_, i) => startId + i)

  const uris = await Promise.all(
    ids.map(async (id) => {
      try {
        const uri = await gorgezPublicClient.readContract({
          address: DROP_DED_GORGEZ.address,
          abi: erc721TokenUriAbi,
          functionName: "tokenURI",
          args: [BigInt(id)],
        })
        return { id, tokenURI: uri as string, err: null as string | null }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "tokenURI failed"
        return { id, tokenURI: null as string | null, err: msg }
      }
    })
  )

  const errors: string[] = []
  let revealedInBatch = 0
  let unrevealedInBatch = 0
  const unrevealedIds: number[] = []

  for (const row of uris) {
    if (!row.tokenURI || row.err) {
      errors.push(`#${row.id}: ${row.err ?? "no URI"}`)
      unrevealedInBatch++
      unrevealedIds.push(row.id)
      continue
    }

    const { metadata, error: metaErr } = await loadMetadataFromTokenURI(row.tokenURI)
    if (metaErr) {
      errors.push(`#${row.id}: ${metaErr}`)
    }

    const revealed = isRevealedMetadata(metadata)
    if (revealed) {
      revealedInBatch++
    } else {
      unrevealedInBatch++
      unrevealedIds.push(row.id)
    }
  }

  const nextStart = endId < DROP_DED_GORGEZ.totalSupply ? endId + 1 : null

  return {
    startId,
    endId,
    revealedInBatch,
    unrevealedInBatch,
    unrevealedIds,
    nextStart,
    errors,
  }
}
