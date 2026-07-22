import Link from "next/link";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { formatMoney, paymentStatusLabel } from "@/lib/notifications/types";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ paymentStatus?: string }>;
}) {
  const { paymentStatus } = await searchParams;

  const orders = await prisma.order.findMany({
    where: {
      orderNumber: { not: null },
      ...(paymentStatus ? { paymentStatus: paymentStatus as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <section className="py-10">
      <Container>
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-semibold">Orders</h1>
          <div className="flex gap-2 text-sm">
            <Link
              href="/admin/orders"
              className={!paymentStatus ? "font-medium" : "text-muted-foreground"}
            >
              All
            </Link>
            <Link
              href="/admin/orders?paymentStatus=PENDING_VERIFICATION"
              className={
                paymentStatus === "PENDING_VERIFICATION"
                  ? "font-medium"
                  : "text-muted-foreground"
              }
            >
              Pending verification
            </Link>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4">Payment status</th>
                <th className="py-2 pr-4">Order status</th>
                <th className="py-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-border/60">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{order.customerName}</td>
                  <td className="py-2 pr-4">{formatMoney(order.total, order.currency)}</td>
                  <td className="py-2 pr-4">{order.paymentMethod}</td>
                  <td className="py-2 pr-4">{paymentStatusLabel(order.paymentStatus)}</td>
                  <td className="py-2 pr-4">{order.status}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {order.createdAt.toLocaleString()}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}
