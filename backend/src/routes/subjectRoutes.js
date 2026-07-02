const router = require("express").Router();
const ctrl = require("../controllers/subjectController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("SCHOOL_ADMIN", "SUPER_ADMIN"));

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
