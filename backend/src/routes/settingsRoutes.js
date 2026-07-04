const router = require("express").Router();
const ctrl = require("../controllers/settingsController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("SCHOOL_ADMIN", "SUPER_ADMIN"));

router.get("/", ctrl.get);
router.put("/", ctrl.update);

module.exports = router;
