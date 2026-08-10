import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { OrderActions } from "@/components/admin/order-actions";
import { QuoteForm } from "@/components/admin/quote-form";
import { ResendQuoteEmailButton } from "@/components/admin/resend-quote-email-button";
import { OrderNotes } from "@/components/admin/order-notes";
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
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between py-2">
                <span>
                  {item.quantity} × {item.productNameSnapshot}
                </span>
                <span>
                  {order.paymentStatus === "PENDING_QUOTE"
                    ? "—"
                    : formatMoney(item.unitPrice * item.quantity, order.currency)}
                </span>
              </li>
            ))}
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
