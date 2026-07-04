const { verifyToken } = require("../utils/jwt");
const prisma = require("../lib/prisma");

// Verifies the JWT and attaches `req.user` = { id, role, schoolId, email, name }
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, include: { school: true } });
    if (!user) return res.status(401).json({ error: "Invalid session" });

    // A school can be disabled after a session's token was already issued
    // (e.g. non-payment) — re-check on every request so access is cut
    // off immediately, not just at the next login.
    if (user.role === "SCHOOL_ADMIN" && user.school && !user.school.active) {
      return res.status(403).json({ error: "This school's account has been disabled. Contact the platform admin for help." });
    }

    req.user = user;
    next();
  } catch (err) {
    // The generic message is what the client sees (so we don't leak
    // internals), but log the real cause — this endpoint silently
    // swallowing DB errors as "invalid token" has bitten us before.
    console.error("requireAuth failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Restrict a route to specific roles, e.g. requireRole("SUPER_ADMIN")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Not authorized for this action" });
    }
    next();
  };
}

// Resolves which schoolId the current request should operate on:
// - SUPER_ADMIN may act on any school via ?schoolId= or body.schoolId
// - SCHOOL_ADMIN is always scoped to their own school, regardless of input
function resolveSchoolId(req) {
  if (req.user.role === "SUPER_ADMIN") {
    return req.params.schoolId || req.query.schoolId || req.body.schoolId || null;
  }
  return req.user.schoolId;
}

module.exports = { requireAuth, requireRole, resolveSchoolId };
