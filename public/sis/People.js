// ============================================================
// Academx SIS: Home dashboard, Students and Classes
//
// Reads (Firestore, from the browser):
//   classes                                  (top level, filtered by institutionId)
//   institutions/{inst}/users                (students; falls back to top-level users)
//   institutions/{inst}/pendingStudents      (approved, waiting to activate)
//   institutions/{inst}/applications, applicationForms, attendance_v2
//
// Writes (only through the Academx API on Render, never from the browser):
//   POST /api/students/update   POST /api/classes/save   POST /api/classes/delete
//
// app.js creates this module with initPeople({ db, auth, apiBase, toast }).
// ============================================================

import {
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


export function initPeople(env) {

    const db = env.db;
    const auth = env.auth;
    const apiBase = env.apiBase;
    const toast = env.toast;

    const roots = {
        home: document.getElementById("homeRoot"),
        students: document.getElementById("studentsRoot"),
        classes: document.getElementById("classesRoot")
    };

    const modalHost = document.createElement("div");

    modalHost.id = "pxModalHost";

    document.body.appendChild(modalHost);

    const PAGE_SIZE = 50;

    function fresh() {
        return {
            uid: null,
            role: null,
            institutionId: null,
            canManage: false,

            classes: null,          // [{ id, class, sections[] }]
            students: null,         // enrolled students
            pending: null,          // approved, not yet activated

            page: "home",
            tab: "enrolled",        // enrolled | pending
            q: "",
            cls: "all",
            sec: "all",
            limit: PAGE_SIZE,

            modal: null,            // { type: "student" | "pending" | "class", ... }
            busy: false,
            homeLoading: false
        };
    }

    let S = fresh();


    // ---------- helpers ----------

    function esc(value) {

        return String(value === undefined || value === null ? "" : value)
            .replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
    }

    function byNumber(a, b) {
        return String(a).localeCompare(String(b), undefined, { numeric: true });
    }

    function today() {

        const d = new Date();

        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
    }

    function fmtDate(ts) {

        return ts && ts.toDate
            ? ts.toDate().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
            : "—";
    }

    // "10" shows as "Class 10"; a class already named "Class 1" is left alone
    function classLabel(c) {
        return /^class\b/i.test(String(c)) ? String(c) : "Class " + c;
    }

    function studentName(s) {
        return s.name || s.displayName || "Unnamed student";
    }

    function studentContact(s) {
        return s.contactNumber || s.phone || "";
    }

    function inst() {
        return S.institutionId;
    }

    // Shows a Firestore read problem in plain words
    function readError(error) {

        if (error && error.code === "permission-denied") {
            return "Firestore rules don't allow this account to read this data yet.";
        }

        return "Couldn't load this data. " + (error && error.message ? error.message : "");
    }


    // ---------- Academx API (writes) ----------

    async function api(path, body) {

        const user = auth.currentUser;

        if (!user) {
            const err = new Error("Please sign in again.");
            err.code = "api/unauthenticated";
            throw err;
        }

        const token = await user.getIdToken();

        const controller = new AbortController();

        const timer = setTimeout(function () { controller.abort(); }, 90000);

        let response;

        try {

            response = await fetch(apiBase + path, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });

        } catch (error) {

            console.error("Academx API request failed:", error);

            const err = new Error("unreachable");
            err.code = "api/unreachable";
            throw err;

        } finally {

            clearTimeout(timer);
        }

        let data = null;

        try {
            data = await response.json();
        } catch (error) {
            data = null;
        }

        if (!response.ok || !data || data.ok !== true) {

            console.error("Academx API error:", path, response.status, data);

            const err = new Error((data && data.message) || "Request failed");
            err.code = "api/" + ((data && data.code) || ("http-" + response.status));
            throw err;
        }

        return data;
    }

    function apiErrorText(error) {

        const code = error.code || "";

        if (code === "api/unreachable") {
            return "The Academx service did not respond, so nothing was saved. " +
                "Try again in a minute (it can take a while to wake up).";
        }

        if (["api/failed-precondition", "api/invalid-argument", "api/permission-denied",
             "api/not-found", "api/unauthenticated"].includes(code)) {
            return error.message;
        }

        return "The Academx service had a problem. Please try again.";
    }


    // ---------- data ----------

    async function loadClasses(force) {

        if (S.classes && !force) return S.classes;

        const snap = await getDocs(
            query(collection(db, "classes"), where("institutionId", "==", inst()))
        );

        S.classes = snap.docs.map(function (d) {

            const data = d.data();

            return {
                id: d.id,
                class: String(data.class === undefined ? "" : data.class),
                sections: Array.isArray(data.sections) ? data.sections.map(String) : []
            };

        }).sort(function (a, b) { return byNumber(a.class, b.class); });

        return S.classes;
    }

    async function loadStudents(force) {

        if (S.students && !force) return S.students;

        let docs;

        try {

            docs = (await getDocs(collection(db, "institutions/" + inst() + "/users"))).docs;

        } catch (error) {

            if (error.code !== "permission-denied") throw error;

            // Same records also live in the top-level users collection
            docs = (await getDocs(
                query(collection(db, "users"), where("institutionId", "==", inst()))
            )).docs;
        }

        S.students = docs
            .map(function (d) { return { id: d.id, ...d.data() }; })
            .filter(function (u) { return u.role === "student"; })
            .sort(function (a, b) { return byNumber(studentName(a).toLowerCase(), studentName(b).toLowerCase()); });

        try {

            const pendingSnap = await getDocs(collection(db, "institutions/" + inst() + "/pendingStudents"));

            S.pending = pendingSnap.docs
                .map(function (d) { return { id: d.id, ...d.data() }; })
                .filter(function (p) { return p.status === "pending"; })
                .sort(function (a, b) {
                    return ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0);
                });

        } catch (error) {

            console.warn("Couldn't read pending students:", error);

            S.pending = [];
        }

        return S.students;
    }


    // ---------- context from app.js ----------

    function setContext(uid, userData) {

        if (S.uid !== uid) S = fresh();

        S.uid = uid;
        S.role = userData.role;
        S.institutionId = userData.institutionId;
        S.canManage = userData.role === "admin";
    }

    function reset() {

        S = fresh();

        Object.keys(roots).forEach(function (key) {
            if (roots[key]) roots[key].innerHTML = "";
        });

        closeModal();
    }


    // ---------- page headers ----------

    function head(title, subtitle, actionsHtml) {

        return "<div class=\"ax-head\"><div><h2 class=\"ax-title\">" + esc(title) +
            "</h2><p class=\"ax-sub\">" + esc(subtitle) + "</p></div>" +
            (actionsHtml ? "<div class=\"ax-head-actions\">" + actionsHtml + "</div>" : "") + "</div>";
    }

    function loading(page) {

        if (roots[page]) roots[page].innerHTML = "<p class=\"ax-muted\">Loading…</p>";
    }

    function failed(page, error) {

        console.error("Load " + page + " error:", error);

        if (roots[page]) {
            roots[page].innerHTML = "<p class=\"ax-error-text\">" + esc(readError(error)) + "</p>";
        }
    }


    // ============================================================
    // HOME
    // ============================================================

    async function openHome() {

        if (!roots.home || !inst()) return;

        S.page = "home";

        if (S.homeLoading) return;

        S.homeLoading = true;

        try {

            await renderHome();

        } finally {

            S.homeLoading = false;
        }
    }

    async function renderHome() {

        loading("home");

        const attempt = async function (fn) {

            try {
                return { ok: true, value: await fn() };
            } catch (error) {
                console.warn("Home card failed:", error);
                return { ok: false, value: null };
            }
        };

        const results = await Promise.all([
            attempt(function () { return loadClasses(true); }),
            attempt(function () { return loadStudents(true); }),
            attempt(async function () {
                return (await getDocs(collection(db, "institutions/" + inst() + "/applications"))).docs
                    .map(function (d) { return d.data(); });
            }),
            attempt(async function () {
                return (await getDocs(collection(db, "institutions/" + inst() + "/applicationForms"))).docs
                    .map(function (d) { return d.data(); });
            }),
            attempt(async function () {
                return (await getDocs(query(
                    collection(db, "attendance_v2"),
                    where("institutionId", "==", inst()),
                    where("date", "==", today())
                ))).size;
            })
        ]);

        const classes = results[0], students = results[1], apps = results[2], forms = results[3], attendance = results[4];

        const cards = [];

        cards.push({
            label: "Students enrolled",
            value: students.ok ? S.students.length : "—",
            hint: students.ok && S.pending.length
                ? S.pending.length + " approved, waiting to activate"
                : "With an Academx account",
            go: "students"
        });

        const sectionCount = classes.ok
            ? S.classes.reduce(function (n, c) { return n + c.sections.length; }, 0)
            : 0;

        cards.push({
            label: "Classes",
            value: classes.ok ? S.classes.length : "—",
            hint: classes.ok ? sectionCount + " sections in total" : "",
            go: "classes"
        });

        const waiting = apps.ok
            ? apps.value.filter(function (a) { return !a.status || a.status === "submitted"; }).length
            : null;

        const reviewing = apps.ok
            ? apps.value.filter(function (a) { return a.status === "under_review"; }).length
            : null;

        cards.push({
            label: "Applications to review",
            value: apps.ok ? waiting : "—",
            hint: apps.ok ? reviewing + " under review" : "",
            go: "applications"
        });

        cards.push({
            label: "Open forms",
            value: forms.ok ? forms.value.filter(function (f) { return f.status === "active"; }).length : "—",
            hint: "Accepting applications",
            go: "applications"
        });

        const totalSections = sectionCount;

        cards.push({
            label: "Attendance today",
            value: attendance.ok ? attendance.value : "—",
            hint: attendance.ok && classes.ok
                ? "of " + totalSections + " class sections marked"
                : "",
            go: ""
        });

        const attention = [];

        if (waiting) attention.push(waiting + " application" + (waiting === 1 ? "" : "s") + " waiting for review");

        if (students.ok && S.pending.length) {
            attention.push(S.pending.length + " approved student" + (S.pending.length === 1 ? "" : "s") + " haven't activated their account yet");
        }

        if (students.ok && classes.ok) {

            const known = new Set(S.classes.map(function (c) { return c.class; }));

            const unknown = S.students.filter(function (s) { return s.class && !known.has(String(s.class)); }).length;

            if (unknown) attention.push(unknown + " student" + (unknown === 1 ? "" : "s") + " in a class that isn't set up under Classes");
        }

        if (attendance.ok && classes.ok && totalSections > 0 && attendance.value === 0) {
            attention.push("No attendance has been marked today");
        }

        roots.home.innerHTML =
            "<div class=\"ax-stats\">" + cards.map(function (c) {

                const tag = c.go ? "button" : "div";

                return "<" + tag + (c.go ? " type=\"button\" data-p=\"go\" data-go=\"" + c.go + "\"" : "") + " class=\"ax-stat\">" +
                    "<span class=\"ax-stat-value\">" + esc(c.value) + "</span>" +
                    "<span class=\"ax-stat-label\">" + esc(c.label) + "</span>" +
                    "<span class=\"ax-stat-hint\">" + esc(c.hint) + "</span></" + tag + ">";

            }).join("") + "</div>" +
            "<section class=\"ax-panel\"><h3 class=\"ax-panel-title\">Needs attention</h3>" +
            (attention.length
                ? "<ul class=\"ax-attention\">" + attention.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"
                : "<p class=\"ax-muted\">Nothing needs attention right now.</p>") +
            "</section>";
    }


    // ============================================================
    // STUDENTS
    // ============================================================

    async function openStudents() {

        if (!roots.students || !inst()) return;

        S.page = "students";

        loading("students");

        try {

            await Promise.all([loadStudents(true), loadClasses(true).catch(function () { return []; })]);

        } catch (error) {

            return failed("students", error);
        }

        renderStudents();
    }

    function classNames() {

        const names = new Set((S.classes || []).map(function (c) { return c.class; }));

        (S.students || []).forEach(function (s) { if (s.class) names.add(String(s.class)); });

        return Array.from(names).sort(byNumber);
    }

    function sectionNames(forClass) {

        const names = new Set();

        (S.classes || []).forEach(function (c) {
            if (forClass === "all" || c.class === forClass) c.sections.forEach(function (x) { names.add(x); });
        });

        (S.students || []).forEach(function (s) {
            if (s.section && (forClass === "all" || String(s.class) === forClass)) names.add(String(s.section));
        });

        return Array.from(names).sort(byNumber);
    }

    function filteredStudents() {

        const q = S.q.trim().toLowerCase();

        return S.students.filter(function (s) {

            if (S.cls !== "all" && String(s.class) !== S.cls) return false;

            if (S.sec !== "all" && String(s.section) !== S.sec) return false;

            if (!q) return true;

            return [studentName(s), s.email, studentContact(s), s.id].join(" ").toLowerCase().indexOf(q) !== -1;
        });
    }

    function filteredPending() {

        const q = S.q.trim().toLowerCase();

        return S.pending.filter(function (p) {

            if (S.cls !== "all" && String(p.class) !== S.cls) return false;

            if (S.sec !== "all" && String(p.section) !== S.sec) return false;

            if (!q) return true;

            return [p.name, p.email, p.contactNumber].join(" ").toLowerCase().indexOf(q) !== -1;
        });
    }

    function classCell(value) {

        const v = value === undefined || value === null ? "" : String(value);

        if (!v) return "—";

        const known = (S.classes || []).some(function (c) { return c.class === v; });

        return esc(v) + (S.classes && !known
            ? " <span class=\"ax-pill ax-closed\" title=\"This class isn't set up under Classes\">not set up</span>"
            : "");
    }

    function renderStudents() {

        if (!roots.students) return;

        const classOptions = "<option value=\"all\">All classes</option>" + classNames().map(function (c) {
            return "<option value=\"" + esc(c) + "\"" + (S.cls === c ? " selected" : "") + ">" + esc(classLabel(c)) + "</option>";
        }).join("");

        const sectionOptions = "<option value=\"all\">All sections</option>" + sectionNames(S.cls).map(function (x) {
            return "<option value=\"" + esc(x) + "\"" + (S.sec === x ? " selected" : "") + ">Section " + esc(x) + "</option>";
        }).join("");

        const chips = [["enrolled", "Enrolled", S.students.length], ["pending", "Waiting to activate", S.pending.length]]
            .map(function (c) {
                return "<button type=\"button\" class=\"ax-chip" + (S.tab === c[0] ? " is-on" : "") +
                    "\" data-p=\"tab\" data-tab=\"" + c[0] + "\">" + c[1] +
                    " <span class=\"ax-chip-count\">" + c[2] + "</span></button>";
            }).join("");

        roots.students.innerHTML =
            head("Students", "Everyone enrolled in your institution, and approved students who haven't activated yet.") +
            "<section class=\"ax-panel\"><div class=\"ax-toolbar\">" +
            "<input type=\"search\" id=\"pxSearch\" class=\"ax-search\" placeholder=\"Search name, email or phone\" " +
            "aria-label=\"Search students\" value=\"" + esc(S.q) + "\">" +
            "<select id=\"pxClassFilter\" class=\"ax-formfilter\" aria-label=\"Filter by class\">" + classOptions + "</select>" +
            "<select id=\"pxSectionFilter\" class=\"ax-formfilter\" aria-label=\"Filter by section\">" + sectionOptions + "</select>" +
            "</div><div class=\"ax-chips\">" + chips + "</div>" +
            "<div id=\"pxStudentResults\">" + studentResultsHtml() + "</div></section>";
    }

    function studentResultsHtml() {

        const pending = S.tab === "pending";

        const all = pending ? filteredPending() : filteredStudents();

        const shown = all.slice(0, S.limit);

        if (!(pending ? S.pending : S.students).length) {

            return "<div class=\"ax-empty\"><strong>" +
                (pending ? "No students are waiting to activate" : "No students yet") + "</strong>" +
                "<p class=\"ax-muted\">" +
                (pending
                    ? "Students you approve appear here until they activate their account in the Academx app."
                    : "Students appear here after they activate their account.") + "</p></div>";
        }

        if (!all.length) {
            return "<div class=\"ax-empty\"><p class=\"ax-muted\">No students match your filters.</p></div>";
        }

        const rows = shown.map(function (s) {

            if (pending) {

                return "<tr><td><strong>" + esc(s.name || "Unnamed") + "</strong></td>" +
                    "<td>" + esc(s.email || "—") + "</td>" +
                    "<td>" + classCell(s.class) + "</td>" +
                    "<td>" + esc(s.section || "—") + "</td>" +
                    "<td>" + esc(s.contactNumber || "—") + "</td>" +
                    "<td>" + fmtDate(s.createdAt) + "</td>" +
                    "<td><button type=\"button\" class=\"ax-btn ax-sm\" data-p=\"view-pending\" data-id=\"" + esc(s.id) + "\">View</button></td></tr>";
            }

            return "<tr><td><strong>" + esc(studentName(s)) + "</strong></td>" +
                "<td>" + esc(s.email || "—") + "</td>" +
                "<td>" + classCell(s.class) + "</td>" +
                "<td>" + esc(s.section || "—") + "</td>" +
                "<td>" + esc(studentContact(s) || "—") + "</td>" +
                "<td><button type=\"button\" class=\"ax-btn ax-sm\" data-p=\"view-student\" data-id=\"" + esc(s.id) + "\">View</button></td></tr>";

        }).join("");

        return "<p class=\"ax-muted ax-resultcount\">Showing " + shown.length + " of " + all.length +
            " student" + (all.length === 1 ? "" : "s") + "</p>" +
            "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Name</th><th>Email</th><th>Class</th>" +
            "<th>Section</th><th>Contact</th>" + (pending ? "<th>Approved</th>" : "") + "<th></th></tr></thead><tbody>" +
            rows + "</tbody></table></div>" +
            (all.length > shown.length
                ? "<div class=\"ax-more\"><button type=\"button\" class=\"ax-btn\" data-p=\"more\">Show more</button></div>"
                : "");
    }


    // ----- student profile modal -----

    function dl(label, valueHtml) {

        return "<div class=\"ax-dl-row\"><dt>" + esc(label) + "</dt><dd>" + valueHtml + "</dd></div>";
    }

    function modalShell(title, subtitle, bodyHtml) {

        return "<div class=\"ax-backdrop\" data-p=\"backdrop\"><div class=\"ax-modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"pxModalTitle\">" +
            "<div class=\"ax-modal-head\"><div><h3 id=\"pxModalTitle\">" + esc(title) + "</h3>" +
            (subtitle ? "<div class=\"ax-muted\">" + esc(subtitle) + "</div>" : "") + "</div>" +
            "<button type=\"button\" class=\"ax-icon\" data-p=\"close\" aria-label=\"Close\">✕</button></div>" +
            "<div class=\"ax-modal-body\">" + bodyHtml + "</div></div></div>";
    }

    function classSelectOptions(selected) {

        const names = (S.classes || []).map(function (c) { return c.class; });

        const list = names.slice();

        if (selected && !list.includes(selected)) list.push(selected);

        return "<option value=\"\">Select class</option>" + list.sort(byNumber).map(function (c) {
            return "<option value=\"" + esc(c) + "\"" + (c === selected ? " selected" : "") + ">" + esc(classLabel(c)) + "</option>";
        }).join("");
    }

    function sectionSelectOptions(forClass, selected) {

        const found = (S.classes || []).find(function (c) { return c.class === forClass; });

        const list = found ? found.sections.slice() : [];

        if (selected && !list.includes(selected)) list.push(selected);

        return "<option value=\"\">" + (forClass ? "Select section" : "Choose a class first") + "</option>" +
            list.sort(byNumber).map(function (x) {
                return "<option value=\"" + esc(x) + "\"" + (x === selected ? " selected" : "") + ">Section " + esc(x) + "</option>";
            }).join("");
    }

    function studentModalHtml() {

        const m = S.modal;

        const s = S.students.find(function (x) { return x.id === m.id; });

        if (!s) return "";

        if (m.editing) {

            const d = m.draft;

            return modalShell("Edit " + studentName(s), s.email || "",
                "<label><span>Name</span><input type=\"text\" id=\"pxName\" maxlength=\"100\" value=\"" + esc(d.name) + "\"></label>" +
                "<div class=\"ax-grid\"><label class=\"ax-grow\"><span>Class</span><select id=\"pxClass\">" + classSelectOptions(d.class) + "</select></label>" +
                "<label class=\"ax-grow\"><span>Section</span><select id=\"pxSection\">" + sectionSelectOptions(d.class, d.section) + "</select></label></div>" +
                "<label><span>Contact number</span><input type=\"text\" id=\"pxContact\" maxlength=\"20\" value=\"" + esc(d.contactNumber) + "\"></label>" +
                "<p class=\"ax-muted\">The email address can't be changed here because it is the student's sign-in.</p>" +
                (m.error ? "<div class=\"ax-msg ax-error\" role=\"alert\">" + esc(m.error) + "</div>" : "") +
                "<div class=\"ax-bar ax-bar-modal\"><button type=\"button\" class=\"ax-btn ax-primary\" data-p=\"save-student\"" + (S.busy ? " disabled" : "") + ">" +
                (S.busy ? "Saving…" : "Save changes") + "</button>" +
                "<button type=\"button\" class=\"ax-btn\" data-p=\"cancel-edit\">Cancel</button></div>");
        }

        return modalShell(studentName(s), s.email || "",
            "<dl class=\"ax-dl\">" +
            dl("Name", esc(studentName(s))) +
            dl("Email", esc(s.email || "—")) +
            dl("Class", classCell(s.class)) +
            dl("Section", esc(s.section || "—")) +
            dl("Contact number", esc(studentContact(s) || "—")) +
            dl("Role", "Student") +
            dl("Student ID", "<span class=\"ax-mono\">" + esc(s.id) + "</span>") +
            (s.applicationId ? dl("Application ID", "<span class=\"ax-mono\">" + esc(s.applicationId) + "</span>") : "") +
            (s.createdAt ? dl("Created", esc(fmtDate(s.createdAt))) : "") +
            "</dl>" +
            (S.canManage
                ? "<div class=\"ax-bar ax-bar-modal\"><button type=\"button\" class=\"ax-btn ax-primary\" data-p=\"edit-student\">Edit student</button></div>"
                : ""));
    }

    function pendingModalHtml() {

        const p = S.pending.find(function (x) { return x.id === S.modal.id; });

        if (!p) return "";

        return modalShell(p.name || "Unnamed", p.email || "",
            "<dl class=\"ax-dl\">" +
            dl("Name", esc(p.name || "—")) +
            dl("Email", esc(p.email || "—")) +
            dl("Class", classCell(p.class)) +
            dl("Section", esc(p.section || "—")) +
            dl("Contact number", esc(p.contactNumber || "—")) +
            dl("Application ID", "<span class=\"ax-mono\">" + esc(p.applicationId || p.id) + "</span>") +
            dl("Approved", esc(fmtDate(p.createdAt))) +
            dl("Account", "Waiting for the student to activate") + "</dl>" +
            "<p class=\"ax-info\">The student can open Academx, choose <strong>Activate your account</strong>, " +
            "enter this email and set their own password.</p>");
    }


    // ============================================================
    // CLASSES
    // ============================================================

    async function openClasses() {

        if (!roots.classes || !inst()) return;

        S.page = "classes";

        loading("classes");

        try {

            await loadClasses(true);

            // Student counts are optional; the page still works without them
            await loadStudents(false).catch(function (error) { console.warn(error); });

        } catch (error) {

            return failed("classes", error);
        }

        renderClasses();
    }

    function renderClasses() {

        if (!roots.classes) return;

        const counts = {};

        (S.students || []).forEach(function (s) {

            const key = String(s.class);

            counts[key] = (counts[key] || 0) + 1;
        });

        const rows = S.classes.map(function (c) {

            return "<tr><td><strong>" + esc(classLabel(c.class)) + "</strong></td><td>" +
                (c.sections.length
                    ? c.sections.slice().sort(byNumber).map(function (x) { return "<span class=\"ax-pill\">" + esc(x) + "</span> "; }).join("")
                    : "<span class=\"ax-muted\">No sections</span>") + "</td>" +
                "<td class=\"ax-num\">" + (S.students ? (counts[c.class] || 0) : "—") + "</td><td>" +
                (S.canManage
                    ? "<div class=\"ax-row-actions\"><button type=\"button\" class=\"ax-btn ax-sm\" data-p=\"edit-class\" data-id=\"" + esc(c.id) + "\">Edit sections</button>" +
                      "<button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-p=\"delete-class\" data-id=\"" + esc(c.id) + "\">Delete</button></div>"
                    : "") + "</td></tr>";

        }).join("");

        roots.classes.innerHTML =
            head("Classes", "The classes and sections of your institution. Application forms, students, attendance and timetables all use these.",
                S.canManage ? "<button type=\"button\" class=\"ax-btn ax-primary\" data-p=\"add-class\">+ Add class</button>" : "") +
            "<section class=\"ax-panel\">" +
            (S.classes.length
                ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Class</th><th>Sections</th><th class=\"ax-num\">Students</th><th></th></tr></thead><tbody>" +
                  rows + "</tbody></table></div>"
                : "<div class=\"ax-empty\"><strong>No classes yet</strong><p class=\"ax-muted\">Add your first class to get started.</p></div>") +
            "</section>";
    }

    function classModalHtml() {

        const m = S.modal;

        return modalShell(m.isNew ? "Add class" : "Edit sections for " + classLabel(m.draft.name), "",
            "<label><span>Class</span><input type=\"text\" id=\"pxClassName\" maxlength=\"20\" value=\"" + esc(m.draft.name) + "\"" +
            (m.isNew ? " placeholder=\"e.g. 10\"" : " disabled") + "></label>" +
            (m.isNew ? "" : "<p class=\"ax-muted\">A class can't be renamed because attendance and timetable records use its name.</p>") +
            "<label><span>Sections (one per line, or separated by commas)</span>" +
            "<textarea id=\"pxSections\" rows=\"3\" placeholder=\"A&#10;B&#10;C\">" + esc(m.draft.sectionsText) + "</textarea></label>" +
            (m.error ? "<div class=\"ax-msg ax-error\" role=\"alert\">" + esc(m.error) + "</div>" : "") +
            "<div class=\"ax-bar ax-bar-modal\"><button type=\"button\" class=\"ax-btn ax-primary\" data-p=\"save-class\"" + (S.busy ? " disabled" : "") + ">" +
            (S.busy ? "Saving…" : "Save") + "</button><button type=\"button\" class=\"ax-btn\" data-p=\"close\">Cancel</button></div>");
    }

    function parseSections(text) {

        const seen = new Set();

        return String(text || "").split(/[\n,]/).map(function (x) { return x.trim(); }).filter(function (x) {

            if (!x || seen.has(x.toLowerCase())) return false;

            seen.add(x.toLowerCase());

            return true;
        });
    }


    // ---------- modal host ----------

    function renderModal() {

        let html = "";

        if (S.modal) {

            if (S.modal.type === "student") html = studentModalHtml();
            else if (S.modal.type === "pending") html = pendingModalHtml();
            else if (S.modal.type === "class") html = classModalHtml();
        }

        modalHost.innerHTML = html ? "<div class=\"ax-root ax-root-top\">" + html + "</div>" : "";

        document.body.classList.toggle("ax-noscroll", !!html);
    }

    function closeModal() {

        S.modal = null;
        S.busy = false;

        modalHost.innerHTML = "";

        document.body.classList.remove("ax-noscroll");
    }

    function rerenderPage() {

        if (S.page === "students") renderStudents();
        else if (S.page === "classes") renderClasses();
    }


    // ---------- saving ----------

    async function saveStudent() {

        const m = S.modal;

        const d = m.draft;

        if (!d.name.trim()) {
            m.error = "Enter the student's name.";
            return renderModal();
        }

        if (d.section && !d.class) {
            m.error = "Choose a class before choosing a section.";
            return renderModal();
        }

        m.error = "";
        S.busy = true;
        renderModal();

        try {

            await api("/api/students/update", {
                institutionId: inst(),
                uid: m.id,
                name: d.name.trim(),
                class: d.class,
                section: d.section,
                contactNumber: d.contactNumber.trim()
            });

            const s = S.students.find(function (x) { return x.id === m.id; });

            if (s) {
                s.name = d.name.trim();
                s.class = d.class;
                s.section = d.section;
                s.contactNumber = d.contactNumber.trim();
            }

            S.busy = false;
            m.editing = false;

            toast("Student updated.", "ok");

            renderModal();
            rerenderPage();

        } catch (error) {

            S.busy = false;
            m.error = apiErrorText(error);

            renderModal();
        }
    }

    async function saveClass() {

        const m = S.modal;

        const name = m.draft.name.trim();

        const sections = parseSections(m.draft.sectionsText);

        if (m.isNew && !name) {
            m.error = "Enter the class name.";
            return renderModal();
        }

        m.error = "";
        S.busy = true;
        renderModal();

        try {

            await api("/api/classes/save", {
                institutionId: inst(),
                classId: m.isNew ? "" : m.id,
                class: name,
                sections: sections
            });

            await loadClasses(true);

            S.busy = false;

            closeModal();

            toast("Class saved.", "ok");

            rerenderPage();

        } catch (error) {

            S.busy = false;
            m.error = apiErrorText(error);

            renderModal();
        }
    }

    async function deleteClass(classId) {

        const c = S.classes.find(function (x) { return x.id === classId; });

        if (!c) return;

        if (!confirm("Delete " + classLabel(c.class) + "?\n\nThis only works if no students, attendance or timetable records use it.")) return;

        try {

            await api("/api/classes/delete", { institutionId: inst(), classId: classId });

            await loadClasses(true);

            toast("Class deleted.", "ok");

            rerenderPage();

        } catch (error) {

            toast(apiErrorText(error), "error");
        }
    }


    // ---------- events (one set of listeners for all three pages) ----------

    document.addEventListener("click", function (event) {

        const target = event.target.closest("[data-p]");

        if (!target || !S.institutionId) return;

        const act = target.dataset.p;

        const id = target.dataset.id;

        if (act === "backdrop") {

            if (event.target === target && S.modal && !S.busy) closeModal();

            return;
        }

        if (act === "go") {

            const go = target.dataset.go;

            const nav = document.getElementById(go + "Nav");

            if (window.showPage && nav) window.showPage(go, nav);

            return;
        }

        if (act === "tab") {
            S.tab = target.dataset.tab;
            S.limit = PAGE_SIZE;
            return renderStudents();
        }

        if (act === "more") {
            S.limit += PAGE_SIZE;
            return renderStudents();
        }

        if (act === "view-student") {
            S.modal = { type: "student", id: id, editing: false, draft: null, error: "" };
            return renderModal();
        }

        if (act === "view-pending") {
            S.modal = { type: "pending", id: id };
            return renderModal();
        }

        if (act === "edit-student" && S.canManage && S.modal) {

            const s = S.students.find(function (x) { return x.id === S.modal.id; });

            S.modal.editing = true;
            S.modal.error = "";
            S.modal.draft = {
                name: s.name || s.displayName || "",
                class: s.class === undefined || s.class === null ? "" : String(s.class),
                section: s.section === undefined || s.section === null ? "" : String(s.section),
                contactNumber: studentContact(s)
            };

            return renderModal();
        }

        if (act === "cancel-edit" && S.modal) {
            S.modal.editing = false;
            S.modal.error = "";
            return renderModal();
        }

        if (act === "save-student" && S.canManage && S.modal && !S.busy) return saveStudent();

        if (act === "add-class" && S.canManage) {
            S.modal = { type: "class", isNew: true, id: "", error: "", draft: { name: "", sectionsText: "A\nB\nC" } };
            return renderModal();
        }

        if (act === "edit-class" && S.canManage) {

            const c = S.classes.find(function (x) { return x.id === id; });

            if (!c) return;

            S.modal = {
                type: "class", isNew: false, id: id, error: "",
                draft: { name: c.class, sectionsText: c.sections.join("\n") }
            };

            return renderModal();
        }

        if (act === "save-class" && S.canManage && S.modal && !S.busy) return saveClass();

        if (act === "delete-class" && S.canManage) return deleteClass(id);

        if (act === "close" && !S.busy) return closeModal();
    });

    document.addEventListener("input", function (event) {

        const el = event.target;

        if (!S.institutionId) return;

        if (el.id === "pxSearch") {

            S.q = el.value;
            S.limit = PAGE_SIZE;

            // Only the results are redrawn so the search box keeps focus
            const results = document.getElementById("pxStudentResults");

            if (results) results.innerHTML = studentResultsHtml();

            return;
        }

        if (!S.modal) return;

        const d = S.modal.draft;

        if (!d) return;

        if (el.id === "pxName") d.name = el.value;
        else if (el.id === "pxContact") d.contactNumber = el.value;
        else if (el.id === "pxClassName") d.name = el.value;
        else if (el.id === "pxSections") d.sectionsText = el.value;
    });

    document.addEventListener("change", function (event) {

        const el = event.target;

        if (!S.institutionId) return;

        if (el.id === "pxClassFilter") {
            S.cls = el.value;
            S.sec = "all";
            S.limit = PAGE_SIZE;
            return renderStudents();
        }

        if (el.id === "pxSectionFilter") {
            S.sec = el.value;
            S.limit = PAGE_SIZE;
            return renderStudents();
        }

        if (el.id === "pxClass" && S.modal && S.modal.draft) {

            S.modal.draft.class = el.value;

            const found = (S.classes || []).find(function (c) { return c.class === el.value; });

            if (!found || !found.sections.includes(S.modal.draft.section)) S.modal.draft.section = "";

            return renderModal();
        }

        if (el.id === "pxSection" && S.modal && S.modal.draft) {
            S.modal.draft.section = el.value;
        }
    });

    document.addEventListener("keydown", function (event) {

        if (event.key === "Escape" && S.modal && !S.busy) closeModal();
    });


    return {
        setContext: setContext,
        reset: reset,
        openHome: openHome,
        openStudents: openStudents,
        openClasses: openClasses,
        loadClasses: loadClasses
    };
}