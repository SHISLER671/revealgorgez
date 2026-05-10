"use client"

import Image from "next/image"
import {
  useCallback,
  useMemo,
  useRef,
  useState,

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

export function RevealGorgezApp() {
  const reduceMotion = useReducedMotion()

  const [pulseOpen, setPulseOpen] = useState(true)
  const [graveyardOpen, setGraveyardOpen] = useState(true)
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

      <div className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <motion.main
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex min-w-0 flex-col gap-6 lg:gap-8"
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
                      Checking���
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

          {/* Collection Pulse */}
          <Collapsible.Root
            open={pulseOpen}
            onOpenChange={setPulseOpen}
            className="min-w-0"
          >
            <Collapsible.Trigger
              className={cn(
                "flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-[#C75B24]/35",
                "bg-gradient-to-r from-[#1a1a1a]/80 to-[#151515]/90 px-4 py-3 text-left",
                "font-heading text-lg font-semibold text-[#E8DFD0] shadow-[0_0_20px_rgba(199,91,36,0.12)]",
                "transition-colors hover:border-[#5DBEB3]/40 hover:bg-[#1a1a1a]/90 active:scale-[0.99]"
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
                <Card className="mt-3 border-[#C75B24]/25 bg-gradient-to-b from-[#1a1a1a]/55 to-[#151515]/95 shadow-[0_0_36px_rgba(199,91,36,0.12)]">
                  <div
                    className="pointer-events-none absolute bottom-0 right-0 opacity-[0.06]"
                    aria-hidden
                  >
                    <Flame className="size-32 text-[#C75B24]" />
                  </div>
                  <CardHeader className="relative z-[1]">
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
                        ? "Scanning graveyard..."
                        : "Scan the Whole Graveyard"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </Collapsible.Content>
          </Collapsible.Root>

          <Collapsible.Root
            open={graveyardOpen}
            onOpenChange={setGraveyardOpen}
            className="min-w-0"
          >
            <Collapsible.Trigger
              className={cn(
                "flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-[#5DBEB3]/35",
                "bg-gradient-to-r from-[#1a1a1a]/80 to-[#151515]/90 px-4 py-3 text-left",
                "font-heading text-lg font-semibold text-[#E8DFD0] shadow-[0_0_20px_rgba(93,190,179,0.12)]",
                "transition-colors hover:border-[#C75B24]/40 hover:bg-[#1a1a1a]/90 active:scale-[0.99]"
              )}
            >
              <span className="flex items-center gap-2">
                Unrevealed Graveyard
                <span className="rounded-full bg-[#5DBEB3]/20 px-2 py-0.5 text-sm font-medium text-[#5DBEB3]">
                  {unrevealedIds.length}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-6 shrink-0 text-[#C75B24] transition-transform duration-200",
                  graveyardOpen && "rotate-180"
                )}
              />
            </Collapsible.Trigger>
            <Collapsible.Content className="min-w-0 overflow-hidden">
              <Card className="mt-3 border-[#5DBEB3]/20 bg-[#151515]/85">
                <CardHeader>
                  <CardDescription className="text-base">
                    IDs flagged unrevealed by your latest CollectionPulse
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
            </Collapsible.Content>
          </Collapsible.Root>
        </motion.main>
      </div>

      <footer className="relative z-10 mt-auto border-t border-[#1a1a1a] px-4 py-6 text-center text-xs text-muted-foreground sm:text-sm">
        <div className="mb-3 flex items-center justify-center gap-4">
          <a
            href="https://dedgorgez.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block transition-opacity hover:opacity-80"
            aria-label="Visit official DedGorgez website"
          >
            <Image
              src="/brand/skull-mark.png"
              alt="DedGorgez"
              width={36}
              height={36}
              className="brightness-100 sepia saturate-200 hue-rotate-[15deg]"
            />
          </a>
          <a
            href="https://opensea.io/collection/gorgez"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block transition-opacity hover:opacity-80"
            aria-label="View collection on OpenSea"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 90 90"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-[#E8DFD0]"
            >
              <path
                d="M45 0C20.151 0 0 20.151 0 45C0 69.849 20.151 90 45 90C69.849 90 90 69.849 90 45C90 20.151 69.858 0 45 0ZM22.203 46.512L22.392 46.206L34.101 27.891C34.272 27.63 34.677 27.657 34.803 27.945C36.756 32.328 38.448 37.782 37.656 41.175C37.323 42.57 36.396 44.46 35.352 46.206C35.217 46.458 35.073 46.701 34.92 46.937C34.848 47.052 34.723 47.124 34.587 47.124H22.5C22.176 47.124 21.987 46.773 22.203 46.512ZM74.376 52.812C74.376 52.983 74.277 53.127 74.133 53.19C73.224 53.577 70.119 55.008 68.832 56.799C65.538 61.38 63.027 67.932 57.402 67.932H33.948C25.632 67.932 18.9 61.173 18.9 52.83V52.56C18.9 52.344 19.08 52.164 19.305 52.164H32.373C32.634 52.164 32.823 52.398 32.805 52.659C32.706 53.505 32.868 54.378 33.273 55.17C34.047 56.745 35.658 57.726 37.395 57.726H43.866V52.677H37.467C37.134 52.677 36.936 52.299 37.134 52.029C37.206 51.921 37.287 51.804 37.368 51.678C37.971 50.823 38.835 49.491 39.699 47.97C40.302 46.944 40.878 45.846 41.346 44.739C41.454 44.505 41.544 44.262 41.634 44.028C41.778 43.65 41.931 43.29 42.039 42.93C42.147 42.624 42.237 42.3 42.327 41.994C42.588 40.905 42.705 39.753 42.705 38.565C42.705 38.079 42.678 37.575 42.633 37.098C42.606 36.576 42.534 36.054 42.462 35.532C42.408 35.073 42.318 34.623 42.219 34.164C42.039 33.264 41.805 32.373 41.517 31.491L41.418 31.14C41.193 30.42 40.995 29.736 40.743 29.034C40.059 27.171 39.294 25.398 38.457 23.787C38.151 23.187 37.818 22.623 37.494 22.059C37.044 21.276 36.576 20.565 36.135 19.899C35.892 19.521 35.622 19.161 35.379 18.801C35.109 18.396 34.812 17.991 34.533 17.613C34.344 17.352 34.128 17.1 33.948 16.848L33.273 15.921C33.129 15.723 33.291 15.453 33.534 15.507L37.548 16.524H37.566C37.575 16.524 37.575 16.524 37.584 16.524L38.124 16.668L38.718 16.839L38.934 16.902V13.869C38.934 12.321 40.185 11.052 41.715 11.052C42.48 11.052 43.173 11.367 43.668 11.88C44.163 12.393 44.496 13.086 44.496 13.869V18.261L44.937 18.378C44.973 18.387 45.009 18.405 45.045 18.432C45.171 18.522 45.36 18.666 45.603 18.855C45.792 19.008 45.999 19.197 46.251 19.386C46.749 19.773 47.349 20.268 48.015 20.844C48.195 20.997 48.366 21.159 48.519 21.321C49.41 22.131 50.418 23.094 51.372 24.192C51.642 24.516 51.903 24.849 52.173 25.2C52.443 25.56 52.731 25.911 52.974 26.262C53.298 26.748 53.658 27.252 53.955 27.774C54.108 28.044 54.288 28.323 54.423 28.593C54.819 29.313 55.152 30.06 55.449 30.806C55.557 31.095 55.665 31.419 55.746 31.734C56.007 32.535 56.196 33.363 56.295 34.191C56.331 34.389 56.349 34.605 56.358 34.812C56.394 35.325 56.403 35.847 56.358 36.378C56.331 36.792 56.277 37.188 56.205 37.602C56.124 38.034 56.016 38.457 55.881 38.898C55.62 39.744 55.287 40.572 54.873 41.355C54.738 41.652 54.576 41.967 54.405 42.264C54.225 42.588 54.027 42.903 53.856 43.2C53.613 43.596 53.343 43.983 53.091 44.352C52.866 44.739 52.623 45.126 52.353 45.486C51.966 46.017 51.597 46.521 51.201 47.007C51.021 47.241 50.814 47.493 50.616 47.718C50.4 47.97 50.175 48.204 49.977 48.42C49.653 48.78 49.365 49.095 49.095 49.383L48.519 50.004C48.42 50.112 48.285 50.175 48.141 50.175H44.496V57.726H49.212C50.319 57.726 51.372 57.33 52.218 56.61C52.515 56.358 54.153 54.936 56.07 52.974C56.142 52.893 56.232 52.839 56.331 52.812L73.962 47.952C74.214 47.88 74.376 48.105 74.376 48.357V52.812Z"
                fill="currentColor"
              />
            </svg>
          </a>
        </div>
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
