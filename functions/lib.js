"use strict";

// Pure helpers (no Firebase), kept separate so they are easy to test.

const crypto = require("crypto");

const ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Lower-cased, trimmed email, or null when it isn't a plausible address.
function normalizeEmail(raw) {
    if (typeof raw !== "string") return null;

    const email = raw.trim().toLowerCase();

    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null;

    return email;
}

// Document id used for the email lookup. The raw email is never used as an id.
function emailHash(email) {
    return crypto.createHash("sha256").update(email).digest("hex");
}

function validId(value) {
    return typeof value === "string" && ID_PATTERN.test(value) ? value : null;
}

function text(value) {
    return typeof value === "string" ? value.trim() : "";
}

// Picks the permanent-profile values out of an application, using the form
// definition when it exists. Applications don't all have the same fields.
function mapApplication(application, form) {
    const fields = form && Array.isArray(form.fields) ? form.fields : [];
    const data = (application && application.data) || {};

    const byId = function (id) {
        return text(data[id]);
    };

    const byType = function (type) {
        for (const f of fields) {
            if (f.type === type && text(data[f.id])) return text(data[f.id]);
        }
        return "";
    };

    const byLabel = function (pattern) {
        for (const f of fields) {
            if (pattern.test(String(f.label || "")) && text(data[f.id])) return text(data[f.id]);
        }
        return "";
    };

    return {
        email: normalizeEmail(byType("email") || byId("email")),
        name: byId("student_name") || byLabel(/name/i),
        class: byId("class") || byLabel(/^class\b/i),
        section: byId("section") || byLabel(/^section\b/i),
        contactNumber: byType("phone") || byId("contact_number")
    };
}

// Names of required profile values that are missing.
function missingProfileValues(mapped) {
    const missing = [];

    if (!mapped.email) missing.push("a valid email");
    if (!mapped.name) missing.push("the student's name");
    if (!mapped.class) missing.push("the class");

    return missing;
}

module.exports = { normalizeEmail, emailHash, validId, mapApplication, missingProfileValues };
