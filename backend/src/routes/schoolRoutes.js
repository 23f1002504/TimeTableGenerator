const router = require("express").Router();
const ctrl = require("../controllers/schoolController");
const { requireAuth, requireRole } = require("../middleware/auth");

// All school-management routes are SUPER_ADMIN only — this is the
// "admin controls everything, all school data" surface.
router.use(requireAuth, requireRole("SUPER_ADMIN"));

router.get("/", ctrl.listSchools);
router.post("/", ctrl.createSchool);
router.get("/:schoolId/overview", ctrl.schoolOverview);
router.put("/:schoolId", ctrl.updateSchool);
router.delete("/:schoolId", ctrl.deleteSchool);
router.post("/:schoolId/admins", ctrl.addSchoolAdmin);

module.exports = router;
