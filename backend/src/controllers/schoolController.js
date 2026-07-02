const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { publicUser } = require("./authController");

// SUPER_ADMIN: list every school on the platform, with quick stats
async function listSchools(req, res, next) {
  try {
    const schools = await prisma.school.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { teachers: true, classes: true, users: true } },
      },
    });
    res.json({ schools });
  } catch (err) {
    next(err);
  }
}

// SUPER_ADMIN: create a school + its first school-admin login in one step
async function createSchool(req, res, next) {
  try {
    const { name, address, email, phone, adminName, adminEmail, adminPassword } = req.body;
    if (!name || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: "name, adminName, adminEmail, adminPassword are required" });
    }
    if (adminPassword.length < 8) {
      return res.status(400).json({ error: "Admin password must be at least 8 characters" });
    }

    const school = await prisma.school.create({ data: { name, address, email, phone } });

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail.toLowerCase().trim(),
        name: adminName,
        passwordHash,
        role: "SCHOOL_ADMIN",
        schoolId: school.id,
      },
    });

    res.status(201).json({ school, admin: publicUser(admin) });
  } catch (err) {
    next(err);
  }
}

async function updateSchool(req, res, next) {
  try {
    const school = await prisma.school.update({
      where: { id: req.params.schoolId },
      data: (({ name, address, email, phone, active }) => ({ name, address, email, phone, active }))(req.body),
    });
    res.json({ school });
  } catch (err) {
    next(err);
  }
}

async function deleteSchool(req, res, next) {
  try {
    await prisma.school.delete({ where: { id: req.params.schoolId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// SUPER_ADMIN: add another admin login to an existing school
async function addSchoolAdmin(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        role: "SCHOOL_ADMIN",
        schoolId: req.params.schoolId,
      },
    });
    res.status(201).json({ admin: publicUser(admin) });
  } catch (err) {
    next(err);
  }
}

// Full drill-down view for the SUPER_ADMIN "view everything" screen
async function schoolOverview(req, res, next) {
  try {
    const schoolId = req.params.schoolId;
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        users: true,
        teachers: { include: { teacherSubjects: { include: { subject: true } } } },
        subjects: true,
        classes: { include: { divisions: true }, orderBy: { order: "asc" } },
        periods: { orderBy: [{ day: "asc" }, { periodNumber: "asc" }] },
      },
    });
    if (!school) return res.status(404).json({ error: "School not found" });
    school.users = school.users.map(publicUser);
    res.json({ school });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSchools,
  createSchool,
  updateSchool,
  deleteSchool,
  addSchoolAdmin,
  schoolOverview,
};
