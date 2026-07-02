// Normalizes thrown errors (incl. Prisma unique-constraint violations) into
// a consistent JSON shape so the frontend can render useful messages.
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === "P2002") {
    return res.status(409).json({
      error: "A record with these values already exists (duplicate).",
      fields: err.meta && err.meta.target,
    });
  }
  if (err.code === "P2025") {
    return res.status(404).json({ error: "Record not found." });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
}

module.exports = errorHandler;
