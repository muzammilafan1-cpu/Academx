"use strict";

/**
 * Academx API: subjects and exams (Academic Records)
 *
 *   POST /api/academic/subjects/save     create or update a subject for a class
 *   POST /api/academic/subjects/delete   delete a subject
 *   POST /api/academic/exams/save        create or update an exam
 *   POST /api/academic/exams/delete      delete an exam
 *
 * Same rules as the other routes:
 *  - requires a signed-in Firebase user (Authorization: Bearer <ID token>)
 *  - the caller must be an ADMIN of the same institution (from their own users/{uid})
 *  - nothing secret is returned; unexpected errors are logged on Render only
 *
 * Mount next to the other routes:
 *     const { createAcademicRouter } = require("./academic-routes");
 *     app.use("/api", createAcademicRouter(admin));
 */

const { validId } = require("./studentLib");

const WRITE_ROLES = ["admin"];

const ALLOWED_ORIGINS = [
    "https://academx.in",
    "https://www.academx.in",
    "https://school-app-backend-38e01.web.app",
    "https://school-app-backend-38e01.firebaseapp.com"
];

const NAME_PATTERN = /^[A-Za-z0-9 .()&'\-]{1,60}$/;   // subjects and exams
const CODE_PATTERN = /^[A-Za-z0-9.\-]{0,12}$/;         // short subject code, e.g. "ENG"
const YEAR_PATTERN = /^\d{4}-\d{2}$/;                  // academic year, e.g. "2026-27"
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function createAcademicHandlers(admin, log) {

    const logger = log || console;
    const db = admin.firestore();
    const auth = admin.auth();
    const FieldValue = admin.firestore.FieldValue;

    async function requireAdmin(req) {

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

        if (!institutionId) throw new ApiError(400, "invalid-argument", "Missing or invalid institution.");

        const callerSnap = await db.doc("users/" + decoded.uid).get();

        const caller = callerSnap.exists ? callerSnap.data() : null;

        if (!caller || !WRITE_ROLES.includes(caller.role) || caller.institutionId !== institutionId) {
            throw new ApiError(403, "permission-denied", "Only an administrator of this institution can do this.");
        }

        return { uid: decoded.uid, institutionId: institutionId, body: body };
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

                logger.error("academic route failed:", req.path, error);

                res.status(500).json({
                    ok: false,
                    code: "internal",
                    message: "Something went wrong. Please try again."
                });
            }
        };
    }

    function validDate(text) {

        if (!DATE_PATTERN.test(text)) return false;

        const d = new Date(text + "T00:00:00Z");

        return !isNaN(d) && d.toISOString().slice(0, 10) === text;
    }

    async function classExists(institutionId, className) {

        const snap = await db.collection("classes").where("institutionId", "==", institutionId).get();

        return snap.docs.some(function (d) { return String(d.data().class) === className; });
    }


    // ---------- subjects ----------

    const saveSubject = wrap(async function (req) {

        const ctx = await requireAdmin(req);

        const body = ctx.body;

        const className = typeof body.class === "string" ? body.class.trim() : "";

        if (!className || !(await classExists(ctx.institutionId, className))) {
            throw new ApiError(400, "invalid-argument", "That class isn't set up under Classes.");
        }

        // The sections that teach this subject, and an optional group or stream
        const classSnap = await db.collection("classes").where("institutionId", "==", ctx.institutionId).get();
        const classDoc = classSnap.docs.find(function (d) { return String(d.data().class) === className; });
        const classSections = classDoc && Array.isArray(classDoc.data().sections) ? classDoc.data().sections.map(String) : [];

        const sectionsIn = Array.isArray(body.sections) ? body.sections.map(function (x) { return String(x).trim(); }) : [];
        const sections = [...new Set(sectionsIn)];

        if (!sections.length) {
            throw new ApiError(400, "invalid-argument", "Choose at least one section that teaches this subject.");
        }

        for (const sec of sections) {
            if (!classSections.includes(sec)) {
                throw new ApiError(400, "invalid-argument", "Section " + sec + " doesn't exist in class " + className + ".");
            }
        }

        const group = typeof body.group === "string" ? body.group.trim() : "";

        if (group && !NAME_PATTERN.test(group)) {
            throw new ApiError(400, "invalid-argument",
                "The group or stream can be up to 60 characters: letters, numbers, spaces, . ( ) & ' -.");
        }

        const name = typeof body.name === "string" ? body.name.trim() : "";

        if (!NAME_PATTERN.test(name)) {
            throw new ApiError(400, "invalid-argument",
                "Enter a subject name of up to 60 characters: letters, numbers, spaces, . ( ) & ' -.");
        }

        const code = typeof body.code === "string" ? body.code.trim() : "";

        if (!CODE_PATTERN.test(code)) {
            throw new ApiError(400, "invalid-argument", "The subject code can be up to 12 letters, numbers, . or -.");
        }

        const subjectId = body.subjectId ? validId(body.subjectId) : "";

        if (body.subjectId && !subjectId) throw new ApiError(400, "invalid-argument", "Invalid subject.");

        const col = db.collection("institutions/" + ctx.institutionId + "/subjects");

        // One subject name per class (case-insensitive)
        const sameClass = await col.where("class", "==", className).get();

        const clash = sameClass.docs.find(function (d) {
            return d.id !== subjectId && String(d.data().name).toLowerCase() === name.toLowerCase();
        });

        if (clash) {
            throw new ApiError(409, "failed-precondition", "This class already has a subject called " + name + ".");
        }

        if (subjectId) {

            const ref = col.doc(subjectId);

            const snap = await ref.get();

            if (!snap.exists) throw new ApiError(404, "not-found", "Subject not found.");

            // A subject stays with its class, because marks will be stored against it
            if (String(snap.data().class) !== className) {
                throw new ApiError(400, "invalid-argument", "A subject can't be moved to another class.");
            }

            await ref.set({
                name: name,
                code: code,
                sections: sections,
                group: group,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: ctx.uid
            }, { merge: true });

            return { subjectId: subjectId };
        }

        const ref = col.doc();

        await ref.set({
            institutionId: ctx.institutionId,
            class: className,
            name: name,
            code: code,
            sections: sections,
            group: group,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: ctx.uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: ctx.uid
        });

        logger.log("subject created", { institutionId: ctx.institutionId, subjectId: ref.id, by: ctx.uid });

        return { subjectId: ref.id };
    });

    const deleteSubject = wrap(async function (req) {

        const ctx = await requireAdmin(req);

        const subjectId = validId(ctx.body.subjectId);

        if (!subjectId) throw new ApiError(400, "invalid-argument", "Invalid subject.");

        const ref = db.doc("institutions/" + ctx.institutionId + "/subjects/" + subjectId);

        const snap = await ref.get();

        if (!snap.exists) throw new ApiError(404, "not-found", "Subject not found.");

        // Marks will be checked here before deleting, once marks entry is built.

        await ref.delete();

        return {};
    });


    // ---------- exams ----------

    const saveExam = wrap(async function (req) {

        const ctx = await requireAdmin(req);

        const body = ctx.body;

        const name = typeof body.name === "string" ? body.name.trim() : "";

        if (!NAME_PATTERN.test(name)) {
            throw new ApiError(400, "invalid-argument",
                "Enter an exam name of up to 60 characters: letters, numbers, spaces, . ( ) & ' -.");
        }

        const academicYear = typeof body.academicYear === "string" ? body.academicYear.trim() : "";

        if (!YEAR_PATTERN.test(academicYear)) {
            throw new ApiError(400, "invalid-argument", "The academic year must look like 2026-27.");
        }

        const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
        const endDate = typeof body.endDate === "string" ? body.endDate.trim() : "";

        if (!validDate(startDate) || !validDate(endDate)) {
            throw new ApiError(400, "invalid-argument", "Enter valid start and end dates.");
        }

        if (startDate > endDate) {
            throw new ApiError(400, "invalid-argument", "The end date can't be before the start date.");
        }

        // Which classes and sections take this exam: all classes, or chosen classes with all or some sections
        let scope = { all: true };

        if (!(body.scope && body.scope.all === true)) {

            const rows = body.scope && Array.isArray(body.scope.classes) ? body.scope.classes : [];

            if (!rows.length) {
                throw new ApiError(400, "invalid-argument", "Choose All classes, or add at least one class.");
            }

            const classSnap = await db.collection("classes").where("institutionId", "==", ctx.institutionId).get();

            const byClass = new Map();

            for (const row of rows) {

                const cls = String(row && row.class || "").trim();

                const clsDoc = classSnap.docs.find(function (d) { return String(d.data().class) === cls; });

                if (!clsDoc) throw new ApiError(400, "invalid-argument", "Class " + cls + " isn't set up under Classes.");

                const classSections = Array.isArray(clsDoc.data().sections) ? clsDoc.data().sections.map(String) : [];

                const chosen = Array.isArray(row.sections) && row.sections.length ? row.sections.map(String) : classSections;

                for (const sec of chosen) {
                    if (!classSections.includes(sec)) {
                        throw new ApiError(400, "invalid-argument", "Section " + sec + " doesn't exist in class " + cls + ".");
                    }
                }

                const set = byClass.get(cls) || new Set();
                chosen.forEach(function (sec) { set.add(sec); });
                byClass.set(cls, set);
            }

            scope = {
                all: false,
                classes: [...byClass.entries()].map(function (e) { return { class: e[0], sections: [...e[1]] }; })
            };
        }

        const examId = body.examId ? validId(body.examId) : "";

        if (body.examId && !examId) throw new ApiError(400, "invalid-argument", "Invalid exam.");

        const col = db.collection("institutions/" + ctx.institutionId + "/exams");

        const same = await col.where("academicYear", "==", academicYear).get();

        const clash = same.docs.find(function (d) {
            return d.id !== examId && String(d.data().name).toLowerCase() === name.toLowerCase();
        });

        if (clash) {
            throw new ApiError(409, "failed-precondition",
                "An exam called " + name + " already exists for " + academicYear + ".");
        }

        const data = {
            name: name,
            academicYear: academicYear,
            scope: scope,
            startDate: startDate,
            endDate: endDate,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: ctx.uid
        };

        if (examId) {

            const ref = col.doc(examId);

            const snap = await ref.get();

            if (!snap.exists) throw new ApiError(404, "not-found", "Exam not found.");

            await ref.set(data, { merge: true });

            return { examId: examId };
        }

        const ref = col.doc();

        await ref.set({
            ...data,
            institutionId: ctx.institutionId,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: ctx.uid
        });

        logger.log("exam created", { institutionId: ctx.institutionId, examId: ref.id, by: ctx.uid });

        return { examId: ref.id };
    });

    const deleteExam = wrap(async function (req) {

        const ctx = await requireAdmin(req);

        const examId = validId(ctx.body.examId);

        if (!examId) throw new ApiError(400, "invalid-argument", "Invalid exam.");

        const ref = db.doc("institutions/" + ctx.institutionId + "/exams/" + examId);

        const snap = await ref.get();

        if (!snap.exists) throw new ApiError(404, "not-found", "Exam not found.");

        // Marks will be checked here before deleting, once marks entry is built.

        await ref.delete();

        return {};
    });

    return {
        saveSubject: saveSubject,
        deleteSubject: deleteSubject,
        saveExam: saveExam,
        deleteExam: deleteExam
    };
}

// Adds CORS headers for this router only (skipped if your app already set them)
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

// Usage:  app.use("/api", createAcademicRouter(admin));
function createAcademicRouter(admin) {

    const express = require("express");

    const router = express.Router();

    const handlers = createAcademicHandlers(admin);

    const json = express.json({ limit: "20kb" });

    const paths = ["/academic/subjects/save", "/academic/subjects/delete",
                   "/academic/exams/save", "/academic/exams/delete"];

    router.use(corsForSis);

    paths.forEach(function (path) {
        router.options(path, function (req, res) { res.sendStatus(204); });
    });

    router.post("/academic/subjects/save", json, handlers.saveSubject);
    router.post("/academic/subjects/delete", json, handlers.deleteSubject);
    router.post("/academic/exams/save", json, handlers.saveExam);
    router.post("/academic/exams/delete", json, handlers.deleteExam);

    return router;
}

module.exports = { createAcademicRouter, createAcademicHandlers };