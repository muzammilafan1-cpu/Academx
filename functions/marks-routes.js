"use strict";

/**
 * Academx API: marks entry
 *
 *   POST /api/marks/save
 *
 * Who may enter marks (checked here, not trusted from the browser):
 *   - Subject teacher: a teaching assignment exists for this teacher, class, section and subject.
 *   - Class teacher: they are the class teacher of this section, AND no subject teacher is
 *     assigned to this subject in this section. (Subject teacher always wins.)
 *   - Admin: only when the admin switch in Grading rules is on.
 *
 * Maximums: each component's maximum defaults to its weight (Internal 20, External 80).
 * Only an admin can change the maximums, for this exam and subject.
 *
 * Writes: institutions/{inst}/marks/{examId}__{subjectId}__{class}__{section}
 *   { institutionId, examId, subjectId, subjectName, class, section,
 *     maxes: { name: max }, scores: { uid: { name: score | null } },
 *     gradingVersion, updatedAt, updatedBy }
 *
 * Mount next to the other routes in server.js:
 *     const { createMarksRouter } = require("./marks-routes");
 *     app.use("/api", createMarksRouter(admin));
 */

const { validId } = require("./studentLib");

const ALLOWED_ORIGINS = [
    "https://academx.in",
    "https://www.academx.in",
    "https://school-app-backend-38e01.web.app",
    "https://school-app-backend-38e01.firebaseapp.com"
];

const MAX_STUDENTS = 300;

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

