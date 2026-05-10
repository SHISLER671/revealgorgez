import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

export function NeonSkeleton({
  className,
  ...props
}: ComponentProps<typeof Skeleton>) {
  return (
    <Skeleton
      className={cn(
        "neon-skeleton-glow bg-[#1a0033]/80",
        className
      )}
      {...props}
    />
  )
}
