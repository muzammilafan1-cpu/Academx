"use strict";

/**
 * Academx API: POST /api/approve-application
 *
 * Called by the SIS when staff click Approve (or "Create student record").
 * Runs on the Render Express server with the Firebase Admin SDK.
 *
 *  - Requires a signed-in Firebase user (Authorization: Bearer <ID token>).
 *  - The caller must be admin/teacher of the SAME institution as the application.
 *  - Records the student under institutions/{inst}/pendingStudents/{applicationId}
 *    and marks the application approved. Creates NO Auth account and NO password.
 *  - Idempotent: repeating the request never duplicates anything.
 *
 * The student's Auth account and users/{uid} profiles are created later by your
 * existing activation endpoint when the student activates in the app.
 */

const {
    normalizeEmail, emailHash, validId, mapApplication, missingProfileValues
} = require("./studentLib");

const APPROVER_ROLES = ["admin", "teacher"];

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

function createApproveHandler(admin, log) {

    const logger = log || console;
    const db = admin.firestore();
    const auth = admin.auth();
    const FieldValue = admin.firestore.FieldValue;

    async function approve(callerUid, institutionId, applicationId, reviewNote) {

        // ---- Is the caller staff of THIS institution? ----

        const callerSnap = await db.doc("users/" + callerUid).get();

        const caller = callerSnap.exists ? callerSnap.data() : null;

        if (!caller ||
            !APPROVER_ROLES.includes(caller.role) ||
            caller.institutionId !== institutionId) {

            throw new ApiError(403, "permission-denied",
                "You can't approve applications for this institution.");
        }

        // ---- Load and validate the application ----

        const appRef = db.doc("institutions/" + institutionId + "/applications/" + applicationId);

        const appSnap = await appRef.get();

        if (!appSnap.exists) {
            throw new ApiError(404, "not-found", "Application not found.");
        }

        const application = appSnap.data();

        const status = application.status || "submitted";

        if (status === "approved" && application.pendingStudentId) {
            return { alreadyApproved: true };
        }

        if (status === "rejected") {
            throw new ApiError(409, "failed-precondition",
                "Move a rejected application back to Under Review before approving it.");
        }

        if (!["submitted", "under_review", "approved"].includes(status)) {
            throw new ApiError(409, "failed-precondition", "This application can't be approved.");
        }

        let form = null;

        if (validId(application.formId)) {

            const formSnap = await db
                .doc("institutions/" + institutionId + "/applicationForms/" + application.formId)
                .get();

            form = formSnap.exists ? formSnap.data() : null;
        }

        const mapped = mapApplication(application, form);

        const missing = missingProfileValues(mapped);

        if (missing.length) {
            throw new ApiError(409, "failed-precondition",
                "This application can't become a student record. It is missing " + missing.join(", ") + ".");
        }

        // ---- Does this email already belong to another Academx account? ----

        let existingUid = null;

        try {
            existingUid = (await auth.getUserByEmail(mapped.email)).uid;
        } catch (error) {
            if (error.code !== "auth/user-not-found") throw error;
        }

        if (existingUid) {

            const existingProfile = await db.doc("users/" + existingUid).get();

            if (existingProfile.exists) {

                const profile = existingProfile.data();

                if (profile.institutionId !== institutionId || profile.role !== "student") {
                    throw new ApiError(409, "failed-precondition",
                        "This email already belongs to another Academx account, so a student record can't be created for it.");
                }
            }
        }

        // ---- Write everything together ----

        const pointerRef = db.doc("pendingStudentEmails/" + emailHash(mapped.email));
        const pendingRef = db.doc("institutions/" + institutionId + "/pendingStudents/" + applicationId);

        await db.runTransaction(async function (tx) {

            const fresh = await tx.get(appRef);
            const pointer = await tx.get(pointerRef);
            const pending = await tx.get(pendingRef);

            if (!fresh.exists) {
                throw new ApiError(404, "not-found", "Application not found.");
            }

            const now = fresh.data();

            if ((now.status || "submitted") === "approved" && now.pendingStudentId) {
                return; // approved a moment ago by another request
            }

            if (pointer.exists) {

                const p = pointer.data();

                if (p.institutionId !== institutionId || p.applicationId !== applicationId) {
                    throw new ApiError(409, "failed-precondition",
                        "A student record already exists for this email.");
                }
            }

            if (!pending.exists) {

                const record = {
                    email: mapped.email,
                    name: mapped.name,
                    role: "student",
                    institutionId: institutionId,
                    class: mapped.class,
                    section: mapped.section,
                    applicationId: applicationId,
                    formId: application.formId || "",
                    status: "pending",
                    approvedBy: callerUid,
                    createdAt: FieldValue.serverTimestamp()
                };

                if (mapped.contactNumber) record.contactNumber = mapped.contactNumber;

                tx.set(pendingRef, record);
            }

            if (!pointer.exists) {

                tx.set(pointerRef, {
                    institutionId: institutionId,
                    applicationId: applicationId,
                    createdAt: FieldValue.serverTimestamp()
                });
            }

            const update = {
                status: "approved",
                pendingStudentId: applicationId,
                reviewedBy: callerUid,
                reviewedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };

            if (reviewNote) update.reviewNote = reviewNote;

            if (pending.exists && pending.data().studentUid) {
                update.studentUid = pending.data().studentUid;
            }

            tx.update(appRef, update);
        });

        return { alreadyApproved: false };
    }

    return async function handler(req, res) {

        try {

            const match = String(req.headers.authorization || "").match(/^Bearer (.+)$/i);

            if (!match) {
                throw new ApiError(401, "unauthenticated", "Please sign in again.");
            }

            let decoded;

            try {
                decoded = await auth.verifyIdToken(match[1]);
            } catch (error) {
                throw new ApiError(401, "unauthenticated", "Your session has expired. Please sign in again.");
            }

            const body = req.body || {};

            const institutionId = validId(body.institutionId);
            const applicationId = validId(body.applicationId);

            if (!institutionId || !applicationId) {
                throw new ApiError(400, "invalid-argument", "Missing or invalid application.");
            }

            const reviewNote = typeof body.reviewNote === "string"
                ? body.reviewNote.trim().slice(0, 1000)
                : "";

            const result = await approve(decoded.uid, institutionId, applicationId, reviewNote);

            logger.log("approve-application ok", { institutionId, applicationId, uid: decoded.uid });

            res.status(200).json({ ok: true, ...result });

        } catch (error) {

            if (error instanceof ApiError) {
                return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
            }

            // Full detail goes to the Render logs only, never to the browser.
            logger.error("approve-application failed:", error);

            res.status(500).json({
                ok: false,
                code: "internal",
                message: "Something went wrong. Please try again."
            });
        }
    };
}

// Adds CORS headers for this router only (and skips them if your app already set them).
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

// Usage:  app.use("/api", createApproveRouter(admin));
function createApproveRouter(admin) {

    const express = require("express");

    const router = express.Router();

    router.use(corsForSis);

    router.options("/approve-application", function (req, res) {
        res.sendStatus(204);
    });

    router.post(
        "/approve-application",
        express.json({ limit: "20kb" }),
        createApproveHandler(admin)
    );

    return router;
}

module.exports = { createApproveRouter, createApproveHandler };
