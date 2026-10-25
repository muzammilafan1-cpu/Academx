// ============================================================
// Academx SIS: Academic Records (subjects and exams)
//
// Reads (browser):  classes, institutions/{inst}/subjects, institutions/{inst}/exams
// Writes (Render API only): /api/academic/subjects/save|delete, /api/academic/exams/save|delete
// Marks entry comes later, once the mobile app's marks format is confirmed.
//
// app.js creates this with initAcademic({ db, auth, apiBase, toast }).
// ============================================================

import {
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


export function initAcademic(env) {

    const db = env.db;
    const auth = env.auth;
    const apiBase = env.apiBase;
    const toast = env.toast;

    const root = document.getElementById("academicRecordsRoot");

    const modalHost = document.createElement("div");

    modalHost.id = "acModalHost";

    document.body.appendChild(modalHost);

    let S = fresh();

    function fresh() {
        return {
            inst: null,
            canManage: false,
            tab: "subjects",     // subjects | exams
            classes: [],
            cls: "",
            subjects: [],
            exams: [],
            modal: null,         // { type: "subject" | "exam", id, draft, error }
            busy: false
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

    // "10" shows as "Class 10"; a class already named "Class 1" is left alone
    function classLabel(c) {
        return /^class\b/i.test(String(c)) ? String(c) : "Class " + c;
    }

    function readError(error) {

        return error && error.code === "permission-denied"
            ? "Firestore rules don't allow reading academic records for this account yet."
            : "Couldn't load academic records. " + (error && error.message ? error.message : "");
    }


    // ---------- context from app.js ----------

    function setContext(institutionId, role) {

        if (S.inst !== institutionId) S = fresh();

        S.inst = institutionId;
        S.canManage = role === "admin";
    }

    function reset() {

        S = fresh();

        if (root) root.innerHTML = "";

        closeModal();
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


    // ---------- data (reads) ----------

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

    async function loadSubjects() {

        const snap = await getDocs(collection(db, "institutions/" + S.inst + "/subjects"));

        S.subjects = snap.docs
            .map(function (d) { return { id: d.id, ...d.data() }; })
            .sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || "")); });
    }

    async function loadExams() {

        const snap = await getDocs(collection(db, "institutions/" + S.inst + "/exams"));

        S.exams = snap.docs
            .map(function (d) { return { id: d.id, ...d.data() }; })
            .sort(function (a, b) { return String(b.startDate || "").localeCompare(String(a.startDate || "")); });
    }


    // ---------- page ----------

    async function open(tab) {

        if (tab) S.tab = tab;
        if (!root || !S.inst) return;

        root.innerHTML = "<p class=\"ax-muted\">Loading…</p>";

        try {

            await Promise.all([loadClasses(), loadSubjects(), loadExams()]);

        } catch (error) {

            console.error("Academic records load error:", error);

            root.innerHTML = "<p class=\"ax-error-text\">" + esc(readError(error)) + "</p>";

            return;
        }

        if (!S.classes.some(function (c) { return c.class === S.cls; })) {
            S.cls = S.classes.length ? S.classes[0].class : "";
        }

        render();
    }

    function emptyPanel(title, text) {

        return "<section class=\"ax-panel\"><div class=\"ax-empty\"><strong>" + esc(title) + "</strong>" +
            "<p class=\"ax-muted\">" + esc(text) + "</p></div></section>";
    }

    function render() {

        if (!root) return;

        const isExams = S.tab === "exams";

        const head =
            "<div class=\"ax-head\"><div><h2 class=\"ax-title\">" + (isExams ? "Exams" : "Subjects") + "</h2>" +
            "<p class=\"ax-sub\">" + (isExams
                ? "Exams and their dates. Marks are entered against these."
                : "The subjects each class studies, and the sections that take them.") + "</p></div></div>";

        root.innerHTML = head + (isExams ? examsHtml() : subjectsHtml());
    }

    function subjectsHtml() {

        if (!S.classes.length) {
            return "<div class=\"ax-empty\"><strong>No classes yet</strong><p class=\"ax-muted\">Add classes under Classes first.</p></div>";
        }

        const add = S.canManage
            ? "<div class=\"ax-bar\" style=\"margin-top:0;border-top:0;padding-top:0\"><button type=\"button\" class=\"ax-btn ax-primary\" data-ac=\"add-subject\">+ Add subject</button></div>"
            : "";

        const list = S.subjects.slice().sort(function (a, b) {
            return byNumber(a.class, b.class) || String(a.name).localeCompare(String(b.name));
        });

        const rows = list.map(function (s) {

            const secs = Array.isArray(s.sections) && s.sections.length ? s.sections.join(", ") : "—";

            return "<tr><td>" + esc(classLabel(s.class)) + "</td><td>" + esc(secs) + "</td><td><strong>" + esc(s.name) +
                "</strong></td><td>" + esc(s.code || "—") + "</td><td>" +
                (S.canManage
                    ? "<div class=\"ax-row-actions\"><button type=\"button\" class=\"ax-btn ax-sm\" data-ac=\"edit-subject\" data-id=\"" +
                      esc(s.id) + "\">Edit</button><button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-ac=\"delete-subject\" data-id=\"" +
                      esc(s.id) + "\">Delete</button></div>"
                    : "") + "</td></tr>";
        }).join("");

        return "<section class=\"ax-panel\">" + add +
            (list.length
                ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Class</th><th>Section</th>" +
                  "<th>Subject</th><th>Code</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>"
                : "<div class=\"ax-empty\"><strong>No subjects yet</strong>" +
                  "<p class=\"ax-muted\">Click + Add subject, then choose the class, the section or all sections, and the subject name.</p></div>") +
            "</section>";
    }

    function examsHtml() {

        const add = S.canManage
            ? "<div class=\"ax-bar\" style=\"margin-top:0;border-top:0;padding-top:0\"><button type=\"button\" class=\"ax-btn ax-primary\" data-ac=\"add-exam\">+ Add exam</button></div>"
            : "";

        const rows = S.exams.map(function (e) {
            const papers = Array.isArray(e.schedule) ? e.schedule.length : 0;
            return "<tr><td><strong>" + esc(e.name) + "</strong></td><td>" + esc(e.academicYear || "—") +
                "</td><td>" + esc(scopeText(e)) + "</td><td>" + papers + "</td><td><div class=\"ax-row-actions\">" +
                "<button type=\"button\" class=\"ax-btn ax-sm\" data-ac=\"view-exam\" data-id=\"" + esc(e.id) + "\">View</button>" +
                (S.canManage
                    ? "<button type=\"button\" class=\"ax-btn ax-sm\" data-ac=\"edit-exam\" data-id=\"" + esc(e.id) + "\">Edit</button>" +
                      "<button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-ac=\"delete-exam\" data-id=\"" + esc(e.id) + "\">Delete</button>"
                    : "") + "</div></td></tr>";
        }).join("");

        return "<section class=\"ax-panel\">" + add +
            (S.exams.length
                ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Exam</th><th>Academic year</th>" +
                  "<th>Classes</th><th>Papers with a date</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>"
                : "<div class=\"ax-empty\"><strong>No exams yet</strong><p class=\"ax-muted\">Add exams such as Term 1 or Unit Test 2.</p></div>") +
            "</section>";
    }


    // ---------- modal ----------

    function field(label, id, value, extra) {

        return "<label><span>" + esc(label) + "</span><input type=\"text\" id=\"" + id + "\" value=\"" +
            esc(value) + "\"" + (extra || "") + "></label>";
    }

    // A saved subject becomes the form values: all sections, one section, or a custom list
    function subjectDraft(subj) {
        const cls = S.classes.find(function (c) { return c.class === subj.class; }) || { sections: [] };
        const taught = Array.isArray(subj.sections) ? subj.sections.slice() : [];
        const sameSet = cls.sections.length === taught.length && cls.sections.every(function (x) { return taught.includes(x); });
        let section = "__all";
        if (!sameSet && taught.length === 1) section = taught[0];
        if (!sameSet && taught.length > 1) section = "__custom";
        return { class: subj.class, section: section, customSections: taught, name: subj.name || "", code: subj.code || "" };
    }

    // The sections a subject is taught in, from the form values
    function sectionsFromDraft(d) {
        const cls = S.classes.find(function (c) { return c.class === d.class; }) || { sections: [] };
        if (d.section === "__all") return cls.sections.slice();
        if (d.section === "__custom") return (d.customSections || []).slice();
        return [d.section];
    }

    function scopeText(e) {
        if (!e.scope || e.scope.all !== false) return "All classes";
        return (e.scope.classes || []).map(function (c) {
            const all = (S.classes.find(function (x) { return x.class === c.class; }) || { sections: [] }).sections;
            const same = all.length === (c.sections || []).length;
            return classLabel(c.class) + " (" + (same ? "all sections" : (c.sections || []).join(", ")) + ")";
        }).join("; ");
    }

    // Weekday name, with Sundays flagged so the admin can check them
    function dayLabel(date) {
        if (!date) return "—";
        const d = new Date(date + "T00:00:00");
        if (isNaN(d)) return "—";
        const name = d.toLocaleDateString(undefined, { weekday: "long" });
        return d.getDay() === 0 ? name + " (Sunday: check)" : name;
    }

    // Every subject in the exam's classes, with the sections it is taught in
    function examPaperRows(d) {
        const classes = d.scopeAll
            ? S.classes.map(function (c) { return { class: c.class, sections: c.sections }; })
            : d.rows;
        const rows = [];
        classes.forEach(function (c) {
            S.subjects.filter(function (s) { return s.class === c.class; }).forEach(function (s) {
                const taught = Array.isArray(s.sections) && s.sections.length ? s.sections : null;
                const applies = !taught || !c.sections || c.sections.length === 0 || taught.some(function (x) { return c.sections.includes(x); });
                if (applies) rows.push({ class: c.class, subjectId: s.id, subjectName: s.name });
            });
        });
        return rows;
    }

    function examPapersHtml(d) {

        const rows = examPaperRows(d);

        if (!rows.length) {
            return "<p class=\"ax-muted\">These classes have no subjects yet. Add subjects under Academic Records > Subjects, then set the paper dates.</p>";
        }

        return "<h4 class=\"ax-subtitle\">Paper dates</h4>" +
            "<p class=\"ax-muted\">Set the date of each subject's paper. Leave one empty if it isn't fixed yet.</p>" +
            "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Class</th><th>Subject</th><th>Paper date</th><th>Day</th></tr></thead><tbody>" +
            rows.map(function (r) {
                const key = r.class + "|" + r.subjectId;
                const date = d.schedule[key] || "";
                return "<tr><td>" + esc(classLabel(r.class)) + "</td><td>" + esc(r.subjectName) + "</td><td>" +
                    "<input type=\"date\" data-ac-paper=\"" + esc(key) + "\" value=\"" + esc(date) + "\"></td><td><span data-ac-day=\"" +
                    esc(key) + "\">" + esc(dayLabel(date)) + "</span></td></tr>";
            }).join("") + "</tbody></table></div>";
    }

    // The full record of one exam, with its papers in date order
    function examViewHtml(m) {

        const e = S.exams.find(function (x) { return x.id === m.id; });

        if (!e) return "";

        const papers = (Array.isArray(e.schedule) ? e.schedule : []).slice().sort(function (a, b) {
            return String(a.date).localeCompare(String(b.date));
        });

        const undated = examPaperRows(examDraft(e)).filter(function (r) {
            return !papers.some(function (p) { return p.class === r.class && p.subjectId === r.subjectId; });
        }).length;

        const row = function (label, value) {
            return "<div class=\"ax-dl-row\"><dt>" + esc(label) + "</dt><dd>" + value + "</dd></div>";
        };

        return "<div class=\"ax-backdrop\" data-ac=\"backdrop\"><div class=\"ax-modal\" role=\"dialog\" aria-modal=\"true\">" +
            "<div class=\"ax-modal-head\"><div><h3>" + esc(e.name) + "</h3><div class=\"ax-muted\">" + esc(e.academicYear || "") +
            "</div></div><button type=\"button\" class=\"ax-icon\" data-ac=\"close\" aria-label=\"Close\">✕</button></div>" +
            "<div class=\"ax-modal-body\"><dl class=\"ax-dl\">" +
            row("Classes", esc(scopeText(e))) +
            row("Papers with a date", String(papers.length)) +
            row("Papers without a date", String(undated)) +
            "</dl>" +
            "<h4 class=\"ax-subtitle\">Paper timetable</h4>" +
            (papers.length
                ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Date</th><th>Day</th><th>Class</th><th>Subject</th></tr></thead><tbody>" +
                  papers.map(function (p) {
                      return "<tr><td>" + esc(p.date) + "</td><td>" + esc(dayLabel(p.date)) + "</td><td>" + esc(classLabel(p.class)) +
                          "</td><td>" + esc(p.subjectName) + "</td></tr>";
                  }).join("") + "</tbody></table></div>"
                : "<p class=\"ax-muted\">No paper dates have been set yet.</p>") +
            "<div class=\"ax-bar ax-bar-modal\">" +
            (S.canManage ? "<button type=\"button\" class=\"ax-btn ax-primary\" data-ac=\"edit-exam\" data-id=\"" + esc(e.id) + "\">Edit exam</button>" : "") +
            "<button type=\"button\" class=\"ax-btn\" data-ac=\"close\">Close</button></div>" +
            "</div></div></div>";
    }

    // The exam form values: all classes, or the chosen classes and their sections
    function examDraft(e) {
        const first = S.classes[0] || { class: "" };
        const scope = e && e.scope ? e.scope : { all: true };
        const schedule = {};
        (e && Array.isArray(e.schedule) ? e.schedule : []).forEach(function (p) {
            schedule[p.class + "|" + p.subjectId] = p.date;
        });
        return {
            name: e ? e.name || "" : "",
            academicYear: e ? e.academicYear || "" : "",
            scopeAll: scope.all !== false,
            rows: scope.all === false && Array.isArray(scope.classes)
                ? scope.classes.map(function (c) { return { class: c.class, sections: (c.sections || []).slice() }; })
                : [],
            pickClass: first.class,
            pickSection: "__all",
            schedule: schedule
        };
    }

    // Adding classes to an exam: a class, then all its sections or one section
    function examClassPicker(d) {

        const cls = S.classes.find(function (c) { return c.class === d.pickClass; }) || { sections: [] };

        const classOpts = S.classes.map(function (c) {
            return "<option value=\"" + esc(c.class) + "\"" + (c.class === d.pickClass ? " selected" : "") + ">" + esc(classLabel(c.class)) + "</option>";
        }).join("");

        const secOpts = "<option value=\"__all\"" + (d.pickSection === "__all" ? " selected" : "") + ">All sections</option>" +
            cls.sections.map(function (sec) {
                return "<option value=\"" + esc(sec) + "\"" + (d.pickSection === sec ? " selected" : "") + ">Section " + esc(sec) + "</option>";
            }).join("");

        const list = d.rows.length
            ? "<ul class=\"ax-attention\">" + d.rows.map(function (r, i) {
                const all = (S.classes.find(function (x) { return x.class === r.class; }) || { sections: [] }).sections;
                const same = all.length === r.sections.length;
                return "<li>" + esc(classLabel(r.class)) + " · " + esc(same ? "All sections" : "Sections " + r.sections.join(", ")) +
                    " <button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-ac=\"rm-exam-class\" data-i=\"" + i + "\">Remove</button></li>";
              }).join("") + "</ul>"
            : "<p class=\"ax-muted\">No classes added yet.</p>";

        return "<div class=\"ax-grid\"><label class=\"ax-grow\"><span>Class</span><select id=\"acExClass\">" + classOpts + "</select></label>" +
            "<label class=\"ax-grow\"><span>Section</span><select id=\"acExSec\">" + secOpts + "</select></label></div>" +
            "<div class=\"ax-bar\" style=\"margin-top:0;border-top:0;padding-top:0\"><button type=\"button\" class=\"ax-btn\" data-ac=\"add-exam-class\">Add class</button></div>" +
            list;
    }

    function openExamEdit(id) {
        const e = S.exams.find(function (x) { return x.id === id; });
        if (!e) return;
        S.modal = { type: "exam", id: id, error: "", draft: examDraft(e) };
        renderModal();
    }

    function renderModal() {

        const m = S.modal;

        let html = "";

        if (m && m.type === "examView") {
            modalHost.innerHTML = "<div class=\"ax-root ax-root-top\">" + examViewHtml(m) + "</div>";
            document.body.classList.add("ax-noscroll");
            return;
        }

        if (m) {

            const isSubject = m.type === "subject";

            let body;
            let title;

            if (isSubject) {

                const d = m.draft;

                const cls = S.classes.find(function (c) { return c.class === d.class; }) || { sections: [] };

                const classOptions = S.classes.map(function (c) {
                    return "<option value=\"" + esc(c.class) + "\"" + (c.class === d.class ? " selected" : "") + ">" +
                        esc(classLabel(c.class)) + "</option>";
                }).join("");

                const secOptions =
                    "<option value=\"__all\"" + (d.section === "__all" ? " selected" : "") + ">All sections</option>" +
                    cls.sections.map(function (sec) {
                        return "<option value=\"" + esc(sec) + "\"" + (d.section === sec ? " selected" : "") + ">Section " + esc(sec) + "</option>";
                    }).join("") +
                    (d.section === "__custom"
                        ? "<option value=\"__custom\" selected>Sections " + esc((d.customSections || []).join(", ")) + "</option>"
                        : "");

                body =
                    "<label><span>Class</span><select id=\"acClassM\">" + classOptions + "</select></label>" +
                    "<label><span>Section</span><select id=\"acSecM\">" + secOptions + "</select></label>" +
                    field("Subject", "acName", d.name, " maxlength=\"60\" placeholder=\"e.g. English, Physics\"") +
                    field("Subject code (optional)", "acCode", d.code, " maxlength=\"12\" placeholder=\"e.g. ENG\"");

                title = m.id ? "Edit subject" : "Add subject";

            } else {

                const d = m.draft;

                body = field("Exam name", "acExamName", d.name, " maxlength=\"60\"") +
                    field("Academic year (e.g. 2026-27)", "acYear", d.academicYear, " maxlength=\"7\"") +
                    "<h4 class=\"ax-subtitle\">Which classes take this exam?</h4>" +
                    "<label class=\"ax-check\"><input type=\"radio\" name=\"acScope\" data-ac-scope=\"all\"" + (d.scopeAll ? " checked" : "") + "><span>All classes</span></label>" +
                    "<label class=\"ax-check\"><input type=\"radio\" name=\"acScope\" data-ac-scope=\"some\"" + (!d.scopeAll ? " checked" : "") + "><span>Selected classes</span></label>" +
                    (d.scopeAll ? "" : examClassPicker(d)) + examPapersHtml(d);

                title = m.id ? "Edit exam" : "Add exam";
            }

            html = "<div class=\"ax-backdrop\" data-ac=\"backdrop\"><div class=\"ax-modal\" role=\"dialog\" aria-modal=\"true\">" +
                "<div class=\"ax-modal-head\"><div><h3>" + esc(title) + "</h3></div>" +
                "<button type=\"button\" class=\"ax-icon\" data-ac=\"close\" aria-label=\"Close\">✕</button></div>" +
                "<div class=\"ax-modal-body\">" + body +
                (m.error ? "<div class=\"ax-msg ax-error\" role=\"alert\">" + esc(m.error) + "</div>" : "") +
                "<div class=\"ax-bar ax-bar-modal\"><button type=\"button\" class=\"ax-btn ax-primary\" data-ac=\"save\"" +
                (S.busy ? " disabled" : "") + ">" + (S.busy ? "Saving…" : "Save") + "</button>" +
                "<button type=\"button\" class=\"ax-btn\" data-ac=\"close\">Cancel</button></div>" +
                "</div></div></div>";
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


    // ---------- saving ----------

    async function save() {

        const m = S.modal;

        if (!m || S.busy) return;

        m.error = "";
        S.busy = true;
        renderModal();

        try {

            if (m.type === "subject") {

                await api("/api/academic/subjects/save", {
                    institutionId: S.inst,
                    class: m.draft.class,
                    subjectId: m.id || "",
                    name: m.draft.name,
                    code: m.draft.code,
                    sections: sectionsFromDraft(m.draft)
                });

                toast("Subject saved.", "ok");

            } else {

                await api("/api/academic/exams/save", {
                    institutionId: S.inst,
                    examId: m.id || "",
                    name: m.draft.name,
                    academicYear: m.draft.academicYear,
                    scope: m.draft.scopeAll
                        ? { all: true }
                        : { all: false, classes: m.draft.rows.map(function (r) { return { class: r.class, sections: r.sections }; }) },
                    schedule: examPaperRows(m.draft).map(function (r) {
                        return { class: r.class, subjectId: r.subjectId, date: m.draft.schedule[r.class + "|" + r.subjectId] || "" };
                    })
                });

                toast("Exam saved.", "ok");
            }

            await Promise.all([loadSubjects(), loadExams()]);

            closeModal();

            render();

        } catch (error) {

            S.busy = false;
            m.error = apiErrorText(error);

            renderModal();
        }
    }

    async function remove(type, id) {

        const list = type === "subject" ? S.subjects : S.exams;

        const item = list.find(function (x) { return x.id === id; });

        if (!item) return;

        if (!confirm("Delete \"" + item.name + "\"?")) return;

        try {

            await api(type === "subject" ? "/api/academic/subjects/delete" : "/api/academic/exams/delete",
                type === "subject" ? { institutionId: S.inst, subjectId: id } : { institutionId: S.inst, examId: id });

            await Promise.all([loadSubjects(), loadExams()]);

            toast("Deleted.", "ok");

            render();

        } catch (error) {

            toast(apiErrorText(error), "error");
        }
    }


    // ---------- events ----------

    if (root) {

        root.addEventListener("click", function (event) {

            const t = event.target.closest("[data-ac]");

            if (!t) return;

            const act = t.dataset.ac;
            const id = t.dataset.id;

            if (act === "tab") {

                S.tab = t.dataset.t;

                return render();
            }

            if (!S.canManage && act !== "tab") return;

            if (act === "add-subject") {

                S.modal = { type: "subject", id: "", error: "", draft: { class: (S.classes[0] || { class: "" }).class, section: "__all", customSections: [], name: "", code: "" } };

                return renderModal();
            }

            if (act === "edit-subject") {

                const s = S.subjects.find(function (x) { return x.id === id; });

                if (!s) return;

                S.modal = { type: "subject", id: id, error: "", draft: subjectDraft(s) };

                return renderModal();
            }

            if (act === "delete-subject") return remove("subject", id);

            if (act === "add-exam") {

                S.modal = { type: "exam", id: "", draft: examDraft(null), error: "" };

                return renderModal();
            }

            if (act === "edit-exam") {

                const e = S.exams.find(function (x) { return x.id === id; });

                if (!e) return;

                S.modal = {
                    type: "exam", id: id,
                    draft: examDraft(e),
                    error: ""
                };

                return renderModal();
            }

            if (act === "view-exam") { S.modal = { type: "examView", id: id }; return renderModal(); }
            if (act === "delete-exam") return remove("exam", id);
        });

        root.addEventListener("change", function (event) {

            const el = event.target;

            if (el.id === "acClass") {

                S.cls = el.value;

                render();
            }
        });
    }

    modalHost.addEventListener("click", function (event) {

        const t = event.target.closest("[data-ac]");

        if (!t) return;

        const act = t.dataset.ac;

        if (act === "backdrop") {
            if (event.target === t && !S.busy) closeModal();
            return;
        }

        if (act === "close" && !S.busy) return closeModal();

        if (act === "save") return save();

        if (act === "edit-exam") return openExamEdit(t.dataset.id);

        const d = S.modal && S.modal.type === "exam" ? S.modal.draft : null;

        if (!d) return;

        if (act === "add-exam-class") {

            const cls = S.classes.find(function (c) { return c.class === d.pickClass; });

            if (!cls) return;

            const sections = d.pickSection === "__all" ? cls.sections.slice() : [d.pickSection];

            const existing = d.rows.find(function (r) { return r.class === cls.class; });

            if (existing) {
                sections.forEach(function (sec) { if (!existing.sections.includes(sec)) existing.sections.push(sec); });
            } else {
                d.rows.push({ class: cls.class, sections: sections });
            }

            return renderModal();
        }

        if (act === "rm-exam-class") {
            d.rows.splice(Number(t.dataset.i), 1);
            return renderModal();
        }
    });
    modalHost.addEventListener("input", function (event) {

        const el = event.target;
        const d = S.modal && S.modal.draft;

        if (!d) return;

        if (el.id === "acName") d.name = el.value;
        else if (el.id === "acCode") d.code = el.value;
        else if (el.id === "acExamName") d.name = el.value;
        else if (el.id === "acYear") d.academicYear = el.value;
    });

    modalHost.addEventListener("change", function (event) {

        const el = event.target;
        const d = S.modal && S.modal.draft;

        if (!d) return;

        if (el.dataset.acPaper) {
            d.schedule[el.dataset.acPaper] = el.value;
            const tag = modalHost.querySelector("[data-ac-day=\"" + el.dataset.acPaper + "\"]");
            if (tag) tag.textContent = dayLabel(el.value);
            return;
        }

        if (el.dataset.acScope === "all") { d.scopeAll = true; return renderModal(); }
        if (el.dataset.acScope === "some") { d.scopeAll = false; return renderModal(); }

        if (el.id === "acExClass") { d.pickClass = el.value; d.pickSection = "__all"; return renderModal(); }
        if (el.id === "acExSec") { d.pickSection = el.value; return; }

        if (el.id === "acClassM") {
            d.class = el.value;
            d.section = "__all";
            d.customSections = [];
            return renderModal();
        }

        if (el.id === "acSecM") { d.section = el.value; return; }

    });
    document.addEventListener("keydown", function (event) {

        if (event.key === "Escape" && S.modal && !S.busy) closeModal();
    });


    return {
        setContext: setContext,
        reset: reset,
        open: open
    };
}