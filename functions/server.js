
"use strict";

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const {
  normalizeEmail,
  emailHash,
  validId,
  mapApplication,
  missingProfileValues,
} = require("./lib");

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  admin.initializeApp({
    credential: serviceAccount
      ? admin.credential.cert(serviceAccount)
      : admin.credential.applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "school-app-backend-38e01",
  });
}

const app = express();
const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

const { createApproveRouter } = require("./approve-application");
app.use("/api", createApproveRouter(admin));

const { createSisRouter } = require("./sis-routes");
app.use("/api", createSisRouter(admin));

const { createAcademicRouter } = require("./academic-routes");
app.use("/api", createAcademicRouter(admin));

const { createGradingRouter } = require("./grading-routes");
app.use("/api", createGradingRouter(admin));

const { createAttendanceRulesRouter } = require("./attendance-rules-routes");
app.use("/api", createAttendanceRulesRouter(admin));

const { createMarksRouter } = require("./marks-routes");
app.use("/api", createMarksRouter(admin));

const { createStaffRouter } = require("./staff-routes");
app.use("/api", createStaffRouter(admin));

const allowedOrigins = [
  "https://academx.in",
  "https://www.academx.in",
  "https://school-app-backend-38e01.web.app",
  "https://school-app-backend-38e01.firebaseapp.com",
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  },
}));

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "Academx API" });
});

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function requireFirebaseUser(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer (.+)$/i);

    if (!match) {
      return sendError(res, 401, "Please sign in.");
    }

    req.firebaseUser = await auth.verifyIdToken(match[1]);
    return next();
  } catch (_error) {
    return sendError(res, 401, "Invalid or expired sign-in token.");
  }
}

function handleError(res, error) {
  console.error("Academx API error:", error);

  if (error.apiStatus) {
    return sendError(res, error.apiStatus, error.message);
  }

  return sendError(res, 500, "Something went wrong. Please try again.");
}

function apiError(status, message) {
  const error = new Error(message);
  error.apiStatus = status;
  return error;
}

