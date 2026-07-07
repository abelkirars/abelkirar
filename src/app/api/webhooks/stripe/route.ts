import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { resend } from "@/lib/resend";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (!orderId) break;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.status === "PAID") break;

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "PAID",
          stripePaymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
          customerEmail: session.customer_details?.email,
          customerName: session.customer_details?.name,
          shippingAddress: session.collected_information?.shipping_details
            ? JSON.parse(
                JSON.stringify(session.collected_information.shipping_details)
              )
            : undefined,
        },
      });

      if (process.env.RESEND_API_KEY && session.customer_details?.email) {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL as string,
          to: session.customer_details.email,
          subject: "Your Abelkirar order is confirmed",
          html: "<p>Thank you for your order. We'll be in touch with next steps as your instrument is prepared.</p>",
        });
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (orderId) {
        await prisma.order.updateMany({
          where: { id: orderId, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata?.orderId;
      if (orderId) {
        await prisma.order.updateMany({
          where: { id: orderId, status: "PENDING" },
          data: { status: "FAILED" },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
