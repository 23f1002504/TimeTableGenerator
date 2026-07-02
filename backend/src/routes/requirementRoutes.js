const router = require("express").Router();
const ctrl = require("../controllers/requirementController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("SCHOOL_ADMIN", "SUPER_ADMIN"));

router.get("/schools/:schoolId", ctrl.listForSchool);
router.post("/", ctrl.upsert);
router.delete("/:id", ctrl.remove);

module.exports = router;
