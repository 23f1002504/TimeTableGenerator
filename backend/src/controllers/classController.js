const prisma = require("../lib/prisma");
const { resolveSchoolId } = require("../middleware/auth");

async function list(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const classes = await prisma.academicClass.findMany({
      where: { schoolId },
      include: { divisions: true },
      orderBy: { order: "asc" },
    });
    res.json({ classes });
  } catch (err) {
    next(err);
  }
}

async function createClass(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const { name, order, divisionNames = [] } = req.body;
    if (!name) return res.status(400).json({ error: "Class name is required" });

    const cls = await prisma.academicClass.create({
      data: {
        schoolId,
        name,
        order: order || 0,
        divisions: { create: divisionNames.map((n) => ({ name: n })) },
      },
      include: { divisions: true },
    });
    res.status(201).json({ class: cls });
  } catch (err) {
    next(err);
  }
}

async function updateClass(req, res, next) {
  try {
    const { name, order } = req.body;
    const cls = await prisma.academicClass.update({
      where: { id: req.params.id },
      data: { name, order },
      include: { divisions: true },
    });
    res.json({ class: cls });
  } catch (err) {
    next(err);
  }
}

async function removeClass(req, res, next) {
  try {
    await prisma.academicClass.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function addDivision(req, res, next) {
  try {
    const { name, studentCount } = req.body;
    if (!name) return res.status(400).json({ error: "Division name is required" });
    const division = await prisma.division.create({
      data: { classId: req.params.id, name, studentCount },
    });
    res.status(201).json({ division });
  } catch (err) {
    next(err);
  }
}

async function updateDivision(req, res, next) {
  try {
    const { name, studentCount } = req.body;
    const division = await prisma.division.update({
      where: { id: req.params.divisionId },
      data: { name, studentCount },
    });
    res.json({ division });
  } catch (err) {
    next(err);
  }
}

async function removeDivision(req, res, next) {
  try {
    await prisma.division.delete({ where: { id: req.params.divisionId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, createClass, updateClass, removeClass, addDivision, updateDivision, removeDivision };
