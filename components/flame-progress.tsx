"use client"

import { cn } from "@/lib/utils"

type FlameProgressProps = {
  value: number
  className?: string
}

export function FlameProgress({ value, className }: FlameProgressProps) {
  const v = Math.min(100, Math.max(0, value))
  return (
    <div
      className={cn(
        "relative h-3 w-full overflow-hidden rounded-full bg-[#1a0033] ring-1 ring-[#00f0ff]/25",
        className
      )}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="flame-progress-fill relative h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${v}%` }}
      >
        <span className="flame-progress-sheen absolute inset-0 rounded-full opacity-90" />
      </div>
    </div>
  )
}
