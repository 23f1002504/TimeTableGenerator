const prisma = require("../lib/prisma");
const stripe = require("../lib/stripe");

/**
 * Mounted with express.raw() (not express.json()) in app.js, because
 * Stripe's signature verification needs the exact raw request body.
 */
async function handleWebhook(req, res) {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const applicationId = session.metadata && session.metadata.applicationId;
        if (applicationId) {
          await prisma.schoolApplication.update({
            where: { id: applicationId },
            data: {
              status: "PAID",
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
            },
          });
        }
        break;
      }

      // Ongoing enforcement: if a school's subscription lapses or is
      // cancelled after approval, disable their access automatically.
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const school = await prisma.school.findUnique({ where: { stripeSubscriptionId: sub.id } });
        if (school) {
          const isHealthy = ["active", "trialing"].includes(sub.status);
          await prisma.school.update({
            where: { id: school.id },
            data: { subscriptionStatus: sub.status, active: isHealthy },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const school = await prisma.school.findUnique({ where: { stripeSubscriptionId: sub.id } });
        if (school) {
          await prisma.school.update({
            where: { id: school.id },
            data: { subscriptionStatus: "canceled", active: false },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const school = await prisma.school.findUnique({ where: { stripeSubscriptionId: invoice.subscription } });
          if (school) {
            await prisma.school.update({
              where: { id: school.id },
              data: { subscriptionStatus: "past_due", active: false },
            });
          }
        }
        break;
      }

      default:
        break; // ignore events we don't act on
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Error processing Stripe webhook:", err);
    // Return 200 anyway once signature is verified — Stripe will retry
    // on non-2xx, and retrying a bug won't fix it. Log and fix forward.
    res.json({ received: true, processingError: true });
  }
}

module.exports = { handleWebhook };
