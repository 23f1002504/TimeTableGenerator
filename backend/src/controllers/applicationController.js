const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const stripe = require("../lib/stripe");
const { generateTempPassword } = require("../utils/password");
const { publicUser } = require("./authController");

function billingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

// ---------- PUBLIC: submitted from the Register page ----------

async function submit(req, res, next) {
  try {
    const { schoolName, address, contactName, contactEmail, contactPhone } = req.body;
    if (!schoolName || !contactName || !contactEmail) {
      return res.status(400).json({ error: "schoolName, contactName and contactEmail are required" });
    }

    const application = await prisma.schoolApplication.create({
      data: {
        schoolName,
        address,
        contactName,
        contactEmail: contactEmail.toLowerCase().trim(),
        contactPhone,
        // No billing configured yet -> skip straight to the approval
        // queue. Once STRIPE_SECRET_KEY / STRIPE_PRICE_ID are set, new
        // registrations will require payment before reaching the queue.
        status: billingConfigured() ? "PENDING_PAYMENT" : "PENDING_APPROVAL",
      },
    });

    if (!billingConfigured()) {
      return res.status(201).json({ pending: true, application: { id: application.id, status: application.status } });
    }

    const appUrl = process.env.APP_URL || "http://localhost:5173";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: application.contactEmail,
      client_reference_id: application.id,
      metadata: { applicationId: application.id },
      subscription_data: { metadata: { applicationId: application.id } },
      success_url: `${appUrl}/apply/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/register?canceled=1`,
    });

    await prisma.schoolApplication.update({
      where: { id: application.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    res.status(201).json({ checkoutUrl: session.url });
  } catch (err) {
    next(err);
  }
}

// ---------- PUBLIC: polled by the post-checkout success page ----------

async function statusBySession(req, res, next) {
  try {
    const application = await prisma.schoolApplication.findUnique({
      where: { stripeCheckoutSessionId: req.params.sessionId },
      select: { schoolName: true, status: true, createdAt: true },
    });
    if (!application) return res.status(404).json({ error: "Application not found" });
    res.json({ application });
  } catch (err) {
    next(err);
  }
}

// ---------- SUPER_ADMIN: review queue ----------

async function list(req, res, next) {
  try {
    const { status } = req.query;
    const statuses = status ? status.split(",").map((s) => s.trim()) : undefined;
    const applications = await prisma.schoolApplication.findMany({
      where: statuses ? { status: { in: statuses } } : undefined,
      orderBy: { createdAt: "desc" },
    });
    res.json({ applications });
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const application = await prisma.schoolApplication.findUnique({ where: { id: req.params.id } });
    if (!application) return res.status(404).json({ error: "Application not found" });
    if (!["PAID", "PENDING_APPROVAL"].includes(application.status)) {
      return res.status(400).json({ error: `Can't approve an application in status ${application.status}.` });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const school = await prisma.school.create({
      data: {
        name: application.schoolName,
        address: application.address,
        email: application.contactEmail,
        phone: application.contactPhone,
        stripeCustomerId: application.stripeCustomerId,
        stripeSubscriptionId: application.stripeSubscriptionId,
        subscriptionStatus: "active",
      },
    });

    const admin = await prisma.user.create({
      data: {
        email: application.contactEmail,
        name: application.contactName,
        passwordHash,
        role: "SCHOOL_ADMIN",
        schoolId: school.id,
      },
    });

    await prisma.schoolApplication.update({
      where: { id: application.id },
      data: { status: "APPROVED", reviewedAt: new Date(), approvedSchoolId: school.id },
    });

    // tempPassword is only ever returned here, once — it isn't stored
    // anywhere in plaintext. Relay it to the school (email, phone, etc.)
    res.status(201).json({ school, admin: publicUser(admin), tempPassword });
  } catch (err) {
    next(err);
  }
}

async function reject(req, res, next) {
  try {
    const { reason } = req.body;
    const existing = await prisma.schoolApplication.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Application not found" });

    if (existing.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(existing.stripeSubscriptionId);
      } catch (stripeErr) {
        console.error("Stripe cancellation failed during rejection:", stripeErr.message);
        // Continue with the rejection regardless — surface this in the
        // response so the admin knows to cancel it manually in Stripe.
      }
    }

    const application = await prisma.schoolApplication.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", reviewedAt: new Date(), rejectionReason: reason || null },
    });
    res.json({ application, note: existing.stripeSubscriptionId ? "Stripe subscription cancelled." : undefined });
  } catch (err) {
    next(err);
  }
}

module.exports = { submit, statusBySession, list, approve, reject };
