"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

export function CustomOrderNotice() {
  const panelId = useId();
  const errorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError("Please upload a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be smaller than 8MB.");
      return;
    }

    setError(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function handleRemoveImage() {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-muted/30 p-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="font-heading text-lg font-semibold">
          Custom Order Available
        </span>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      <div id={panelId} hidden={!expanded} className="mt-5 space-y-5">
        <div>
          <label htmlFor="customOrderDescription" className="text-sm font-medium">
            Describe your custom order
          </label>
          <Textarea
            id="customOrderDescription"
            className="mt-2"
            placeholder="Describe the design, color, size, decoration, tuning, or other details you want."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="customOrderImage" className="text-sm font-medium">
            Upload a custom order image
          </label>

          <input
            ref={fileInputRef}
            id="customOrderImage"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className="sr-only"
          />

          {!preview ? (
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose image
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <div className="relative aspect-4/3 w-full max-w-xs overflow-hidden rounded-lg border border-border">
                <Image
                  src={preview}
                  alt="Selected custom order reference"
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, 320px"
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  aria-label="Remove selected image"
                  className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
                >
                  <X className="size-4" />
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Replace image
              </Button>
            </div>
          )}

          {error && (
            <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
