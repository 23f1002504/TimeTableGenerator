const prisma = require("../lib/prisma");
const { resolveSchoolId } = require("../middleware/auth");

async function list(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const periods = await prisma.period.findMany({
      where: { schoolId },
      orderBy: [{ day: "asc" }, { periodNumber: "asc" }],
    });
    res.json({ periods });
  } catch (err) {
    next(err);
  }
}

// Bulk-replace the entire bell schedule in one call — this is how the
// admin defines "6 days a week, fully custom period timings" in one go.
// Body: { schedule: [{ day, periodNumber, startTime, endTime, isBreak, label }, ...] }
async function bulkSet(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const { schedule = [] } = req.body;
    if (!Array.isArray(schedule) || schedule.length === 0) {
      return res.status(400).json({ error: "schedule array is required" });
    }

    await prisma.$transaction([
      prisma.period.deleteMany({ where: { schoolId } }),
      prisma.period.createMany({
        data: schedule.map((p) => ({
          schoolId,
          day: p.day,
          periodNumber: p.periodNumber,
          startTime: p.startTime,
          endTime: p.endTime,
          isBreak: !!p.isBreak,
          label: p.label || null,
        })),
      }),
    ]);

    const periods = await prisma.period.findMany({
      where: { schoolId },
      orderBy: [{ day: "asc" }, { periodNumber: "asc" }],
    });
    res.json({ periods });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, bulkSet };
