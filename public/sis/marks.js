// ============================================================
// Academx SIS: Marks
//
// Shows only the subjects this person may enter (the server checks again on save).
//   Subject teacher: subjects they teach in a section.
//   Class teacher:   subjects in their section that have no subject teacher.
//   Admin:           everything, only when the admin switch is on in Grading rules.
//
// Reads:  exams, classes, subjects, teachingAssignments, users (students),
//         gradingSettings/{inst}, institutions/{inst}/marks/{id}
// Writes: POST /api/marks/save (Render)
//
// Totals, pass or fail, and grades are worked out here from the saved grading
// rules. Overall percentage, CGPA and divisions come with report cards.
//
// app.js creates this with initMarks({ db, auth, apiBase, toast }).
// ============================================================

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


export function initMarks(env) {

    const db = env.db;
    const auth = env.auth;
    const apiBase = env.apiBase;
    const toast = env.toast;

    const root = document.getElementById("marksRoot");

    let S = fresh();

    function fresh() {
        return {
            inst: null,
            uid: null,
            role: null,
            teacherRoles: {},
            grading: null,        // saved grading rules
            exams: [],
            classes: [],          // { class, sections[], classTeachers{} }
            subjects: [],         // { id, class, name }
            assignments: [],      // teachingAssignments
            exam: "",
            cls: "",
            sec: "",
            subject: "",
            roster: [],           // students in the chosen class and section
            mark: null,           // saved marks document for the selection
            busy: false,
            error: ""
        };
    }

    function esc(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
    }

    function slug(text) {
        return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    function byNumber(a, b) {
        return String(a).localeCompare(String(b), undefined, { numeric: true });
    }

    function classLabel(c) {
        return /^class\b/i.test(String(c)) ? String(c) : "Class " + c;
    }

    function setContext(institutionId, uid, role, teacherRoles) {
        if (S.inst !== institutionId || S.uid !== uid) S = fresh();
        S.inst = institutionId;
        S.uid = uid;
        S.role = role;
        S.teacherRoles = teacherRoles || {};
    }

    function reset() {
        S = fresh();
        if (root) root.innerHTML = "";
    }

    // An exam applies if it covers all classes, or includes this class and section
    function examApplies(e) {
        const scope = e.scope;
        if (!scope || scope.all !== false) return true;
        return (scope.classes || []).some(function (c) {
            return c.class === S.cls && (c.sections || []).includes(S.sec);
        });
    }

    function adminMarksOn() {
        return !!(S.grading && S.grading.marksEntry && S.grading.marksEntry.adminOverride);
    }

    function classOf(name) {
        return S.classes.find(function (c) { return c.class === name; });
    }

    // The rule, mirrored from the server so the screen only offers what can be saved
    function canEnter(subjectId) {

        const assigned = S.assignments.filter(function (a) {
            return a.class === S.cls && a.section === S.sec && a.subjectId === subjectId;
        });

        if (S.role === "admin") return adminMarksOn();

        if (assigned.some(function (a) { return a.teacherUid === S.uid; })) return true;

        const c = classOf(S.cls);

        const isClassTeacher = !!(c && c.classTeachers[S.sec] && c.classTeachers[S.sec].uid === S.uid);

        return isClassTeacher && assigned.length === 0;
    }

    function allowedSubjects() {
        return S.subjects
            .filter(function (s) { return s.class === S.cls; })
            .filter(function (s) { return canEnter(s.id); });
    }


    // ---------- data ----------

    async function loadBase() {

        const [examSnap, classSnap, subjSnap, assignSnap, gradingSnap, rosterSnap] = await Promise.all([
            getDocs(collection(db, "institutions/" + S.inst + "/exams")),
            getDocs(query(collection(db, "classes"), where("institutionId", "==", S.inst))),
            getDocs(collection(db, "institutions/" + S.inst + "/subjects")),
            getDocs(collection(db, "institutions/" + S.inst + "/teachingAssignments")),
            getDoc(doc(db, "gradingSettings/" + S.inst)),
            getDocs(collection(db, "institutions/" + S.inst + "/users"))
        ]);

        S.exams = examSnap.docs.map(function (d) { return { id: d.id, ...d.data() }; })
            .sort(function (a, b) { return String(b.startDate || "").localeCompare(String(a.startDate || "")); });

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
        }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });

        S.assignments = assignSnap.docs.map(function (d) { return d.data(); });

        S.grading = gradingSnap.exists() ? gradingSnap.data() : null;

        S.roster = rosterSnap.docs
            .map(function (d) { return { id: d.id, ...d.data() }; })
            .filter(function (u) { return u.role === "student"; });
    }

    function rosterFor() {
        return S.roster
            .filter(function (u) { return String(u.class) === S.cls && String(u.section) === S.sec; })
            .sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || "")); });
    }

    async function loadMark() {

        if (!S.exam || !S.subject || !S.cls || !S.sec) {
            S.mark = null;
            return;
        }

        const id = S.exam + "__" + S.subject + "__" + slug(S.cls) + "__" + slug(S.sec);

        const snap = await getDoc(doc(db, "institutions/" + S.inst + "/marks/" + id));

        S.mark = snap.exists() ? snap.data() : null;
    }

    // The selected exam's own marks parts; older exams use the grading defaults
    function components() {
        const e = S.exams.find(function (x) { return x.id === S.exam; });
        if (e && Array.isArray(e.components) && e.components.length) return e.components;
        return S.grading && Array.isArray(S.grading.components) ? S.grading.components : [];
    }

    function maxFor(name) {
        if (S.mark && S.mark.maxes && S.mark.maxes[name] !== undefined) return Number(S.mark.maxes[name]);
        const c = components().find(function (x) { return x.name === name; });
        return c ? Number(c.max || c.weight) : 0;
    }


    // ---------- results (worked out from the grading rules) ----------

    function roundTo(value, decimals, mode) {

        const f = Math.pow(10, decimals);

        if (mode === "down") return Math.floor(value * f) / f;
        if (mode === "up") return Math.ceil(value * f) / f;

        return Math.round(value * f) / f;
    }

    function totalFor(row) {

        const comps = components();

        if (!comps.length) return null;

        let sum = 0;
        let weightSum = 0;

        for (const c of comps) {

            const v = row ? row[c.name] : null;

            if (v === null || v === undefined || v === "") return null;

            const max = maxFor(c.name);

            if (!max) return null;

            sum += Number(c.weight) * (Number(v) / max);
            weightSum += Number(c.weight);
        }

        return weightSum ? (sum / weightSum) * 100 : null;
    }

    function resultFor(total) {

        if (total === null || !S.grading) return { pass: "—", grade: "—" };

        const pass = total >= Number(S.grading.passRule.minPercent) ? "Pass" : "Fail";

        const type = S.grading.gradingType;

        let grade = "—";

        if (type === "grade_points" || type === "letter_custom") {

            const bands = (S.grading.bands || []).slice().sort(function (a, b) { return b.minMarks - a.minMarks; });

            const band = bands.find(function (b) { return total >= b.minMarks; });

            if (band) grade = band.grade + (type === "grade_points" && band.gradePoint !== undefined ? " (" + band.gradePoint + ")" : "");
        }

        return { pass: pass, grade: grade };
    }

    function shownTotal(total) {

        if (total === null) return "—";

        const r = S.grading.rounding || { mode: "nearest", decimals: 0 };

        return roundTo(total, Number(r.decimals) || 0, r.mode || "nearest").toFixed(Number(r.decimals) || 0) + "%";
    }


    // ---------- page ----------

    async function open() {

        if (!root || !S.inst) return;

        root.innerHTML = "<p class=\"ax-muted\">Loading…</p>";

        try {

            await loadBase();

        } catch (error) {

            console.error("Marks load error:", error);

            root.innerHTML = "<p class=\"ax-error-text\">" + esc(
                error.code === "permission-denied"
                    ? "Firestore rules don't allow reading marks data for this account yet."
                    : "Couldn't load marks. " + error.message
            ) + "</p>";

            return;
        }

        if (!S.exam && S.exams.length) S.exam = S.exams[0].id;

        if (!S.cls && S.classes.length) {
            const first = S.classes.find(function (c) { return c.sections.length; }) || S.classes[0];
            S.cls = first.class;
            S.sec = first.sections[0] || "";
        }

        await chooseSubject();

        render();
    }

    async function chooseSubject() {

        const applicable = S.exams.filter(examApplies);

        if (!applicable.some(function (e) { return e.id === S.exam; })) {
            S.exam = applicable.length ? applicable[0].id : "";
        }


        const allowed = allowedSubjects();

        if (!allowed.some(function (s) { return s.id === S.subject; })) {
            S.subject = allowed.length ? allowed[0].id : "";
        }

        await loadMark();
    }

    function render() {

        if (!root) return;

        const head =
            "<div class=\"ax-head\"><div><h2 class=\"ax-title\">Marks</h2>" +
            "<p class=\"ax-sub\">Enter marks for the subjects you teach. Totals, pass or fail and grades follow the school's grading rules.</p></div></div>" +
            (S.error ? "<div class=\"ax-msg ax-error\" role=\"alert\">" + esc(S.error) + "</div>" : "");

        S.error = "";

        if (!S.grading) {
            root.innerHTML = head + "<div class=\"ax-empty\"><strong>Grading rules aren't set up yet</strong>" +
                "<p class=\"ax-muted\">Set them under Settings > Business rules > Grading rules before entering marks.</p></div>";
            return;
        }

        const applicable = S.exams.filter(examApplies);

        if (!applicable.length) {
            root.innerHTML = head + "<div class=\"ax-empty\"><strong>No exams yet</strong>" +
                "<p class=\"ax-muted\">Create an exam under Academic Records > Exams first.</p></div>";
            return;
        }

        const examOpts = applicable.map(function (e) {
            return "<option value=\"" + esc(e.id) + "\"" + (e.id === S.exam ? " selected" : "") + ">" + esc(e.name || e.id) +
                (e.academicYear ? " · " + esc(e.academicYear) : "") + "</option>";
        }).join("");

        const classOpts = S.classes.map(function (c) {
            return "<option value=\"" + esc(c.class) + "\"" + (c.class === S.cls ? " selected" : "") + ">" + esc(classLabel(c.class)) + "</option>";
        }).join("");

        const secs = (classOf(S.cls) || { sections: [] }).sections;

        const secOpts = secs.map(function (s) {
            return "<option value=\"" + esc(s) + "\"" + (s === S.sec ? " selected" : "") + ">Section " + esc(s) + "</option>";
        }).join("");

        const allowed = allowedSubjects();

        const subjOpts = allowed.map(function (s) {
            return "<option value=\"" + esc(s.id) + "\"" + (s.id === S.subject ? " selected" : "") + ">" + esc(s.name) + "</option>";
        }).join("");

        const filters =
            "<section class=\"ax-panel\"><div class=\"ax-grid\">" +
            "<label><span>Exam</span><select data-m=\"exam\">" + examOpts + "</select></label>" +
            "<label><span>Class</span><select data-m=\"class\">" + classOpts + "</select></label>" +
            "<label><span>Section</span><select data-m=\"section\">" + (secOpts || "<option value=\"\">No sections</option>") + "</select></label>" +
            "<label><span>Subject</span><select data-m=\"subject\"" + (allowed.length ? "" : " disabled") + ">" +
            (subjOpts || "<option value=\"\">No subjects you can enter</option>") + "</select></label>" +
            "</div>";

        if (!allowed.length) {
            root.innerHTML = head + filters +
                "<p class=\"ax-muted\">You can enter marks only for subjects you teach, or for your class section where no subject teacher is set. " +
                "Ask an administrator to check your roles under Security.</p></section>";
            return;
        }

        root.innerHTML = head + filters + marksTable() + "</section>";
    }

    function marksTable() {

        const comps = components();

        const roster = rosterFor();

        const isAdmin = S.role === "admin";

        const maxRow = "<tr><th>Student</th>" + comps.map(function (c) {
            return "<th>" + esc(c.name) + "<br><span class=\"ax-muted\">" +
                (isAdmin
                    ? "out of <input type=\"number\" data-m=\"max\" data-c=\"" + esc(c.name) + "\" value=\"" + esc(maxFor(c.name)) +
                      "\" min=\"1\" max=\"1000\" style=\"width:80px\">"
                    : "out of " + esc(maxFor(c.name))) +
                "</span></th>";
        }).join("") + "<th>Total</th><th>Result</th><th>Grade</th></tr>";

        const rows = roster.map(function (u) {

            const saved = S.mark && S.mark.scores ? S.mark.scores[u.id] || {} : {};

            const cells = comps.map(function (c) {
                const v = saved[c.name];
                return "<td><input type=\"number\" data-m=\"score\" data-uid=\"" + esc(u.id) + "\" data-c=\"" + esc(c.name) +
                    "\" value=\"" + (v === null || v === undefined ? "" : esc(v)) + "\" min=\"0\" step=\"any\" style=\"width:90px\"></td>";
            }).join("");

            const row = {};

            comps.forEach(function (c) { row[c.name] = saved[c.name]; });

            const total = totalFor(row);

            const result = resultFor(total);

            return "<tr><td><strong>" + esc(u.name || u.email || "—") + "</strong></td>" + cells +
                "<td data-m=\"total\" data-uid=\"" + esc(u.id) + "\">" + esc(shownTotal(total)) + "</td>" +
                "<td>" + esc(result.pass) + "</td><td>" + esc(result.grade) + "</td></tr>";
        }).join("");

        const body = roster.length
            ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead>" + maxRow + "</thead><tbody>" + rows + "</tbody></table></div>"
            : "<div class=\"ax-empty\"><p class=\"ax-muted\">No students in this class and section yet.</p></div>";

        const save = roster.length
            ? "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn ax-primary\" data-m=\"save\"" + (S.busy ? " disabled" : "") + ">" +
              (S.busy ? "Saving…" : "Save marks") + "</button></div>" +
              "<p class=\"ax-muted\">Leave a box empty if the student's mark isn't in yet. Totals update as you type.</p>"
            : "";

        return "<section class=\"ax-panel\">" + body + save;
    }


    // ---------- saving ----------

    async function save() {

        if (S.busy) return;

        const comps = components();

        const scores = {};

        root.querySelectorAll("[data-m=\"score\"]").forEach(function (input) {
            const uid = input.dataset.uid;
            const name = input.dataset.c;
            if (!scores[uid]) scores[uid] = {};
            scores[uid][name] = input.value === "" ? null : Number(input.value);
        });

        const payload = {
            examId: S.exam,
            subjectId: S.subject,
            class: S.cls,
            section: S.sec,
            institutionId: S.inst,
            scores: scores
        };

        if (S.role === "admin") {
            const maxes = {};
            root.querySelectorAll("[data-m=\"max\"]").forEach(function (input) {
                maxes[input.dataset.c] = Number(input.value);
            });
            if (comps.length) payload.maxes = maxes;
        }

        S.busy = true;
        render();

        try {

            const token = await auth.currentUser.getIdToken();

            const response = await fetch(apiBase + "/api/marks/save", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                body: JSON.stringify(payload)
            });

            let data = null;

            try { data = await response.json(); } catch (e) { data = null; }

            if (!response.ok || !data || data.ok !== true) {
                throw new Error((data && data.message) || "The Academx service had a problem. Please try again.");
            }

            S.busy = false;

            await loadMark();

            toast("Marks saved.", "ok");

            render();

        } catch (error) {

            S.busy = false;
            S.error = error.message || "Couldn't save the marks.";

            render();
        }
    }


    // ---------- events ----------

    if (root) {

        root.addEventListener("click", function (event) {
            const t = event.target.closest("[data-m=\"save\"]");
            if (t) save();
        });

        root.addEventListener("change", async function (event) {

            const el = event.target;

            const kind = el.dataset.m;

            if (kind === "exam") { S.exam = el.value; await loadMark(); return render(); }

            if (kind === "class") {
                S.cls = el.value;
                S.sec = (classOf(S.cls) || { sections: [] }).sections[0] || "";
                S.subject = "";
                await chooseSubject();
                return render();
            }

            if (kind === "section") {
                S.sec = el.value;
                await chooseSubject();
                return render();
            }

            if (kind === "subject") {
                S.subject = el.value;
                await loadMark();
                return render();
            }
        });

        root.addEventListener("input", function (event) {

            const el = event.target;

            if (el.dataset.m !== "score") return;

            // Update that student's total live
            const uid = el.dataset.uid;

            const row = {};

            root.querySelectorAll("[data-m=\"score\"][data-uid=\"" + uid + "\"]").forEach(function (input) {
                row[input.dataset.c] = input.value === "" ? null : Number(input.value);
            });

            const total = totalFor(row);

            const result = resultFor(total);

            const cell = root.querySelector("[data-m=\"total\"][data-uid=\"" + uid + "\"]");

            if (cell) {
                const tr = cell.parentElement;
                cell.textContent = shownTotal(total);
                tr.children[tr.children.length - 2].textContent = result.pass;
                tr.children[tr.children.length - 1].textContent = result.grade;
            }
        });
    }


    return {
        setContext: setContext,
        reset: reset,
        open: open
    };
}