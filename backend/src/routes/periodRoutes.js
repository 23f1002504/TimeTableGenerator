const router = require("express").Router();
const ctrl = require("../controllers/periodController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("SCHOOL_ADMIN", "SUPER_ADMIN"));

router.get("/", ctrl.list);
router.put("/", ctrl.bulkSet); // replace the whole bell schedule

module.exports = router;
