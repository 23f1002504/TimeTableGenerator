const prisma = require("../lib/prisma");
const { generateTimetable } = require("../services/timetableGenerator");

async function generate(req, res, next) {
  try {
    const { schoolId } = req.params;
    const { label, keepLocked } = req.body || {};
    const result = await generateTimetable(schoolId, { label, keepLocked });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function listVersions(req, res, next) {
  try {
    const { schoolId } = req.params;
    const versions = await prisma.timetableVersion.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { entries: true } } },
    });
    res.json({ versions });
  } catch (err) {
    next(err);
  }
}

async function publishVersion(req, res, next) {
  try {
    const { schoolId, versionId } = req.params;
    await prisma.$transaction([
      prisma.timetableVersion.updateMany({ where: { schoolId }, data: { published: false } }),
      prisma.timetableVersion.update({ where: { id: versionId }, data: { published: true } }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Full grid for one version: entries plus everything needed to render
// (periods, divisions, subjects, teachers) in one round trip.
async function getVersionGrid(req, res, next) {
  try {
    const { schoolId, versionId } = req.params;

    const [entries, periods, classes] = await Promise.all([
      prisma.timetableEntry.findMany({
        where: { schoolId, versionId },
        include: { subject: true, teacher: true, division: { include: { class: true } } },
      }),
      prisma.period.findMany({ where: { schoolId }, orderBy: [{ day: "asc" }, { periodNumber: "asc" }] }),
      prisma.academicClass.findMany({ where: { schoolId }, include: { divisions: true }, orderBy: { order: "asc" } }),
    ]);

    res.json({ entries, periods, classes });
  } catch (err) {
    next(err);
  }
}

// Per-teacher view: a teacher's own weekly schedule across all divisions
async function getTeacherGrid(req, res, next) {
  try {
    const { versionId, teacherId } = req.params;
    const entries = await prisma.timetableEntry.findMany({
      where: { versionId, teacherId },
      include: { subject: true, division: { include: { class: true } } },
    });
    res.json({ entries });
  } catch (err) {
    next(err);
  }
}

// Manual override of a single cell, with hard conflict checking so the
// "no conflicts" guarantee holds even after hand edits.
async function updateEntry(req, res, next) {
  try {
    const { versionId } = req.params;
    const { divisionId, subjectId, teacherId, day, periodNumber, entryId } = req.body;

    if (!divisionId || !subjectId || !teacherId || !day || !periodNumber) {
      return res.status(400).json({ error: "divisionId, subjectId, teacherId, day, periodNumber are required" });
    }

    const [divisionClash, teacherClash] = await Promise.all([
      prisma.timetableEntry.findFirst({
        where: { versionId, divisionId, day, periodNumber, NOT: entryId ? { id: entryId } : undefined },
      }),
      prisma.timetableEntry.findFirst({
        where: { versionId, teacherId, day, periodNumber, NOT: entryId ? { id: entryId } : undefined },
      }),
    ]);

    if (divisionClash) {
      return res.status(409).json({ error: "This division already has a class scheduled at that time." });
    }
    if (teacherClash) {
      return res.status(409).json({ error: "This teacher is already teaching another division at that time." });
    }

    let entry;
    if (entryId) {
      entry = await prisma.timetableEntry.update({
        where: { id: entryId },
        data: { divisionId, subjectId, teacherId, day, periodNumber },
      });
    } else {
      const version = await prisma.timetableVersion.findUnique({ where: { id: versionId } });
      entry = await prisma.timetableEntry.create({
        data: { schoolId: version.schoolId, versionId, divisionId, subjectId, teacherId, day, periodNumber },
      });
    }

    res.json({ entry });
  } catch (err) {
    next(err);
  }
}

async function deleteEntry(req, res, next) {
  try {
    await prisma.timetableEntry.delete({ where: { id: req.params.entryId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function toggleLock(req, res, next) {
  try {
    const entry = await prisma.timetableEntry.findUnique({ where: { id: req.params.entryId } });
    const updated = await prisma.timetableEntry.update({
      where: { id: req.params.entryId },
      data: { locked: !entry.locked },
    });
    res.json({ entry: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  generate,
  listVersions,
  publishVersion,
  getVersionGrid,
  getTeacherGrid,
  updateEntry,
  deleteEntry,
  toggleLock,
};
