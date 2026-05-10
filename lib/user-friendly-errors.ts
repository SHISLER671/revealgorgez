/** Shown for RPC / CDN / network failures — never raw HTML or stack dumps */
export const RPC_BUSY_USER_MESSAGE =
  "RPC is busy right now. Try again in a few seconds."

function looksLikeHtml(s: string): boolean {
  const t = s.trimStart().slice(0, 64).toLowerCase()
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    t.includes("<html") ||
    t.includes("cloudflare")
  )
}

/** True if this error likely means infrastructure / rate limit, not the contract */
export function isLikelyInfrastructureError(raw: string | undefined | null): boolean {
  if (!raw || !raw.trim()) return true
  const s = raw
  const lower = s.toLowerCase()
  if (looksLikeHtml(s)) return true
  if (s.length > 400) return true
  return (
    lower.includes("cloudflare") ||
    lower.includes("attention required") ||
    lower.includes("http request failed") ||
    lower.includes("non-json") ||
    lower.includes("failed to parse") ||
    lower.includes("unexpected token") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("forbidden") ||
    lower.includes("bad gateway") ||
    lower.includes("service unavailable") ||
    lower.includes("gateway timeout") ||
    /\b403\b/.test(s) ||
    /\b429\b/.test(s) ||
    /\b502\b/.test(s) ||
    /\b503\b/.test(s) ||
    /\b504\b/.test(s)
  )
}

export function toFriendlyErrorMessage(raw: string | undefined | null): string {
  if (!raw || !raw.trim()) return RPC_BUSY_USER_MESSAGE
  if (looksLikeHtml(raw) || isLikelyInfrastructureError(raw)) {
    return RPC_BUSY_USER_MESSAGE
  }
  const s = raw.trim()
  if (s.length > 200) return RPC_BUSY_USER_MESSAGE
  return s
}
