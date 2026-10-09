"use strict";

/**
 * Academx backend
 *
 *   approveApplication       (signed-in SIS staff)
 *       Approves an application and records the student under
 *       institutions/{institutionId}/pendingStudents/{applicationId}.
 *       Creates NO Auth account.
 *
 *   firebase deploy --only functions   (no sign-in; called from the app's activation screen)
 *       Finds the approved student by email, creates/reuses the Firebase Auth
 *       account (without a password), creates users/{uid} and
 *       institutions/{institutionId}/users/{uid}, and links studentUid back to
 *       the application. The app then sends Firebase's password-reset email so
 *       the student chooses their own password.
 *
 * Passwords are never created, sent or stored by this code.
 * The response to the public function is deliberately generic: it never says
 * whether an email is enrolled.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const {
    normalizeEmail, emailHash, validId, mapApplication, missingProfileValues
} = require("./lib");

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

// Same region as the Firestore database. The SIS and the app use this region too.
const REGION = "asia-south1";

// Roles allowed to approve applications (same people who can review them in the SIS).
const APPROVER_ROLES = ["admin", "teacher"];

// One activation request per email per minute.
const THROTTLE_MS = 60 * 1000;

const CORS = [
    "https://academx.in",
    "https://www.academx.in",
    "https://school-app-backend-38e01.web.app",
    "https://school-app-backend-38e01.firebaseapp.com"
];

const OPTIONS = { region: REGION, cors: CORS, maxInstances: 10 };


// ============================================================
// approveApplication
// ============================================================

exports.approveApplication = onCall(OPTIONS, async function (request) {

    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Please sign in.");
    }

    const input = request.data || {};

    const institutionId = validId(input.institutionId);
    const applicationId = validId(input.applicationId);

    if (!institutionId || !applicationId) {
        throw new HttpsError("invalid-argument", "Missing or invalid application.");
    }

    const reviewNote = typeof input.reviewNote === "string"
        ? input.reviewNote.trim().slice(0, 1000)
        : "";

    // ---- Is the caller staff of THIS institution? ----

    const callerSnap = await db.doc("users/" + request.auth.uid).get();

    const caller = callerSnap.exists ? callerSnap.data() : null;

    if (!caller ||
        !APPROVER_ROLES.includes(caller.role) ||
        caller.institutionId !== institutionId) {

        throw new HttpsError(
            "permission-denied",
            "You can't approve applications for this institution."
        );
    }

    // ---- Load and validate the application ----

    const appRef = db.doc("institutions/" + institutionId + "/applications/" + applicationId);

    const appSnap = await appRef.get();

    if (!appSnap.exists) {
        throw new HttpsError("not-found", "Application not found.");
    }

    const application = appSnap.data();

    const status = application.status || "submitted";

    // Already processed: do nothing (idempotent).
    if (status === "approved" && application.pendingStudentId) {
        return { ok: true, alreadyApproved: true };
    }

    if (status === "rejected") {
        throw new HttpsError(
            "failed-precondition",
            "Move a rejected application back to Under Review before approving it."
        );
    }

    if (!["submitted", "under_review", "approved"].includes(status)) {
        throw new HttpsError("failed-precondition", "This application can't be approved.");
    }

    let form = null;

    if (typeof application.formId === "string" && validId(application.formId)) {

        const formSnap = await db
            .doc("institutions/" + institutionId + "/applicationForms/" + application.formId)
            .get();

        form = formSnap.exists ? formSnap.data() : null;
    }

    const mapped = mapApplication(application, form);

    const missing = missingProfileValues(mapped);

    if (missing.length) {
        throw new HttpsError(
            "failed-precondition",
            "This application can't become a student record. It is missing " + missing.join(", ") + "."
        );
    }

    // ---- Does this email already belong to another Academx account? ----
    // (Only staff see this message. It does not say which institution.)

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
                throw new HttpsError(
                    "failed-precondition",
                    "This email already belongs to another Academx account, so a student record can't be created for it."
                );
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
            throw new HttpsError("not-found", "Application not found.");
        }

        const now = fresh.data();

        if ((now.status || "submitted") === "approved" && now.pendingStudentId) {
            return; // someone else approved it a moment ago
        }

        if (pointer.exists) {

            const p = pointer.data();

            if (p.institutionId !== institutionId || p.applicationId !== applicationId) {
                throw new HttpsError(
                    "failed-precondition",
                    "A student record already exists for this email."
                );
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
                approvedBy: request.auth.uid,
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
            reviewedBy: request.auth.uid,
            reviewedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };

        if (reviewNote) update.reviewNote = reviewNote;

        if (pending.exists && pending.data().studentUid) {
            update.studentUid = pending.data().studentUid;
        }

        tx.update(appRef, update);
    });

    logger.info("Application approved", { institutionId, applicationId });

    return { ok: true, alreadyApproved: false };
});


// ============================================================
// activateStudentAccount
// Public. Never reveals whether an email is enrolled.
// ============================================================

exports.activateStudentAccount = onCall(OPTIONS, async function (request) {

    const email = normalizeEmail(request.data && request.data.email);

    if (!email) {
        throw new HttpsError("invalid-argument", "Please enter a valid email address.");
    }

    const hash = emailHash(email);

    try {

        // ---- Throttle: one request per email per minute (same for every email) ----

        const throttleRef = db.doc("activationThrottle/" + hash);

        const allowed = await db.runTransaction(async function (tx) {

            const snap = await tx.get(throttleRef);

            const now = Date.now();

            if (snap.exists && now - snap.data().lastAt < THROTTLE_MS) return false;

            tx.set(throttleRef, {
                lastAt: now,
                // Optional: enable a Firestore TTL policy on this field to auto-delete old docs
                expireAt: admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000)
            });

            return true;
        });

        if (!allowed) {
            return { ok: true, proceed: false };
        }

        // ---- Is there an approved student waiting for this email? ----

        const pointerSnap = await db.doc("pendingStudentEmails/" + hash).get();

        if (!pointerSnap.exists) {
            logger.info("Activation: no approved student for this email");
            return { ok: true, proceed: true };
        }

        const institutionId = validId(pointerSnap.data().institutionId);
        const applicationId = validId(pointerSnap.data().applicationId);

        if (!institutionId || !applicationId) {
            logger.warn("Activation: invalid lookup record", { hash });
            return { ok: true, proceed: true };
        }

        const pendingRef = db.doc("institutions/" + institutionId + "/pendingStudents/" + applicationId);

        const pendingSnap = await pendingRef.get();

        if (!pendingSnap.exists || pendingSnap.data().email !== email) {
            logger.warn("Activation: pending record missing or mismatched", { institutionId, applicationId });
            return { ok: true, proceed: true };
        }

        const pending = pendingSnap.data();

        // ---- Firebase Auth account: reuse if it exists, otherwise create WITHOUT a password ----

        let userRecord;

        try {

            userRecord = await auth.getUserByEmail(email);

        } catch (error) {

            if (error.code !== "auth/user-not-found") throw error;

            try {

                userRecord = await auth.createUser({
                    email: email,
                    displayName: pending.name,
                    emailVerified: false
                });

            } catch (createError) {

                // Created by a parallel request a moment ago
                if (createError.code === "auth/email-already-exists") {
                    userRecord = await auth.getUserByEmail(email);
                } else {
                    throw createError;
                }
            }
        }

        const uid = userRecord.uid;

        // ---- Never take over an account that belongs to someone else ----

        const userRef = db.doc("users/" + uid);
        const instUserRef = db.doc("institutions/" + institutionId + "/users/" + uid);

        const userSnap = await userRef.get();

        if (userSnap.exists) {

            const existing = userSnap.data();

            if (existing.institutionId !== institutionId || existing.role !== "student") {
                logger.warn("Activation: email belongs to a different account type or institution", { uid });
                return { ok: true, proceed: true };
            }
        }

        const instUserSnap = await instUserRef.get();

        const appRef = db.doc("institutions/" + institutionId + "/applications/" + applicationId);

        const appSnap = await appRef.get();

        // ---- Create the profile in BOTH places, with the same UID. Existing profiles are not overwritten. ----

        const profile = {
            email: email,
            name: pending.name,
            role: "student",
            institutionId: institutionId,
            class: pending.class || "",
            section: pending.section || "",
            applicationId: applicationId
        };

        if (pending.contactNumber) profile.contactNumber = pending.contactNumber;

        const batch = db.batch();

        if (!userSnap.exists) {
            batch.set(userRef, { ...profile, createdAt: FieldValue.serverTimestamp() });
        }

        if (!instUserSnap.exists) {
            batch.set(instUserRef, { ...profile, createdAt: FieldValue.serverTimestamp() });
        }

        if (pending.status !== "activated" || pending.studentUid !== uid) {

            batch.update(pendingRef, {
                status: "activated",
                studentUid: uid,
                activatedAt: FieldValue.serverTimestamp()
            });
        }

        if (appSnap.exists && appSnap.data().studentUid !== uid) {

            batch.update(appRef, {
                studentUid: uid,
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        await batch.commit();

        logger.info("Student account ready", { institutionId, applicationId, uid });

        return { ok: true, proceed: true };

    } catch (error) {

        if (error instanceof HttpsError) throw error;

        logger.error("Activation failed", error);

        throw new HttpsError("internal", "Something went wrong. Please try again.");
    }
});
