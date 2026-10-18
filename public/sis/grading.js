// ============================================================
// Academx SIS: Settings > Grading
//
// Reads:  gradingSettings/{institutionId} (browser)
// Writes: POST /api/grading/save (Render; checks the rules and keeps old versions)
//
// Default values are "to verify" against each board's published rules.
// The school confirms or changes them before results are published.
// app.js creates this with initGrading({ db, auth, apiBase, toast }).
// ============================================================

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// ---------- the four grading types and their defaults ----------

const GRADING_TYPES = [
    {
        value: "marks_percentage",
        label: "Marks percentage",
        help: "Each subject is scored out of 100. The result is a percentage, with optional divisions."
    },
    {
        value: "grade_points",
        label: "Grade points (CBSE-style)",
        help: "Each subject gets a grade and a grade point. The overall result is a CGPA."
    },
    {
        value: "letter_custom",
        label: "Letter grades (custom)",
        help: "Your own grade bands. Each subject gets a letter grade."
    },
    {
        value: "pass_fail",
        label: "Pass or fail",
        help: "Each subject is pass or fail. No grades or divisions."
    }
];

const STANDARD_COMPONENTS = [
    { name: "Internal assessment", weight: 20 },
    { name: "External exam", weight: 80 }
];

// "to verify" values, taken from common published rules. Confirm with the school.
const DEFAULTS = {
    marks_percentage: {
        components: STANDARD_COMPONENTS,
        bands: [],
        passRule: { minPercent: 33, allMustPass: true },
        divisions: {
            enabled: true,
            cutoffs: [
                { name: "First Division with Distinction", min: 75 },
                { name: "First Division", min: 60 },
                { name: "Second Division", min: 50 },
                { name: "Third Division", min: 33 }
            ]
        },
        rounding: { mode: "nearest" }
    },
    grade_points: {
        components: STANDARD_COMPONENTS,
        bands: [
            { minMarks: 91, grade: "A1", gradePoint: 10 },
            { minMarks: 81, grade: "A2", gradePoint: 9 },
            { minMarks: 71, grade: "B1", gradePoint: 8 },
            { minMarks: 61, grade: "B2", gradePoint: 7 },
            { minMarks: 51, grade: "C1", gradePoint: 6 },
            { minMarks: 41, grade: "C2", gradePoint: 5 },
            { minMarks: 33, grade: "D", gradePoint: 4 },
            { minMarks: 21, grade: "E1", gradePoint: 0 },
            { minMarks: 0, grade: "E2", gradePoint: 0 }
        ],
        passRule: { minPercent: 33, allMustPass: true },
        divisions: { enabled: false, cutoffs: [] },
        rounding: { mode: "nearest" }
    },
    letter_custom: {
        components: STANDARD_COMPONENTS,
        bands: [
            { minMarks: 75, grade: "A" },
            { minMarks: 60, grade: "B" },
            { minMarks: 45, grade: "C" },
            { minMarks: 33, grade: "D" },
            { minMarks: 0, grade: "F" }
        ],
        passRule: { minPercent: 33, allMustPass: true },
        divisions: { enabled: false, cutoffs: [] },
        rounding: { mode: "nearest" }
    },
    pass_fail: {
        components: STANDARD_COMPONENTS,
        bands: [],
        passRule: { minPercent: 33, allMustPass: true },
        divisions: { enabled: false, cutoffs: [] },
        rounding: { mode: "nearest" }
    }
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function defaultsFor(type) {
    return { gradingType: type, ...clone(DEFAULTS[type]) };
}


// ---------- the page ----------

export function initGrading(env) {

    const db = env.db;
    const auth = env.auth;
    const apiBase = env.apiBase;
    const toast = env.toast;

    const root = document.getElementById("gradingRoot");

    let S = fresh();

    function fresh() {
        return {
            inst: null,
            canManage: false,
            loaded: false,
            current: null,     // saved setup, or null if the school hasn't chosen yet
            form: defaultsFor("marks_percentage"),
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

    function typeInfo(value) {
        return GRADING_TYPES.find(function (t) { return t.value === value; }) || GRADING_TYPES[0];
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
    }

    function reset() {
        S = fresh();
        if (root) root.innerHTML = "";
    }

    function setActive() {
        document.querySelectorAll("[data-setnav]").forEach(function (item) {
            item.classList.toggle("active", item.dataset.setnav === "grading");
        });
    }


    // ---------- data ----------

    async function load() {

        const snap = await getDoc(doc(db, "gradingSettings/" + S.inst));

        S.current = snap.exists() ? snap.data() : null;

        S.form = S.current ? clone(S.current) : defaultsFor("marks_percentage");

        S.loaded = true;
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

        setActive();

        root.innerHTML = "<p class=\"ax-muted\">Loading…</p>";

        try {

            await load();

        } catch (error) {

            console.error("Grading load error:", error);

            root.innerHTML = "<p class=\"ax-error-text\">" + esc(
                error.code === "permission-denied"
                    ? "Firestore rules don't allow reading grading settings for this account yet."
                    : "Couldn't load grading settings. " + error.message
            ) + "</p>";

            return;
        }

        render();
    }

    function render() {

        if (!root) return;

        const f = S.form;

        const info = typeInfo(f.gradingType);

        const usesBands = f.gradingType === "grade_points" || f.gradingType === "letter_custom";

        const usesPoints = f.gradingType === "grade_points";

        const usesDivisions = f.gradingType === "marks_percentage";

        const dis = S.canManage ? "" : " disabled";

        const sum = f.components.reduce(function (n, c) { return n + (Number(c.weight) || 0); }, 0);

        const status = S.current
            ? "Version " + S.current.version + " · saved " + fmtDate(S.current.updatedAt)
            : "Not set up yet. Choose a grading type and save to start.";

        const head =
            "<div class=\"ax-head\"><div><h2 class=\"ax-title\">Grading</h2>" +
            "<p class=\"ax-sub\">How marks become results for this school. " + esc(status) + "</p></div></div>" +
            (S.canManage
                ? ""
                : "<div class=\"ax-msg ax-error\" role=\"status\">Only administrators can change grading. You can view it here.</div>") +
            (S.error ? "<div class=\"ax-msg ax-error\" role=\"alert\">" + esc(S.error) + "</div>" : "");

        // 1. Grading type
        const typeCards = GRADING_TYPES.map(function (t) {
            return "<label class=\"ax-typecard\"><input type=\"radio\" name=\"gdType\" data-gd=\"type\" value=\"" +
                t.value + "\"" + (f.gradingType === t.value ? " checked" : "") + dis + "><span><strong>" +
                esc(t.label) + "</strong>" + esc(t.help) + "</span></label>";
        }).join("");

        const typeSection =
            "<section class=\"ax-panel\"><h3 class=\"ax-panel-title\">1. Grading type</h3>" +
            "<div class=\"ax-typecards\">" + typeCards + "</div>" +
            "<p class=\"ax-muted\">Choosing a type loads its standard values. You can change every value below.</p>" +
            "</section>";

        // 2. Components
        const compRows = f.components.map(function (c, i) {
            return "<tr><td><input type=\"text\" data-gd=\"cname\" data-i=\"" + i + "\" value=\"" + esc(c.name) +
                "\" maxlength=\"40\"" + dis + "></td><td><input type=\"number\" data-gd=\"cweight\" data-i=\"" + i +
                "\" value=\"" + esc(c.weight) + "\" min=\"1\" max=\"100\" step=\"1\"" + dis + "></td><td>" +
                (S.canManage && f.components.length > 1
                    ? "<button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-gd=\"cdel\" data-i=\"" + i + "\">Remove</button>"
                    : "") + "</td></tr>";
        }).join("");

        const componentsSection =
            "<section class=\"ax-panel\"><h3 class=\"ax-panel-title\">2. Components and weights</h3>" +
            "<p class=\"ax-muted\">What makes up each subject's total. The weights must add up to 100. " +
            "They add up to <strong>" + sum + "</strong>" + (sum === 100 ? "" : " (should be 100)") + ".</p>" +
            "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Component</th><th>Weight %</th><th></th></tr></thead><tbody>" +
            compRows + "</tbody></table></div>" +
            (S.canManage && f.components.length < 6
                ? "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn\" data-gd=\"cadd\">Add component</button></div>"
                : "") +
            "</section>";

        // 3. Grade bands (letter and grade-point types)
        let bandsSection = "";

        if (usesBands) {

            const rows = f.bands.map(function (b, i) {

                const max = i === 0 ? 100 : f.bands[i - 1].minMarks - 1;

                return "<tr><td><input type=\"text\" data-gd=\"bgrade\" data-i=\"" + i + "\" value=\"" + esc(b.grade) +
                    "\" maxlength=\"5\"" + dis + "></td><td><input type=\"number\" data-gd=\"bmin\" data-i=\"" + i +
                    "\" value=\"" + esc(b.minMarks) + "\" min=\"0\" max=\"100\" step=\"1\"" + dis + "></td><td class=\"ax-muted\">" +
                    esc(max) + "</td>" + (usesPoints
                        ? "<td><input type=\"number\" data-gd=\"bpoint\" data-i=\"" + i + "\" value=\"" + esc(b.gradePoint) +
                          "\" min=\"0\" max=\"10\" step=\"0.1\"" + dis + "></td>"
                        : "") + "<td>" +
                    (S.canManage && f.bands.length > 2
                        ? "<button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-gd=\"bdel\" data-i=\"" + i + "\">Remove</button>"
                        : "") + "</td></tr>";
            }).join("");

            bandsSection =
                "<section class=\"ax-panel\"><h3 class=\"ax-panel-title\">3. Grade bands</h3>" +
                "<p class=\"ax-muted\">Each band runs from its minimum up to the row above. The top band ends at 100 and the lowest must start at 0.</p>" +
                "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Grade</th><th>From marks</th><th>To marks</th>" +
                (usesPoints ? "<th>Grade point</th>" : "") + "<th></th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
                (S.canManage && f.bands.length < 20
                    ? "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn\" data-gd=\"badd\">Add band</button></div>"
                    : "") +
                "</section>";
        }

        // 4. Pass rule
        const passSection =
            "<section class=\"ax-panel\"><h3 class=\"ax-panel-title\">" + (usesBands ? "4" : "3") + ". Pass rule</h3>" +
            "<div class=\"ax-grid\"><label><span>Minimum % to pass a subject</span>" +
            "<input type=\"number\" data-gd=\"pass\" value=\"" + esc(f.passRule.minPercent) + "\" min=\"0\" max=\"100\" step=\"1\"" + dis + "></label>" +
            "<label class=\"ax-check\"><input type=\"checkbox\" data-gd=\"allpass\"" + (f.passRule.allMustPass ? " checked" : "") + dis +
            "><span>A student must pass every subject</span></label></div></section>";

        // 5. Divisions (percentage type only)
        let divisionsSection = "";

        if (usesDivisions) {

            const cutoffRows = f.divisions.cutoffs.map(function (d, i) {
                return "<tr><td><input type=\"text\" data-gd=\"dname\" data-i=\"" + i + "\" value=\"" + esc(d.name) +
                    "\" maxlength=\"40\"" + dis + "></td><td><input type=\"number\" data-gd=\"dmin\" data-i=\"" + i +
                    "\" value=\"" + esc(d.min) + "\" min=\"0\" max=\"100\" step=\"1\"" + dis + "></td><td>" +
                    (S.canManage && f.divisions.cutoffs.length > 1
                        ? "<button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-gd=\"ddel\" data-i=\"" + i + "\">Remove</button>"
                        : "") + "</td></tr>";
            }).join("");

            divisionsSection =
                "<section class=\"ax-panel\"><h3 class=\"ax-panel-title\">5. Divisions</h3>" +
                "<label class=\"ax-check\"><input type=\"checkbox\" data-gd=\"dison\"" + (f.divisions.enabled ? " checked" : "") + dis +
                "><span>This school reports divisions</span></label>" +
                (f.divisions.enabled
                    ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Division name</th><th>From %</th><th></th></tr></thead><tbody>" +
                      cutoffRows + "</tbody></table></div>" +
                      (S.canManage && f.divisions.cutoffs.length < 6
                          ? "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn\" data-gd=\"dadd\">Add division</button></div>"
                          : "")
                    : "") +
                "</section>";
        }

        // 6. Rounding
        const roundSection =
            "<section class=\"ax-panel\"><h3 class=\"ax-panel-title\">" +
            (usesBands ? (usesDivisions ? "6" : "5") : (usesDivisions ? "6" : "4")) + ". Rounding</h3>" +
            "<label><span>How results are rounded</span><select data-gd=\"round\"" + dis + ">" +
            [["nearest", "To nearest whole number"], ["down", "Always down"], ["up", "Always up"]].map(function (r) {
                return "<option value=\"" + r[0] + "\"" + (f.rounding.mode === r[0] ? " selected" : "") + ">" + r[1] + "</option>";
            }).join("") + "</select></label></section>";

        const saveBar = S.canManage
            ? "<div class=\"ax-bar\"><button type=\"button\" class=\"ax-btn ax-primary\" data-gd=\"save\"" +
              (S.busy ? " disabled" : "") + ">" + (S.busy ? "Saving…" : "Save grading") + "</button></div>"
            : "";

        root.innerHTML = head + typeSection + componentsSection + bandsSection + passSection +
            divisionsSection + roundSection + saveSection(saveBar);
    }

    function saveSection(bar) {
        return "<section class=\"ax-panel\">" + bar + "<p class=\"ax-muted\">Saving keeps the previous version, so results already " +
            "calculated still show the rules they were worked out with.</p></section>";
    }


    // ---------- editing ----------

    function changeType(value) {

        const info = typeInfo(value);

        if (S.current || S.form.gradingType !== value) {

            if (!confirm("Load the standard values for " + info.label + "? This replaces the values on this page. Nothing is saved until you press Save.")) {
                render();
                return;
            }
        }

        S.form = defaultsFor(value);

        S.error = "";

        render();
    }

    function setField(el) {

        const f = S.form;

        const i = Number(el.dataset.i);

        const kind = el.dataset.gd;

        if (kind === "cname") f.components[i].name = el.value;
        else if (kind === "cweight") f.components[i].weight = el.value;
        else if (kind === "bgrade") f.bands[i].grade = el.value;
        else if (kind === "bmin") f.bands[i].minMarks = el.value;
        else if (kind === "bpoint") f.bands[i].gradePoint = el.value;
        else if (kind === "dname") f.divisions.cutoffs[i].name = el.value;
        else if (kind === "dmin") f.divisions.cutoffs[i].min = el.value;
        else if (kind === "pass") f.passRule.minPercent = el.value;
        else if (kind === "allpass") f.passRule.allMustPass = el.checked;
        else if (kind === "dison") {
            f.divisions.enabled = el.checked;
            if (el.checked && !f.divisions.cutoffs.length) {
                f.divisions.cutoffs = clone(DEFAULTS.marks_percentage.divisions.cutoffs);
            }
            render();
        }
        else if (kind === "round") f.rounding.mode = el.value;
    }

    async function save() {

        if (S.busy) return;

        const f = S.form;

        const usesBands = f.gradingType === "grade_points" || f.gradingType === "letter_custom";

        const payload = {
            institutionId: S.inst,
            gradingType: f.gradingType,
            components: f.components.map(function (c) {
                return { name: String(c.name).trim(), weight: Number(c.weight) };
            }),
            bands: usesBands
                ? f.bands.map(function (b) {
                    const row = { minMarks: Number(b.minMarks), grade: String(b.grade).trim() };
                    if (f.gradingType === "grade_points") row.gradePoint = Number(b.gradePoint);
                    return row;
                })
                : [],
            passRule: { minPercent: Number(f.passRule.minPercent), allMustPass: !!f.passRule.allMustPass },
            divisions: f.gradingType === "marks_percentage" && f.divisions.enabled
                ? {
                    enabled: true,
                    cutoffs: f.divisions.cutoffs.map(function (d) {
                        return { name: String(d.name).trim(), min: Number(d.min) };
                    })
                }
                : { enabled: false, cutoffs: [] },
            rounding: { mode: f.rounding.mode }
        };

        S.busy = true;
        S.error = "";
        render();

        try {

            const result = await api("/api/grading/save", payload);

            S.busy = false;

            await load();

            toast("Grading saved as version " + result.version + ".", "ok");

            render();

        } catch (error) {

            S.busy = false;
            S.error = apiErrorText(error);

            render();
        }
    }


    // ---------- events ----------

    if (root) {

        root.addEventListener("click", function (event) {

            const t = event.target.closest("[data-gd]");

            if (!t || !S.canManage) return;

            const f = S.form;

            const act = t.dataset.gd;

            const i = Number(t.dataset.i);

            if (act === "save") return save();

            if (act === "cadd") { f.components.push({ name: "New component", weight: 0 }); return render(); }
            if (act === "cdel") { f.components.splice(i, 1); return render(); }

            if (act === "badd") {
                const last = f.bands[f.bands.length - 1];
                f.bands.push({ minMarks: Math.max(0, Number(last.minMarks) - 10), grade: "", gradePoint: 0 });
                return render();
            }
            if (act === "bdel") { f.bands.splice(i, 1); return render(); }

            if (act === "dadd") { f.divisions.cutoffs.push({ name: "New division", min: 0 }); return render(); }
            if (act === "ddel") { f.divisions.cutoffs.splice(i, 1); return render(); }
        });

        root.addEventListener("change", function (event) {

            const el = event.target;

            if (!S.canManage) return;

            if (el.dataset.gd === "type") return changeType(el.value);

            if (el.dataset.gd) { setField(el); render(); }
        });

        root.addEventListener("input", function (event) {

            const el = event.target;

            if (!S.canManage || !el.dataset.gd || el.dataset.gd === "type" || el.dataset.gd === "round") return;

            setField(el);
        });
    }


    return {
        setContext: setContext,
        reset: reset,
        open: open
    };
}