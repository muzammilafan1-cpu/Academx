"use strict";

/**
 * Academx API: marking attendance from the SIS
 *
 *   POST /api/attendance/mark
 *
 * Who may mark (checked here, not trusted from the browser):
 *   Daily mode:        the class teacher of the section, with "marks attendance" ticked.
 *   Per subject mode:  a teacher assigned to that subject in that section.
 *   Admin:             only when the admin switch is on under Business rules > Attendance rules.
 *
 * Dates: teachers may mark only today's date (Asia/Kolkata). Admins may use any date.
 *
 * Writes: attendance_v2/{docId}, in the same shape the mobile app uses:
 *   daily:        {institutionId}_{class}_{section}_{date}
 *   per subject:  {institutionId}_{class}_{section}_{date}_{subjectId}
 * and an alert for each student whose status changed (same alert the mobile app sends).
 *
 * Mount next to the other routes in server.js:
 *     const { createAttendanceMarkingRouter } = require("./attendance-marking-routes");
 *     app.use("/api", createAttendanceMarkingRouter(admin));
 */

const { validId } = require("./studentLib");

const ALLOWED_ORIGINS = [
    "https://academx.in",
    "https://www.academx.in",
    "https://school-app-backend-38e01.web.app",
    "https://school-app-backend-38e01.firebaseapp.com"
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function bad(message) {
    throw new ApiError(400, "invalid-argument", message);
}

function todayInIndia() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function createAttendanceMarkingHandlers(admin, log) {

    const logger = log || console;
    const db = admin.firestore();
    const auth = admin.auth();
    const FieldValue = admin.firestore.FieldValue;

    async function requireStaff(req) {

        const match = String(req.headers.authorization || "").match(/^Bearer (.+)$/i);

        if (!match) throw new ApiError(401, "unauthenticated", "Please sign in again.");

        let decoded;

        try {
            decoded = await auth.verifyIdToken(match[1]);
        } catch (error) {
            throw new ApiError(401, "unauthenticated", "Your session has expired. Please sign in again.");
        }

        const body = req.body || {};

        const institutionId = validId(body.institutionId);

        if (!institutionId) bad("Missing or invalid institution.");

        const snap = await db.doc("users/" + decoded.uid).get();

        const user = snap.exists ? snap.data() : null;

        if (!user || user.institutionId !== institutionId || (user.role !== "teacher" && user.role !== "admin")) {
            throw new ApiError(403, "permission-denied", "You can't mark attendance for this institution.");
        }

        return { uid: decoded.uid, institutionId: institutionId, role: user.role, body: body };
    }

    function wrap(fn) {

        return async function (req, res) {

            try {

                const result = await fn(req);

                res.status(200).json({ ok: true, ...result });

            } catch (error) {

                if (error instanceof ApiError) {
                    return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
                }

                logger.error("attendance marking failed:", error);

                res.status(500).json({ ok: false, code: "internal", message: "Something went wrong. Please try again." });
            }
        };
    }

    const mark = wrap(async function (req) {

        const ctx = await requireStaff(req);

        const body = ctx.body;

        const inst = ctx.institutionId;

        // ---- date ----
        const date = typeof body.date === "string" ? body.date.trim() : "";

        if (!DATE_PATTERN.test(date) || isNaN(new Date(date + "T00:00:00Z"))) bad("Choose a valid date.");

        const isAdmin = ctx.role === "admin";

        if (!isAdmin && date !== todayInIndia()) {
            throw new ApiError(403, "permission-denied", "Teachers can mark attendance only for today.");
        }

        // ---- class and section ----
        const className = typeof body.class === "string" ? body.class.trim() : "";
        const section = typeof body.section === "string" ? body.section.trim() : "";

        if (!className || !section) bad("Choose a class and section.");

        if (className.includes("/") || section.includes("/")) bad("Class and section names can't contain '/'.");

        const classSnap = await db.collection("classes").where("institutionId", "==", inst).get();

        const classDoc = classSnap.docs.find(function (d) { return String(d.data().class) === className; });

        if (!classDoc) bad("Class " + className + " isn't set up under Classes.");

        const classData = classDoc.data();

        const sections = Array.isArray(classData.sections) ? classData.sections.map(String) : [];

        if (!sections.includes(section)) bad("Section " + section + " doesn't exist in class " + className + ".");

        // ---- the attendance rule ----
        const settingsSnap = await db.doc("attendanceSettings/" + inst).get();

        const settings = settingsSnap.exists ? settingsSnap.data() : { mode: "daily", adminOverride: false };

        const mode = settings.mode === "per_subject" ? "per_subject" : "daily";

        // ---- subject (per subject mode) ----
        let subjectId = "";
        let subjectName = "";

        if (mode === "per_subject") {

            subjectId = validId(body.subjectId);

            if (!subjectId) bad("Choose a subject.");

            const subjSnap = await db.doc("institutions/" + inst + "/subjects/" + subjectId).get();

            if (!subjSnap.exists || String(subjSnap.data().class) !== className) {
                bad("That subject isn't in class " + className + ".");
            }

            subjectName = subjSnap.data().name || "";
        }

        // ---- who may mark ----
        let allowed = false;

        if (isAdmin) {
            allowed = settings.adminOverride === true;
        } else if (mode === "daily") {
            const ct = classData.classTeachers && classData.classTeachers[section];
            allowed = !!(ct && ct.uid === ctx.uid && ct.marksAttendance === true);
        } else {
            const assign = await db.collection("institutions/" + inst + "/teachingAssignments")
                .where("teacherUid", "==", ctx.uid)
                .where("class", "==", className)
                .where("section", "==", section)
                .where("subjectId", "==", subjectId)
                .limit(1)
                .get();
            allowed = !assign.empty;
        }

        if (!allowed) {
            throw new ApiError(403, "permission-denied", isAdmin
                ? "Admins can mark attendance only when the admin switch is on under Attendance rules."
                : mode === "daily"
                    ? "Only the class teacher of this section, with marking turned on, can mark attendance."
                    : "Only the subject teacher of this subject in this section can mark attendance.");
        }

        // ---- the students, which must match the section exactly ----
        const rosterSnap = await db.collection("institutions/" + inst + "/users")
            .where("role", "==", "student")
            .where("class", "==", className)
            .where("section", "==", section)
            .get();

        const roster = new Set(rosterSnap.docs.map(function (d) { return d.id; }));

        const incoming = body.students && typeof body.students === "object" ? body.students : {};

        const ids = Object.keys(incoming);

        if (ids.length !== roster.size || ids.some(function (id) { return !roster.has(id); })) {
            bad("The student list doesn't match this class and section. Reload the page and try again.");
        }

        for (const id of ids) {
            if (typeof incoming[id] !== "boolean") bad("Each student must be marked present or absent.");
        }

        // ---- save ----
        const docId = mode === "per_subject"
            ? inst + "_" + className + "_" + section + "_" + date + "_" + subjectId
            : inst + "_" + className + "_" + section + "_" + date;

        const ref = db.doc("attendance_v2/" + docId);

        const previous = await ref.get();

        const before = previous.exists && previous.data().students ? previous.data().students : {};

        await ref.set({
            institutionId: inst,
            class: className,
            section: section,
            date: date,
            mode: mode,
            subjectId: subjectId,
            subjectName: subjectName,
            markedBy: ctx.uid,
            students: incoming,
            timestamp: FieldValue.serverTimestamp()
        }, { merge: true });

        // ---- alerts for students whose status changed (same alert the mobile app sends) ----
        const changed = ids.filter(function (id) { return before[id] !== incoming[id]; });

        for (let i = 0; i < changed.length; i += 400) {

            const batch = db.batch();

            changed.slice(i, i + 400).forEach(function (id) {

                const present = incoming[id] === true;

                batch.set(db.collection("alerts").doc(), {
                    institutionId: inst,
                    title: present ? "Attendance Marked" : "Absent Alert",
                    message: present ? "You were marked present today" : "You were marked absent today",
                    source: "attendance",
                    referenceId: docId,
                    targetRoles: ["student"],
                    targetUserId: id,
                    createdAt: FieldValue.serverTimestamp(),
                    read: false
                });
            });

            await batch.commit();
        }

        logger.log("attendance saved", { institutionId: inst, docId: docId, by: ctx.uid, alerts: changed.length });

        return { saved: ids.length, alerts: changed.length, record: docId };
    });

    return { mark: mark };
}

function corsForSis(req, res, next) {

    const origin = req.headers.origin;

    if (origin && ALLOWED_ORIGINS.includes(origin) && !res.getHeader("Access-Control-Allow-Origin")) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Max-Age", "600");
    }

    next();
}

function createAttendanceMarkingRouter(admin) {

    const express = require("express");

    const router = express.Router();

    const handlers = createAttendanceMarkingHandlers(admin);

    router.use(corsForSis);

    router.options("/attendance/mark", function (req, res) { res.sendStatus(204); });

    router.post("/attendance/mark", express.json({ limit: "100kb" }), handlers.mark);

    return router;
}

module.exports = {
    createAttendanceMarkingRouter: createAttendanceMarkingRouter,
    createAttendanceMarkingHandlers: createAttendanceMarkingHandlers
};