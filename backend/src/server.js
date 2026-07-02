require("dotenv").config();
const bcrypt = require("bcryptjs");
const app = require("./app");
const prisma = require("./lib/prisma");

const PORT = process.env.PORT || 4000;

// Ensures a SUPER_ADMIN account exists on first boot, using credentials
// from .env. This is the only account created outside the app itself —
// every school + school-admin after this is created via the API/UI.
async function ensureSuperAdmin() {
  const email = (process.env.SUPER_ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, name: "Platform Admin", passwordHash, role: "SUPER_ADMIN" },
  });
  console.log(`Bootstrapped SUPER_ADMIN account: ${email}`);
}

async function start() {
  await ensureSuperAdmin();
  app.listen(PORT, () => console.log(`Timetable API listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
