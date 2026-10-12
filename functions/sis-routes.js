"use strict";

/**
 * Academx API: student and class management for the SIS
 *
 *   POST /api/students/update   edit a student's name, class, section, contact number
 *   POST /api/classes/save      create a class, or change a class's sections
 *   POST /api/classes/delete    delete an unused class
 *
 * Same rules as /api/approve-application:
 *  - requires a signed-in Firebase user (Authorization: Bearer <ID token>)
 *  - the caller must be an ADMIN of the same institution (taken from their own users/{uid})
 *  - nothing secret is returned; unexpected errors are logged on Render only
 *
 * Mount it next to the approve route:
 *     const { createSisRouter } = require("./sis-routes");
 *     app.use("/api", createSisRouter(admin));
 */

const { validId } = require("./studentLib");

const WRITE_ROLES = ["admin"];

const ALLOWED_ORIGINS = [
    "https://academx.in",
    "https://www.academx.in",
    "https://school-app-backend-38e01.web.app",
    "https://school-app-backend-38e01.firebaseapp.com"
];

const NAME_PATTERN = /^[A-Za-z0-9 .\-]{1,20}$/;      // class names, e.g. "10", "Class 1", "LKG"
const SECTION_PATTERN = /^[A-Za-z0-9 .\-]{1,10}$/;   // section names, e.g. "A"
const PHONE_PATTERN = /^[0-9+\-() .]{0,20}$/;

class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function createSisHandlers(admin, log) {

    const logger = log || console;
    const db = admin.firestore();
    const auth = admin.auth();
    const FieldValue = admin.firestore.FieldValue;

    // ---------- shared checks ----------

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

                logger.error("sis route failed:", req.path, error);

