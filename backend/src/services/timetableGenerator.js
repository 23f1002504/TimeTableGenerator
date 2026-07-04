/**
 * TIMETABLE GENERATION ENGINE
 * ============================================================
 * Treats scheduling as a Constraint Satisfaction Problem (CSP):
 *
 *   Variables : one per "lesson unit" — e.g. if Division 5A needs
 *               Math 6x/week, that's 6 separate lesson units to place.
 *   Domain    : every (day, periodNumber) slot from the school's bell
 *               schedule (excluding breaks).
 *
 *   HARD constraints (always enforced, never violated):
 *     1. A division can only have one subject in a given slot.
 *     2. A teacher can only be in one place in a given slot.
 *     3. A teacher never exceeds maxPeriodsPerDay / maxPeriodsPerWeek.
 *     4. A teacher is never placed in a slot they marked unavailable.
 *     5. A teacher must be qualified for the subject (enforced upstream —
 *        Requirement.teacherId is only ever set to a qualified teacher).
 *     6. Manually "locked" entries from a previous version are kept as-is
 *        and treated as pre-filled constraints.
 *     7. Double-period subjects (e.g. labs) are placed as two
 *        back-to-back periods on the same day.
 *     8. [Configurable] A division never has more than
 *        settings.maxSameSubjectPerDay periods of the same subject on
 *        one day (0 = unlimited).
 *     9. [Configurable] A teacher never teaches more than
 *        settings.teacherMaxConsecutivePeriods periods in a row on one
 *        day without a gap (0 = unlimited).
 *
 *   SOFT preferences (optimized for, relaxed if they'd block a solution):
 *     - [Configurable] spreadSubjectsAcrossWeek: avoid stacking a
 *       subject's remaining lessons on days it's already scheduled.
 *     - [Configurable] preferMorningForPriority: subjects flagged
 *       "preferMorning" (e.g. Math) are nudged toward earlier periods.
 *     - [Configurable] avoidTeacherGaps: prefer slots adjacent to a
 *       teacher's other lessons that day over leaving them a free gap
 *       between two teaching periods.
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

const DEFAULT_SETTINGS = {
  maxSameSubjectPerDay: 2,
  teacherMaxConsecutivePeriods: 0,
  spreadSubjectsAcrossWeek: true,
  preferMorningForPriority: true,
  avoidTeacherGaps: true,
};

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

// Given the set of period numbers a teacher already has on a day, plus
// the ones a candidate placement would add, returns the longest run of
// back-to-back periods that would result.
function longestConsecutiveRun(existingNums, newNums) {
  const all = Array.from(new Set([...existingNums, ...newNums])).sort((a, b) => a - b);
  let best = all.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < all.length; i++) {
    run = all[i] === all[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Loads everything needed to generate a timetable for a school.
 */
async function loadSchoolData(schoolId) {
  const [periods, requirements, teachers, divisions, settings] = await Promise.all([
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
    getOrCreateSettings(schoolId),
  ]);

  return { periods, requirements, teachers, divisions, settings };
}

/**
 * Fetches this school's editable constraint settings, creating a row
 * with defaults on first use so the rest of the app can always assume
 * one exists.
 */
