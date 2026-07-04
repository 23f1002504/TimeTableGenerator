const prisma = require("../lib/prisma");
const { resolveSchoolId } = require("../middleware/auth");
const { getOrCreateSettings, DEFAULT_SETTINGS } = require("../services/timetableGenerator");

async function get(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const settings = await getOrCreateSettings(schoolId);
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const {
      maxSameSubjectPerDay,
      teacherMaxConsecutivePeriods,
      spreadSubjectsAcrossWeek,
      preferMorningForPriority,
      avoidTeacherGaps,
    } = req.body;

    const data = {
      maxSameSubjectPerDay: clampInt(maxSameSubjectPerDay, DEFAULT_SETTINGS.maxSameSubjectPerDay, 0, 20),
      teacherMaxConsecutivePeriods: clampInt(teacherMaxConsecutivePeriods, DEFAULT_SETTINGS.teacherMaxConsecutivePeriods, 0, 20),
      spreadSubjectsAcrossWeek: !!spreadSubjectsAcrossWeek,
      preferMorningForPriority: !!preferMorningForPriority,
      avoidTeacherGaps: !!avoidTeacherGaps,
    };

    const settings = await prisma.schoolSettings.upsert({
      where: { schoolId },
      update: data,
      create: { schoolId, ...data },
    });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

module.exports = { get, update };
