"use client"

import Image from "next/image"
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Flame,
  RefreshCw,
  Search,
  Skull,
  Sparkles,
} from "lucide-react"
import { Collapsible } from "radix-ui"

import {
  checkTokenAction,
  scanBatchAction,
  type CheckTokenResult,
} from "@/app/actions"
import { FlameProgress } from "@/components/flame-progress"
import { NeonSkeleton } from "@/components/neon-skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DROP_DED_GORGEZ, SCAN_BATCH_DELAY_MS } from "@/lib/constants"
import { cn } from "@/lib/utils"

function pickTokenId(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10)
  if (
    Number.isNaN(n) ||
    n < 1 ||
    n > DROP_DED_GORGEZ.totalSupply
  ) {
    return null
  }
  return n
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
}

function useIsLargeScreen() {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {}
      const mq = window.matchMedia("(min-width: 1024px)")
      mq.addEventListener("change", onStoreChange)
      return () => mq.removeEventListener("change", onStoreChange)
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false
  )
}

export function RevealGorgezApp() {
  const reduceMotion = useReducedMotion()
  const isLg = useIsLargeScreen()
  const [pulseOpen, setPulseOpen] = useState(true)
  const [tokenInput, setTokenInput] = useState("")
  const [checkResult, setCheckResult] = useState<CheckTokenResult | null>(null)
  const [checkErr, setCheckErr] = useState<string | null>(null)
  const [isCheckPending, startCheckTransition] = useTransition()

  const [scanning, setScanning] = useState(false)
  const [scanProgressPct, setScanProgressPct] = useState(0)
  const [scannedThrough, setScannedThrough] = useState(0)
  const [revealedInScan, setRevealedInScan] = useState(0)
  const [unrevealedInScan, setUnrevealedInScan] = useState(0)
  const [unrevealedIds, setUnrevealedIds] = useState<number[]>([])

  const [scanRpcError, setScanRpcError] = useState<string | null>(null)
  const resumeScanCursorRef = useRef<number | null>(null)
  const scanSnapshotRef = useRef<{
    revealed: number
    unrevealed: number
    accUnrevealed: number[]
    scannedThrough: number
  } | null>(null)

  const onCheck = () => {
    setCheckErr(null)
    const id = pickTokenId(tokenInput)
    if (id === null) {
      setCheckErr(`Enter a token ID from 1 to ${DROP_DED_GORGEZ.totalSupply}.`)
      setCheckResult(null)
      return
    }
    startCheckTransition(async () => {
      const res = await checkTokenAction(id)
      setCheckResult(res)
      setCheckErr(null)
    })
  }

  const runFullScan = useCallback(async (resume = false) => {
    setScanRpcError(null)
    setScanning(true)

    let cursor: number | null
    let revealed: number
    let unrevealed: number
    let accUnrevealed: number[]

    if (resume && resumeScanCursorRef.current !== null) {
      cursor = resumeScanCursorRef.current
      const snap = scanSnapshotRef.current
      if (snap) {
        revealed = snap.revealed
        unrevealed = snap.unrevealed
        accUnrevealed = [...snap.accUnrevealed]
        const sortedUnique = [...new Set(accUnrevealed)].sort((a, b) => a - b)
        setRevealedInScan(revealed)
        setUnrevealedInScan(unrevealed)
        setUnrevealedIds(sortedUnique)
        setScannedThrough(snap.scannedThrough)
        setScanProgressPct(
          (snap.scannedThrough / DROP_DED_GORGEZ.totalSupply) * 100
        )
      } else {
        revealed = 0
        unrevealed = 0
        accUnrevealed = []
        setRevealedInScan(0)
        setUnrevealedInScan(0)
        setUnrevealedIds([])
        setScannedThrough(0)
        setScanProgressPct(0)
      }
    } else {
      resumeScanCursorRef.current = null
      scanSnapshotRef.current = null
      setScanProgressPct(0)
      setScannedThrough(0)
      setRevealedInScan(0)
      setUnrevealedInScan(0)
      setUnrevealedIds([])
      cursor = 1
      revealed = 0
      unrevealed = 0
      accUnrevealed = []
    }

    try {
      while (cursor !== null) {
        const batch = await scanBatchAction(cursor)
        if (batch.scanRpcError) {
          resumeScanCursorRef.current = cursor
          setScanRpcError(batch.scanRpcError)
          return
        }

        revealed += batch.revealedInBatch
        unrevealed += batch.unrevealedInBatch
        accUnrevealed.push(...batch.unrevealedIds)

        const sortedUnique = [...new Set(accUnrevealed)].sort((a, b) => a - b)
        setRevealedInScan(revealed)
        setUnrevealedInScan(unrevealed)
        setUnrevealedIds(sortedUnique)
        setScannedThrough(batch.endId)
        setScanProgressPct((batch.endId / DROP_DED_GORGEZ.totalSupply) * 100)

        scanSnapshotRef.current = {
          revealed,
          unrevealed,
          accUnrevealed: [...sortedUnique],
          scannedThrough: batch.endId,
        }

        if (batch.nextStart === null) break
        cursor = batch.nextStart
        await new Promise((r) => setTimeout(r, SCAN_BATCH_DELAY_MS))
      }
      resumeScanCursorRef.current = null
      scanSnapshotRef.current = null
      setScanRpcError(null)
    } finally {
      setScanning(false)
    }
  }, [])

  const exportCsv = () => {
    const header = "token_id\n"
    const body = unrevealedIds.map((id) => `${id}`).join("\n")
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `dropdedgorgez-unrevealed-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const scanSummary = useMemo(() => {
    if (scannedThrough === 0 && !scanning) {
      return "Run a graveyard scan to tally revealed vs unrevealed (scan-local counts)."
    }
    return `Scanned tokens 1–${scannedThrough} of ${DROP_DED_GORGEZ.totalSupply}. Counts reflect this scan only.`
  }, [scannedThrough, scanning])

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-x-hidden">
      <div
        className="pointer-events-none fixed inset-0 skull-watermark"
        aria-hidden
      />

      <header className="relative z-10 overflow-hidden border-b border-[#E8DFD0]/10 bg-[#0a0a0a]">
        <div className="absolute inset-0">
          <Image
            src="/brand/drop-ded-banner.png"
            alt=""
            fill
            className="object-cover object-center opacity-20"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/60 to-[#0a0a0a]" />
        </div>
        <motion.div
          {...(reduceMotion
            ? { initial: false }
            : { initial: { opacity: 0, y: 12 } })}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 mx-auto max-w-4xl px-4 py-8 text-center sm:px-6 sm:py-10 lg:px-10"
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#C75B24]/30 bg-[#1a1a1a]/60 px-3 py-1 text-xs font-medium tracking-wide text-[#E8DFD0] backdrop-blur-sm sm:text-sm">
            <Sparkles className="size-4 shrink-0 text-[#C75B24]" aria-hidden />
            DropDedGorgez · 8888 on Ethereum
          </div>
          <h1
            className={cn(
              "font-heading text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl",
              "bg-gradient-to-r from-[#C75B24] via-[#E84393] to-[#5DBEB3] bg-clip-text text-transparent",
              "logo-glow"
            )}
          >
            RevealGorgez
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#a89a8a] sm:text-lg">
            Know before you snipe{" "}
            <span className="text-[#C75B24]">·</span> No wallet. No lies.
          </p>
          <p className="mx-auto mt-2 max-w-2xl font-mono text-xs text-muted-foreground sm:text-sm">
            Contract{" "}
            <span className="break-all text-[#5DBEB3]/80">
              {DROP_DED_GORGEZ.address}
            </span>
          </p>
        </motion.div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 lg:grid-cols-[1fr,minmax(280px,380px)] lg:gap-8 lg:px-8">
        {/* Main column — left on desktop */}
        <motion.main
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="order-2 flex min-w-0 flex-col gap-6 lg:order-1 lg:gap-8"
        >
          <Card className="relative border-[#C75B24]/25 bg-[#151515]/90 shadow-[0_0_40px_rgba(199,91,36,0.08)] ring-1 ring-[#C75B24]/10">
            <div
              className="pointer-events-none absolute -right-8 -top-8 opacity-[0.07]"
              aria-hidden
            >
              <Skull className="size-40 text-[#C75B24]" strokeWidth={1} />
            </div>
            <CardHeader className="relative z-[1] space-y-2 pb-2">
              <CardTitle className="font-heading text-xl text-[#E8DFD0] sm:text-2xl">
                Snipe intel
              </CardTitle>
              <CardDescription className="text-base text-[#a89a8a]">
                Punch a token ID. We read{" "}
                <code className="rounded bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[#5DBEB3]">
                  tokenURI
                </code>{" "}
                and judge the metadata.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-[1] flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:gap-4">
                <Label
                  htmlFor="token-id"
                  className="text-base font-medium text-[#E8DFD0]"
                >
                  Token ID
                </Label>
                <Input
                  id="token-id"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={`1 – ${DROP_DED_GORGEZ.totalSupply}`}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCheck()
                  }}
                  className={cn(
                    "min-h-[52px] rounded-xl border-[#E8DFD0]/25 bg-[#0a0a0a]/80 px-4 py-3 font-mono text-xl text-[#E8DFD0]",
                    "placeholder:text-muted-foreground/70",
                    "focus-visible:border-[#C75B24] focus-visible:ring-[#C75B24]/40",
                    "sm:min-h-14 sm:text-2xl md:min-h-12 md:text-xl"
                  )}
                />
              </div>
              <Button
                type="button"
                onClick={onCheck}
                disabled={isCheckPending}
                className={cn(
                  "group relative min-h-[52px] w-full overflow-hidden rounded-xl text-lg font-bold tracking-wide",
                  "bg-gradient-to-r from-[#C75B24] via-[#E84393] to-[#5DBEB3] text-[#0a0a0a]",
                  "shadow-[0_0_32px_rgba(199,91,36,0.35)] transition-all duration-200",
                  "hover:brightness-110 hover:shadow-[0_0_48px_rgba(199,91,36,0.45)]",
                  "active:scale-[0.98] disabled:opacity-60",
                  "sm:min-h-14 sm:text-xl md:min-h-12"
                )}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0 opacity-0 transition-opacity group-hover:opacity-100" />
                <span className="relative flex items-center justify-center gap-2">
                  {isCheckPending ? (
                    <>
                      <Search className="size-6 animate-pulse" />
                      Checking…
                    </>
                  ) : (
                    <>
                      <Check className="size-6" strokeWidth={2.5} />
                      CHECK
                    </>
                  )}
                </span>
              </Button>
              {checkErr ? (
                <p className="text-sm text-destructive" role="alert">
                  {checkErr}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <AnimatePresence mode="wait">
            {isCheckPending ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Card className="border-[#C75B24]/20 bg-[#151515]/80">
                  <CardContent className="space-y-4 pt-6">
                    <NeonSkeleton className="h-10 w-40 rounded-lg" />
                    <NeonSkeleton className="h-24 w-full rounded-xl" />
                    <NeonSkeleton className="aspect-square w-full max-w-md rounded-xl" />
                  </CardContent>
                </Card>
              </motion.div>
            ) : checkResult ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <ResultCard
                  result={checkResult}
                  onCopyUri={() =>
                    checkResult.tokenURI && copyText(checkResult.tokenURI)
                  }
                  onRetry={checkResult.error ? onCheck : undefined}
                  checkRetryPending={isCheckPending}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <Card className="border-[#5DBEB3]/20 bg-[#151515]/85">
            <CardHeader>
              <CardTitle className="font-heading text-lg text-[#E8DFD0] sm:text-xl">
                Unrevealed graveyard
              </CardTitle>
              <CardDescription className="text-base">
                IDs flagged unrevealed by your last full scan. Tap a row to load
                it above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  disabled={unrevealedIds.length === 0}
                  onClick={exportCsv}
                  className="min-h-12 w-full border-[#5DBEB3]/40 bg-[#0a0a0a]/50 text-[#5DBEB3] hover:bg-[#1a1a1a] sm:w-auto sm:min-h-11"
                >
                  <Download className="size-5" />
                  Export CSV
                </Button>
                <span className="text-sm text-muted-foreground">
                  {unrevealedIds.length} token
                  {unrevealedIds.length === 1 ? "" : "s"} in list
                </span>
              </div>

              {unrevealedIds.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#1a1a1a] bg-[#0a0a0a]/50 p-6 text-center text-muted-foreground">
                  No unrevealed IDs yet. Run{" "}
                  <span className="text-[#C75B24]">Scan the Whole Graveyard</span>{" "}
                  in Collection Pulse.
                </p>
              ) : (
                <>
                  {/* Mobile: stacked rows */}
                  <ul className="flex max-h-[min(50vh,420px)] flex-col gap-2 overflow-y-auto pr-1 sm:hidden">
                    {unrevealedIds.map((id) => (
                      <li key={id}>
                        <div
                          className={cn(
                            "flex w-full min-h-[52px] items-stretch gap-2 rounded-xl border border-[#1a1a1a] bg-[#0a0a0a]/70 p-2",
                            "transition-colors hover:border-[#C75B24]/40"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setTokenInput(String(id))
                              setCheckErr(null)
                            }}
                            className={cn(
                              "min-h-[48px] min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-lg font-mono text-[#E8DFD0]",
                              "transition-colors active:bg-[#1a1a1a] hover:bg-[#1a1a1a]/50"
                            )}
                          >
                            #{id}
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-12 shrink-0 text-[#5DBEB3] hover:bg-[#1a1a1a]"
                            onClick={() => copyText(String(id))}
                            aria-label={`Copy token ${id}`}
                          >
                            <Copy className="size-5" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Desktop: table — container clips horizontal scroll */}
                  <div className="hidden max-h-[min(50vh,480px)] sm:block">
                    <ScrollArea className="h-[min(50vh,480px)] rounded-xl border border-[#1a1a1a]">
                      <Table className="w-full table-fixed">
                        <TableHeader>
                          <TableRow className="border-[#1a1a1a] hover:bg-transparent">
                            <TableHead className="w-[55%] py-4 pl-4 text-[#C75B24]">
                              Token ID
                            </TableHead>
                            <TableHead className="py-4 pr-4 text-right text-[#C75B24]">
                              Copy
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unrevealedIds.map((id) => (
                            <TableRow
                              key={id}
                              className="cursor-pointer border-[#1a1a1a] hover:bg-[#1a1a1a]/50"
                              onClick={() => {
                                setTokenInput(String(id))
                                setCheckErr(null)
                              }}
                            >
                              <TableCell className="py-4 pl-4 font-mono text-base text-[#E8DFD0]">
                                #{id}
                              </TableCell>
                              <TableCell className="py-4 pr-4 text-right">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="min-h-11 min-w-11 border-[#5DBEB3]/35"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyText(String(id))
                                  }}
                                >
                                  <Copy className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.main>

        {/* Collection pulse — top on mobile, sidebar on desktop */}
        <aside className="order-1 min-w-0 lg:order-2">
          <Collapsible.Root
            open={isLg || pulseOpen}
            onOpenChange={(open) => {
              if (!isLg) setPulseOpen(open)
            }}
            className="min-w-0"
          >
            <Collapsible.Trigger
              className={cn(
                "mb-3 flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-[#C75B24]/35",
                "bg-gradient-to-r from-[#1a1a1a]/80 to-[#151515]/90 px-4 py-3 text-left",
                "font-heading text-lg font-semibold text-[#E8DFD0] shadow-[0_0_20px_rgba(199,91,36,0.12)]",
                "transition-colors hover:border-[#5DBEB3]/40 hover:bg-[#1a1a1a]/90 active:scale-[0.99]",
                "lg:hidden"
              )}
            >
              Collection Pulse
              <ChevronDown
                className={cn(
                  "size-6 shrink-0 text-[#5DBEB3] transition-transform duration-200",
                  pulseOpen && "rotate-180"
                )}
              />
            </Collapsible.Trigger>
            <Collapsible.Content className="min-w-0 overflow-hidden">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.45 }}
              >
                <Card className="sticky top-4 border-[#C75B24]/25 bg-gradient-to-b from-[#1a1a1a]/55 to-[#151515]/95 shadow-[0_0_36px_rgba(199,91,36,0.12)] lg:top-6">
                  <div
                    className="pointer-events-none absolute bottom-0 right-0 opacity-[0.06]"
                    aria-hidden
                  >
                    <Flame className="size-32 text-[#C75B24]" />
                  </div>
                  <CardHeader className="relative z-[1] hidden lg:block">
                    <CardTitle className="font-heading text-xl text-[#E8DFD0] sm:text-2xl">
                      Collection Pulse
                    </CardTitle>
                    <CardDescription className="text-base text-[#a89a8a]">
                      {scanSummary}
                    </CardDescription>
                  </CardHeader>
                  <CardHeader className="relative z-[1] lg:hidden">
                    <CardDescription className="text-base text-[#a89a8a]">
                      {scanSummary}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="relative z-[1] space-y-5">
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="rounded-xl border border-[#5DBEB3]/20 bg-[#0a0a0a]/60 p-4 text-center">
                        <p className="text-xs font-medium uppercase tracking-wider text-[#5DBEB3]/80">
                          Revealed
                        </p>
                        <p className="mt-1 font-heading text-3xl font-bold text-[#5DBEB3] sm:text-4xl">
                          {scannedThrough > 0 || scanning ? revealedInScan : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[#C75B24]/25 bg-[#0a0a0a]/60 p-4 text-center">
                        <p className="text-xs font-medium uppercase tracking-wider text-[#C75B24]/80">
                          Unrevealed
                        </p>
                        <p className="mt-1 font-heading text-3xl font-bold text-[#C75B24] sm:text-4xl">
                          {scannedThrough > 0 || scanning
                            ? unrevealedInScan
                            : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Graveyard progress</span>
                        <span className="font-mono text-[#E8DFD0]">
                          {scannedThrough} / {DROP_DED_GORGEZ.totalSupply}
                        </span>
                      </div>
                      <FlameProgress value={scanProgressPct} className="h-4 sm:h-3" />
                    </div>

                    {scanRpcError && !scanning ? (
                      <div
                        className="flex flex-col gap-3 rounded-xl border border-[#C75B24]/35 bg-[#0a0a0a]/70 p-4"
                        role="alert"
                      >
                        <p className="text-center text-base leading-relaxed text-[#E8DFD0]">
                          {scanRpcError}
                        </p>
                        <Button
                          type="button"
                          onClick={() => runFullScan(true)}
                          className={cn(
                            "min-h-[52px] w-full rounded-xl border border-[#5DBEB3]/45 text-base font-semibold",
                            "bg-[#1a1a1a]/80 text-[#5DBEB3] shadow-[0_0_20px_rgba(93,190,179,0.2)]",
                            "hover:bg-[#5DBEB3]/10 active:scale-[0.98]",
                            "sm:min-h-14"
                          )}
                        >
                          <RefreshCw className="size-5" />
                          Try again
                        </Button>
                      </div>
                    ) : null}

                    <Button
                      type="button"
                      onClick={() => runFullScan(false)}
                      disabled={scanning}
                      className={cn(
                        "relative min-h-[52px] w-full rounded-xl border border-[#C75B24]/50 text-base font-bold",
                        "bg-[#0a0a0a]/80 text-[#C75B24] shadow-[0_0_24px_rgba(199,91,36,0.25)]",
                        "transition-all hover:bg-[#C75B24]/15 hover:shadow-[0_0_36px_rgba(199,91,36,0.4)]",
                        "active:scale-[0.98] disabled:opacity-50",
                        "sm:min-h-14 sm:text-lg"
                      )}
                    >
                      <Flame
                        className={cn(
                          "size-6",
                          scanning && "animate-pulse text-[#5DBEB3]"
                        )}
                      />
                      {scanning
                        ? "Scanning graveyard…"
                        : "Scan the Whole Graveyard"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </Collapsible.Content>
          </Collapsible.Root>
        </aside>
      </div>

      <footer className="relative z-10 mt-auto border-t border-[#1a1a1a] px-4 py-6 text-center text-xs text-muted-foreground sm:text-sm">
        Reveal rules: metadata must include a non-empty{" "}
        <code className="text-[#5DBEB3]/80">image</code> and{" "}
        <code className="text-[#5DBEB3]/80">attributes</code> with length &gt; 0.
        Not financial advice. DYOR.
      </footer>
    </div>
  )
}

function ResultCard({
  result,
  onCopyUri,
  onRetry,
  checkRetryPending = false,
}: {
  result: CheckTokenResult
  onCopyUri: () => void
  onRetry?: () => void
  checkRetryPending?: boolean
}) {
  const rpcCheckFailed = Boolean(result.error && !result.tokenURI)
  const revealed = result.revealed && !rpcCheckFailed

  return (
    <Card className="overflow-hidden border-[#C75B24]/30 bg-[#151515]/95 shadow-[0_0_48px_rgba(199,91,36,0.1)]">
      <CardHeader className="flex flex-col gap-4 border-b border-[#1a1a1a] sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Badge
            variant="outline"
            className="border-[#C75B24]/40 bg-[#1a1a1a]/50 px-3 py-1 font-mono text-base text-[#C75B24]"
          >
            Token #{result.tokenId}
          </Badge>
          <div
            className={cn(
              "flex items-center gap-3 text-2xl font-bold sm:text-3xl",
              rpcCheckFailed
                ? "text-[#C75B24]"
                : revealed
                  ? "text-[#5DBEB3]"
                  : "text-destructive"
            )}
          >
            <Skull className="size-8 shrink-0 sm:size-10" strokeWidth={1.5} />
            {rpcCheckFailed
              ? "Couldn't check"
              : revealed
                ? "Revealed"
                : "Unrevealed"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {result.error ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-[#C75B24]/35 bg-[#C75B24]/10 p-3 text-base leading-relaxed text-[#E8DFD0]">
              {result.error}
            </p>
            {onRetry ? (
              <Button
                type="button"
                onClick={onRetry}
                disabled={checkRetryPending}
                className={cn(
                  "min-h-[52px] w-full rounded-xl border border-[#5DBEB3]/45 font-semibold text-[#5DBEB3]",
                  "bg-[#1a1a1a]/60 hover:bg-[#5DBEB3]/10 active:scale-[0.98] disabled:opacity-50",
                  "sm:min-h-12"
                )}
              >
                <RefreshCw
                  className={cn("size-5", checkRetryPending && "animate-spin")}
                />
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}

        {result.tokenURI ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#a89a8a]">tokenURI</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <p className="min-w-0 flex-1 break-all rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]/70 p-3 font-mono text-xs text-[#5DBEB3]/90 sm:text-sm">
                {result.tokenURI}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={onCopyUri}
                className="min-h-12 shrink-0 border-[#5DBEB3]/35 sm:min-h-0 sm:min-w-[52px]"
              >
                <Copy className="size-5" />
                <span className="sr-only">Copy token URI</span>
              </Button>
            </div>
          </div>
        ) : null}

        {result.metadata ? (
          <details className="group rounded-xl border border-[#1a1a1a] bg-[#0a0a0a]/50">
            <summary className="min-h-[48px] cursor-pointer list-none px-4 py-3 font-medium text-[#E8DFD0] transition-colors marker:content-none hover:bg-[#1a1a1a]/40 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-2">
                Metadata JSON
                <span className="text-[#C75B24] group-open:rotate-180">▼</span>
              </span>
            </summary>
            <pre className="max-h-[min(50vh,320px)] overflow-auto border-t border-[#1a1a1a] p-4 font-mono text-xs leading-relaxed text-[#a89a8a] sm:text-sm">
              {JSON.stringify(result.metadata, null, 2)}
            </pre>
          </details>
        ) : null}

        {revealed && result.imageUrl ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="overflow-hidden rounded-xl border border-[#C75B24]/25 bg-[#0a0a0a]/80 ring-1 ring-[#5DBEB3]/10"
          >
            <Image
              src={result.imageUrl}
              alt={`DropDedGorgez #${result.tokenId}`}
              width={1024}
              height={1024}
              unoptimized
              className="mx-auto h-auto max-h-[min(70vh,640px)] w-full object-contain"
              sizes="(max-width: 768px) 100vw, 640px"
            />
          </motion.div>
        ) : null}
      </CardContent>
    </Card>
  )
}
