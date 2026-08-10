"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
// Reference-photo upload lands in Phase 3 (private bucket + signed URLs).
// The picker UI/state below is kept intact, just not rendered, so wiring it
// up later doesn't require rebuilding this part.
// Wired to POST /api/custom-orders (piece 4) — field name "customOrderImage"
// must match formData.get("customOrderImage") on the route exactly.
const ENABLE_CUSTOM_ORDER_IMAGE_UPLOAD = true;

type PaymentRegion = "US" | "EUROZONE";

export function CustomOrderNotice({ productId }: { productId: string }) {
  const t = useTranslations("customOrderNotice");
  const router = useRouter();
  const panelId = useId();
  const imageErrorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentRegion, setPaymentRegion] = useState<PaymentRegion>("US");

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setImageError(t("imageTypeError"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(t("imageSizeError"));
      return;
    }

    setImageError(null);
    setImageFile(file);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function handleRemoveImage() {
    setImageFile(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageError(null);
  }

  async function handleSubmit() {
    setSubmitError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("productId", productId);
      formData.set("description", description);
      formData.set("customerName", customerName);
      formData.set("customerEmail", customerEmail);
      formData.set("customerPhone", customerPhone);
      formData.set("paymentRegion", paymentRegion);
      if (imageFile) formData.set("customOrderImage", imageFile);

      const res = await fetch("/api/custom-orders", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? t("genericError"));
        return;
      }
      if (data.imageUploaded === false) {
        router.push(`/store/order/${data.orderNumber}?photoAttachFailed=1`);
      } else {
        router.push(`/store/order/${data.orderNumber}`);
      }
    } catch {
      setSubmitError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    description.trim().length >= 10 && !!customerName && !!customerEmail && !!customerPhone;

  return (
    <div className="mt-8 rounded-2xl border border-border bg-muted/30 p-6">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="font-heading text-lg font-semibold">{t("toggleLabel")}</span>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      <div id={panelId} hidden={!expanded} className="mt-5 space-y-5">
        <p className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm text-foreground">
          {t("pricingNotice")}
        </p>

        <div>
          <label htmlFor="customOrderDescription" className="text-sm font-medium">
            {t("descriptionLabel")}
          </label>
          <Textarea
            id="customOrderDescription"
            className="mt-2"
            placeholder={t("descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {ENABLE_CUSTOM_ORDER_IMAGE_UPLOAD && (
          <div>
            <label htmlFor="customOrderImage" className="text-sm font-medium">
              {t("imageLabel")}
            </label>

            <input
              ref={fileInputRef}
              id="customOrderImage"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              aria-invalid={!!imageError}
              aria-describedby={imageError ? imageErrorId : undefined}
              className="sr-only"
            />

            {!preview ? (
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t("chooseImage")}
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
                    aria-label={t("removeImageAriaLabel")}
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
                  {t("replaceImage")}
                </Button>
              </div>
            )}

            {imageError && (
              <p id={imageErrorId} role="alert" className="mt-2 text-sm text-destructive">
                {imageError}
              </p>
            )}
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-5">
          <Label>{t("contactDetails")}</Label>
          <Input
            placeholder={t("fullName")}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
          <Input
            type="email"
            placeholder={t("emailAddress")}
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
          <Input
            type="tel"
            placeholder={t("phoneNumber")}
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
        </div>

        <div className="space-y-3 border-t border-border pt-5">
          <Label>{t("paymentRegion")}</Label>
          <div className="flex gap-2">
            {(["US", "EUROZONE"] as const).map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => setPaymentRegion(region)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                  paymentRegion === region
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                {region === "US" ? t("usRegion") : t("eurozoneRegion")}
              </button>
            ))}
          </div>
        </div>

        {submitError && <p className="text-sm text-destructive">{submitError}</p>}

        <Button className="w-full" disabled={loading || !canSubmit} onClick={handleSubmit}>
          {loading ? t("submitting") : t("submit")}
        </Button>
      </div>
    </div>
  );
}
