import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { OrderActions } from "@/components/admin/order-actions";
import { QuoteForm } from "@/components/admin/quote-form";
import { ResendQuoteEmailButton } from "@/components/admin/resend-quote-email-button";
import { OrderNotes } from "@/components/admin/order-notes";
import type { SelectedCustomizationSnapshot } from "@/types/customization";
import {
  formatMoney,
  paymentMethodLabel,
  paymentRegionLabel,
  paymentStatusLabel,
} from "@/lib/notifications/types";

export const dynamic = "force-dynamic";

const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  customerOrderPending: "Order confirmation (customer)",
  customerQuoteReady: "Quote ready (customer)",
  customerPaymentConfirmed: "Payment confirmed (customer)",
  customerCustomOrderPending: "Custom order received (customer)",
  adminNewCustomOrder: "New custom order (admin)",
  adminNewOrder: "New order (admin)",
  adminPaymentSubmitted: "Payment submitted (admin)",
  adminPaymentConfirmed: "Payment confirmed (admin)",
  adminPaymentNotFound: "Payment not found (admin)",
  adminOrderCancelled: "Order cancelled (admin)",
};

function notificationKindLabel(kind: string): string {
  return NOTIFICATION_KIND_LABELS[kind] ?? kind;
}

async function getOrder(orderNumber: string) {
  return prisma.order.findUnique({
    where: { orderNumber },
    include: {
      items: true,
      paymentConfirmations: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { admin: true } },
      paymentConfirmedBy: true,
      notificationLogs: { orderBy: { createdAt: "desc" } },
    },
  });
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getOrder(orderNumber);
  if (!order) notFound();

  const shipping = order.shippingAddress as {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;

  return (
    <section className="py-10">
      <Container className="max-w-4xl space-y-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Order {order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {order.createdAt.toLocaleString()}
          </p>
        </div>

        <OrderActions
          orderNumber={order.orderNumber ?? ""}
          paymentStatus={order.paymentStatus}
          orderStatus={order.status}
        />

        {order.paymentStatus === "PENDING_QUOTE" && (
          <QuoteForm
            orderNumber={order.orderNumber ?? ""}
            paymentRegion={order.paymentRegion as "US" | "EUROZONE" | null}
          />
        )}

        {order.quotedAt && <ResendQuoteEmailButton orderNumber={order.orderNumber ?? ""} />}

        {order.customOrderDescription && (
          <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="font-medium">Custom order request</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{order.customOrderDescription}</p>
            {order.customOrderImagePath && (
              <a
                className="mt-2 inline-block text-accent hover:underline"
                href={`/api/admin/orders/${order.orderNumber}/custom-order-image`}
                target="_blank"
                rel="noreferrer"
              >
                View reference photo
              </a>
            )}
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="font-medium">Customer</h2>
            <p className="mt-2 text-sm">{order.customerName}</p>
            <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
            <p className="text-sm text-muted-foreground">{order.customerPhone}</p>
          </div>
          <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="font-medium">Shipping address</h2>
            {shipping ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {shipping.line1}
                {shipping.line2 ? <>, {shipping.line2}</> : null}
                <br />
                {shipping.city}, {shipping.state} {shipping.postalCode}
                <br />
                {shipping.country}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Not provided</p>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="font-medium">Payment</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium">
                {order.paymentStatus === "PENDING_QUOTE"
                  ? paymentStatusLabel(order.paymentStatus)
                  : formatMoney(order.total, order.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Region</dt>
              <dd className="font-medium">
                {order.paymentRegion
                  ? `${paymentRegionLabel(order.paymentRegion as "US" | "EUROZONE")} (${order.currency.toUpperCase()})`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Method</dt>
              <dd className="font-medium">
                {order.paymentMethod
                  ? paymentMethodLabel(order.paymentMethod as "ZELLE" | "CASH_APP" | "EUR_BANK_TRANSFER")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Payment status</dt>
              <dd className="font-medium">{order.paymentStatus}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Order status</dt>
              <dd className="font-medium">{order.status}</dd>
            </div>
          </dl>
          {order.paymentConfirmedBy && order.paymentConfirmedAt && (
            <p className="mt-3 text-sm text-muted-foreground">
              Confirmed by {order.paymentConfirmedBy.displayName} on{" "}
              {order.paymentConfirmedAt.toLocaleString()}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="font-medium">Items</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {order.items.map((item) => {
              // Prefer the resolved snapshot, written once at order-creation
              // time and frozen forever after (prisma/schema.prisma's doc
              // comment on selectedCustomizationSnapshot; DECISIONS.md
              // 2026-08-10). Falls back to raw field:choice IDs only for
              // orders placed before that column existed — those rows have
              // no snapshot to read, and resolving raw IDs against the LIVE
              // product is what DECISIONS.md warned would go silently wrong
              // once an editing UI existed, which it now does.
              const snapshot = item.selectedCustomizationSnapshot as unknown as
                | SelectedCustomizationSnapshot
                | null;
              const snapshotEntries = snapshot ? Object.entries(snapshot) : null;

              const customization = (item.selectedCustomization ?? {}) as Record<string, string>;
              const customizationEntries = Object.entries(customization);

              return (
                <li key={item.id} className="flex flex-col gap-1 py-2">
                  <div className="flex justify-between">
                    <span>
                      {item.quantity} × {item.productNameSnapshot}
                    </span>
                    <span>
                      {order.paymentStatus === "PENDING_QUOTE"
                        ? "—"
                        : formatMoney(item.unitPrice * item.quantity, order.currency)}
                    </span>
                  </div>
                  {snapshotEntries && snapshotEntries.length > 0 ? (
                    <div className="space-y-1">
                      {snapshotEntries.map(([fieldId, entry]) => (
                        <div
                          key={fieldId}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          {entry.imageUrl && (
                            <div className="relative size-8 shrink-0 overflow-hidden rounded ring-1 ring-border">
                              <Image src={entry.imageUrl} alt="" fill className="object-cover" />
                            </div>
                          )}
                          <span>
                            {entry.fieldLabel}: {entry.choiceLabel}
                            {entry.priceModifier !== 0 && (
                              <span className="opacity-70">
                                {" "}
                                ({entry.priceModifier > 0 ? "+" : ""}
                                {formatMoney(entry.priceModifier, order.currency)})
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    customizationEntries.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {customizationEntries
                          .map(([field, choice]) => `${field}: ${choice}`)
                          .join(", ")}
                      </p>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="font-medium">Customer-submitted payment confirmations</h2>
          {order.paymentConfirmations.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              The customer hasn&rsquo;t submitted payment details yet.
            </p>
          )}
          <ul className="mt-2 space-y-3">
            {order.paymentConfirmations.map((confirmation) => (
              <li key={confirmation.id} className="rounded-md bg-muted/50 p-3 text-sm">
                <p>
                  <strong>{confirmation.senderName}</strong> sent{" "}
                  {formatMoney(confirmation.amountSent, order.currency)} on{" "}
                  {confirmation.sentAt.toLocaleString()}
                </p>
                {confirmation.transactionReference && (
                  <p className="text-muted-foreground">
                    Reference: {confirmation.transactionReference}
                  </p>
                )}
                {confirmation.screenshotPath && (
                  <a
                    className="text-accent hover:underline"
                    href={`/api/admin/orders/${order.orderNumber}/screenshot/${confirmation.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View screenshot
                  </a>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Submitted {confirmation.createdAt.toLocaleString()} — a screenshot alone does
                  not confirm payment; verify against the actual Zelle/Cash App account.
                </p>
              </li>
            ))}
          </ul>
        </div>

        {order.notificationLogs.length > 0 && (
          <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="font-medium">Failed notification emails</h2>
            <ul className="mt-2 space-y-3">
              {order.notificationLogs.map((log) => (
                <li key={log.id} className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="font-medium text-destructive">
                    {notificationKindLabel(log.kind)} — failed to send
                  </p>
                  {log.error && <p className="mt-1 text-muted-foreground">{log.error}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {log.createdAt.toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="font-medium">Internal notes</h2>
          <div className="mt-2">
            <OrderNotes
              orderNumber={order.orderNumber ?? ""}
              notes={order.notes.map((n) => ({
                id: n.id,
                body: n.body,
                createdAt: n.createdAt.toISOString(),
                admin: { displayName: n.admin.displayName },
              }))}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
