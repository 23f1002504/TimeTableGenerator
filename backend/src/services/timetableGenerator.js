/**
 * TIMETABLE GENERATION ENGINE
 * ============================================================
 * Treats scheduling as a Constraint Satisfaction Problem (CSP):
 *
 *   Variables : one per "lesson unit" — e.g. if Division 5A needs
 *               Math 6x/week, that's 6 separate lesson units to place.
 *   Domain    : every (day, periodNumber) slot from the school's bell
 *               schedule (excluding breaks).
 *   Constraints (all hard, all enforced):
 *     1. A division can only have one subject in a given slot.
 *     2. A teacher can only be in one place in a given slot.
 *     3. A teacher never exceeds maxPeriodsPerDay / maxPeriodsPerWeek.
 *     4. A teacher is never placed in a slot they marked unavailable.
 *     5. Manually "locked" entries from a previous version are kept as-is
 *        and treated as pre-filled constraints.
 *     6. Double-period subjects (e.g. labs) are placed as two
 *        back-to-back periods on the same day.
 *   Soft preference (best-effort, relaxed if it blocks a solution):
 *     - Spread a subject's lessons across different days for a division
 *       rather than stacking them on the same day.
 *
 * Approach: most-constrained-first backtracking with randomized
 * tie-breaking + restart, which in practice converges quickly for
 * realistic school inputs (tens of teachers/divisions). If no complete
 * solution is found within the attempt budget, the best partial
 * solution is returned along with a list of unplaced lessons so a
 * human can resolve the remaining conflicts by hand.
 * ============================================================
 */

const prisma = require("../lib/prisma");

