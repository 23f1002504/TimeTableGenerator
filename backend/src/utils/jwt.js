const jwt = require("jsonwebtoken");

// A bare number here means SECONDS to the jsonwebtoken lib, and any
// value it can't parse as a valid duration falls back unpredictably —
// both are easy to get wrong via a pasted env var (stray whitespace,
// wrong units). Validate against the expected "<number><s|m|h|d>"
// shape and fall back to a safe default rather than silently minting
// tokens that expire almost immediately.
function resolveExpiresIn() {
  const raw = (process.env.JWT_EXPIRES_IN || "").trim();
  if (/^\d+(s|m|h|d)$/.test(raw)) return raw;
  if (raw) console.warn(`JWT_EXPIRES_IN="${raw}" isn't a valid duration (e.g. "7d") — falling back to 7d.`);
  return "7d";
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: resolveExpiresIn(),
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
