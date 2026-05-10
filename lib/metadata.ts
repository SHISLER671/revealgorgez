import { DROP_DED_GORGEZ } from "@/lib/constants"
import {
  RPC_BUSY_USER_MESSAGE,
  toFriendlyErrorMessage,
} from "@/lib/user-friendly-errors"

export function resolveFetchableUri(uri: string): string {
  const t = uri.trim()
  if (t.startsWith("ipfs://")) {
    const path = t.slice("ipfs://".length).replace(/^ipfs\//, "")
    return `https://ipfs.io/ipfs/${path}`
  }
  if (t.startsWith("ipfs/")) {
    return `https://ipfs.io/ipfs/${t.replace(/^ipfs\//, "")}`
  }
  if (t.startsWith("ar://")) {
    return `https://arweave.net/${t.slice("ar://".length)}`
  }
  return t
}

function parseDataJsonUri(tokenURI: string): Record<string, unknown> | null {
  const t = tokenURI.trim()
  try {
    if (t.startsWith("data:application/json;base64,")) {
      const b64 = t.split(",")[1] ?? ""
      const json = Buffer.from(b64, "base64").toString("utf-8")
      return JSON.parse(json) as Record<string, unknown>
    }
    if (t.startsWith("data:application/json,")) {
      const raw = t.split(",").slice(1).join(",")
      const json = decodeURIComponent(raw)
      return JSON.parse(json) as Record<string, unknown>
    }
  } catch {
    return null
  }
  return null
}

export async function loadMetadataFromTokenURI(
  tokenURI: string
): Promise<{ metadata: Record<string, unknown> | null; error?: string }> {
  const inlined = parseDataJsonUri(tokenURI)
  if (inlined) {
    return { metadata: inlined }
  }

  const url = resolveFetchableUri(tokenURI)
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12_000)
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    })
    clearTimeout(timer)
    if (!res.ok) {
      return {
        metadata: null,
        error: toFriendlyErrorMessage(`Metadata HTTP ${res.status}`),
      }
    }
    const text = await res.text()
    const trimmed = text.trimStart()
    if (trimmed.startsWith("<") || trimmed.toLowerCase().includes("<!doctype")) {
      return { metadata: null, error: RPC_BUSY_USER_MESSAGE }
    }
    try {
      const metadata = JSON.parse(text) as Record<string, unknown>
      return { metadata }
    } catch {
      return {
        metadata: null,
        error: RPC_BUSY_USER_MESSAGE,
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Metadata fetch failed"
    return { metadata: null, error: toFriendlyErrorMessage(msg) }
  }
}

export function imageUrlFromMetadata(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null
  const image = meta.image
  if (typeof image !== "string" || image.trim() === "") return null
  return resolveFetchableUri(image.trim())
}

/** Revealed = real image URL string + non-empty attributes array */
export function isRevealedMetadata(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false
  const image = meta.image
  if (typeof image !== "string" || image.trim() === "") return false
  const attrs = meta.attributes
  if (!Array.isArray(attrs) || attrs.length === 0) return false
  return true
}

export function assertTokenId(tokenId: number): void {
  if (
    !Number.isInteger(tokenId) ||
    tokenId < 1 ||
    tokenId > DROP_DED_GORGEZ.totalSupply
  ) {
    throw new Error(`Token ID must be 1–${DROP_DED_GORGEZ.totalSupply}`)
  }
}
