"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export interface PasswordInputProps extends Omit<React.ComponentProps<typeof Input>, "type"> {
  /** Defaults are hardcoded English — admin call sites can omit these entirely. Student-facing call sites should pass translated strings. */
  showPasswordLabel?: string
  hidePasswordLabel?: string
}

/**
 * Input wrapped with a show/hide toggle — extends the existing Input (same
 * border/focus/invalid styling, just with room reserved for the button) so
 * it never drifts from the rest of the form kit. Always starts hidden.
 */
function PasswordInput({
  className,
  showPasswordLabel = "Show password",
  hidePasswordLabel = "Hide password",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-9", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? hidePasswordLabel : showPasswordLabel}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}

export { PasswordInput }