const MAX_BACKTRACK_STEPS = 60000; // per attempt, guards against runaway recursion
const MAX_ATTEMPTS = 25; // randomized restarts

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Simple seeded RNG (mulberry32) so a given attempt number is reproducible.
function makeRng(seed) {
  let t = seed + 0x6d2b79f5;
  return function () {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const slotKey = (day, periodNumber) => `${day}#${periodNumber}`;

/**
 * Loads everything needed to generate a timetable for a school.
 */
async function loadSchoolData(schoolId) {
  const [periods, requirements, teachers, divisions] = await Promise.all([
    prisma.period.findMany({
      where: { schoolId, isBreak: false },
      orderBy: [{ day: "asc" }, { periodNumber: "asc" }],
    }),
    prisma.requirement.findMany({
      where: { division: { class: { schoolId } } },
      include: { subject: true, teacher: { include: { unavailabilities: true } }, division: { include: { class: true } } },
    }),
    prisma.teacher.findMany({
      where: { schoolId },
      include: { unavailabilities: true },
    }),
    prisma.division.findMany({
      where: { class: { schoolId } },
      include: { class: true },
    }),
  ]);

  return { periods, requirements, teachers, divisions };
}

/**
 * Expands requirements into individual lesson units to place.
 * A requirement of "6 hours/week" becomes 6 lesson objects (or 3 if
 * it's a double-period subject, each occupying 2 consecutive slots).
 */
function buildLessons(requirements) {
  const lessons = [];
  let idCounter = 0;

  for (const req of requirements) {
    const isDouble = req.subject.isDoublePeriod;
    const units = isDouble ? Math.ceil(req.hoursPerWeek / 2) : req.hoursPerWeek;

    for (let i = 0; i < units; i++) {
      lessons.push({
        lessonId: `L${idCounter++}`,
        requirementId: req.id,
        divisionId: req.divisionId,
        divisionLabel: `${req.division.class.name} ${req.division.name}`,
        subjectId: req.subjectId,
        subjectName: req.subject.name,
        teacherId: req.teacherId,
        teacherName: req.teacher.name,
        double: isDouble,
      });
    }
  }
  return lessons;
}

/**
 * Groups the school's bell-schedule periods by day, and finds pairs of
 * consecutive period numbers on the same day (for double periods).
 */
function indexPeriods(periods) {
  const byDay = {};
  for (const p of periods) {
    byDay[p.day] = byDay[p.day] || [];
    byDay[p.day].push(p.periodNumber);
  }
  for (const day in byDay) byDay[day].sort((a, b) => a - b);

  const allSlots = periods.map((p) => ({ day: p.day, periodNumber: p.periodNumber }));

  const consecutivePairs = [];
  for (const day in byDay) {
    const nums = byDay[day];
    for (let i = 0; i < nums.length - 1; i++) {
      if (nums[i + 1] === nums[i] + 1) {
        consecutivePairs.push({ day, first: nums[i], second: nums[i + 1] });
      }
    }
  }

  return { byDay, allSlots, consecutivePairs };
}

/**
 * Runs one backtracking attempt. Returns { success, placements, unplaced }.
 */
function attempt(lessons, periodIndex, teacherMeta, seed, preLocked) {
  const rng = makeRng(seed);
  const orderedLessons = shuffle(lessons, rng);

  // Most-constrained-first: teachers with fewer available slots / more
  // load go first, since they're hardest to place later.
  orderedLessons.sort((a, b) => {
    const loadA = teacherMeta[a.teacherId].weeklyLoad;
    const loadB = teacherMeta[b.teacherId].weeklyLoad;
    return loadB - loadA;
  });

  // Occupancy trackers
  const divisionBusy = new Set(); // `${divisionId}#${slotKey}`
  const teacherBusy = new Set(); // `${teacherId}#${slotKey}`
  const teacherDayCount = {}; // `${teacherId}#${day}` -> count
  const teacherWeekCount = {}; // teacherId -> count
  const divisionSubjectDay = new Set(); // `${divisionId}#${subjectId}#${day}` soft-avoid

  // Seed with pre-locked entries (kept as-is from a previous version)
  for (const l of preLocked) {
    divisionBusy.add(`${l.divisionId}#${slotKey(l.day, l.periodNumber)}`);
    teacherBusy.add(`${l.teacherId}#${slotKey(l.day, l.periodNumber)}`);
    teacherDayCount[`${l.teacherId}#${l.day}`] = (teacherDayCount[`${l.teacherId}#${l.day}`] || 0) + 1;
    teacherWeekCount[l.teacherId] = (teacherWeekCount[l.teacherId] || 0) + 1;
    divisionSubjectDay.add(`${l.divisionId}#${l.subjectId}#${l.day}`);
  }

  const placements = [];
  const unplaced = [];
  let steps = 0;

  function candidateSlotsFor(lesson) {
    const unavailable = teacherMeta[lesson.teacherId].unavailableSet;

    if (lesson.double) {
      return shuffle(
        periodIndex.consecutivePairs.filter((pair) => {
          const s1 = slotKey(pair.day, pair.first);
          const s2 = slotKey(pair.day, pair.second);
          if (unavailable.has(s1) || unavailable.has(s2)) return false;
          if (divisionBusy.has(`${lesson.divisionId}#${s1}`)) return false;
          if (divisionBusy.has(`${lesson.divisionId}#${s2}`)) return false;
          if (teacherBusy.has(`${lesson.teacherId}#${s1}`)) return false;
          if (teacherBusy.has(`${lesson.teacherId}#${s2}`)) return false;
          const dayCount = teacherDayCount[`${lesson.teacherId}#${pair.day}`] || 0;
          if (dayCount + 2 > teacherMeta[lesson.teacherId].maxPerDay) return false;
          const weekCount = teacherWeekCount[lesson.teacherId] || 0;
          if (weekCount + 2 > teacherMeta[lesson.teacherId].maxPerWeek) return false;
          return true;
        }),
        rng
      ).map((pair) => ({ kind: "double", day: pair.day, first: pair.first, second: pair.second }));
    }

    return shuffle(
      periodIndex.allSlots.filter((slot) => {
        const s = slotKey(slot.day, slot.periodNumber);
        if (unavailable.has(s)) return false;
        if (divisionBusy.has(`${lesson.divisionId}#${s}`)) return false;
        if (teacherBusy.has(`${lesson.teacherId}#${s}`)) return false;
        const dayCount = teacherDayCount[`${lesson.teacherId}#${slot.day}`] || 0;
        if (dayCount + 1 > teacherMeta[lesson.teacherId].maxPerDay) return false;
        const weekCount = teacherWeekCount[lesson.teacherId] || 0;
        if (weekCount + 1 > teacherMeta[lesson.teacherId].maxPerWeek) return false;
        return true;
      }),
      rng
    ).map((slot) => ({ kind: "single", day: slot.day, periodNumber: slot.periodNumber }));
  }

  // Rank candidates so slots that avoid stacking the same subject on the
  // same day for a division are preferred (soft constraint).
  function rankCandidates(lesson, candidates) {
    return candidates
      .map((c) => {
        const day = c.day;
        const key = `${lesson.divisionId}#${lesson.subjectId}#${day}`;
        const penalty = divisionSubjectDay.has(key) ? 1 : 0;
        return { c, penalty };
      })
      .sort((a, b) => a.penalty - b.penalty)
      .map((x) => x.c);
  }

  function place(lesson, choice) {
    if (choice.kind === "double") {
      const s1 = slotKey(choice.day, choice.first);
      const s2 = slotKey(choice.day, choice.second);
      divisionBusy.add(`${lesson.divisionId}#${s1}`);
      divisionBusy.add(`${lesson.divisionId}#${s2}`);
      teacherBusy.add(`${lesson.teacherId}#${s1}`);
      teacherBusy.add(`${lesson.teacherId}#${s2}`);
      teacherDayCount[`${lesson.teacherId}#${choice.day}`] = (teacherDayCount[`${lesson.teacherId}#${choice.day}`] || 0) + 2;
      teacherWeekCount[lesson.teacherId] = (teacherWeekCount[lesson.teacherId] || 0) + 2;
      divisionSubjectDay.add(`${lesson.divisionId}#${lesson.subjectId}#${choice.day}`);
      placements.push({ ...lesson, day: choice.day, periodNumber: choice.first });
      placements.push({ ...lesson, day: choice.day, periodNumber: choice.second });
    } else {
      const s = slotKey(choice.day, choice.periodNumber);
      divisionBusy.add(`${lesson.divisionId}#${s}`);
      teacherBusy.add(`${lesson.teacherId}#${s}`);
      teacherDayCount[`${lesson.teacherId}#${choice.day}`] = (teacherDayCount[`${lesson.teacherId}#${choice.day}`] || 0) + 1;
      teacherWeekCount[lesson.teacherId] = (teacherWeekCount[lesson.teacherId] || 0) + 1;
      divisionSubjectDay.add(`${lesson.divisionId}#${lesson.subjectId}#${choice.day}`);
      placements.push({ ...lesson, day: choice.day, periodNumber: choice.periodNumber });
    }
  }

  function unplace(lesson, choice) {
    if (choice.kind === "double") {
      const s1 = slotKey(choice.day, choice.first);
      const s2 = slotKey(choice.day, choice.second);
      divisionBusy.delete(`${lesson.divisionId}#${s1}`);
      divisionBusy.delete(`${lesson.divisionId}#${s2}`);
      teacherBusy.delete(`${lesson.teacherId}#${s1}`);
      teacherBusy.delete(`${lesson.teacherId}#${s2}`);
      teacherDayCount[`${lesson.teacherId}#${choice.day}`] -= 2;
      teacherWeekCount[lesson.teacherId] -= 2;
      placements.pop();
      placements.pop();
    } else {
      const s = slotKey(choice.day, choice.periodNumber);
      divisionBusy.delete(`${lesson.divisionId}#${s}`);
      teacherBusy.delete(`${lesson.teacherId}#${s}`);
      teacherDayCount[`${lesson.teacherId}#${choice.day}`] -= 1;
      teacherWeekCount[lesson.teacherId] -= 1;
      placements.pop();
    }
  }

  // Recursive backtracking over the ordered lesson list.
  function backtrack(index) {
    if (index >= orderedLessons.length) return true;
    steps++;
    if (steps > MAX_BACKTRACK_STEPS) return false;

    const lesson = orderedLessons[index];
    const candidates = rankCandidates(lesson, candidateSlotsFor(lesson));

    for (const choice of candidates) {
      place(lesson, choice);
      if (backtrack(index + 1)) return true;
      unplace(lesson, choice);
    }
    return false;
  }

  const solved = backtrack(0);

  if (!solved) {
    // Fall back to a greedy best-effort pass so the user still gets a
    // usable timetable, with the remaining conflicts flagged explicitly.
    return greedyFallback(orderedLessons, periodIndex, teacherMeta, preLocked, rng);
  }

  return { success: true, placements, unplaced: [] };
}

/**
 * Greedy fallback: place what can be placed, report the rest as unplaced
 * so a human can resolve them (e.g. by adjusting hours or availability).
 */
function greedyFallback(orderedLessons, periodIndex, teacherMeta, preLocked, rng) {
  const divisionBusy = new Set();
  const teacherBusy = new Set();
  const teacherDayCount = {};
  const teacherWeekCount = {};

  for (const l of preLocked) {
    divisionBusy.add(`${l.divisionId}#${slotKey(l.day, l.periodNumber)}`);
    teacherBusy.add(`${l.teacherId}#${slotKey(l.day, l.periodNumber)}`);
    teacherDayCount[`${l.teacherId}#${l.day}`] = (teacherDayCount[`${l.teacherId}#${l.day}`] || 0) + 1;
    teacherWeekCount[l.teacherId] = (teacherWeekCount[l.teacherId] || 0) + 1;
  }

  const placements = [];
  const unplaced = [];

  for (const lesson of orderedLessons) {
    const unavailable = teacherMeta[lesson.teacherId].unavailableSet;
    let placed = false;

    const trySlots = lesson.double
      ? shuffle(periodIndex.consecutivePairs, rng).map((p) => ({ kind: "double", day: p.day, first: p.first, second: p.second }))
      : shuffle(periodIndex.allSlots, rng).map((s) => ({ kind: "single", day: s.day, periodNumber: s.periodNumber }));

    for (const choice of trySlots) {
      if (choice.kind === "double") {
        const s1 = slotKey(choice.day, choice.first);
        const s2 = slotKey(choice.day, choice.second);
        if (unavailable.has(s1) || unavailable.has(s2)) continue;
        if (divisionBusy.has(`${lesson.divisionId}#${s1}`) || divisionBusy.has(`${lesson.divisionId}#${s2}`)) continue;
        if (teacherBusy.has(`${lesson.teacherId}#${s1}`) || teacherBusy.has(`${lesson.teacherId}#${s2}`)) continue;
        const dayCount = teacherDayCount[`${lesson.teacherId}#${choice.day}`] || 0;
        if (dayCount + 2 > teacherMeta[lesson.teacherId].maxPerDay) continue;
        const weekCount = teacherWeekCount[lesson.teacherId] || 0;
        if (weekCount + 2 > teacherMeta[lesson.teacherId].maxPerWeek) continue;

        divisionBusy.add(`${lesson.divisionId}#${s1}`);
        divisionBusy.add(`${lesson.divisionId}#${s2}`);
        teacherBusy.add(`${lesson.teacherId}#${s1}`);
        teacherBusy.add(`${lesson.teacherId}#${s2}`);
        teacherDayCount[`${lesson.teacherId}#${choice.day}`] = dayCount + 2;
        teacherWeekCount[lesson.teacherId] = weekCount + 2;
        placements.push({ ...lesson, day: choice.day, periodNumber: choice.first });
        placements.push({ ...lesson, day: choice.day, periodNumber: choice.second });
        placed = true;
        break;
      } else {
        const s = slotKey(choice.day, choice.periodNumber);
        if (unavailable.has(s)) continue;
        if (divisionBusy.has(`${lesson.divisionId}#${s}`)) continue;
        if (teacherBusy.has(`${lesson.teacherId}#${s}`)) continue;
        const dayCount = teacherDayCount[`${lesson.teacherId}#${choice.day}`] || 0;
        if (dayCount + 1 > teacherMeta[lesson.teacherId].maxPerDay) continue;
        const weekCount = teacherWeekCount[lesson.teacherId] || 0;
        if (weekCount + 1 > teacherMeta[lesson.teacherId].maxPerWeek) continue;

        divisionBusy.add(`${lesson.divisionId}#${s}`);
        teacherBusy.add(`${lesson.teacherId}#${s}`);
        teacherDayCount[`${lesson.teacherId}#${choice.day}`] = dayCount + 1;
        teacherWeekCount[lesson.teacherId] = weekCount + 1;
        placements.push({ ...lesson, day: choice.day, periodNumber: choice.periodNumber });
        placed = true;
        break;
      }
    }

    if (!placed) {
      unplaced.push({
        divisionLabel: lesson.divisionLabel,
        subjectName: lesson.subjectName,
        teacherName: lesson.teacherName,
        reason: "No conflict-free slot available given current constraints",
      });
    }
  }

  return { success: unplaced.length === 0, placements, unplaced };
}

/**
 * Public entry point. Generates (or regenerates) a timetable for a school
 * and persists it as a new TimetableVersion.
 *
 * @param {string} schoolId
 * @param {object} options
 * @param {string} [options.label] - label for the new version
 * @param {boolean} [options.keepLocked] - carry over entries marked `locked`
 *        from the most recent version as fixed constraints
 */
async function generateTimetable(schoolId, options = {}) {
  const { periods, requirements, teachers, divisions } = await loadSchoolData(schoolId);

  if (periods.length === 0) {
    const err = new Error("Define the school's period/bell schedule before generating a timetable.");
    err.status = 400;
    throw err;
  }
  if (requirements.length === 0) {
    const err = new Error("Add at least one subject-teacher-hours requirement before generating a timetable.");
    err.status = 400;
    throw err;
  }

  const periodIndex = indexPeriods(periods);
  const lessons = buildLessons(requirements);

  const teacherMeta = {};
  for (const t of teachers) {
    teacherMeta[t.id] = {
      maxPerDay: t.maxPeriodsPerDay,
      maxPerWeek: t.maxPeriodsPerWeek,
      weeklyLoad: 0,
      unavailableSet: new Set(t.unavailabilities.map((u) => slotKey(u.day, u.periodNumber))),
    };
  }
  for (const l of lessons) {
    if (teacherMeta[l.teacherId]) teacherMeta[l.teacherId].weeklyLoad += l.double ? 2 : 1;
  }

  let preLocked = [];
  if (options.keepLocked) {
    const latest = await prisma.timetableVersion.findFirst({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      include: { entries: { where: { locked: true } } },
    });
    if (latest) preLocked = latest.entries;
  }

  let best = null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = attempt(lessons, periodIndex, teacherMeta, i + 1, preLocked);
    if (result.success) {
      best = result;
      break;
    }
    if (!best || result.unplaced.length < best.unplaced.length) best = result;
  }

  // Persist as a new version
  const version = await prisma.timetableVersion.create({
    data: {
      schoolId,
      label: options.label || `Generated ${new Date().toISOString()}`,
    },
  });

  if (best.placements.length > 0) {
    await prisma.timetableEntry.createMany({
      data: best.placements.map((p) => ({
        schoolId,
        versionId: version.id,
        divisionId: p.divisionId,
        subjectId: p.subjectId,
        teacherId: p.teacherId,
        day: p.day,
        periodNumber: p.periodNumber,
        locked: false,
      })),
    });
  }

  // Re-create locked entries under the new version too, so they persist forward
  if (preLocked.length > 0) {
    await prisma.timetableEntry.createMany({
      data: preLocked.map((p) => ({
        schoolId,
        versionId: version.id,
        divisionId: p.divisionId,
        subjectId: p.subjectId,
        teacherId: p.teacherId,
        day: p.day,
        periodNumber: p.periodNumber,
        locked: true,
      })),
    });
  }

  return {
    versionId: version.id,
    success: best.success,
    placedCount: best.placements.length,
    totalLessons: lessons.length,
    unplaced: best.unplaced,
  };
}

module.exports = { generateTimetable, loadSchoolData, buildLessons, indexPeriods };
