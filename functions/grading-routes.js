"use strict";

/**
 * Academx API: grading settings
 *
 *   POST /api/grading/save   save the school's grading setup (admins of the institution only)
 *
 * Writes:
 *   gradingSettings/{institutionId}              the active setup
 *   gradingSettingsHistory/{institutionId}_{version}     a copy of each earlier version
 *
 * Mount next to the other routes in server.js:
 *     const { createGradingRouter } = require("./grading-routes");
 *     app.use("/api", createGradingRouter(admin));
 */

const { validId } = require("./studentLib");

const GRADING_TYPES = ["marks_percentage", "grade_points", "letter_custom", "pass_fail"];
const ROUNDING_MODES = ["nearest", "down", "up"];
const WRITE_ROLES = ["admin"];

const NAME_PATTERN = /^[A-Za-z0-9 .()&'\-]{1,40}$/;
const GRADE_PATTERN = /^[A-Za-z0-9+\-]{1,5}$/;

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

function whole(value, min, max) {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Checks every rule and returns a clean copy of the settings.
// Throws ApiError(400) with a message the admin can act on.
function validateGradingPayload(p) {

    if (!p || typeof p !== "object") bad("Missing grading settings.");

    if (!GRADING_TYPES.includes(p.gradingType)) bad("Choose a grading type.");

    // Pass rule
    const minPercent = whole(p.passRule && p.passRule.minPercent, 0, 100);

    if (minPercent === null) bad("The pass mark must be a whole number from 0 to 100.");

    const passRule = { minPercent: minPercent, allMustPass: !!(p.passRule && p.passRule.allMustPass) };

    // Rounding
    const mode = p.rounding && p.rounding.mode;

    if (!ROUNDING_MODES.includes(mode)) bad("Choose a rounding rule.");

    const decimals = whole(p.rounding && p.rounding.decimals, 0, 2);

    if (decimals === null) bad("Decimal places must be 0, 1 or 2.");

    const rounding = { mode: mode, decimals: decimals };

    // Grade bands (grade points and custom letters only)
    let bands = [];

    if (p.gradingType === "grade_points" || p.gradingType === "letter_custom") {
        bands = validateBands(p.bands, p.gradingType === "grade_points");
    }

    // Divisions (percentage type only)
    let divisions = { enabled: false, cutoffs: [] };

    if (p.gradingType === "marks_percentage" && p.divisions && p.divisions.enabled) {
        divisions = { enabled: true, cutoffs: validateCutoffs(p.divisions.cutoffs, minPercent) };
    }

    // Who enters marks is fixed by the rule (subject teacher for their subject, class teacher for the rest).
    // Only the optional admin switch is saved here. Off by default.
    const marksEntry = { adminOverride: !!(p.marksEntry && p.marksEntry.adminOverride) };

    return {
        gradingType: p.gradingType,
        bands: bands,
        passRule: passRule,
        divisions: divisions,
        rounding: rounding,
        marksEntry: marksEntry
    };
}

// Bands are listed from highest to lowest. Each band runs from its minimum up to
// just below the band above it, so the bands can't leave gaps or overlap.
// The top band always ends at 100, and the lowest band must start at 0.
function validateBands(list, needsGradePoints) {

    if (!Array.isArray(list) || list.length < 2 || list.length > 20) {
        bad("Add between 2 and 20 grade bands.");
    }

    const rows = list.map(function (b) {

        const minMarks = whole(b.minMarks, 0, 100);

        if (minMarks === null) bad("Each band's minimum marks must be a whole number from 0 to 100.");

        const grade = typeof b.grade === "string" ? b.grade.trim() : "";

        if (!GRADE_PATTERN.test(grade)) bad("Each grade needs a name of up to 5 characters.");

        const row = { minMarks: minMarks, grade: grade };

        if (needsGradePoints) {

            const point = Number(b.gradePoint);

            if (!Number.isFinite(point) || point < 0 || point > 10) {
                bad("Each grade point must be a number from 0 to 10.");
            }

            row.gradePoint = point;
        }

        return row;
    });

    rows.sort(function (a, b) { return b.minMarks - a.minMarks; });

    const mins = rows.map(function (r) { return r.minMarks; });

    if (new Set(mins).size !== mins.length) bad("Two bands start at the same mark.");

    const grades = rows.map(function (r) { return r.grade.toLowerCase(); });

    if (new Set(grades).size !== grades.length) bad("Each grade name must be different.");

    if (rows[rows.length - 1].minMarks !== 0) bad("The lowest band must start at 0.");

    // Work out where each band ends, so the saved bands show the full range
    return rows.map(function (r, i) {

        const maxMarks = i === 0 ? 100 : rows[i - 1].minMarks - 1;

        const out = { minMarks: r.minMarks, maxMarks: maxMarks, grade: r.grade };

        if (needsGradePoints) out.gradePoint = r.gradePoint;

        return out;
    });
}

// Division cut-offs, highest first. Each division starts at its minimum.
function validateCutoffs(list, passMark) {

    if (!Array.isArray(list) || list.length < 1 || list.length > 6) {
        bad("Add between 1 and 6 divisions.");
    }

    const rows = list.map(function (d) {

        const name = typeof d.name === "string" ? d.name.trim() : "";

        if (!NAME_PATTERN.test(name)) bad("Each division needs a name of up to 40 characters.");

        const min = whole(d.min, 0, 100);

        if (min === null) bad("Each division's minimum must be a whole number from 0 to 100.");

        return { name: name, min: min };
    });

    rows.sort(function (a, b) { return b.min - a.min; });

    const mins = rows.map(function (r) { return r.min; });

    if (new Set(mins).size !== mins.length) bad("Two divisions start at the same percentage.");

    const names = rows.map(function (r) { return r.name.toLowerCase(); });

    if (new Set(names).size !== names.length) bad("Division names must be different.");

    if (rows[rows.length - 1].min < passMark) {
        bad("The lowest division can't start below the pass mark of " + passMark + "%.");
    }

    return rows;
}

function createGradingHandlers(admin, log) {

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
            throw new ApiError(403, "permission-denied", "Only an administrator of this institution can change grading.");
        }

        return { uid: decoded.uid, institutionId: institutionId, body: body };
    }

    const save = async function (req, res) {

        try {

            const ctx = await requireAdmin(req);

            const settings = validateGradingPayload(ctx.body);

            const currentRef = db.doc("gradingSettings/" + ctx.institutionId);

            // Keep the old version, then write the new one, in one transaction
            const version = await db.runTransaction(async function (tx) {

                const snap = await tx.get(currentRef);

                const previous = snap.exists ? snap.data() : null;

                const next = previous ? (previous.version || 0) + 1 : 1;

                if (previous) {
                    tx.set(
                        db.doc("gradingSettingsHistory/" + ctx.institutionId + "_" + (previous.version || 0)),
                        { ...previous, institutionId: ctx.institutionId }
                    );
                }

                tx.set(currentRef, {
                    ...settings,
                    institutionId: ctx.institutionId,
                    version: next,
                    updatedAt: FieldValue.serverTimestamp(),
                    updatedBy: ctx.uid
                });

                return next;
            });

            logger.log("grading saved", { institutionId: ctx.institutionId, version: version, by: ctx.uid });

            return res.status(200).json({ ok: true, version: version });

        } catch (error) {

            if (error instanceof ApiError) {
                return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
            }

            logger.error("grading save failed:", error);

            return res.status(500).json({ ok: false, code: "internal", message: "Something went wrong. Please try again." });
        }
    };

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

function createGradingRouter(admin) {

    const express = require("express");

    const router = express.Router();

    const handlers = createGradingHandlers(admin);

    router.use(corsForSis);

    router.options("/grading/save", function (req, res) { res.sendStatus(204); });

    router.post("/grading/save", express.json({ limit: "50kb" }), handlers.save);

    return router;
}

module.exports = {
    createGradingRouter: createGradingRouter,
    createGradingHandlers: createGradingHandlers,
    validateGradingPayload: validateGradingPayload
};