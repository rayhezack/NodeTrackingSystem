import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-primary/20 aria-invalid:ring-destructive/20 dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-sm border border-border/70 bg-muted/20 px-3 py-2 text-base transition-[color,box-shadow,background-color] outline-none focus-visible:ring-[3px] enabled:hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