async function getOrCreateSettings(schoolId) {
  const existing = await prisma.schoolSettings.findUnique({ where: { schoolId } });
  if (existing) return existing;
  return prisma.schoolSettings.create({ data: { schoolId, ...DEFAULT_SETTINGS } });
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
        preferMorning: !!req.subject.preferMorning,
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
function attempt(lessons, periodIndex, teacherMeta, settings, seed, preLocked) {
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
  const teacherDayPeriods = {}; // `${teacherId}#${day}` -> Set<periodNumber> (for consecutive-run + gap checks)
  const divisionSubjectDayCount = {}; // `${divisionId}#${subjectId}#${day}` -> count (hard cap + soft ranking)

  function addTeacherPeriod(teacherId, day, periodNumber) {
    const key = `${teacherId}#${day}`;
    if (!teacherDayPeriods[key]) teacherDayPeriods[key] = new Set();
    teacherDayPeriods[key].add(periodNumber);
  }
  function removeTeacherPeriod(teacherId, day, periodNumber) {
    const key = `${teacherId}#${day}`;
    if (teacherDayPeriods[key]) teacherDayPeriods[key].delete(periodNumber);
  }

  // Seed with pre-locked entries (kept as-is from a previous version)
  for (const l of preLocked) {
    divisionBusy.add(`${l.divisionId}#${slotKey(l.day, l.periodNumber)}`);
    teacherBusy.add(`${l.teacherId}#${slotKey(l.day, l.periodNumber)}`);
    teacherDayCount[`${l.teacherId}#${l.day}`] = (teacherDayCount[`${l.teacherId}#${l.day}`] || 0) + 1;
    teacherWeekCount[l.teacherId] = (teacherWeekCount[l.teacherId] || 0) + 1;
    addTeacherPeriod(l.teacherId, l.day, l.periodNumber);
    const dsKey = `${l.divisionId}#${l.subjectId}#${l.day}`;
    divisionSubjectDayCount[dsKey] = (divisionSubjectDayCount[dsKey] || 0) + 1;
  }

  const placements = [];
  const unplaced = [];
  let steps = 0;

  function subjectDayCapOk(lesson, day, additionalUnits) {
    if (!settings.maxSameSubjectPerDay || settings.maxSameSubjectPerDay <= 0) return true;
    const key = `${lesson.divisionId}#${lesson.subjectId}#${day}`;
    const current = divisionSubjectDayCount[key] || 0;
    return current + additionalUnits <= settings.maxSameSubjectPerDay;
  }

  function consecutiveCapOk(teacherId, day, newPeriodNumbers) {
    if (!settings.teacherMaxConsecutivePeriods || settings.teacherMaxConsecutivePeriods <= 0) return true;
    const existing = Array.from(teacherDayPeriods[`${teacherId}#${day}`] || []);
    return longestConsecutiveRun(existing, newPeriodNumbers) <= settings.teacherMaxConsecutivePeriods;
  }

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
          if (!subjectDayCapOk(lesson, pair.day, 2)) return false;
          if (!consecutiveCapOk(lesson.teacherId, pair.day, [pair.first, pair.second])) return false;
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
        if (!subjectDayCapOk(lesson, slot.day, 1)) return false;
        if (!consecutiveCapOk(lesson.teacherId, slot.day, [slot.periodNumber])) return false;
        return true;
      }),
      rng
    ).map((slot) => ({ kind: "single", day: slot.day, periodNumber: slot.periodNumber }));
  }

  // Combines every enabled soft preference into one score per candidate
  // slot (lower is better), then sorts by it. Randomized shuffle already
  // happened in candidateSlotsFor, so ties stay randomized.
  function rankCandidates(lesson, candidates) {
    return candidates
      .map((c) => {
        let score = 0;
        const day = c.day;
        const periodNumber = c.kind === "double" ? c.first : c.periodNumber;

        if (settings.spreadSubjectsAcrossWeek) {
          const key = `${lesson.divisionId}#${lesson.subjectId}#${day}`;
          if (divisionSubjectDayCount[key] > 0) score += 5;
        }

        if (settings.preferMorningForPriority && lesson.preferMorning) {
          score += periodNumber; // earlier period numbers score lower (better)
        }

        if (settings.avoidTeacherGaps) {
          const existing = teacherDayPeriods[`${lesson.teacherId}#${day}`];
          if (existing && existing.size > 0) {
            const adjacent = existing.has(periodNumber - 1) || existing.has(periodNumber + 1);
            score += adjacent ? -3 : 1; // reward clustering, mildly penalize creating a new island
          }
        }

        return { c, score };
      })
      .sort((a, b) => a.score - b.score)
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
      addTeacherPeriod(lesson.teacherId, choice.day, choice.first);
      addTeacherPeriod(lesson.teacherId, choice.day, choice.second);
      const dsKey = `${lesson.divisionId}#${lesson.subjectId}#${choice.day}`;
      divisionSubjectDayCount[dsKey] = (divisionSubjectDayCount[dsKey] || 0) + 2;
      placements.push({ ...lesson, day: choice.day, periodNumber: choice.first });
      placements.push({ ...lesson, day: choice.day, periodNumber: choice.second });
    } else {
      const s = slotKey(choice.day, choice.periodNumber);
      divisionBusy.add(`${lesson.divisionId}#${s}`);
      teacherBusy.add(`${lesson.teacherId}#${s}`);
      teacherDayCount[`${lesson.teacherId}#${choice.day}`] = (teacherDayCount[`${lesson.teacherId}#${choice.day}`] || 0) + 1;
      teacherWeekCount[lesson.teacherId] = (teacherWeekCount[lesson.teacherId] || 0) + 1;
      addTeacherPeriod(lesson.teacherId, choice.day, choice.periodNumber);
      const dsKey = `${lesson.divisionId}#${lesson.subjectId}#${choice.day}`;
      divisionSubjectDayCount[dsKey] = (divisionSubjectDayCount[dsKey] || 0) + 1;
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
      removeTeacherPeriod(lesson.teacherId, choice.day, choice.first);
      removeTeacherPeriod(lesson.teacherId, choice.day, choice.second);
      const dsKey = `${lesson.divisionId}#${lesson.subjectId}#${choice.day}`;
      divisionSubjectDayCount[dsKey] -= 2;
      placements.pop();
      placements.pop();
    } else {
      const s = slotKey(choice.day, choice.periodNumber);
      divisionBusy.delete(`${lesson.divisionId}#${s}`);
      teacherBusy.delete(`${lesson.teacherId}#${s}`);
      teacherDayCount[`${lesson.teacherId}#${choice.day}`] -= 1;
      teacherWeekCount[lesson.teacherId] -= 1;
      removeTeacherPeriod(lesson.teacherId, choice.day, choice.periodNumber);
      const dsKey = `${lesson.divisionId}#${lesson.subjectId}#${choice.day}`;
      divisionSubjectDayCount[dsKey] -= 1;
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
    return greedyFallback(orderedLessons, periodIndex, teacherMeta, settings, preLocked, rng);
  }

  return { success: true, placements, unplaced: [] };
}

