const prisma = require("../lib/prisma");
const { resolveSchoolId } = require("../middleware/auth");

async function list(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const subjects = await prisma.subject.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
    res.json({ subjects });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const { name, code, color, isDoublePeriod } = req.body;
    if (!name) return res.status(400).json({ error: "Subject name is required" });
    const subject = await prisma.subject.create({
      data: { schoolId, name, code, color: color || "#4F46E5", isDoublePeriod: !!isDoublePeriod },
    });
    res.status(201).json({ subject });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { name, code, color, isDoublePeriod } = req.body;
    const subject = await prisma.subject.update({
      where: { id: req.params.id },
      data: { name, code, color, isDoublePeriod },
    });
    res.json({ subject });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await prisma.subject.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
