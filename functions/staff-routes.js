"use strict";

/**
 * Academx API: staff (teachers and admins)
 *
 *   POST /api/staff/create        create a teacher or admin account (no password)
 *   POST /api/staff/assignments   save a teacher's subject and class-teacher assignments
 *
 * Admins of the same institution only. Nobody sets a password here: the browser sends
 * Firebase's password-setup email afterwards, and the staff member chooses their own password.
 *
 * Writes:
 *   users/{uid} and institutions/{inst}/users/{uid}      role, name, email, teacherRoles
 *   institutions/{inst}/teachingAssignments/{id}         one subject per class and section
 *   classes/{classId}.classTeachers                      { "A": { uid, marksAttendance } }
 *
 * Mount next to the other routes in server.js:
 *     const { createStaffRouter } = require("./staff-routes");
 *     app.use("/api", createStaffRouter(admin));
 */

const { validId, normalizeEmail } = require("./studentLib");

const ADMIN_ROLES = ["admin"];
const STAFF_ROLES = ["teacher", "admin"];
const MAX_SUBJECTS = 200;
const MAX_CLASS_TEACHER = 50;

const ALLOWED_ORIGINS = [
    "https://academx.in",
    "https://www.academx.in",
    "https://school-app-backend-38e01.web.app",
    "https://school-app-backend-38e01.firebaseapp.com"
];

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

