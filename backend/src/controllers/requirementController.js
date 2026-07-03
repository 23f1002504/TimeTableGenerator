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

// Copies every subject+teacher+hours entry from one division onto one
// or more other divisions — the main time-saver for classes where every
// division shares the same curriculum. Existing entries on the target
// divisions for the same subject are overwritten; anything the target
// already has that the source doesn't is left alone (so you can copy,
// then hand-adjust just the differences rather than starting from zero).
async function copyToDivisions(req, res, next) {
  try {
    const { fromDivisionId, toDivisionIds } = req.body;
    if (!fromDivisionId || !Array.isArray(toDivisionIds) || toDivisionIds.length === 0) {
      return res.status(400).json({ error: "fromDivisionId and a non-empty toDivisionIds array are required" });
    }

    const sourceRequirements = await prisma.requirement.findMany({ where: { divisionId: fromDivisionId } });
    if (sourceRequirements.length === 0) {
      return res.status(400).json({ error: "The source division has no curriculum entries to copy yet." });
    }

    const targets = toDivisionIds.filter((id) => id !== fromDivisionId);
    let copiedCount = 0;

    for (const divisionId of targets) {
      for (const req of sourceRequirements) {
        await prisma.requirement.upsert({
          where: { divisionId_subjectId: { divisionId, subjectId: req.subjectId } },
          update: { teacherId: req.teacherId, hoursPerWeek: req.hoursPerWeek },
          create: { divisionId, subjectId: req.subjectId, teacherId: req.teacherId, hoursPerWeek: req.hoursPerWeek },
        });
        copiedCount++;
      }
    }

    res.status(201).json({ copiedCount, targetDivisions: targets.length, entriesPerDivision: sourceRequirements.length });
  } catch (err) {
    next(err);
  }
}

module.exports = { listForSchool, upsert, remove, copyToDivisions };
