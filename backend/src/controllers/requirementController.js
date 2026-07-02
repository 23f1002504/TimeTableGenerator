const prisma = require("../lib/prisma");

async function listForSchool(req, res, next) {
  try {
    const { schoolId } = req.params;
    const requirements = await prisma.requirement.findMany({
      where: { division: { class: { schoolId } } },
      include: { subject: true, teacher: true, division: { include: { class: true } } },
      orderBy: [{ division: { class: { order: "asc" } } }],
    });
    res.json({ requirements });
  } catch (err) {
    next(err);
  }
}

async function upsert(req, res, next) {
  try {
    const { divisionId, subjectId, teacherId, hoursPerWeek } = req.body;
    if (!divisionId || !subjectId || !teacherId || !hoursPerWeek) {
      return res.status(400).json({ error: "divisionId, subjectId, teacherId, hoursPerWeek are all required" });
    }
    const requirement = await prisma.requirement.upsert({
      where: { divisionId_subjectId: { divisionId, subjectId } },
      update: { teacherId, hoursPerWeek },
      create: { divisionId, subjectId, teacherId, hoursPerWeek },
      include: { subject: true, teacher: true, division: { include: { class: true } } },
    });
    res.status(201).json({ requirement });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await prisma.requirement.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listForSchool, upsert, remove };