/**
 * Greedy fallback: place what can be placed, report the rest as unplaced
 * so a human can resolve them (e.g. by adjusting hours or availability).
 * Hard constraints (including the configurable ones) are still enforced
 * here — only the soft preferences are dropped, to maximize the chance
 * of placing every lesson somewhere.
 */
function greedyFallback(orderedLessons, periodIndex, teacherMeta, settings, preLocked, rng) {
  const divisionBusy = new Set();
  const teacherBusy = new Set();
  const teacherDayCount = {};
  const teacherWeekCount = {};
  const teacherDayPeriods = {};
  const divisionSubjectDayCount = {};

  function addTeacherPeriod(teacherId, day, periodNumber) {
    const key = `${teacherId}#${day}`;
    if (!teacherDayPeriods[key]) teacherDayPeriods[key] = new Set();
    teacherDayPeriods[key].add(periodNumber);
  }

  for (const l of preLocked) {
    divisionBusy.add(`${l.divisionId}#${slotKey(l.day, l.periodNumber)}`);
    teacherBusy.add(`${l.teacherId}#${slotKey(l.day, l.periodNumber)}`);
    teacherDayCount[`${l.teacherId}#${l.day}`] = (teacherDayCount[`${l.teacherId}#${l.day}`] || 0) + 1;
    teacherWeekCount[l.teacherId] = (teacherWeekCount[l.teacherId] || 0) + 1;
    addTeacherPeriod(l.teacherId, l.day, l.periodNumber);
    const dsKey = `${l.divisionId}#${l.subjectId}#${l.day}`;
    divisionSubjectDayCount[dsKey] = (divisionSubjectDayCount[dsKey] || 0) + 1;
  }

  function subjectDayCapOk(lesson, day, additionalUnits) {
    if (!settings.maxSameSubjectPerDay || settings.maxSameSubjectPerDay <= 0) return true;
    const key = `${lesson.divisionId}#${lesson.subjectId}#${day}`;
    const current = divisionSubjectDayCount[key] || 0;
    return current + additionalUnits <= settings.maxSameSubjectPerDay;
  }

  function consecutiveCapOk(teacherId, day, newPeriodNumbers) {
    if (!settings.teacherMaxConsecutivePeriods || settings.teacherMaxConsecutivePeriods <= 0) return true;
    const existing = Array.from(teacherDayPeriods[`${teacherId}#${day}`] || []);
    return longestConsecutiveRun(existing, newPeriodNumbers) <= settings.teacherMaxConsecutivePeriods;
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
        if (!subjectDayCapOk(lesson, choice.day, 2)) continue;
        if (!consecutiveCapOk(lesson.teacherId, choice.day, [choice.first, choice.second])) continue;

        divisionBusy.add(`${lesson.divisionId}#${s1}`);
        divisionBusy.add(`${lesson.divisionId}#${s2}`);
        teacherBusy.add(`${lesson.teacherId}#${s1}`);
        teacherBusy.add(`${lesson.teacherId}#${s2}`);
        teacherDayCount[`${lesson.teacherId}#${choice.day}`] = dayCount + 2;
        teacherWeekCount[lesson.teacherId] = weekCount + 2;
        addTeacherPeriod(lesson.teacherId, choice.day, choice.first);
        addTeacherPeriod(lesson.teacherId, choice.day, choice.second);
        const dsKey = `${lesson.divisionId}#${lesson.subjectId}#${choice.day}`;
        divisionSubjectDayCount[dsKey] = (divisionSubjectDayCount[dsKey] || 0) + 2;
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
        if (!subjectDayCapOk(lesson, choice.day, 1)) continue;
        if (!consecutiveCapOk(lesson.teacherId, choice.day, [choice.periodNumber])) continue;

        divisionBusy.add(`${lesson.divisionId}#${s}`);
        teacherBusy.add(`${lesson.teacherId}#${s}`);
        teacherDayCount[`${lesson.teacherId}#${choice.day}`] = dayCount + 1;
        teacherWeekCount[lesson.teacherId] = weekCount + 1;
        addTeacherPeriod(lesson.teacherId, choice.day, choice.periodNumber);
        const dsKey = `${lesson.divisionId}#${lesson.subjectId}#${choice.day}`;
        divisionSubjectDayCount[dsKey] = (divisionSubjectDayCount[dsKey] || 0) + 1;
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
  const { periods, requirements, teachers, divisions, settings } = await loadSchoolData(schoolId);

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
    const result = attempt(lessons, periodIndex, teacherMeta, settings, i + 1, preLocked);
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

module.exports = { generateTimetable, loadSchoolData, buildLessons, indexPeriods, getOrCreateSettings, DEFAULT_SETTINGS };
