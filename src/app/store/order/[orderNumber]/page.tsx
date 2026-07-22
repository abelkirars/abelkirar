import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { ClearCartOnMount } from "@/components/store/clear-cart-on-mount";
import { PaymentConfirmationForm } from "@/components/store/payment-confirmation-form";
import { getPaymentInstructions } from "@/lib/notifications/payment-instructions";
import { formatMoney, paymentMethodLabel, paymentRegionLabel } from "@/lib/notifications/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order confirmation",
};

async function getOrder(orderNumber: string) {
  return prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
}

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getOrder(orderNumber);
  if (!order) notFound();

  const isManualPayment =
    order.paymentMethod === "ZELLE" ||
    order.paymentMethod === "CASH_APP" ||
    order.paymentMethod === "EUR_BANK_TRANSFER";
  const instructions = isManualPayment
    ? getPaymentInstructions(
        order.paymentMethod as "ZELLE" | "CASH_APP" | "EUR_BANK_TRANSFER",
        orderNumber
      )
    : null;

  const alreadyPaid = order.paymentStatus === "PAID";

  return (
    <section className="py-16 sm:py-20">
      <ClearCartOnMount />
      <Container className="max-w-2xl">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {alreadyPaid ? "Payment confirmed" : "Order received"}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Order number <strong>{orderNumber}</strong>
        </p>

        <div className="mt-8 space-y-2 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">{formatMoney(order.total, order.currency)}</span>
          </div>
          {order.paymentRegion && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment region</span>
              <span className="font-medium">
                {paymentRegionLabel(order.paymentRegion as "US" | "EUROZONE")} (
                {order.currency.toUpperCase()})
              </span>
            </div>
          )}
          {order.paymentMethod && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment method</span>
              <span className="font-medium">
                {paymentMethodLabel(order.paymentMethod as "ZELLE" | "CASH_APP" | "EUR_BANK_TRANSFER")}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">
              {alreadyPaid ? "Paid — processing" : "Pending payment verification"}
            </span>
          </div>
        </div>

        {!alreadyPaid && instructions && (
          <>
            <div className="mt-8 rounded-2xl border border-accent/30 bg-accent/5 p-6">
              <h2 className="font-heading text-xl font-semibold">
                {instructions.heading}
              </h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
                {instructions.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm font-medium text-accent">
                Important: include order number {orderNumber} in your payment
                note so we can match your payment to this order.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Payments are verified manually by our team. Your order will
                not be processed until we&rsquo;ve confirmed your payment —
                this does not happen automatically.
              </p>
            </div>

            <div className="mt-8 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
              <PaymentConfirmationForm orderNumber={orderNumber} />
            </div>
          </>
        )}
      </Container>
    </section>
  );
}
