const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const subjectRoutes = require("./routes/subjectRoutes");
const classRoutes = require("./routes/classRoutes");
const periodRoutes = require("./routes/periodRoutes");
const requirementRoutes = require("./routes/requirementRoutes");
const timetableRoutes = require("./routes/timetableRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const { handleWebhook } = require("./controllers/stripeWebhookController");
const errorHandler = require("./middleware/errorHandler");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",");
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Stripe webhook needs the raw, unparsed body to verify its signature —
// this MUST be registered before express.json() below, and only for
// this exact path.
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleWebhook);

app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ ok: true, service: "timetable-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/schools", schoolRoutes); // SUPER_ADMIN: manage every school
app.use("/api/applications", applicationRoutes); // public apply + SUPER_ADMIN review queue
app.use("/api/teachers", teacherRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/classes", classRoutes); // classes + divisions
app.use("/api/periods", periodRoutes); // bell schedule
app.use("/api/requirements", requirementRoutes); // division-subject-teacher-hours
app.use("/api/timetable", timetableRoutes); // generate + view + edit

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use(errorHandler);

module.exports = app;
