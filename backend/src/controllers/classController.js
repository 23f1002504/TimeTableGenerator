const prisma = require("../lib/prisma");
const { resolveSchoolId } = require("../middleware/auth");

// Generates A, B, C ... Z, AA, AB ... for divisionsCount divisions —
// covers any realistic school size.
function letterNames(count, startIndex = 0) {
  const names = [];
  for (let i = 0; i < count; i++) {
    let n = startIndex + i;
    let label = "";
    do {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    names.push(label);
  }
  return names;
}

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

// `divisionsCount` (e.g. 4) auto-generates A, B, C, D — no need to
// type each division name by hand. `divisionNames` still works if you
// want custom labels instead.
async function createClass(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const { name, order, divisionNames, divisionsCount } = req.body;
    if (!name) return res.status(400).json({ error: "Class name is required" });

    const names = Array.isArray(divisionNames) && divisionNames.length > 0 ? divisionNames : letterNames(divisionsCount > 0 ? divisionsCount : 1);

    const cls = await prisma.academicClass.create({
      data: {
        schoolId,
        name,
        order: order || 0,
        divisions: { create: names.map((n) => ({ name: n })) },
      },
      include: { divisions: true },
    });
    res.status(201).json({ class: cls });
  } catch (err) {
    next(err);
  }
}

// Creates a whole range of classes in one shot, e.g. prefix="Grade",
// startNum=1, endNum=10, divisionsCount=3 -> "Grade 1".."Grade 10",
// each with divisions A, B, C. Saves clicking "Add class" ten times.
async function createClassRange(req, res, next) {
  try {
    const schoolId = resolveSchoolId(req);
    const { prefix, startNum, endNum, divisionsCount } = req.body;
    if (!prefix || startNum == null || endNum == null) {
      return res.status(400).json({ error: "prefix, startNum and endNum are required" });
    }
    const start = Number(startNum);
    const end = Number(endNum);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      return res.status(400).json({ error: "startNum must be a whole number <= endNum" });
    }
    if (end - start > 50) {
      return res.status(400).json({ error: "That's more than 50 classes at once — split it into smaller ranges." });
    }

    const divNames = letterNames(divisionsCount > 0 ? divisionsCount : 1);
    const existingCount = await prisma.academicClass.count({ where: { schoolId } });

    const created = [];
    for (let i = start; i <= end; i++) {
      const cls = await prisma.academicClass.create({
        data: {
          schoolId,
          name: `${prefix} ${i}`,
          order: existingCount + (i - start),
          divisions: { create: divNames.map((n) => ({ name: n })) },
        },
        include: { divisions: true },
      });
      created.push(cls);
    }

    res.status(201).json({ classes: created });
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

// Adds N more divisions in one call, auto-continuing the letter
// sequence from whatever divisions already exist on the class (e.g.
// class already has A, B -> asking for 2 more creates C, D).
async function addDivisionsBulk(req, res, next) {
  try {
    const { count } = req.body;
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 26) {
      return res.status(400).json({ error: "count must be a whole number between 1 and 26" });
    }
    const existing = await prisma.division.count({ where: { classId: req.params.id } });
    const names = letterNames(n, existing);

    await prisma.division.createMany({
      data: names.map((name) => ({ classId: req.params.id, name })),
    });

    const cls = await prisma.academicClass.findUnique({
      where: { id: req.params.id },
      include: { divisions: true },
    });
    res.status(201).json({ class: cls });
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

module.exports = {
  list,
  createClass,
  createClassRange,
  updateClass,
  removeClass,
  addDivision,
  addDivisionsBulk,
  updateDivision,
  removeDivision,
};
