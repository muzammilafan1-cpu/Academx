"use strict";

/**
 * Academx API: attendance rules (Settings > Business rules > Attendance rules)
 *
 *   POST /api/attendance-rules/save   (admins of the institution only)
 *
 * Writes (top-level collections, one document per institution):
 *   attendanceSettings/{institutionId}                  the active rule
 *   attendanceSettingsHistory/{institutionId}_{version} a copy of each earlier version
 *
 * Mount next to the other routes in server.js:
 *     const { createAttendanceRulesRouter } = require("./attendance-rules-routes");
 *     app.use("/api", createAttendanceRulesRouter(admin));
 */

const { validId } = require("./studentLib");

const MODES = ["daily", "per_subject"];
const WRITE_ROLES = ["admin"];

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

function validateAttendanceRules(p) {

    if (!p || typeof p !== "object") throw new ApiError(400, "invalid-argument", "Missing attendance rules.");

    if (!MODES.includes(p.mode)) {
        throw new ApiError(400, "invalid-argument", "Choose Daily or Per subject.");
    }

    return {
        mode: p.mode,
        adminOverride: !!p.adminOverride
    };
}

function createAttendanceRulesHandlers(admin, log) {

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
            throw new ApiError(403, "permission-denied", "Only an administrator of this institution can change attendance rules.");
        }

        return { uid: decoded.uid, institutionId: institutionId, body: body };
    }

    const save = async function (req, res) {

        try {

            const ctx = await requireAdmin(req);

            const rules = validateAttendanceRules(ctx.body);

            const currentRef = db.doc("attendanceSettings/" + ctx.institutionId);

            const version = await db.runTransaction(async function (tx) {

                const snap = await tx.get(currentRef);

                const previous = snap.exists ? snap.data() : null;

                const next = previous ? (previous.version || 0) + 1 : 1;

                if (previous) {
                    tx.set(
                        db.doc("attendanceSettingsHistory/" + ctx.institutionId + "_" + (previous.version || 0)),
                        { ...previous, institutionId: ctx.institutionId }
                    );
                }

                tx.set(currentRef, {
                    ...rules,
                    institutionId: ctx.institutionId,
                    version: next,
                    updatedAt: FieldValue.serverTimestamp(),
                    updatedBy: ctx.uid
                });

                return next;
            });

            logger.log("attendance rules saved", { institutionId: ctx.institutionId, version: version, by: ctx.uid });

            return res.status(200).json({ ok: true, version: version });

        } catch (error) {

            if (error instanceof ApiError) {
                return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
            }

            logger.error("attendance rules save failed:", error);

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

function createAttendanceRulesRouter(admin) {

    const express = require("express");

    const router = express.Router();

    const handlers = createAttendanceRulesHandlers(admin);

    router.use(corsForSis);

    router.options("/attendance-rules/save", function (req, res) { res.sendStatus(204); });

    router.post("/attendance-rules/save", express.json({ limit: "20kb" }), handlers.save);

    return router;
}

module.exports = {
    createAttendanceRulesRouter: createAttendanceRulesRouter,
    createAttendanceRulesHandlers: createAttendanceRulesHandlers,
    validateAttendanceRules: validateAttendanceRules
};