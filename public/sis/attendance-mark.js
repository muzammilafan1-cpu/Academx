// ============================================================
// Academx SIS: Mark attendance
//
// Shows only what this person may mark. The server checks again on save.
//   Daily mode:        class teacher of the section (with marking turned on). Admin when the switch is on.
//   Per subject mode:  the subject teacher of that subject in that section. Admin when the switch is on.
//
// Reads:  attendanceSettings/{inst}, classes, institutions/{inst}/subjects,
//         institutions/{inst}/teachingAssignments, institutions/{inst}/users, attendance_v2
// Writes: POST /api/attendance/mark (Render)
//
// app.js creates this with initMarkAttendance({ db, auth, apiBase, toast, onSaved }).
// ============================================================

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


export function initMarkAttendance(env) {

    const db = env.db;
    const auth = env.auth;
    const apiBase = env.apiBase;
    const toast = env.toast;
    const onSaved = env.onSaved || function () {};

    const root = document.getElementById("attendanceMarkRoot");

    let S = fresh();

    function today() {
        return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    }

    function fresh() {
        return {
            inst: null,
            uid: null,
            role: "",
            mode: "daily",
            adminOn: false,
            classes: [],        // { class, sections[], classTeachers{} }
            subjects: [],       // { id, class, name }
            assignments: [],    // teachingAssignments
            students: [],       // { id, name, class, section }
            cls: "",
            sec: "",
            subject: "",
            date: today(),
            statuses: {},       // uid -> true (present) / false (absent)
            busy: false,
            error: "",
            loaded: false
        };
    }

    function esc(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
    }

    function byNumber(a, b) {
        return String(a).localeCompare(String(b), undefined, { numeric: true });
    }

    function classLabel(c) {
        return /^class\b/i.test(String(c)) ? String(c) : "Class " + c;
    }

    function classOf(name) {
        return S.classes.find(function (c) { return c.class === name; });
    }

    function recordId() {
        const base = S.inst + "_" + S.cls + "_" + S.sec + "_" + S.date;
        return S.mode === "per_subject" ? base + "_" + S.subject : base;
    }

    // The same rule the server applies
    function canMark(cls, sec, subjectId) {

        if (S.role === "admin") return S.adminOn;

        if (S.mode === "daily") {
            const c = classOf(cls);
            const ct = c && c.classTeachers ? c.classTeachers[sec] : null;
            return !!(ct && ct.uid === S.uid && ct.marksAttendance === true);
        }

        return S.assignments.some(function (a) {
            return a.teacherUid === S.uid && a.class === cls && a.section === sec && a.subjectId === subjectId;
        });
    }

    function markableSubjects() {
        return S.subjects
            .filter(function (s) { return s.class === S.cls && canMark(S.cls, S.sec, s.id); })
            .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    }

    function canMarkNow() {
        if (!S.cls || !S.sec) return false;
        if (S.mode === "per_subject") return !!S.subject && canMark(S.cls, S.sec, S.subject);
        return canMark(S.cls, S.sec);
    }

    function setContext(institutionId, uid, role, teacherRoles) {
        if (S.inst !== institutionId || S.uid !== uid) S = fresh();
        S.inst = institutionId;
        S.uid = uid;
        S.role = role;
    }

    function reset() {
        S = fresh();
        if (root) root.innerHTML = "";
    }


    // ---------- data ----------

    async function loadBase() {

        const [settingsSnap, classSnap, subjSnap, assignSnap, usersSnap] = await Promise.all([
            getDoc(doc(db, "attendanceSettings/" + S.inst)),
            getDocs(query(collection(db, "classes"), where("institutionId", "==", S.inst))),
            getDocs(collection(db, "institutions/" + S.inst + "/subjects")),
            getDocs(collection(db, "institutions/" + S.inst + "/teachingAssignments")),
            getDocs(collection(db, "institutions/" + S.inst + "/users"))
        ]);

        const settings = settingsSnap.exists() ? settingsSnap.data() : {};

        S.mode = settings.mode === "per_subject" ? "per_subject" : "daily";
        S.adminOn = settings.adminOverride === true;

        S.classes = classSnap.docs.map(function (d) {
            const x = d.data();
            return {
                class: String(x.class),
                sections: Array.isArray(x.sections) ? x.sections.map(String).sort(byNumber) : [],
                classTeachers: x.classTeachers && typeof x.classTeachers === "object" ? x.classTeachers : {}
            };
        }).sort(function (a, b) { return byNumber(a.class, b.class); });

        S.subjects = subjSnap.docs.map(function (d) {
            const x = d.data();
            return { id: d.id, class: String(x.class), name: x.name || "" };
        });

        S.assignments = assignSnap.docs.map(function (d) { return d.data(); });

        S.students = usersSnap.docs
            .map(function (d) { return { id: d.id, ...d.data() }; })
            .filter(function (u) { return u.role === "student"; })
            .map(function (u) { return { id: u.id, name: u.name || u.email || "Student", class: String(u.class || ""), section: String(u.section || "") }; })
            .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    }

    function rosterFor() {
        return S.students.filter(function (s) { return s.class === S.cls && s.section === S.sec; });
    }

    // Present unless a saved record says otherwise
    async function loadStatuses() {

        const roster = rosterFor();

        const snap = S.cls && S.sec && (S.mode !== "per_subject" || S.subject)
            ? await getDoc(doc(db, "attendance_v2/" + recordId()))
            : null;

        const saved = snap && snap.exists() && snap.data().students ? snap.data().students : {};

        S.statuses = {};

        roster.forEach(function (s) {
            S.statuses[s.id] = saved[s.id] === undefined ? true : saved[s.id] === true;
        });

        S.recordExists = !!(snap && snap.exists());
    }

    function chooseDefaults() {

        if (!S.classes.some(function (c) { return c.class === S.cls; })) {
            const first = S.classes.find(function (c) { return c.sections.length; }) || S.classes[0];
            S.cls = first ? first.class : "";
            S.sec = first && first.sections[0] ? first.sections[0] : "";
        }

        if (S.cls && !classOf(S.cls).sections.includes(S.sec)) {
            S.sec = classOf(S.cls).sections[0] || "";
        }

        if (S.mode === "per_subject") {
            const subs = markableSubjects();
            if (!subs.some(function (s) { return s.id === S.subject; })) {
                S.subject = subs.length ? subs[0].id : "";
            }
        } else {
            S.subject = "";
        }
    }

    async function open() {

        if (!root || !S.inst) return;

        root.innerHTML = "<p class=\"ax-muted\">Loading…</p>";

        try {

            await loadBase();

            chooseDefaults();

            await loadStatuses();

        } catch (error) {

            console.error("Mark attendance load error:", error);

            root.innerHTML = "<p class=\"ax-error-text\">" + esc(
                error.code === "permission-denied"
                    ? "Firestore rules don't allow reading attendance data for this account yet."
                    : "Couldn't load attendance. " + error.message
            ) + "</p>";

            return;
        }

        render();
    }


    // ---------- page ----------

    function render() {

        if (!root) return;

        const isAdmin = S.role === "admin";

        const modeText = S.mode === "per_subject"
            ? "Per subject: the subject teacher marks their own period."
            : "Daily: the class teacher marks the whole section for the day.";

        const classOpts = S.classes.map(function (c) {
            return "<option value=\"" + esc(c.class) + "\"" + (c.class === S.cls ? " selected" : "") + ">" + esc(classLabel(c.class)) + "</option>";
        }).join("");

        const secOpts = (classOf(S.cls) ? classOf(S.cls).sections : []).map(function (s) {
            return "<option value=\"" + esc(s) + "\"" + (s === S.sec ? " selected" : "") + ">Section " + esc(s) + "</option>";
        }).join("");

        const subjects = S.mode === "per_subject" ? markableSubjects() : [];

        const subjOpts = subjects.map(function (s) {
            return "<option value=\"" + esc(s.id) + "\"" + (s.id === S.subject ? " selected" : "") + ">" + esc(s.name) + "</option>";
        }).join("");

        const filters = "<div class=\"ax-grid\">" +
            "<label><span>Date</span><input type=\"date\" data-mk=\"date\" value=\"" + esc(S.date) + "\"" +
            (isAdmin ? "" : " max=\"" + esc(today()) + "\"") + "></label>" +
            "<label><span>Class</span><select data-mk=\"cls\">" + classOpts + "</select></label>" +
            "<label><span>Section</span><select data-mk=\"sec\">" + secOpts + "</select></label>" +
            (S.mode === "per_subject"
                ? "<label><span>Subject</span><select data-mk=\"subject\"" + (subjects.length ? "" : " disabled") + ">" +
                  (subjOpts || "<option value=\"\">No subjects you can mark</option>") + "</select></label>"
                : "") +
            "</div>";

        let body;

        if (!canMarkNow()) {
            body = "<p class=\"ax-muted\">" + esc(isAdmin
                ? "Admin marking is off. Turn on the admin switch under Settings > Business rules > Attendance rules to mark attendance here."
                : S.mode === "per_subject"
                    ? "You can mark attendance only for a subject you teach in this section."
                    : "You can mark attendance only for a section where you are the class teacher and marking is turned on.") + "</p>";
        } else {

            const roster = rosterFor();

            const present = roster.filter(function (s) { return S.statuses[s.id]; }).length;

            const rows = roster.map(function (s) {
                const on = S.statuses[s.id];
                return "<tr><td><strong>" + esc(s.name) + "</strong></td><td>" +
                    "<button type=\"button\" class=\"ax-btn ax-sm" + (on ? " ax-primary" : "") + "\" data-mk=\"status\" data-uid=\"" + esc(s.id) + "\" data-v=\"1\">Present</button> " +
                    "<button type=\"button\" class=\"ax-btn ax-sm" + (!on ? " ax-danger" : "") + "\" data-mk=\"status\" data-uid=\"" + esc(s.id) + "\" data-v=\"0\">Absent</button>" +
                    "</td></tr>";
            }).join("");

            body = (roster.length
                ? "<p class=\"ax-muted\">" + present + " present, " + (roster.length - present) + " absent. " +
                  (S.recordExists ? "A record already exists for this date. Saving replaces it." : "Nothing saved yet for this date.") + "</p>" +
                  "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Student</th><th>Status</th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
                  "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn ax-primary\" data-mk=\"save\"" + (S.busy ? " disabled" : "") + ">" +
                  (S.busy ? "Saving…" : "Save attendance") + "</button></div>"
                : "<p class=\"ax-muted\">No students in this class and section yet.</p>");
        }

        const errorBox = S.error ? "<div class=\"ax-msg ax-error\" role=\"alert\">" + esc(S.error) + "</div>" : "";

        root.innerHTML = "<section class=\"ax-panel\">" +
            "<h3 class=\"ax-panel-title\">Mark attendance</h3>" +
            "<p class=\"ax-muted\">" + esc(modeText) + (isAdmin && !S.adminOn ? "" : "") + "</p>" +
            errorBox + filters + body + "</section>";
    }


    // ---------- saving ----------

    async function save() {

        if (S.busy || !canMarkNow()) return;

        const students = {};

        rosterFor().forEach(function (s) { students[s.id] = S.statuses[s.id] === true; });

        S.busy = true;
        S.error = "";
        render();

        try {

            const token = await auth.currentUser.getIdToken();

            const response = await fetch(apiBase + "/api/attendance/mark", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                body: JSON.stringify({
                    institutionId: S.inst,
                    date: S.date,
                    class: S.cls,
                    section: S.sec,
                    subjectId: S.mode === "per_subject" ? S.subject : "",
                    students: students
                })
            });

            let data = null;

            try { data = await response.json(); } catch (e) { data = null; }

            if (!response.ok || !data || data.ok !== true) {
                throw new Error((data && data.message) || "The Academx service had a problem. Please try again.");
            }

            S.busy = false;

            toast("Attendance saved. " + data.alerts + " student alert(s) sent.", "ok");

            await loadStatuses();

            render();

            onSaved();

        } catch (error) {

            S.busy = false;
            S.error = error.message || "Couldn't save attendance.";

            render();
        }
    }


    // ---------- events ----------

    if (root) {

        root.addEventListener("click", function (event) {

            const t = event.target.closest("[data-mk]");

            if (!t) return;

            if (t.dataset.mk === "save") return save();

            if (t.dataset.mk === "status") {
                S.statuses[t.dataset.uid] = t.dataset.v === "1";
                render();
            }
        });

        root.addEventListener("change", async function (event) {

            const el = event.target;

            const kind = el.dataset.mk;

            if (kind === "date") {
                S.date = el.value || today();
                if (S.role !== "admin" && S.date > today()) S.date = today();
            } else if (kind === "cls") {
                S.cls = el.value;
                S.sec = classOf(S.cls) && classOf(S.cls).sections[0] ? classOf(S.cls).sections[0] : "";
                S.subject = "";
            } else if (kind === "sec") {
                S.sec = el.value;
            } else if (kind === "subject") {
                S.subject = el.value;
            } else {
                return;
            }

            chooseDefaults();

            try {
                await loadStatuses();
            } catch (error) {
                S.error = "Couldn't load that record. " + error.message;
            }

            render();
        });
    }


    return {
        setContext: setContext,
        reset: reset,
        open: open
    };
}