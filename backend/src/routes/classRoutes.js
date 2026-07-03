const router = require("express").Router();
const ctrl = require("../controllers/classController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("SCHOOL_ADMIN", "SUPER_ADMIN"));

router.get("/", ctrl.list);
router.post("/", ctrl.createClass);
router.post("/bulk-range", ctrl.createClassRange);
router.put("/:id", ctrl.updateClass);
router.delete("/:id", ctrl.removeClass);

router.post("/:id/divisions", ctrl.addDivision);
router.post("/:id/divisions/bulk", ctrl.addDivisionsBulk);
router.put("/:id/divisions/:divisionId", ctrl.updateDivision);
router.delete("/:id/divisions/:divisionId", ctrl.removeDivision);

module.exports = router;
