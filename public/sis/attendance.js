// ============================================================
// Academx SIS: Attendance (view only)
//
// Reads:  classes, institutions/{inst}/users (falls back to users),
//         attendance_v2 for the chosen date.
// Marking attendance stays in the mobile app for now.
//
// app.js creates this with initAttendance({ db }).
// ============================================================

import {
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


export function initAttendance(env) {

    const db = env.db;

    const root = document.getElementById("attendanceRoot");

    let S = fresh();

    function fresh() {
        return {
            inst: null,
            classes: [],      // [{ class, sections[] }]
            students: [],     // students of this institution
            records: [],      // attendance_v2 documents for S.date
            cls: "",
            sec: "",
            date: today()
        };
    }

    function today() {

        const d = new Date();

        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0");
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

    // "10" shows as "Class 10"; a class already named "Class 1" is left alone
    function classLabel(c) {
        return /^class\b/i.test(String(c)) ? String(c) : "Class " + c;
    }

    function sectionsOf(className) {

        const c = S.classes.find(function (x) { return x.class === className; });

        return c ? c.sections.slice().sort(byNumber) : [];
    }

    function recordFor(className, section) {

        return S.records.find(function (r) {
            return String(r.class) === className && String(r.section) === section;
        });
    }

    function rosterFor(className, section) {

        return S.students
            .filter(function (s) {
                return String(s.class) === className && String(s.section) === section;
            })
            .sort(function (a, b) {
                return String(a.name || "").localeCompare(String(b.name || ""));
            });
    }

    // A student is present only when the record lists their uid as true
    function statusOf(student, record) {

        if (!record) return "none";

        return record.students && record.students[student.id] === true
            ? "present"
            : "absent";
    }

    function readError(error) {

        return error && error.code === "permission-denied"
            ? "Firestore rules don't allow reading attendance for this account yet."
            : "Couldn't load attendance. " + (error && error.message ? error.message : "");
    }

    function pill(status) {

        if (status === "present") return "<span class=\"ax-pill ax-approved\">Present</span>";
        if (status === "absent") return "<span class=\"ax-pill ax-rejected\">Absent</span>";

        return "<span class=\"ax-pill ax-draft\">Not marked</span>";
    }

    function stat(value, label, hint) {

        return "<div class=\"ax-stat\">" +
            "<span class=\"ax-stat-value\">" + esc(value) + "</span>" +
            "<span class=\"ax-stat-label\">" + esc(label) + "</span>" +
            "<span class=\"ax-stat-hint\">" + esc(hint) + "</span></div>";
    }


    // ---------- context from app.js ----------

    function setContext(institutionId) {

        if (S.inst !== institutionId) S = fresh();

        S.inst = institutionId;
    }

    function reset() {

        S = fresh();

        if (root) root.innerHTML = "";
    }


    // ---------- data ----------

    async function loadClasses() {

        const snap = await getDocs(
            query(collection(db, "classes"), where("institutionId", "==", S.inst))
        );

        S.classes = snap.docs
            .map(function (d) {

                const x = d.data();

                return {
                    class: String(x.class === undefined ? "" : x.class),
                    sections: Array.isArray(x.sections) ? x.sections.map(String) : []
                };
            })
            .filter(function (c) { return c.class; })
            .sort(function (a, b) { return byNumber(a.class, b.class); });
    }

    async function loadStudents() {

        let docs;

        try {

            docs = (await getDocs(collection(db, "institutions/" + S.inst + "/users"))).docs;

        } catch (error) {

            if (error.code !== "permission-denied") throw error;

            docs = (await getDocs(
                query(collection(db, "users"), where("institutionId", "==", S.inst))
            )).docs;
        }

        S.students = docs
            .map(function (d) { return { id: d.id, ...d.data() }; })
            .filter(function (u) { return u.role === "student"; });
    }

    async function loadRecords() {

        const snap = await getDocs(query(
            collection(db, "attendance_v2"),
            where("institutionId", "==", S.inst),
            where("date", "==", S.date)
        ));

        S.records = snap.docs.map(function (d) { return d.data(); });
    }


    // ---------- page ----------

    async function open() {

        if (!root || !S.inst) return;

        root.innerHTML = "<p class=\"ax-muted\">Loading…</p>";

        try {

            await Promise.all([loadClasses(), loadStudents(), loadRecords()]);

        } catch (error) {

            console.error("Attendance load error:", error);

            root.innerHTML = "<p class=\"ax-error-text\">" + esc(readError(error)) + "</p>";

            return;
        }

        if (!S.classes.some(function (c) { return c.class === S.cls; })) {
            S.cls = S.classes.length ? S.classes[0].class : "";
        }

        const secs = sectionsOf(S.cls);

        if (!secs.includes(S.sec)) S.sec = secs[0] || "";

        render();
    }

    function render() {

        if (!root) return;

        const head =
            "<div class=\"ax-head\"><div><h2 class=\"ax-title\">Attendance</h2>" +
            "<p class=\"ax-sub\">Attendance marked in the Academx app, by class, section and date. " +
            "Viewing only for now.</p></div></div>";

        if (!S.classes.length) {

            root.innerHTML = head +
                "<section class=\"ax-panel\"><div class=\"ax-empty\"><strong>No classes yet</strong>" +
                "<p class=\"ax-muted\">Add classes under Classes first. Attendance is grouped by them.</p></div></section>";

            return;
        }

        const secs = sectionsOf(S.cls);

        const classOptions = S.classes.map(function (c) {
            return "<option value=\"" + esc(c.class) + "\"" + (c.class === S.cls ? " selected" : "") + ">" +
                esc(classLabel(c.class)) + "</option>";
        }).join("");

        const sectionOptions = secs.length
            ? secs.map(function (x) {
                return "<option value=\"" + esc(x) + "\"" + (x === S.sec ? " selected" : "") + ">Section " +
                    esc(x) + "</option>";
            }).join("")
            : "<option value=\"\">No sections</option>";

        const record = recordFor(S.cls, S.sec);

        const roster = rosterFor(S.cls, S.sec);

        const rows = roster.map(function (s) {
            return { s: s, st: statusOf(s, record) };
        });

        const presentCount = rows.filter(function (r) { return r.st === "present"; }).length;

        const stats =
            "<div class=\"ax-stats\">" +
            stat(roster.length, "Students", S.sec ? classLabel(S.cls) + ", Section " + S.sec : classLabel(S.cls)) +
            stat(record ? presentCount : "—", "Present", record ? "" : "Not marked yet") +
            stat(record ? roster.length - presentCount : "—", "Absent", record ? "" : "Not marked yet") +
            stat(record ? "Marked" : "Not marked", "Status", S.date) +
            "</div>";

        const filters =
            "<section class=\"ax-panel\"><div class=\"ax-grid\">" +
            "<label class=\"ax-grow\"><span>Date</span><input type=\"date\" id=\"atDate\" value=\"" +
            esc(S.date) + "\"></label>" +
            "<label class=\"ax-grow\"><span>Class</span><select id=\"atClass\">" + classOptions + "</select></label>" +
            "<label class=\"ax-grow\"><span>Section</span><select id=\"atSection\">" + sectionOptions + "</select></label>" +
            "</div>";

        let body;

        if (!S.sec) {

            body = "<div class=\"ax-empty\"><p class=\"ax-muted\">This class has no sections yet. " +
                "Add sections under Classes.</p></div>";

        } else if (!roster.length) {

            body = "<div class=\"ax-empty\"><p class=\"ax-muted\">No students in " + esc(classLabel(S.cls)) +
                ", Section " + esc(S.sec) + " yet.</p></div>";

        } else {

            body = "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr>" +
                "<th>Student</th><th>Email</th><th>Status</th></tr></thead><tbody>" +
                rows.map(function (r) {
                    return "<tr><td><strong>" + esc(r.s.name || "Unnamed") + "</strong></td><td>" +
                        esc(r.s.email || "—") + "</td><td>" + pill(r.st) + "</td></tr>";
                }).join("") +
                "</tbody></table></div>";
        }

        // Overview: every class and section for the chosen date
        const overviewRows = [];

        S.classes.forEach(function (c) {

            c.sections.slice().sort(byNumber).forEach(function (sec) {

                const rec = recordFor(c.class, sec);

                const members = rosterFor(c.class, sec);

                const present = rec
                    ? members.filter(function (s) { return statusOf(s, rec) === "present"; }).length
                    : 0;

                overviewRows.push(
                    "<tr><td><strong>" + esc(classLabel(c.class)) + "</strong></td><td>Section " + esc(sec) +
                    "</td><td class=\"ax-num\">" + members.length + "</td><td>" +
                    (rec
                        ? "<span class=\"ax-pill ax-approved\">Marked</span> " + present + " of " + members.length + " present"
                        : "<span class=\"ax-pill ax-draft\">Not marked</span>") +
                    "</td></tr>"
                );
            });
        });

        const overview =
            "<section class=\"ax-panel\"><h3 class=\"ax-panel-title\">All classes on " + esc(S.date) + "</h3>" +
            (overviewRows.length
                ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Class</th><th>Section</th>" +
                  "<th class=\"ax-num\">Students</th><th>Attendance</th></tr></thead><tbody>" +
                  overviewRows.join("") + "</tbody></table></div>"
                : "<p class=\"ax-muted\">No sections are set up yet.</p>") +
            "</section>";

        root.innerHTML = head + stats + filters + body + "</section>" + overview;
    }


    // ---------- events (listeners live on the root, which persists across renders) ----------

    if (root) {

        root.addEventListener("change", async function (event) {

            const el = event.target;

            if (el.id === "atDate") {

                S.date = el.value || today();

                try {

                    await loadRecords();

                } catch (error) {

                    console.error("Attendance date error:", error);

                    S.records = [];

                    root.insertAdjacentHTML("afterbegin",
                        "<p class=\"ax-error-text\">" + esc(readError(error)) + "</p>");

                    return;
                }

                render();

            } else if (el.id === "atClass") {

                S.cls = el.value;
                S.sec = sectionsOf(S.cls)[0] || "";

                render();

            } else if (el.id === "atSection") {

                S.sec = el.value;

                render();
            }
        });
    }


    return {
        setContext: setContext,
        reset: reset,
        open: open
    };
}