function createStaffHandlers(admin, log) {

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

        if (!caller || !ADMIN_ROLES.includes(caller.role) || caller.institutionId !== institutionId) {
            throw new ApiError(403, "permission-denied", "Only an administrator of this institution can manage staff.");
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

                logger.error("staff route failed:", req.path, error);

                res.status(500).json({ ok: false, code: "internal", message: "Something went wrong. Please try again." });
            }
        };
    }

    // ---------- create a teacher or admin ----------

    const create = wrap(async function (req) {

        const ctx = await requireAdmin(req);

        const body = ctx.body;

        const name = typeof body.name === "string" ? body.name.trim() : "";

        if (!name || name.length > 100) bad("Enter the person's name (up to 100 characters).");

        const email = normalizeEmail(body.email);

        if (!email) bad("Enter a valid email address.");

        const role = body.role;

        if (!STAFF_ROLES.includes(role)) bad("Choose Teacher or Admin.");

        const teacherRoles = role === "teacher"
            ? {
                subject: !!(body.teacherRoles && body.teacherRoles.subject),
                classTeacher: !!(body.teacherRoles && body.teacherRoles.classTeacher)
            }
            : null;

        if (teacherRoles && !teacherRoles.subject && !teacherRoles.classTeacher) {
            bad("Give a teacher at least one role: Subject teacher or Class teacher.");
        }

        // Is this email already in use?
        let uid = null;

        try {
            uid = (await auth.getUserByEmail(email)).uid;
        } catch (error) {
            if (error.code !== "auth/user-not-found") throw error;
        }

        if (uid) {

            const existing = await db.doc("users/" + uid).get();

            if (existing.exists) {

                const p = existing.data();

                if (p.institutionId === ctx.institutionId && STAFF_ROLES.includes(p.role)) {
                    throw new ApiError(409, "failed-precondition", "This person is already on your staff list.");
                }

                throw new ApiError(409, "failed-precondition",
                    "This email already belongs to another Academx account.");
            }
        } else {

            const created = await auth.createUser({ email: email, displayName: name, emailVerified: false });

            uid = created.uid;
        }

        const profile = {
            name: name,
            email: email,
            role: role,
            institutionId: ctx.institutionId,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: ctx.uid
        };

        if (teacherRoles) profile.teacherRoles = teacherRoles;

        const batch = db.batch();

        batch.set(db.doc("users/" + uid), profile);
        batch.set(db.doc("institutions/" + ctx.institutionId + "/users/" + uid), profile);

        await batch.commit();

        logger.log("staff created", { institutionId: ctx.institutionId, uid: uid, role: role, by: ctx.uid });

        return { uid: uid };
    });

    // ---------- save a teacher's assignments ----------

    const saveAssignments = wrap(async function (req) {

        const ctx = await requireAdmin(req);

        const body = ctx.body;

        const uid = validId(body.uid);

        if (!uid) bad("Missing or invalid staff member.");

        const userRef = db.doc("users/" + uid);

        const userSnap = await userRef.get();

        const user = userSnap.exists ? userSnap.data() : null;

        if (!user || user.institutionId !== ctx.institutionId || !STAFF_ROLES.includes(user.role)) {
            throw new ApiError(404, "not-found", "Staff member not found.");
        }

        const wantsSubject = !!(body.teacherRoles && body.teacherRoles.subject);
        const wantsClassTeacher = !!(body.teacherRoles && body.teacherRoles.classTeacher);

        if (user.role === "admin") {
            if (wantsSubject || wantsClassTeacher) bad("Admins don't teach. Only teachers can have these roles.");
        }

        const subjectsIn = Array.isArray(body.subjects) ? body.subjects : [];
        const classIn = Array.isArray(body.classTeacherSections) ? body.classTeacherSections : [];

        if (!wantsSubject && subjectsIn.length) bad("Turn on Subject teacher before choosing subjects.");
        if (!wantsClassTeacher && classIn.length) bad("Turn on Class teacher before choosing sections.");
        if (subjectsIn.length > MAX_SUBJECTS) bad("Too many subjects for one teacher.");
        if (classIn.length > MAX_CLASS_TEACHER) bad("Too many class teacher sections.");

        // The classes of this institution: names, sections and their refs
        const classSnap = await db.collection("classes").where("institutionId", "==", ctx.institutionId).get();

        const classes = classSnap.docs.map(function (d) {
            const x = d.data();
            return {
                ref: d.ref,
                id: d.id,
                class: String(x.class),
                sections: Array.isArray(x.sections) ? x.sections.map(String) : [],
                classTeachers: x.classTeachers && typeof x.classTeachers === "object" ? x.classTeachers : {}
            };
        });

        function findClass(className, section) {
            const c = classes.find(function (x) { return x.class === String(className); });
            if (!c) bad("Class " + className + " isn't set up under Classes.");
            if (!c.sections.includes(String(section))) bad("Section " + section + " doesn't exist in class " + className + ".");
            return c;
        }

        // ---- subject assignments ----
        const subjectSeen = new Set();
        const subjects = [];

        for (const s of subjectsIn) {

            const className = String(s && s.class || "");
            const section = String(s && s.section || "");
            const subjectId = validId(s && s.subjectId);

            if (!subjectId) bad("A subject reference is invalid.");

            findClass(className, section);

            const subjSnap = await db.doc("institutions/" + ctx.institutionId + "/subjects/" + subjectId).get();

            if (!subjSnap.exists || String(subjSnap.data().class) !== className) {
                bad("A subject doesn't belong to class " + className + ".");
            }

            const key = className + "|" + section + "|" + subjectId;

            if (subjectSeen.has(key)) continue;

            subjectSeen.add(key);

            subjects.push({ class: className, section: section, subjectId: subjectId, subjectName: subjSnap.data().name || "" });
        }

        // ---- class teacher sections ----
        const sectionSeen = new Set();
        const classTeacherSections = [];

        for (const c of classIn) {

            const className = String(c && c.class || "");
            const section = String(c && c.section || "");

            findClass(className, section);

            const key = className + "|" + section;

            if (sectionSeen.has(key)) continue;

            sectionSeen.add(key);

            classTeacherSections.push({ class: className, section: section, marksAttendance: !!(c && c.marksAttendance) });
        }

        // ---- write everything together ----
        const teacherRoles = { subject: wantsSubject, classTeacher: wantsClassTeacher };

        const batch = db.batch();

        batch.set(userRef, { teacherRoles: teacherRoles, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        batch.set(db.doc("institutions/" + ctx.institutionId + "/users/" + uid),
            { teacherRoles: teacherRoles, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

        // Replace this teacher's subject assignments
        const old = await db.collection("institutions/" + ctx.institutionId + "/teachingAssignments")
            .where("teacherUid", "==", uid).get();

        old.docs.forEach(function (d) { batch.delete(d.ref); });

        subjects.forEach(function (s) {

            const id = uid + "__" + slug(s.class) + "__" + slug(s.section) + "__" + s.subjectId;

            batch.set(db.doc("institutions/" + ctx.institutionId + "/teachingAssignments/" + id), {
                institutionId: ctx.institutionId,
                teacherUid: uid,
                class: s.class,
                section: s.section,
                subjectId: s.subjectId,
                subjectName: s.subjectName,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: ctx.uid
            });
        });

        // Class teacher: remove this person from every section first, then set the chosen ones.
        // Choosing a section that had another class teacher replaces them.
        classes.forEach(function (c) {

            const next = {};

            Object.keys(c.classTeachers).forEach(function (section) {
                const entry = c.classTeachers[section];
                if (!entry || entry.uid !== uid) next[section] = entry;
            });

            classTeacherSections.forEach(function (chosen) {
                if (chosen.class === c.class) {
                    next[chosen.section] = { uid: uid, marksAttendance: chosen.marksAttendance };
                }
            });

            const changed = JSON.stringify(next) !== JSON.stringify(c.classTeachers);

            if (changed) batch.update(c.ref, { classTeachers: next });
        });

        await batch.commit();

        logger.log("staff assignments saved", { institutionId: ctx.institutionId, uid: uid, by: ctx.uid });

        return { subjects: subjects.length, classTeacherSections: classTeacherSections.length };
    });

    return { create: create, saveAssignments: saveAssignments };
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

function createStaffRouter(admin) {

    const express = require("express");

    const router = express.Router();

    const handlers = createStaffHandlers(admin);

    router.use(corsForSis);

    ["/staff/create", "/staff/assignments"].forEach(function (path) {
        router.options(path, function (req, res) { res.sendStatus(204); });
    });

    router.post("/staff/create", express.json({ limit: "20kb" }), handlers.create);
    router.post("/staff/assignments", express.json({ limit: "100kb" }), handlers.saveAssignments);

    return router;
}

module.exports = { createStaffRouter: createStaffRouter, createStaffHandlers: createStaffHandlers };