// ------------------------------------------------------------
// Approve application — signed-in institution admin or teacher
// ------------------------------------------------------------
app.post(
  "/api/applications/approve",
  requireFirebaseUser,
  async (req, res) => {
    try {
      const input = req.body || {};
      const institutionId = validId(input.institutionId);
      const applicationId = validId(input.applicationId);
      const uid = req.firebaseUser.uid;

      if (!institutionId || !applicationId) {
        return sendError(res, 400, "Missing or invalid application.");
      }

      const reviewNote = typeof input.reviewNote === "string"
        ? input.reviewNote.trim().slice(0, 1000)
        : "";

      const callerSnap = await db.doc(`users/${uid}`).get();
      const caller = callerSnap.exists ? callerSnap.data() : null;

      if (
        !caller ||
        !["admin", "teacher"].includes(caller.role) ||
        caller.institutionId !== institutionId
      ) {
        return sendError(
          res,
          403,
          "You can't approve applications for this institution."
        );
      }

      const appRef = db.doc(
        `institutions/${institutionId}/applications/${applicationId}`
      );
      const appSnap = await appRef.get();

      if (!appSnap.exists) {
        return sendError(res, 404, "Application not found.");
      }

      const application = appSnap.data();
      const status = application.status || "submitted";

      if (status === "approved" && application.pendingStudentId) {
        return res.json({ ok: true, alreadyApproved: true });
      }

      if (status === "rejected") {
        return sendError(
          res,
          409,
          "Move a rejected application back to Under Review before approving it."
        );
      }

      if (!["submitted", "under_review", "approved"].includes(status)) {
        return sendError(res, 409, "This application can't be approved.");
      }

      let form = null;
      if (typeof application.formId === "string" && validId(application.formId)) {
        const formSnap = await db.doc(
          `institutions/${institutionId}/applicationForms/${application.formId}`
        ).get();
        form = formSnap.exists ? formSnap.data() : null;
      }

      const mapped = mapApplication(application, form);
      const missing = missingProfileValues(mapped);

      if (missing.length) {
        return sendError(
          res,
          409,
          "This application is missing " + missing.join(", ") + "."
        );
      }

      let existingUid = null;
      try {
        existingUid = (await auth.getUserByEmail(mapped.email)).uid;
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }

      if (existingUid) {
        const existingProfile = await db.doc(`users/${existingUid}`).get();
        if (existingProfile.exists) {
          const profile = existingProfile.data();
          if (
            profile.institutionId !== institutionId ||
            profile.role !== "student"
          ) {
            return sendError(
              res,
              409,
              "This email already belongs to another Academx account."
            );
          }
        }
      }

      const pointerRef = db.doc(
        `pendingStudentEmails/${emailHash(mapped.email)}`
      );
      const pendingRef = db.doc(
        `institutions/${institutionId}/pendingStudents/${applicationId}`
      );

      let alreadyApproved = false;

      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(appRef);
        const pointer = await tx.get(pointerRef);
        const pending = await tx.get(pendingRef);

        if (!fresh.exists) {
          throw apiError(404, "Application not found.");
        }

        const current = fresh.data();

        if (current.status === "approved" && current.pendingStudentId) {
          alreadyApproved = true;
          return;
        }

        if (pointer.exists) {
          const p = pointer.data();
          if (
            p.institutionId !== institutionId ||
            p.applicationId !== applicationId
          ) {
            throw apiError(409, "A student record already exists for this email.");
          }
        }

        if (!pending.exists) {
          const record = {
            email: mapped.email,
            name: mapped.name,
            role: "student",
            institutionId,
            class: mapped.class,
            section: mapped.section,
            applicationId,
            formId: application.formId || "",
            status: "pending",
            approvedBy: uid,
            createdAt: FieldValue.serverTimestamp(),
          };

          if (mapped.contactNumber) record.contactNumber = mapped.contactNumber;
          tx.set(pendingRef, record);
        }

        if (!pointer.exists) {
          tx.set(pointerRef, {
            institutionId,
            applicationId,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        const update = {
          status: "approved",
          pendingStudentId: applicationId,
          reviewedBy: uid,
          reviewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (reviewNote) update.reviewNote = reviewNote;
        if (pending.exists && pending.data().studentUid) {
          update.studentUid = pending.data().studentUid;
        }

        tx.update(appRef, update);
      });

      return res.json({ ok: true, alreadyApproved });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

// ------------------------------------------------------------
// Activate approved student — public, generic response
// ------------------------------------------------------------
app.post("/api/students/activate", async (req, res) => {
  try {
    const email = normalizeEmail(req.body && req.body.email);

    if (!email) {
      return sendError(res, 400, "Please enter a valid email address.");
    }

    const hash = emailHash(email);
    const throttleRef = db.doc(`activationThrottle/${hash}`);

    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(throttleRef);
      const now = Date.now();

      if (snap.exists && now - snap.data().lastAt < 60 * 1000) {
        return false;
      }

      tx.set(throttleRef, {
        lastAt: now,
        expireAt: admin.firestore.Timestamp.fromMillis(
          now + 24 * 60 * 60 * 1000
        ),
      });

      return true;
    });

    if (!allowed) {
      return res.json({ ok: true, proceed: false });
    }

    const pointerSnap = await db.doc(`pendingStudentEmails/${hash}`).get();

    if (!pointerSnap.exists) {
      return res.json({ ok: true, proceed: true });
    }

    const institutionId = validId(pointerSnap.data().institutionId);
    const applicationId = validId(pointerSnap.data().applicationId);

    if (!institutionId || !applicationId) {
      return res.json({ ok: true, proceed: true });
    }

    const pendingRef = db.doc(
      `institutions/${institutionId}/pendingStudents/${applicationId}`
    );
    const pendingSnap = await pendingRef.get();

    if (!pendingSnap.exists || pendingSnap.data().email !== email) {
      return res.json({ ok: true, proceed: true });
    }

    const pending = pendingSnap.data();
    let userRecord;
    let createdNow = false;

    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw error;
      }

      userRecord = await auth.createUser({
        email,
        displayName: pending.name,
        emailVerified: false,
      });

      createdNow = true;
    }

    const uid = userRecord.uid;
    const userRef = db.doc(`users/${uid}`);
    const instUserRef = db.doc(
      `institutions/${institutionId}/users/${uid}`
    );

    const userSnap = await userRef.get();
    const instUserSnap = await instUserRef.get();

    if (!createdNow) {
      if (!userSnap.exists) {
        return res.json({ ok: true, proceed: true });
      }

      const existing = userSnap.data();

      if (
        existing.institutionId !== institutionId ||
        existing.role !== "student" ||
        (existing.applicationId &&
          existing.applicationId !== applicationId)
      ) {
        return res.json({ ok: true, proceed: true });
      }

      if (instUserSnap.exists) {
        const institutionUser = instUserSnap.data();

        if (
          institutionUser.institutionId !== institutionId ||
          institutionUser.role !== "student" ||
          (institutionUser.applicationId &&
            institutionUser.applicationId !== applicationId)
        ) {
          return res.json({ ok: true, proceed: true });
        }
      }
    }

    const appRef = db.doc(
      `institutions/${institutionId}/applications/${applicationId}`
    );
    const appSnap = await appRef.get();

    const profile = {
      email,
      name: pending.name,
      role: "student",
      institutionId,
      class: pending.class || "",
      section: pending.section || "",
      applicationId,
    };

    if (pending.contactNumber) profile.contactNumber = pending.contactNumber;

    const batch = db.batch();

    if (!userSnap.exists) {
      batch.set(userRef, {
        ...profile,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (!instUserSnap.exists) {
      batch.set(instUserRef, {
        ...profile,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (pending.status !== "activated" || pending.studentUid !== uid) {
      batch.update(pendingRef, {
        status: "activated",
        studentUid: uid,
        activatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (appSnap.exists && appSnap.data().studentUid !== uid) {
      batch.update(appRef, {
        studentUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    return res.json({ ok: true, proceed: true });
  } catch (error) {
    console.error("Student activation failed:", error);
    return sendError(res, 500, "Something went wrong. Please try again.");
  }
});

// Don't expose internal error details to callers.
app.use((error, _req, res, _next) => {
  if (error.message === "Origin not allowed by CORS") {
    return sendError(res, 403, "Origin not allowed.");
  }
  console.error("Unhandled API error:", error);
  return sendError(res, 500, "Something went wrong. Please try again.");
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Academx API listening on port ${port}`);
});
