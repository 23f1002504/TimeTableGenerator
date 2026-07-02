const router = require("express").Router();
const ctrl = require("../controllers/timetableController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("SCHOOL_ADMIN", "SUPER_ADMIN"));

router.post("/schools/:schoolId/generate", ctrl.generate);
router.get("/schools/:schoolId/versions", ctrl.listVersions);
router.post("/schools/:schoolId/versions/:versionId/publish", ctrl.publishVersion);
router.get("/schools/:schoolId/versions/:versionId/grid", ctrl.getVersionGrid);
router.get("/versions/:versionId/teacher/:teacherId", ctrl.getTeacherGrid);

router.put("/versions/:versionId/entries", ctrl.updateEntry);
router.delete("/entries/:entryId", ctrl.deleteEntry);
router.post("/entries/:entryId/toggle-lock", ctrl.toggleLock);

module.exports = router;
