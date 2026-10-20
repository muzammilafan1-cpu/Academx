// ============================================================
// Academx SIS: Settings > Business rules
//
// Two rule categories, each with its own sub-list:
//   Grading rules    (grading.js: type, components, pass rule, divisions, rounding, marks entry)
//   Attendance rules (this file: mode and the admin switch)
//
// Reads:  gradingSettings/{inst}, attendanceSettings/{inst}
// Writes: POST /api/grading/save and POST /api/attendance-rules/save (Render)
//
// app.js creates this with initRules({ db, auth, apiBase, toast }).
// ============================================================

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { initGrading } from "./grading.js";


export function initRules(env) {

    const db = env.db;
    const auth = env.auth;
    const apiBase = env.apiBase;
    const toast = env.toast;

    const root = document.getElementById("rulesRoot");

    if (!root) return { setContext: function () {}, reset: function () {}, open: function () {} };

    root.innerHTML =
        "<div class=\"ax-head\"><div><h2 class=\"ax-title\">Business rules</h2>" +
        "<p class=\"ax-sub\">How this school runs grading and attendance. Each section is saved on its own and kept as a version.</p>" +
        "</div></div>" +
        "<div class=\"gd-layout\">" +
        "<nav class=\"gd-nav\" aria-label=\"Business rules\">" +
        "<button type=\"button\" class=\"gd-item\" data-rs=\"grading\">Grading rules</button>" +
        "<button type=\"button\" class=\"gd-item\" data-rs=\"attendance\">Attendance rules</button>" +
        "</nav>" +
        "<div class=\"gd-main\"><div id=\"rulesGradingHost\"></div><div id=\"rulesAttendanceHost\"></div></div>" +
        "</div>";

    const gradingHost = root.querySelector("#rulesGradingHost");
    const attHost = root.querySelector("#rulesAttendanceHost");
    attHost.classList.add("hidden");

    const grading = initGrading({ db: db, auth: auth, apiBase: apiBase, toast: toast, root: gradingHost });

    let S = fresh();

    function fresh() {
        return {
            inst: null,
            canManage: false,
            rule: "grading",          // grading | attendance
            att: {
                current: null,
                form: { mode: "daily", adminOverride: false },
                busy: false,
                error: ""
            }
        };
    }

    function esc(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
    }

    function fmtDate(ts) {
        return ts && ts.toDate
            ? ts.toDate().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
            : "—";
    }

    function setContext(institutionId, role) {
        if (S.inst !== institutionId) S = fresh();
        S.inst = institutionId;
        S.canManage = role === "admin";
        grading.setContext(institutionId, role);
    }

    function reset() {
        S = fresh();
        grading.reset();
        if (attHost) attHost.innerHTML = "";
    }

    function showRule(rule) {
        S.rule = rule;
        root.querySelectorAll("[data-rs]").forEach(function (b) {
            b.classList.toggle("on", b.dataset.rs === rule);
        });
        gradingHost.classList.toggle("hidden", rule !== "grading");
        attHost.classList.toggle("hidden", rule !== "attendance");
    }

    async function open(rule) {

        if (!S.inst) return;

        showRule(rule || S.rule || "grading");

        if (S.rule === "grading") {
            return grading.open();
        }

        await loadAttendance();
        renderAttendance();
    }


    // ---------- attendance rules ----------

    async function loadAttendance() {

        const snap = await getDoc(doc(db, "attendanceSettings/" + S.inst));

        S.att.current = snap.exists() ? snap.data() : null;

        S.att.form = S.att.current
            ? { mode: S.att.current.mode, adminOverride: !!S.att.current.adminOverride }
            : { mode: "daily", adminOverride: false };
    }

    function renderAttendance() {

        const a = S.att;

        const status = a.current
            ? "Version " + a.current.version + " · saved " + fmtDate(a.current.updatedAt)
            : "Not set up yet. Choose a mode and save to start.";

        const dis = S.canManage ? "" : " disabled";

        const modes = [
            ["daily", "Daily", "The class teacher marks the whole section once a day."],
            ["per_subject", "Per subject", "Each subject teacher marks attendance for their own period."]
        ].map(function (m) {
            return "<label class=\"ax-typecard\"><input type=\"radio\" name=\"arMode\" data-ar=\"mode\" value=\"" + m[0] + "\"" +
                (a.form.mode === m[0] ? " checked" : "") + dis + "><span><strong>" + esc(m[1]) + "</strong>" + esc(m[2]) + "</span></label>";
        }).join("");

        attHost.innerHTML =
            "<section class=\"ax-panel\"><h3 class=\"ax-panel-title\">Attendance rules</h3>" +
            "<p class=\"ax-sub\">" + esc(status) + "</p>" +
            (S.canManage ? "" : "<div class=\"ax-msg ax-error\" role=\"status\">Only administrators can change attendance rules.</div>") +
            (a.error ? "<div class=\"ax-msg ax-error\" role=\"alert\">" + esc(a.error) + "</div>" : "") +
            "<div class=\"ax-typecards\">" + modes + "</div>" +
            "<label class=\"ax-check\"><input type=\"checkbox\" data-ar=\"admin\"" + (a.form.adminOverride ? " checked" : "") + dis +
            "><span>Admin can also mark attendance for any class, section or student</span></label>" +
            "<p class=\"ax-muted\">Off by default.</p>" +
            (S.canManage
                ? "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn ax-primary\" data-ar=\"save\"" + (a.busy ? " disabled" : "") + ">" +
                  (a.busy ? "Saving…" : "Save attendance rules") + "</button></div>"
                : "") +
            "</section>";
    }

    async function saveAttendance() {

        const a = S.att;

        a.busy = true;
        a.error = "";
        renderAttendance();

        try {

            const response = await fetch(apiBase + "/api/attendance-rules/save", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + (await auth.currentUser.getIdToken())
                },
                body: JSON.stringify({
                    institutionId: S.inst,
                    mode: a.form.mode,
                    adminOverride: !!a.form.adminOverride
                })
            });

            let data = null;

            try { data = await response.json(); } catch (e) { data = null; }

            if (!response.ok || !data || data.ok !== true) {
                throw new Error((data && data.message) || "The Academx service had a problem. Please try again.");
            }

            a.busy = false;

            await loadAttendance();

            toast("Attendance rules saved as version " + data.version + ".", "ok");

            renderAttendance();

        } catch (error) {

            a.busy = false;
            a.error = error.message || "Couldn't save. Please try again.";

            renderAttendance();
        }
    }


    // ---------- events ----------

    root.addEventListener("click", function (event) {

        const nav = event.target.closest("[data-rs]");

        if (nav) return open(nav.dataset.rs);

        const t = event.target.closest("[data-ar]");

        if (t && t.dataset.ar === "save" && S.canManage && !S.att.busy) saveAttendance();
    });

    root.addEventListener("change", function (event) {

        const el = event.target;

        if (!S.canManage) return;

        if (el.dataset.ar === "mode") { S.att.form.mode = el.value; return renderAttendance(); }
        if (el.dataset.ar === "admin") { S.att.form.adminOverride = el.checked; return; }
    });

    return {
        setContext: setContext,
        reset: reset,
        open: function () { return open(S.rule); }
    };
}