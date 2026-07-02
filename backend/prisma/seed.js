/**
 * Demo seed data — creates one fully-configured school so you can see a
 * generated timetable immediately after setup, without manual data entry.
 * Run with: npm run seed
 */
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

async function main() {
  console.log("Seeding demo school...");

  const school = await prisma.school.create({
    data: { name: "Green Valley High School", address: "12 Lake Road", email: "office@greenvalley.edu" },
  });

  const passwordHash = await bcrypt.hash("SchoolAdmin123!", 10);
  await prisma.user.create({
    data: {
      email: "admin@greenvalley.edu",
      name: "Priya Shah",
      passwordHash,
      role: "SCHOOL_ADMIN",
      schoolId: school.id,
    },
  });

  // Bell schedule: 6 days/week, 7 teaching periods + 1 lunch break, custom times
  const scheduleRows = [];
  const times = [
    ["08:00", "08:45"],
    ["08:45", "09:30"],
    ["09:30", "10:15"],
    ["10:15", "10:30", true, "Short Break"],
    ["10:30", "11:15"],
    ["11:15", "12:00"],
    ["12:00", "12:45", true, "Lunch"],
    ["12:45", "13:30"],
    ["13:30", "14:15"],
  ];
  for (const day of DAYS) {
    let periodNumber = 1;
    for (const [startTime, endTime, isBreak, label] of times) {
      scheduleRows.push({ schoolId: school.id, day, periodNumber, startTime, endTime, isBreak: !!isBreak, label: label || null });
      periodNumber++;
    }
  }
  await prisma.period.createMany({ data: scheduleRows });

  // Subjects
  const subjectDefs = [
    { name: "Mathematics", code: "MATH", color: "#4F46E5" },
    { name: "English", code: "ENG", color: "#0EA5E9" },
    { name: "Science", code: "SCI", color: "#16A34A" },
    { name: "Social Studies", code: "SST", color: "#F59E0B" },
    { name: "Computer Science", code: "CS", color: "#DB2777" },
    { name: "Physical Education", code: "PE", color: "#65A30D" },
    { name: "Art", code: "ART", color: "#9333EA" },
  ];
  const subjects = {};
  for (const s of subjectDefs) {
    subjects[s.code] = await prisma.subject.create({ data: { ...s, schoolId: school.id } });
  }

  // Teachers, each qualified to teach a couple of subjects
  const teacherDefs = [
    { name: "Mr. Arjun Mehta", subjects: ["MATH", "CS"], maxPeriodsPerDay: 6, maxPeriodsPerWeek: 28 },
    { name: "Ms. Kavita Rao", subjects: ["ENG", "ART"], maxPeriodsPerDay: 6, maxPeriodsPerWeek: 28 },
    { name: "Dr. Sunil Nair", subjects: ["SCI"], maxPeriodsPerDay: 6, maxPeriodsPerWeek: 28 },
    { name: "Ms. Fatima Sheikh", subjects: ["SST", "ENG"], maxPeriodsPerDay: 6, maxPeriodsPerWeek: 28 },
    { name: "Mr. Rohan Das", subjects: ["PE", "MATH"], maxPeriodsPerDay: 6, maxPeriodsPerWeek: 28 },
    { name: "Ms. Leela Iyer", subjects: ["CS", "SCI"], maxPeriodsPerDay: 6, maxPeriodsPerWeek: 28 },
  ];
  const teachers = {};
  for (const t of teacherDefs) {
    teachers[t.name] = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        name: t.name,
        maxPeriodsPerDay: t.maxPeriodsPerDay,
        maxPeriodsPerWeek: t.maxPeriodsPerWeek,
        teacherSubjects: { create: t.subjects.map((code) => ({ subjectId: subjects[code].id })) },
      },
    });
  }

  // Classes + divisions: Grade 6-8, each with A & B divisions
  const classDefs = [
    { name: "Grade 6", divisions: ["A", "B"] },
    { name: "Grade 7", divisions: ["A", "B"] },
    { name: "Grade 8", divisions: ["A"] },
  ];
  const divisions = [];
  let order = 0;
  for (const c of classDefs) {
    const cls = await prisma.academicClass.create({
      data: {
        schoolId: school.id,
        name: c.name,
        order: order++,
        divisions: { create: c.divisions.map((n) => ({ name: n })) },
      },
      include: { divisions: true },
    });
    divisions.push(...cls.divisions);
  }

  // Requirements: each division gets a weekly curriculum
  const curriculum = [
    { code: "MATH", teacher: "Mr. Arjun Mehta", hours: 6 },
    { code: "ENG", teacher: "Ms. Kavita Rao", hours: 5 },
    { code: "SCI", teacher: "Dr. Sunil Nair", hours: 5 },
    { code: "SST", teacher: "Ms. Fatima Sheikh", hours: 4 },
    { code: "CS", teacher: "Ms. Leela Iyer", hours: 3 },
    { code: "PE", teacher: "Mr. Rohan Das", hours: 2 },
    { code: "ART", teacher: "Ms. Kavita Rao", hours: 2 },
  ];

  for (const division of divisions) {
    for (const c of curriculum) {
      await prisma.requirement.create({
        data: {
          divisionId: division.id,
          subjectId: subjects[c.code].id,
          teacherId: teachers[c.teacher].id,
          hoursPerWeek: c.hours,
        },
      });
    }
  }

  console.log("Done. Demo school login:");
  console.log("  School admin: admin@greenvalley.edu / SchoolAdmin123!");
  console.log("Super admin login comes from your .env SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD");
  console.log("Now run the server and call POST /api/timetable/schools/:schoolId/generate to build the timetable.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
