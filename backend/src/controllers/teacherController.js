const prisma = require("../lib/prisma");
const { resolveSchoolId } = require("../middleware/auth");

async function list(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const teachers = await prisma.teacher.findMany({
      where: { schoolId },
      include: {
        teacherSubjects: { include: { subject: true } },
        unavailabilities: true,
      },
      orderBy: { name: "asc" },
    });
    res.json({ teachers });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const { name, email, maxPeriodsPerDay, maxPeriodsPerWeek, subjectIds = [] } = req.body;
    if (!name) return res.status(400).json({ error: "Teacher name is required" });

    const teacher = await prisma.teacher.create({
      data: {
        schoolId,
        name,
        email,
        maxPeriodsPerDay: maxPeriodsPerDay || 6,
        maxPeriodsPerWeek: maxPeriodsPerWeek || 30,
        teacherSubjects: { create: subjectIds.map((subjectId) => ({ subjectId })) },
      },
      include: { teacherSubjects: { include: { subject: true } } },
    });
    res.status(201).json({ teacher });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { name, email, maxPeriodsPerDay, maxPeriodsPerWeek, subjectIds } = req.body;

    const teacher = await prisma.teacher.update({
      where: { id },
      data: { name, email, maxPeriodsPerDay, maxPeriodsPerWeek },
    });

    if (Array.isArray(subjectIds)) {
      await prisma.teacherSubject.deleteMany({ where: { teacherId: id } });
      if (subjectIds.length > 0) {
        await prisma.teacherSubject.createMany({
          data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })),
        });
      }
    }

    const full = await prisma.teacher.findUnique({
      where: { id },
      include: { teacherSubjects: { include: { subject: true } }, unavailabilities: true },
    });
    res.json({ teacher: full });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await prisma.teacher.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Replace the full set of unavailable slots for a teacher, e.g.
// [{ day: "MON", periodNumber: 1 }, { day: "WED", periodNumber: 6 }]
async function setUnavailability(req, res, next) {
  try {
    const { id } = req.params;
    const { slots = [] } = req.body;
    await prisma.teacherUnavailability.deleteMany({ where: { teacherId: id } });
    if (slots.length > 0) {
      await prisma.teacherUnavailability.createMany({
        data: slots.map((s) => ({ teacherId: id, day: s.day, periodNumber: s.periodNumber })),
      });
    }
    const unavailabilities = await prisma.teacherUnavailability.findMany({ where: { teacherId: id } });
    res.json({ unavailabilities });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove, setUnavailability };