                res.status(500).json({
                    ok: false,
                    code: "internal",
                    message: "Something went wrong. Please try again."
                });
            }
        };
    }

    async function classesOf(institutionId) {

        const snap = await db.collection("classes").where("institutionId", "==", institutionId).get();

        return snap.docs.map(function (d) {
            const data = d.data();
            return {
                id: d.id,
                class: String(data.class === undefined ? "" : data.class),
                sections: Array.isArray(data.sections) ? data.sections.map(String) : []
            };
        });
    }

    async function studentsInClass(institutionId, className) {

        const snap = await db.collection("users")
            .where("institutionId", "==", institutionId)
            .where("class", "==", className)
            .get();

        return snap.docs.map(function (d) { return d.data(); }).filter(function (u) { return u.role === "student"; });
    }


    // ---------- POST /api/students/update ----------

    const updateStudent = wrap(async function (req) {

        const ctx = await requireAdmin(req);

        const body = ctx.body;

        const uid = validId(body.uid);

        if (!uid) throw new ApiError(400, "invalid-argument", "Missing or invalid student.");

        const name = typeof body.name === "string" ? body.name.trim() : "";

        const className = typeof body.class === "string" ? body.class.trim() : "";

        const section = typeof body.section === "string" ? body.section.trim() : "";

        const contact = typeof body.contactNumber === "string" ? body.contactNumber.trim() : "";

        if (!name || name.length > 100) {
            throw new ApiError(400, "invalid-argument", "Enter the student's name (up to 100 characters).");
        }

        if (!PHONE_PATTERN.test(contact)) {
            throw new ApiError(400, "invalid-argument", "The contact number can only contain digits, spaces and + - ( ) .");
        }

        if (section && !className) {
            throw new ApiError(400, "invalid-argument", "Choose a class before choosing a section.");
        }

        // The student must exist, be a student, and belong to THIS institution
        const userRef = db.doc("users/" + uid);

        const userSnap = await userRef.get();

        const user = userSnap.exists ? userSnap.data() : null;

        if (!user || user.role !== "student" || user.institutionId !== ctx.institutionId) {
            throw new ApiError(404, "not-found", "Student not found.");
        }

        // Class and section must exist in this institution's Classes list
        if (className) {

            const found = (await classesOf(ctx.institutionId)).find(function (c) { return c.class === className; });

            if (!found) throw new ApiError(400, "invalid-argument", "That class isn't set up under Classes.");

            if (section && !found.sections.includes(section)) {
                throw new ApiError(400, "invalid-argument", "That section doesn't exist in this class.");
            }
        }

        const patch = {
            name: name,
            class: className,
            section: section,
            contactNumber: contact,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: ctx.uid
        };

        // Same values in BOTH places, written together
        const batch = db.batch();

        batch.set(userRef, patch, { merge: true });

        batch.set(db.doc("institutions/" + ctx.institutionId + "/users/" + uid), patch, { merge: true });

        await batch.commit();

        logger.log("student updated", { institutionId: ctx.institutionId, uid: uid, by: ctx.uid });

        return {};
    });


    // ---------- POST /api/classes/save ----------

    const saveClass = wrap(async function (req) {

        const ctx = await requireAdmin(req);

        const body = ctx.body;

        const className = typeof body.class === "string" ? body.class.trim() : "";

        const classId = body.classId ? validId(body.classId) : "";

        if (body.classId && !classId) throw new ApiError(400, "invalid-argument", "Invalid class.");

        if (!NAME_PATTERN.test(className)) {
            throw new ApiError(400, "invalid-argument",
                "The class name must be 1 to 20 characters: letters, numbers, spaces, dots or dashes.");
        }

        const rawSections = Array.isArray(body.sections) ? body.sections : [];

        if (rawSections.length > 26) throw new ApiError(400, "invalid-argument", "A class can have up to 26 sections.");

        const sections = [];

        const seen = new Set();

        for (const raw of rawSections) {

            const section = typeof raw === "string" ? raw.trim() : "";

            if (!SECTION_PATTERN.test(section)) {
                throw new ApiError(400, "invalid-argument",
                    "Each section must be 1 to 10 characters: letters, numbers, spaces, dots or dashes.");
            }

            if (seen.has(section.toLowerCase())) continue;

            seen.add(section.toLowerCase());

            sections.push(section);
        }

        const existing = await classesOf(ctx.institutionId);

        if (!classId) {

            if (existing.some(function (c) { return c.class.toLowerCase() === className.toLowerCase(); })) {
                throw new ApiError(409, "failed-precondition", "This class already exists.");
            }

            const ref = db.collection("classes").doc();

            await ref.set({
                class: className,
                institutionId: ctx.institutionId,
                sections: sections,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });

            return { classId: ref.id };
        }

        // ---- change the sections of an existing class ----

        const current = existing.find(function (c) { return c.id === classId; });

        if (!current) throw new ApiError(404, "not-found", "Class not found.");

        if (current.class !== className) {
            throw new ApiError(400, "invalid-argument",
                "A class can't be renamed because attendance and timetable records use its name.");
        }

        // A section that students still use can't be removed
        const removed = current.sections.filter(function (s) { return !seen.has(s.toLowerCase()); });

        if (removed.length) {

            const students = await studentsInClass(ctx.institutionId, current.class);

            const inUse = removed.filter(function (s) {
                return students.some(function (u) { return String(u.section) === s; });
            });

            if (inUse.length) {
                throw new ApiError(409, "failed-precondition",
                    "Section " + inUse.join(", ") + " still has students. Move them first.");
            }
        }

        await db.doc("classes/" + classId).update({
            sections: sections,
            updatedAt: FieldValue.serverTimestamp()
        });

        return { classId: classId };
    });


    // ---------- POST /api/classes/delete ----------

    const deleteClass = wrap(async function (req) {

        const ctx = await requireAdmin(req);

        const classId = validId(ctx.body.classId);

        if (!classId) throw new ApiError(400, "invalid-argument", "Invalid class.");

        const current = (await classesOf(ctx.institutionId)).find(function (c) { return c.id === classId; });

        if (!current) throw new ApiError(404, "not-found", "Class not found.");

        const students = await studentsInClass(ctx.institutionId, current.class);

        if (students.length) {
            throw new ApiError(409, "failed-precondition",
                students.length + " student" + (students.length === 1 ? " is" : "s are") + " in this class. Move them first.");
        }

        // Keep history: don't delete a class that has attendance or timetable records
        for (const collectionName of ["attendance_v2", "timetable"]) {

            const used = await db.collection(collectionName)
                .where("institutionId", "==", ctx.institutionId)
                .where("class", "==", current.class)
                .limit(1)
                .get();

            if (!used.empty) {
                throw new ApiError(409, "failed-precondition",
                    "This class has " + (collectionName === "timetable" ? "timetable" : "attendance") +
                    " records, so it can't be deleted.");
            }
        }

        await db.doc("classes/" + classId).delete();

        return {};
    });

    return { updateStudent: updateStudent, saveClass: saveClass, deleteClass: deleteClass };
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

// Usage:  app.use("/api", createSisRouter(admin));
function createSisRouter(admin) {

    const express = require("express");

    const router = express.Router();

    const handlers = createSisHandlers(admin);

    const json = express.json({ limit: "20kb" });

    router.use(corsForSis);

    ["/students/update", "/classes/save", "/classes/delete"].forEach(function (path) {
        router.options(path, function (req, res) { res.sendStatus(204); });
    });

    router.post("/students/update", json, handlers.updateStudent);
    router.post("/classes/save", json, handlers.saveClass);
    router.post("/classes/delete", json, handlers.deleteClass);

    return router;
}

module.exports = { createSisRouter, createSisHandlers };
