const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { signToken } = require("../utils/jwt");

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, schoolId: u.schoolId };
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { school: true },
    });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    if (user.role === "SCHOOL_ADMIN" && user.school && !user.school.active) {
      return res.status(403).json({ error: "This school's account has been disabled. Contact the platform admin for help." });
    }

    const token = signToken({ id: user.id, role: user.role, schoolId: user.schoolId });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    const ok = await bcrypt.compare(currentPassword || "", req.user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, changePassword, publicUser };