function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function createMarksHandlers(admin, log) {

    const logger = log || console;
    const db = admin.firestore();
    const auth = admin.auth();
    const FieldValue = admin.firestore.FieldValue;

    async function requireUser(req) {

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
            throw new ApiError(403, "permission-denied", "You can't enter marks for this institution.");
        }

        return { uid: decoded.uid, institutionId: institutionId, role: user.role, teacherRoles: user.teacherRoles || {}, body: body };
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

                logger.error("marks save failed:", error);

                res.status(500).json({ ok: false, code: "internal", message: "Something went wrong. Please try again." });
            }
        };
    }

    const save = wrap(async function (req) {

        const ctx = await requireUser(req);

        const body = ctx.body;

        const inst = ctx.institutionId;

        const examId = validId(body.examId);
        const subjectId = validId(body.subjectId);

        if (!examId) bad("Choose an exam.");
        if (!subjectId) bad("Choose a subject.");

        const className = typeof body.class === "string" ? body.class.trim() : "";
        const section = typeof body.section === "string" ? body.section.trim() : "";

        // The exam, subject and class must exist in this institution
        const examSnap = await db.doc("institutions/" + inst + "/exams/" + examId).get();
        if (!examSnap.exists) bad("That exam doesn't exist.");

        // The exam must include this class and section (older exams with no scope cover all classes)
        const examScope = examSnap.data().scope;
        const examCoversSection = !examScope || examScope.all !== false ||
            (Array.isArray(examScope.classes) && examScope.classes.some(function (c) {
                return String(c.class) === className && Array.isArray(c.sections) && c.sections.includes(section);
            }));

        if (!examCoversSection) bad("This exam doesn't include " + className + ", section " + section + ".");

        const subjSnap = await db.doc("institutions/" + inst + "/subjects/" + subjectId).get();
        if (!subjSnap.exists || String(subjSnap.data().class) !== className) bad("That subject isn't in this class.");

        const classSnap = await db.collection("classes").where("institutionId", "==", inst).get();
        const classDoc = classSnap.docs.find(function (d) { return String(d.data().class) === className; });
        if (!classDoc) bad("Class " + className + " isn't set up under Classes.");
        const classData = classDoc.data();
        if (!(Array.isArray(classData.sections) ? classData.sections.map(String) : []).includes(section)) {
            bad("Section " + section + " doesn't exist in class " + className + ".");
        }

        // Grading rules must exist: they define the components and the maximums
        const gradingSnap = await db.doc("gradingSettings/" + inst).get();
        if (!gradingSnap.exists) bad("Set up Grading rules first (Settings > Business rules > Grading rules).");
        const grading = gradingSnap.data();
        const components = Array.isArray(grading.components) ? grading.components : [];
        const componentNames = components.map(function (c) { return c.name; });

        // ---- who may enter marks for this subject in this section ----
        const assignSnap = await db.collection("institutions/" + inst + "/teachingAssignments")
            .where("class", "==", className).where("section", "==", section).where("subjectId", "==", subjectId).get();

        const assignedTeachers = assignSnap.docs.map(function (d) { return d.data().teacherUid; });

        const isSubjectTeacher = assignedTeachers.includes(ctx.uid);

        const classTeacherHere = classData.classTeachers && classData.classTeachers[section];
        const isClassTeacher = !!(classTeacherHere && classTeacherHere.uid === ctx.uid);

        const adminOn = !!(grading.marksEntry && grading.marksEntry.adminOverride);

        let allowed = false;

        if (ctx.role === "admin") {
            allowed = adminOn;
        } else if (isSubjectTeacher) {
            allowed = true;
        } else if (isClassTeacher && assignedTeachers.length === 0) {
            allowed = true;
        }

        if (!allowed) {
            throw new ApiError(403, "permission-denied",
                ctx.role === "admin"
                    ? "Admins can enter marks only when the admin switch is on in Grading rules."
                    : "You can enter marks only for the subjects you teach in this section.");
        }

        // ---- maximums: admins only ----
        const markRef = db.doc("institutions/" + inst + "/marks/" + examId + "__" + subjectId + "__" + slug(className) + "__" + slug(section));

        const existing = await markRef.get();

        let maxes = {};

        if (existing.exists && existing.data().maxes) {
            maxes = { ...existing.data().maxes };
        } else {
            components.forEach(function (c) { maxes[c.name] = Number(c.weight); });
        }

        if (body.maxes && typeof body.maxes === "object") {
            if (ctx.role !== "admin") {
                throw new ApiError(403, "permission-denied", "Only an administrator can change the maximum marks.");
            }
            const next = {};
            componentNames.forEach(function (name) {
                const v = Number(body.maxes[name]);
                if (!Number.isFinite(v) || v <= 0 || v > 1000) bad("Each maximum must be a number above 0 and up to 1000.");
                next[name] = v;
            });
            maxes = next;
        }

        // ---- scores ----
        const studentsSnap = await db.collection("users")
            .where("institutionId", "==", inst).where("class", "==", className).where("section", "==", section).get();

        const roster = new Set(studentsSnap.docs.filter(function (d) { return d.data().role === "student"; }).map(function (d) { return d.id; }));

        const incoming = body.scores && typeof body.scores === "object" ? body.scores : {};

        const uids = Object.keys(incoming);

        if (uids.length > MAX_STUDENTS) bad("Too many students in one save.");

        const scores = {};

        for (const uid of uids) {

            if (!roster.has(uid)) bad("A student isn't in this class and section.");

            const row = incoming[uid] || {};

            const clean = {};

            for (const name of componentNames) {

                const raw = row[name];

                if (raw === null || raw === undefined || raw === "") {
                    clean[name] = null;
                    continue;
                }

                const n = Number(raw);

                if (!Number.isFinite(n) || n < 0 || n > maxes[name]) {
                    bad("Marks for " + name + " must be between 0 and " + maxes[name] + ".");
                }

                clean[name] = n;
            }

            scores[uid] = clean;
        }

        // ---- save (merge: only the students sent are changed) ----
        await markRef.set({
            institutionId: inst,
            examId: examId,
            subjectId: subjectId,
            subjectName: subjSnap.data().name || "",
            class: className,
            section: section,
            components: componentNames,
            maxes: maxes,
            scores: scores,
            gradingVersion: grading.version || 0,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: ctx.uid
        }, { merge: true });

        logger.log("marks saved", { institutionId: inst, examId: examId, subjectId: subjectId, by: ctx.uid, students: uids.length });

        return { saved: uids.length };
    });

    return { save: save };
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

function createMarksRouter(admin) {

    const express = require("express");

    const router = express.Router();

    const handlers = createMarksHandlers(admin);

    router.use(corsForSis);

    router.options("/marks/save", function (req, res) { res.sendStatus(204); });

    router.post("/marks/save", express.json({ limit: "200kb" }), handlers.save);

    return router;
}

module.exports = { createMarksRouter: createMarksRouter, createMarksHandlers: createMarksHandlers };