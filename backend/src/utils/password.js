const crypto = require("crypto");

// Generates a readable-ish random password, e.g. "kx7m-qz2p-9wtf".
// Shown to the SUPER_ADMIN exactly once at approval time so they can
// relay it to the school (no outbound email is configured by default).
function generateTempPassword() {
  const part = () => crypto.randomBytes(3).toString("hex");
  return `${part()}-${part()}-${part()}`;
}

module.exports = { generateTempPassword };
