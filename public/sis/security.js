// ============================================================
// Academx SIS: Security (admins only)
//
// Three views: the users list, the add-user form, and the edit page.
// Teacher role is one dropdown: Subject teacher, or Subject and class teacher.
// Class, section and subjects come from the Classes and Academic Records data.
//
// Reads:  users, classes, subjects, teachingAssignments
// Writes: POST /api/staff/create and POST /api/staff/assignments (Render)
// Attendance rules are not on this page. They are set in Settings > Attendance.
//
// app.js creates this with initSecurity({ db, auth, apiBase, toast, sendReset }).
// ============================================================

import {
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


export function initSecurity(env) {

    const db = env.db;
    const auth = env.auth;
    const apiBase = env.apiBase;
    const toast = env.toast;
    const sendReset = env.sendReset;

    const root = document.getElementById("securityRoot");

    let S = fresh();

    function fresh() {
        return {
            inst: null,
            isAdmin: false,
            staff: [],            // teachers and admins
            classes: [],          // { id, class, sections[], classTeachers{} }
            subjects: [],         // { id, class, name }
            assignments: [],      // teachingAssignments
            view: "list",         // list | add | edit
            editUid: null,
            draft: null,          // { role, teacherRole, subjects[], classSections{} }
            pick: { class: "", section: "" },
            cpick: { class: "", section: "", marks: false },
            add: { name: "", email: "", role: "teacher", teacherRole: "subject" },
            busy: false,
            error: "",
            notice: ""
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

    function keyOf(cls, sec, subjectId) {
        return cls + "|" + sec + "|" + subjectId;
    }

    function sectionsOf(cls) {
        const c = S.classes.find(function (x) { return x.class === cls; });
        return c ? c.sections : [];
    }

    function subjectsOf(cls) {
        return S.subjects.filter(function (s) { return s.class === cls; });
    }

    function nameOf(uid) {
        const p = S.staff.find(function (x) { return x.id === uid; });
        return p ? (p.name || p.email) : "another teacher";
    }

    function subjectNameOf(subjectId) {
        const s = S.subjects.find(function (x) { return x.id === subjectId; });
        return s ? s.name : subjectId;
    }

    function setContext(institutionId, role) {
        if (S.inst !== institutionId) S = fresh();
        S.inst = institutionId;
        S.isAdmin = role === "admin";
    }

    function reset() {
        S = fresh();
        if (root) root.innerHTML = "";
    }

    function roleLabel(p) {
        return p.role === "admin" ? "Admin" : "Teacher";
    }

    function teacherRoleLabel(p) {
        if (p.role === "admin") return "—";
        const tr = p.teacherRoles || {};
        if (tr.classTeacher) return "Subject and class teacher";
        if (tr.subject) return "Subject teacher";
        return "No role yet";
    }


    // ---------- data ----------

    async function load() {

        const [usersSnap, classSnap, subjSnap, assignSnap] = await Promise.all([
            getDocs(collection(db, "institutions/" + S.inst + "/users")),
            getDocs(query(collection(db, "classes"), where("institutionId", "==", S.inst))),
            getDocs(collection(db, "institutions/" + S.inst + "/subjects")),
            getDocs(collection(db, "institutions/" + S.inst + "/teachingAssignments"))
        ]);

        S.staff = usersSnap.docs
            .map(function (d) { return { id: d.id, ...d.data() }; })
            .filter(function (u) { return u.role === "teacher" || u.role === "admin"; })
            .sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || "")); });

        S.classes = classSnap.docs.map(function (d) {
            const x = d.data();
            return {
                id: d.id,
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
    }

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
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
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

        if (error.code === "api/unreachable") {
            return "The Academx service did not respond, so nothing was saved. Try again in a minute.";
        }

        if (error.code.indexOf("api/") === 0 && error.code !== "api/http-500") {
            return error.message;
        }

        return "The Academx service had a problem. Please try again.";
    }


    // ---------- page ----------

    async function open() {

        if (!root || !S.inst) return;

        if (!S.isAdmin) {
            root.innerHTML = "<div class=\"ax-msg ax-error\">Only administrators can manage users.</div>";
            return;
        }

        root.innerHTML = "<p class=\"ax-muted\">Loading…</p>";

        try {

            await load();

        } catch (error) {

            console.error("Security load error:", error);

            root.innerHTML = "<p class=\"ax-error-text\">" + esc(
                error.code === "permission-denied"
                    ? "Firestore rules don't allow reading users for this account yet."
                    : "Couldn't load users. " + error.message
            ) + "</p>";

            return;
        }

        S.view = "list";

        render();
    }

    function render() {

        if (!root) return;

        const msgs =
            (S.notice ? "<div class=\"ax-msg ax-ok\" role=\"status\">" + esc(S.notice) + "</div>" : "") +
            (S.error ? "<div class=\"ax-msg ax-error\" role=\"alert\">" + esc(S.error) + "</div>" : "");

        S.notice = "";
        S.error = "";

        let body;

        if (S.view === "add") body = addView();
        else if (S.view === "edit") body = editView();
        else body = listView();

        root.innerHTML = msgs + body;
    }


    // ----- list -----

    function listView() {

        const rows = S.staff.map(function (p) {
            return "<tr><td><strong>" + esc(p.name || "—") + "</strong></td><td>" + esc(p.email || "—") +
                "</td><td>" + esc(roleLabel(p)) + "</td><td>" + esc(teacherRoleLabel(p)) +
                "</td><td><button type=\"button\" class=\"ax-btn ax-sm\" data-s=\"edit\" data-id=\"" + esc(p.id) +
                "\">Edit</button></td></tr>";
        }).join("");

        return "<div class=\"ax-head\"><div><h2 class=\"ax-title\">Users</h2>" +
            "<p class=\"ax-sub\">Admins and teachers of your school. Each person sets their own password from an emailed link.</p></div>" +
            "<div class=\"ax-head-actions\"><button type=\"button\" class=\"ax-btn ax-primary\" data-s=\"add\">+ Add user</button></div></div>" +
            "<section class=\"ax-panel\">" +
            (S.staff.length
                ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Name</th><th>Email</th><th>Role</th>" +
                  "<th>Teacher role</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>"
                : "<div class=\"ax-empty\"><strong>No users yet</strong><p class=\"ax-muted\">Click + Add user to create the first teacher.</p></div>") +
            "</section>";
    }


    // ----- add -----

    function addView() {

        const a = S.add;

        const teacherPart = a.role === "teacher"
            ? "<label><span>Teacher role</span><select data-f=\"teacherRole\">" +
              "<option value=\"subject\"" + (a.teacherRole === "subject" ? " selected" : "") + ">Subject teacher</option>" +
              "<option value=\"both\"" + (a.teacherRole === "both" ? " selected" : "") + ">Subject and class teacher</option>" +
              "</select></label>" +
              "<p class=\"ax-muted\">A class teacher also teaches subjects. You'll pick their classes and subjects after saving.</p>"
            : "<p class=\"ax-muted\">Admins manage the school and users. They don't teach.</p>";

        return "<div class=\"ax-head\"><div><h2 class=\"ax-title\">Add user</h2></div>" +
            "<div class=\"ax-head-actions\"><button type=\"button\" class=\"ax-btn\" data-s=\"list\">Back to users</button></div></div>" +
            "<section class=\"ax-panel\"><div class=\"ax-grid\">" +
            "<label class=\"ax-grow\"><span>Full name</span><input type=\"text\" data-f=\"name\" value=\"" + esc(a.name) + "\" maxlength=\"100\"></label>" +
            "<label class=\"ax-grow\"><span>Email (used to sign in)</span><input type=\"text\" inputmode=\"email\" data-f=\"email\" value=\"" + esc(a.email) + "\" maxlength=\"254\"></label>" +
            "</div><div class=\"ax-grid\">" +
            "<label><span>Role</span><select data-f=\"role\">" +
            "<option value=\"teacher\"" + (a.role === "teacher" ? " selected" : "") + ">Teacher</option>" +
            "<option value=\"admin\"" + (a.role === "admin" ? " selected" : "") + ">Admin</option></select></label>" +
            "</div>" + teacherPart +
            "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn ax-primary\" data-s=\"create\"" + (S.busy ? " disabled" : "") + ">" +
            (S.busy ? "Creating…" : "Create and send password link") + "</button></div>" +
            "<p class=\"ax-muted\">They get an email to set their own password. Nobody else sees or sets it.</p>" +
            "</section>";
    }

    async function createUser() {

        const a = S.add;

        if (!a.name.trim() || !a.email.trim()) {
            S.error = "Enter the person's name and email.";
            return render();
        }

        const teacherRoles = a.role === "teacher"
            ? { subject: true, classTeacher: a.teacherRole === "both" }
            : null;

        S.busy = true;
        render();

        try {

            await api("/api/staff/create", {
                institutionId: S.inst,
                name: a.name.trim(),
                email: a.email.trim(),
                role: a.role,
                teacherRoles: teacherRoles
            });

            try {
                await sendReset(auth, a.email.trim());
            } catch (mailError) {
                console.error("Password email failed:", mailError);
                S.error = "The account was created, but the password email didn't send. Use Forgot password on the sign-in page.";
            }

            S.busy = false;
            S.add = { name: "", email: "", role: "teacher", teacherRole: "subject" };
            S.notice = S.error ? "" : "User created. A password setup email has been sent.";
            S.view = "list";

            await load();

            render();

        } catch (error) {

            S.busy = false;
            S.error = apiErrorText(error);

            render();
        }
    }


    // ----- edit -----

    function startEdit(uid) {

        const p = S.staff.find(function (x) { return x.id === uid; });

        if (!p) return;

        const tr = p.teacherRoles || {};

        const subjects = S.assignments
            .filter(function (a) { return a.teacherUid === uid; })
            .map(function (a) { return keyOf(a.class, a.section, a.subjectId); });

        const classSections = {};

        S.classes.forEach(function (c) {
            Object.keys(c.classTeachers).forEach(function (sec) {
                const entry = c.classTeachers[sec];
                if (entry && entry.uid === uid) {
                    classSections[c.class + "|" + sec] = { marksAttendance: !!entry.marksAttendance };
                }
            });
        });

        const firstClass = S.classes.find(function (c) { return c.sections.length; });

        S.editUid = uid;

        S.draft = {
            role: p.role === "admin" ? "admin" : "teacher",
            teacherRole: tr.classTeacher || Object.keys(classSections).length ? "both" : "subject",
            subjects: subjects,
            classSections: classSections
        };

        S.pick = { class: firstClass ? firstClass.class : "", section: firstClass ? firstClass.sections[0] : "" };
        S.cpick = { class: S.pick.class, section: S.pick.section, marks: false };

        S.view = "edit";

        render();
    }

    function editView() {

        const p = S.staff.find(function (x) { return x.id === S.editUid; });

        if (!p || !S.draft) return "";

        const d = S.draft;

        const head = "<div class=\"ax-head\"><div><h2 class=\"ax-title\">" + esc(p.name || p.email) + "</h2>" +
            "<p class=\"ax-sub\">" + esc(p.email) + " · " + esc(roleLabel(p)) + "</p></div>" +
            "<div class=\"ax-head-actions\"><button type=\"button\" class=\"ax-btn\" data-s=\"list\">Back to users</button></div></div>";

        const roleSelect = "<label><span>Role</span><select data-f=\"edit-role\">" +
            "<option value=\"teacher\"" + (d.role === "teacher" ? " selected" : "") + ">Teacher</option>" +
            "<option value=\"admin\"" + (d.role === "admin" ? " selected" : "") + ">Admin</option></select></label>";

        if (d.role === "admin") {
            return head + "<section class=\"ax-panel\">" + roleSelect +
                "<p class=\"ax-muted\">Admins manage the school and users. They don't teach.</p>" +
                "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn ax-primary\" data-s=\"save\"" + (S.busy ? " disabled" : "") + ">" +
                (S.busy ? "Saving…" : "Save") + "</button></div></section>";
        }

        const teacherRoleSelect = "<label><span>Teacher role</span><select data-f=\"edit-teacher-role\">" +
            "<option value=\"subject\"" + (d.teacherRole === "subject" ? " selected" : "") + ">Subject teacher</option>" +
            "<option value=\"both\"" + (d.teacherRole === "both" ? " selected" : "") + ">Subject and class teacher</option></select></label>";

        return head + "<section class=\"ax-panel\"><div class=\"ax-grid\">" + roleSelect + teacherRoleSelect + "</div>" +
            subjectPanel() +
            (d.teacherRole === "both" ? classTeacherPanel() : "") +
            "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn ax-primary\" data-s=\"save\"" + (S.busy ? " disabled" : "") + ">" +
            (S.busy ? "Saving…" : "Save") + "</button></div></section>";
    }

    function classSelect(value, action) {
        return "<label><span>Class</span><select data-f=\"" + action + "-class\">" +
            S.classes.map(function (c) {
                return "<option value=\"" + esc(c.class) + "\"" + (c.class === value ? " selected" : "") + ">" + esc(classLabel(c.class)) + "</option>";
            }).join("") + "</select></label>";
    }

    function sectionSelect(cls, value, action) {
        const secs = sectionsOf(cls);
        return "<label><span>Section</span><select data-f=\"" + action + "-section\">" +
            (secs.length
                ? secs.map(function (s) {
                    return "<option value=\"" + esc(s) + "\"" + (s === value ? " selected" : "") + ">Section " + esc(s) + "</option>";
                }).join("")
                : "<option value=\"\">No sections yet</option>") +
            "</select></label>";
    }

    // Subjects: pick a class and section, then tick the subjects already set up for that class
    function subjectPanel() {

        const d = S.draft;

        const cls = S.pick.class;
        const sec = S.pick.section;

        const subjects = subjectsOf(cls);

        const ticks = subjects.length
            ? subjects.map(function (s) {
                const k = keyOf(cls, sec, s.id);
                return "<label class=\"ax-check\"><input type=\"checkbox\" data-s=\"sub\" data-k=\"" + esc(k) + "\"" +
                    (d.subjects.includes(k) ? " checked" : "") + "><span>" + esc(s.name) + "</span></label>";
            }).join("")
            : "<p class=\"ax-muted\">No subjects are set up for this class yet. Add them under Academic Records first.</p>";

        const chosen = d.subjects.length
            ? "<ul class=\"ax-attention\">" + d.subjects.map(function (k) {
                const parts = k.split("|");
                return "<li>" + esc(classLabel(parts[0])) + " · Section " + esc(parts[1]) + " · " + esc(subjectNameOf(parts[2])) +
                    " <button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-s=\"rm-sub\" data-k=\"" + esc(k) + "\">Remove</button></li>";
            }).join("") + "</ul>"
            : "<p class=\"ax-muted\">No subjects chosen yet.</p>";

        return "<h4 class=\"ax-subtitle\">Subjects taught</h4>" +
            "<div class=\"ax-grid\">" + classSelect(cls, "pick") + sectionSelect(cls, sec, "pick") + "</div>" +
            "<div class=\"sx-checks\">" + ticks + "</div>" +
            "<p class=\"ax-muted\">Chosen subjects</p>" + chosen;
    }

    // Class teacher: pick a class and section, tick Marks attendance if they record it, then add
    function classTeacherPanel() {

        const d = S.draft;

        const cls = S.cpick.class;
        const sec = S.cpick.section;

        const owner = S.classes.find(function (c) { return c.class === cls; });
        const holder = owner ? owner.classTeachers[sec] : null;

        const warn = holder && holder.uid !== S.editUid
            ? "<p class=\"ax-muted\">Currently class teacher: " + esc(nameOf(holder.uid)) + ". Adding this section replaces them.</p>"
            : "";

        const chosen = Object.keys(d.classSections).length
            ? "<ul class=\"ax-attention\">" + Object.keys(d.classSections).map(function (k) {
                const parts = k.split("|");
                return "<li>" + esc(classLabel(parts[0])) + " · Section " + esc(parts[1]) +
                    (d.classSections[k].marksAttendance ? " · marks attendance" : "") +
                    " <button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-s=\"rm-ct\" data-k=\"" + esc(k) + "\">Remove</button></li>";
            }).join("") + "</ul>"
            : "<p class=\"ax-muted\">No class teacher sections chosen yet.</p>";

        return "<h4 class=\"ax-subtitle\">Class teacher of</h4>" +
            "<div class=\"ax-grid\">" + classSelect(cls, "cpick") + sectionSelect(cls, sec, "cpick") + "</div>" +
            warn +
            "<label class=\"ax-check\"><input type=\"checkbox\" data-s=\"cmarks\"" + (S.cpick.marks ? " checked" : "") +
            "><span>Marks attendance for this section</span></label>" +
            "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn\" data-s=\"cadd\"" + (cpickValid() ? "" : " disabled") + ">Set as class teacher</button></div>" +
            chosen;
    }

    function cpickValid() {
        return !!S.cpick.class && !!S.cpick.section;
    }

    async function saveUser() {

        const d = S.draft;

        const p = S.staff.find(function (x) { return x.id === S.editUid; });

        if (!p || !d) return;

        // Changing between teacher and admin isn't supported yet
        if (d.role !== p.role) {
            S.error = "Changing an existing user's role isn't supported yet. Create a new account for the new role.";
            return render();
        }

        const isTeacher = d.role === "teacher";

        const payload = {
            institutionId: S.inst,
            uid: S.editUid,
            teacherRoles: isTeacher
                ? { subject: true, classTeacher: d.teacherRole === "both" }
                : { subject: false, classTeacher: false },
            subjects: isTeacher
                ? d.subjects.map(function (k) {
                    const parts = k.split("|");
                    return { class: parts[0], section: parts[1], subjectId: parts[2] };
                })
                : [],
            classTeacherSections: isTeacher && d.teacherRole === "both"
                ? Object.keys(d.classSections).map(function (k) {
                    const parts = k.split("|");
                    return { class: parts[0], section: parts[1], marksAttendance: !!d.classSections[k].marksAttendance };
                })
                : []
        };

        S.busy = true;
        render();

        try {

            await api("/api/staff/assignments", payload);

            S.busy = false;
            S.notice = "Saved.";

            await load();

            startEdit(S.editUid);

            toast("Saved.", "ok");

        } catch (error) {

            S.busy = false;
            S.error = apiErrorText(error);

            render();
        }
    }


    // ---------- events ----------

    if (root) {

        root.addEventListener("click", function (event) {

            const t = event.target.closest("[data-s]");

            if (!t) return;

            const act = t.dataset.s;
            const d = S.draft;

            if (act === "add") { S.view = "add"; S.error = ""; return render(); }
            if (act === "list") { S.view = "list"; S.error = ""; return render(); }
            if (act === "create") return createUser();
            if (act === "edit") return startEdit(t.dataset.id);
            if (act === "save") return saveUser();

            if (!d) return;

            if (act === "rm-sub") {
                const k = t.dataset.k;
                d.subjects = d.subjects.filter(function (x) { return x !== k; });
                return render();
            }

            if (act === "cadd") {
                if (!cpickValid()) return;
                d.classSections[S.cpick.class + "|" + S.cpick.section] = { marksAttendance: !!S.cpick.marks };
                return render();
            }

            if (act === "rm-ct") {
                delete d.classSections[t.dataset.k];
                return render();
            }
        });

        root.addEventListener("change", function (event) {

            const el = event.target;

            const f = el.dataset.f;

            // Subject tick (checkbox)
            if (el.dataset.s === "sub" && S.draft) {
                const k = el.dataset.k;
                if (el.checked) {
                    if (!S.draft.subjects.includes(k)) S.draft.subjects.push(k);
                } else {
                    S.draft.subjects = S.draft.subjects.filter(function (x) { return x !== k; });
                }
                return render();
            }

            // Marks attendance tick for the class teacher form
            if (el.dataset.s === "cmarks") {
                S.cpick.marks = el.checked;
                return;
            }

            // Add-user form
            if (f === "name") { S.add.name = el.value; return; }
            if (f === "email") { S.add.email = el.value; return; }
            if (f === "role") { S.add.role = el.value; return render(); }
            if (f === "teacherRole") { S.add.teacherRole = el.value; return render(); }

            // Edit form
            if (f === "edit-role" && S.draft) { S.draft.role = el.value; return render(); }
            if (f === "edit-teacher-role" && S.draft) { S.draft.teacherRole = el.value; return render(); }

            // Subject section pickers
            if (f === "pick-class") {
                S.pick.class = el.value;
                S.pick.section = sectionsOf(el.value)[0] || "";
                return render();
            }
            if (f === "pick-section") { S.pick.section = el.value; return render(); }

            // Class teacher section pickers
            if (f === "cpick-class") {
                S.cpick.class = el.value;
                S.cpick.section = sectionsOf(el.value)[0] || "";
                return render();
            }
            if (f === "cpick-section") { S.cpick.section = el.value; return render(); }
        });

        root.addEventListener("input", function (event) {

            const el = event.target;

            if (el.dataset.f === "name") S.add.name = el.value;
            else if (el.dataset.f === "email") S.add.email = el.value;
        });
    }


    return {
        setContext: setContext,
        reset: reset,
        open: open
    };
}