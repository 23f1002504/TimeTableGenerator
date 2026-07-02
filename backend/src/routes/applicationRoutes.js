const router = require("express").Router();
const ctrl = require("../controllers/applicationController");
const { requireAuth, requireRole } = require("../middleware/auth");

// Public — anyone can apply, no auth
router.post("/", ctrl.submit);
router.get("/status/:sessionId", ctrl.statusBySession);

// SUPER_ADMIN only — the review queue
router.get("/", requireAuth, requireRole("SUPER_ADMIN"), ctrl.list);
router.post("/:id/approve", requireAuth, requireRole("SUPER_ADMIN"), ctrl.approve);
router.post("/:id/reject", requireAuth, requireRole("SUPER_ADMIN"), ctrl.reject);

module.exports = router;
