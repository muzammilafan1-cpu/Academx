import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import { initPeople } from "./people.js";
import { initAttendance } from "./attendance.js";
import { initAcademic } from "./academic.js";
import { initRules } from "./rules.js";
import { initConfig } from "./config.js";
import { initMarks } from "./marks.js";
import { initSecurity } from "./security.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    collection,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// ============================================================
// FIREBASE CONFIGURATION
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyC0xiNgbWSDeKP7QHifTPPMGUa1PylRbqk",
    authDomain: "school-app-backend-38e01.firebaseapp.com",
    projectId: "school-app-backend-38e01",
    storageBucket: "school-app-backend-38e01.firebasestorage.app",
    messagingSenderId: "601113409800",
    appId: "1:601113409800:web:543470df04f660464d14bd",
    measurementId: "G-SCTKJLXJ38"
};


// ============================================================
// INITIALIZE FIREBASE
// ============================================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

// Academx API (Render). Student creation happens there, never in the browser.
const AX_API_BASE = "https://academx-gm8i.onrender.com";


// Home dashboard, Students and Classes live in people.js
const people = initPeople({
    db: db,
    auth: auth,
    apiBase: AX_API_BASE,
    toast: function (text, type) { axToast(text, type); }
});

const attendance = initAttendance({ db: db });

const rules = initRules({
    db: db,
    auth: auth,
    apiBase: AX_API_BASE,
    toast: function (text, type) { axToast(text, type); }
});

const config = initConfig({ db: db });

const security = initSecurity({
    db: db,
    auth: auth,
    apiBase: AX_API_BASE,
    toast: function (text, type) { axToast(text, type); },
    sendReset: function (authInstance, email) { return sendPasswordResetEmail(authInstance, email); }
});

const marks = initMarks({
    db: db,
    auth: auth,
    apiBase: AX_API_BASE,
    toast: function (text, type) { axToast(text, type); }
});

const academic = initAcademic({
    db: db,
    auth: auth,
    apiBase: AX_API_BASE,
    toast: function (text, type) { axToast(text, type); }
});


// ============================================================
// HTML ELEMENTS
// ============================================================

const loginScreen = document.getElementById("loginScreen");

const sisScreen = document.getElementById("sisScreen");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");

const loginButton = document.getElementById("loginButton");

const logoutButton = document.getElementById("logoutButton");

const forgotPasswordButton =
    document.getElementById("forgotPassword");


// ============================================================
// SHOW LOGIN SCREEN
// ============================================================

function showLoginScreen() {

    if (loginScreen) {
        loginScreen.classList.remove("hidden");
    }

    if (sisScreen) {
        sisScreen.classList.add("hidden");
    }
}


// ============================================================
// SHOW SIS
// ============================================================

function showSIS() {

    if (loginScreen) {
        loginScreen.classList.add("hidden");
    }

    if (sisScreen) {
        sisScreen.classList.remove("hidden");
    }

    showPage("home");
}


// ============================================================
// LOGIN
// ============================================================

async function login() {

    const email = emailInput.value.trim();

    const password = passwordInput.value;


    // --------------------------------------------------------
    // Validate fields
    // --------------------------------------------------------

    if (!email || !password) {

        alert("Please enter your email and password.");

        return;
    }


    // --------------------------------------------------------
    // Disable button while logging in
    // --------------------------------------------------------

    loginButton.disabled = true;

    loginButton.textContent = "Signing in...";


    try {

        console.log("Attempting Firebase login...");


        // ----------------------------------------------------
        // Firebase Authentication
        // ----------------------------------------------------

        const userCredential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );


        const user = userCredential.user;


        console.log(
            "Firebase authentication successful:",
            user.uid
        );


        // ----------------------------------------------------
        // Get Academx user profile
        // users/{Firebase UID}
        // ----------------------------------------------------

        const userRef =
            doc(db, "users", user.uid);


        const userSnapshot =
            await getDoc(userRef);


        // ----------------------------------------------------
        // User record not found
        // ----------------------------------------------------

        if (!userSnapshot.exists()) {

            await signOut(auth);

            alert(
                "Your Firebase account exists, but your Academx user profile was not found."
            );

            return;
        }


        const userData =
            userSnapshot.data();


        console.log(
            "Academx user profile:",
            userData
        );


        // ----------------------------------------------------
        // Check role
        // ----------------------------------------------------

        const role =
            userData.role;


        console.log(
            "User role:",
            role
        );


        // ----------------------------------------------------
        // Only ADMIN and TEACHER can access SIS
        // ----------------------------------------------------

        if (
            role !== "admin" &&
            role !== "teacher"
        ) {

            await signOut(auth);

            alert(
                "This account does not have access to Academx SIS."
            );

            return;
        }


        // ----------------------------------------------------
        // Check institution
        // ----------------------------------------------------

        if (!userData.institutionId) {

            await signOut(auth);

            alert(
                "Your account is not connected to an institution."
            );

            return;
        }


        console.log(
            "Institution:",
            userData.institutionId
        );


        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        console.log(
            "Academx SIS login successful."
        );


        // Give the Applications module the logged-in user's
        // role and institution (no institution is hard-coded).
        setApplicationsContext(user.uid, userData);


        showSIS();


    } catch (error) {

        console.error(
            "Firebase login error:",
            error
        );


        // ----------------------------------------------------
        // Firebase error messages
        // ----------------------------------------------------

        let message =
            "Login failed. Please try again.";


        switch (error.code) {

            case "auth/invalid-credential":

                message =
                    "Incorrect email or password.";

                break;


            case "auth/user-not-found":

                message =
                    "No Academx account was found with this email.";

                break;


            case "auth/wrong-password":

                message =
                    "Incorrect email or password.";

                break;


            case "auth/invalid-email":

                message =
                    "Please enter a valid email address.";

                break;


            case "auth/user-disabled":

                message =
                    "This account has been disabled.";

                break;


            case "auth/too-many-requests":

                message =
                    "Too many login attempts. Please try again later.";

                break;


            default:

                message =
                    error.message ||
                    "Login failed.";
        }


        alert(message);

    } finally {

        loginButton.disabled = false;

        loginButton.textContent = "Login";
    }
}


// ============================================================
// LOGOUT
// ============================================================

async function logout() {

    try {

        await signOut(auth);

        console.log(
            "Successfully logged out."
        );


        resetApplications();

        showLoginScreen();


        emailInput.value = "";

        passwordInput.value = "";


    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

    }
}


// ============================================================
// FORGOT PASSWORD
// ============================================================

async function forgotPassword(event) {

    event.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
        alert("Enter your email first, then press Forgot password.");
        return;
    }

    try {

        await sendPasswordResetEmail(auth, email);

    } catch (error) {

        console.error("Password reset error:", error);

        if (error.code === "auth/invalid-email") {
            alert("Please enter a valid email address.");
            return;
        }
    }

    // Same message whether or not the email is registered, so nobody can check who has an account
    alert("If this email is registered, a password reset link has been sent.");
}


// ============================================================
// PAGE NAVIGATION
// ============================================================

function showPage(
    page,
    clickedItem = null
) {

    // Older links used "grading" for Settings. Send them to Business rules.
    if (page === "grading") page = "rules";

    const pages = [
        "home",
        "students",
        "classes",
        "attendance",
        "applications",
        "academicRecords",
        "marks",
        "rules",
        "config",
        "security"
    ];


    // --------------------------------------------------------
    // Hide all pages
    // --------------------------------------------------------

    pages.forEach(function (item) {

        const element =
            document.getElementById(
                item + "Page"
            );


        if (element) {

            element.classList.add("hidden");
        }

    });


    // --------------------------------------------------------
    // Show selected page
    // --------------------------------------------------------

    const selectedPage =
        document.getElementById(
            page + "Page"
        );


    if (selectedPage) {

        selectedPage.classList.remove(
            "hidden"
        );
    }


    // --------------------------------------------------------
    // Remove active navigation
    // --------------------------------------------------------

    document
        .querySelectorAll(".nav-item")
        .forEach(function (item) {

            item.classList.remove(
                "active"
            );

        });


    // --------------------------------------------------------
    // Add active navigation
    // --------------------------------------------------------

    if (clickedItem) {

        clickedItem.classList.add(
            "active"
        );

    } else {

        const homeNav =
            document.getElementById(
                "homeNav"
            );


        if (homeNav) {

            homeNav.classList.add(
                "active"
            );
        }
    }


    // --------------------------------------------------------
    // Update page title
    // --------------------------------------------------------

    const titles = {

        home: "Home",

        students: "Students",

        classes: "Classes",

        rules: "Business rules",

        marks: "Marks",

        config: "Configuration",

        attendance: "Attendance",

        applications: "Applications",

        academicRecords:
            "Academic Records",

        security: "Security"
    };


    const pageTitle =
        document.getElementById(
            "pageTitle"
        );


    if (pageTitle) {

        pageTitle.textContent =
            titles[page] ||
            "Academx SIS";
    }


    // --------------------------------------------------------
    // Load the Applications module when its page is opened
    // --------------------------------------------------------

    const applicationsGroup =
        document.getElementById(
            "applicationsGroup"
        );


    if (applicationsGroup) {

        applicationsGroup.classList.toggle(
            "open",
            page === "applications"
        );
    }


    if (page === "applications") {

        openApplications({ refresh: true });
    }

    if (page === "home") people.openHome();

    if (page === "students") people.openStudents();

    if (page === "classes") people.openClasses();

    if (page === "attendance") attendance.open();

    if (page === "academicRecords") {
        academic.open(pendingAcademicTab || "subjects");
        pendingAcademicTab = null;
    }

    if (page === "rules") rules.open();

    if (page === "config") config.open();

    if (page === "marks") marks.open();

    if (page === "security") security.open();

    const settingsGroup = document.getElementById("settingsGroup");
    if (settingsGroup) settingsGroup.classList.toggle("open", page === "rules" || page === "config");

    const academicGroup = document.getElementById("academicGroup");
    if (academicGroup) academicGroup.classList.toggle("open", ["academicRecords", "classes", "marks"].includes(page));
}


// The navigation items in index.html use inline onclick="showPage(...)".
// Because app.js is an ES module, showPage is not global by default,
// so it is exposed explicitly here.

window.showPage = showPage;

// Academic Records sub-items: open the page on a chosen tab (subjects or exams)
let pendingAcademicTab = null;
window.openAcademic = function (tab, clickedItem) {
    pendingAcademicTab = tab;
    showPage("academicRecords", clickedItem || null);
};


// ============================================================
// APPLICATIONS MODULE
//
// Forms (what applicants fill out):
//   institutions/{institutionId}/applicationForms/{formId}
// Applications (what people have submitted):
//   institutions/{institutionId}/applications/{applicationId}
//
// Sidebar:  Applications
//             Forms
//             Applications -> All / Submitted / Under Review /
//                             Approved / Rejected
// ============================================================

const appsRoot = document.getElementById("applicationsRoot");

const AX_FIELD_TYPES = [
    { value: "text",     label: "Text" },
    { value: "email",    label: "Email" },
    { value: "phone",    label: "Phone" },
    { value: "number",   label: "Number" },
    { value: "date",     label: "Date" },
    { value: "select",   label: "Dropdown" },
    { value: "radio",    label: "Radio" },
    { value: "checkbox", label: "Checkbox" },
    { value: "textarea", label: "Long text" }
];

// Types that can carry an options list (checkbox: optional; none = single box)
const AX_OPTION_TYPES = ["select", "radio", "checkbox"];
const AX_OPTIONS_REQUIRED = ["select", "radio"];

// Applicants must never supply these; the system assigns them.
const AX_RESERVED = [
    "role", "institutionid", "uid", "status",
    "createdat", "updatedat", "formid", "applicationid"
];

const AX_STATUSES = ["submitted", "under_review", "approved", "rejected"];

const AX_STATUS_LABEL = {
    all: "All",
    submitted: "Submitted",
    under_review: "Under Review",
    approved: "Approved",
    rejected: "Rejected"
};

const AX_PAGE_SIZE = 50;

function axFreshState() {
    return {
        uid: null,
        role: null,
        institutionId: null,
        canManage: false,
        loaded: false,

        view: "forms",            // "forms" | "applications" | "enquiries"
        formsMode: "list",        // "list" | "create"
        formsFilter: "all",       // all | active | draft | closed

        appStatus: "all",         // all | submitted | under_review | approved | rejected
        appSearch: "",
        appForm: "all",
        appLimit: AX_PAGE_SIZE,

        forms: [],
        applications: [],
        enquiries: [],
        classOptions: [],
        sectionOptions: [],
        draft: null,
        modal: null,              // { type: "app" | "form" | "enquiry", id }
        msg: null
    };
}

let AX = axFreshState();


// ---------- context from login ----------

function setApplicationsContext(uid, userData) {

    if (AX.uid !== uid) {
        AX = axFreshState();
    }

    AX.uid = uid;
    AX.role = userData.role;
    AX.institutionId = userData.institutionId;
    AX.canManage = userData.role === "admin";

    people.setContext(uid, userData);
    attendance.setContext(userData.institutionId);
    academic.setContext(userData.institutionId, userData.role);
    marks.setContext(userData.institutionId, uid, userData.role, userData.teacherRoles);
    rules.setContext(userData.institutionId, userData.role);
    config.setContext(userData.institutionId);
    security.setContext(userData.institutionId, userData.role);

    // Only admins see Security in the menu
    const securityNav = document.getElementById("securityNav");
    if (securityNav) securityNav.classList.toggle("hidden", userData.role !== "admin");
}

function resetApplications() {

    AX = axFreshState();

    people.reset();
    attendance.reset();
    academic.reset();
    marks.reset();
    rules.reset();
    config.reset();
    security.reset();

    if (appsRoot) {
        appsRoot.innerHTML = "";
    }

    axRenderModal();
    axSyncNav();
}


// ---------- helpers ----------

function axEsc(value) {

    return String(value ?? "").replace(/[&<>"']/g, function (c) {
        return {
            "&": "&amp;", "<": "&lt;", ">": "&gt;",
            '"': "&quot;", "'": "&#39;"
        }[c];
    });
}

function axSlug(text) {

    return String(text)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function axRand() {
    return Math.random().toString(36).slice(2, 8);
}

function axCap(text) {

    return String(text || "").replace(/^./, function (c) { return c.toUpperCase(); });
}

function axAcademicYears() {

    const y = new Date().getFullYear();
    const out = [];

    for (let s = y - 1; s <= y + 3; s++) {
        out.push(s + "-" + String(s + 1).slice(2));
    }

    return out;
}

function axDefaultYear() {

    const d = new Date();
    const y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;

    return y + "-" + String(y + 1).slice(2);
}

function axNewField(label = "", type = "text", required = false, options = []) {

    return {
        key: axRand(),
        label: label,
        type: type,
        required: required,
        optionsText: options.join("\n")
    };
}

// Class and Section start with the values from your Classes list,
// so applications match the classes used by attendance and timetables.
// A Class or Section field takes its choices from the Classes list, not typed by hand
function axSourceOf(f) {

    if (f.type !== "select" && f.type !== "radio") return null;

    if (/^class\b/i.test(String(f.label || ""))) return "class";

    if (/^section\b/i.test(String(f.label || ""))) return "section";

    return null;
}

function axSourceOptions(source) {

    return source === "class" ? AX.classOptions : AX.sectionOptions;
}

function axSourceNote(source) {

    const list = axSourceOptions(source);

    const noun = source === "class" ? "class" : "section";

    if (!list.length) {

        return "<p class=\"ax-info\">No " + noun + "s are set up yet. Go to <strong>Classes</strong> in the menu, " +
            "add them, then come back to this form.</p>";
    }

    return "<p class=\"ax-muted ax-opts\">Choices come from your Classes list (" + list.length + " " + noun +
        (list.length === 1 ? "" : "s") + "). To change them, edit Classes in the menu.</p>";
}

// Fields every onboarding form has. They are always present, always required,
// and can't be renamed, retyped or deleted. Other fields are added after them.
const AX_CORE_FIELDS = [
    { label: "Student Name",   type: "text"   },
    { label: "Email",          type: "email"  },
    { label: "Contact Number", type: "phone"  },
    { label: "Class",          type: "select" },
    { label: "Section",        type: "select" }
];

// Forms created before form types existed are onboarding forms
function axFormTypeOf(form) {
    return form && (form.formType === "custom" || form.formType === "enquiry") ? "custom" : "onboarding";
}

function axLockedField(core) {

    const f = axNewField(core.label, core.type, true);

    f.locked = true;

    return f;
}

function axStarterFields(formType) {

    return formType === "custom" ? [] : AX_CORE_FIELDS.map(function (c) { return axLockedField(c); });
}

async function axLoadClassOptions() {

    try {

        const classes = await people.loadClasses(true);

        const sections = new Set();

        classes.forEach(function (c) {
            c.sections.forEach(function (x) { sections.add(x); });
        });

        const numeric = function (a, b) {
            return String(a).localeCompare(String(b), undefined, { numeric: true });
        };

        AX.classOptions = classes.map(function (c) { return c.class; }).filter(Boolean).sort(numeric);
        AX.sectionOptions = Array.from(sections).sort(numeric);

    } catch (error) {

        // Not fatal: the form builder falls back to default options
        console.warn("Couldn't load classes for the form builder:", error);

        AX.classOptions = [];
        AX.sectionOptions = [];
    }
}

function axBlankDraft(formType) {

    const type = formType === "custom" ? "custom" : "onboarding";

    return {
        formId: null,
        isNew: true,
        keepStatus: null,
        formType: type,
        name: "",
        description: "",
        academicYear: axDefaultYear(),
        fields: axStarterFields(type)
    };
}

function axParseOptions(text) {

    return [...new Set(
        String(text || "")
            .split("\n")
            .map(function (s) { return s.trim(); })
            .filter(Boolean)
    )];
}

function axFmtDate(ts) {

    return ts && ts.toDate
        ? ts.toDate().toLocaleDateString(undefined, {
            day: "numeric", month: "short", year: "numeric"
        })
        : "—";
}

function axFmtDateTime(ts) {

    return ts && ts.toDate
        ? ts.toDate().toLocaleString(undefined, {
            day: "numeric", month: "short", year: "numeric",
            hour: "numeric", minute: "2-digit"
        })
        : "—";
}

function axBase() {
    return "institutions/" + AX.institutionId;
}

function axFlash(type, text) {
    AX.msg = { type: type, text: text };
}

const AX_PUBLIC_BASE_URL = "https://academx.in";

function axApplyLink(formId) {
    return AX_PUBLIC_BASE_URL + "/apply/" +
        encodeURIComponent(AX.institutionId) + "/" +
        encodeURIComponent(formId);
}

// A form created before the builder existed (e.g. admission_2026)
// has no fields array.
function axIsLegacy(form) {
    return !Array.isArray(form.fields) || form.fields.length === 0;
}

function axFormById(id) {
    return AX.forms.find(function (f) { return f.id === id; });
}

function axAppById(id) {
    return AX.applications.find(function (a) { return a.id === id; });
}

// Responses to a form, from either kind of form
function axAppCount(formId) {

    return AX.applications.filter(function (a) { return a.formId === formId; }).length +
        AX.enquiries.filter(function (e) { return e.formId === formId; }).length;
}

function axStatusOf(app) {
    return AX_STATUSES.includes(app.status) ? app.status : "submitted";
}

function axStatusCounts() {

    const counts = { all: AX.applications.length };

    AX_STATUSES.forEach(function (s) { counts[s] = 0; });

    AX.applications.forEach(function (a) { counts[axStatusOf(a)] += 1; });

    return counts;
}

function axBadge(status) {

    const label = AX_STATUS_LABEL[status] || axCap(status) || "Unknown";

    return "<span class=\"ax-pill ax-" + axEsc(status) + "\">" + axEsc(label) + "</span>";
}

// Value of a submitted field, ready to display
function axFmtValue(value) {

    if (value === undefined || value === null || value === "") return "—";

    if (Array.isArray(value)) return value.length ? value.join(", ") : "—";

    if (typeof value === "boolean") return value ? "Yes" : "No";

    return String(value);
}

// Pulls the main details out of an application, using the form
// definition when it is available.
function axSummary(app) {

    const form = axFormById(app.formId);

    const fields = form && Array.isArray(form.fields) ? form.fields : [];

    const d = app.data || {};

    function byType(type) {

        const f = fields.find(function (x) {
            return x.type === type && d[x.id] !== undefined && d[x.id] !== "";
        });

        return f ? d[f.id] : "";
    }

    function byLabel(pattern, id) {

        if (d[id] !== undefined && d[id] !== "") return d[id];

        const f = fields.find(function (x) {
            return pattern.test(x.label) && typeof d[x.id] === "string" && d[x.id] !== "";
        });

        return f ? d[f.id] : "";
    }

    return {
        name: byLabel(/name/i, "student_name") || app.studentName || app.name || "Unnamed applicant",
        email: byType("email") || d.email || "",
        phone: byType("phone") || d.contact_number || "",
        cls: byLabel(/^class\b/i, "class"),
        section: byLabel(/^section\b/i, "section"),
        formName: app.formName || (form && form.name) || app.formId || "—"
    };
}


// ---------- toast + clipboard ----------

// Small message shown at the bottom of the screen, so feedback is
// visible wherever the page is scrolled.
function axToast(text, type) {

    const old = document.getElementById("axToast");

    if (old) old.remove();

    const el = document.createElement("div");

    el.id = "axToast";
    el.className = "ax-toast ax-toast-" + (type || "ok");
    el.setAttribute("role", "status");
    el.textContent = text;

    document.body.appendChild(el);

    setTimeout(function () {
        if (el.parentNode) el.remove();
    }, 3500);
}

// Copies text to the clipboard. Returns true on success.
async function axCopyText(text) {

    // Modern API (needs https, which academx.in uses)
    if (navigator.clipboard && window.isSecureContext) {

        try {

            await navigator.clipboard.writeText(text);

            return true;

        } catch (error) {

            console.warn("Clipboard API failed, trying fallback:", error);
        }
    }

    // Fallback for browsers that block the Clipboard API
    try {

        const box = document.createElement("textarea");

        box.value = text;
        box.setAttribute("readonly", "");
        box.style.position = "fixed";
        box.style.top = "0";
        box.style.left = "0";
        box.style.opacity = "0";

        document.body.appendChild(box);

        box.focus();
        box.select();
        box.setSelectionRange(0, text.length);

        const ok = document.execCommand("copy");

        document.body.removeChild(box);

        return ok;

    } catch (error) {

        console.warn("Fallback copy failed:", error);

        return false;
    }
}

function axCopyLink(formId, button) {

    const link = axApplyLink(formId);

    const originalLabel = button ? button.textContent : "";

    axCopyText(link).then(function (copied) {

        if (copied) {

            axToast("Link copied!", "ok");

            if (button) {

                button.textContent = "Copied!";

                setTimeout(function () {
                    button.textContent = originalLabel;
                }, 2000);
            }

        } else {

            // Clipboard blocked: show the link so it can be copied by hand
            axToast("Couldn't copy automatically. Copy the link from the box.", "error");

            window.prompt("Copy this link (Ctrl+C):", link);
        }
    });
}


// ---------- Firestore: forms ----------

async function axLoadForms() {

    const snap = await getDocs(
        collection(db, axBase() + "/applicationForms")
    );

    AX.forms = snap.docs
        .map(function (d) { return { id: d.id, ...d.data() }; })
        .sort(function (a, b) {
            return ((b.createdAt && b.createdAt.seconds) || 0) -
                   ((a.createdAt && a.createdAt.seconds) || 0);
        });
}

function axValidate(d) {

    if (!d.name.trim()) return "Enter a form name.";
    if (!d.academicYear) return "Select an academic year.";

    if (!d.fields.length) {
        return d.formType === "custom" ? "Add at least one question." : "Add at least one field.";
    }

    if (d.formType !== "custom") {

        const have = d.fields.map(function (f) { return axSlug(f.label); });

        const missing = AX_CORE_FIELDS.filter(function (c) {
            return !have.includes(axSlug(c.label));
        });

        if (missing.length) {
            return "An onboarding form needs these fields: " +
                AX_CORE_FIELDS.map(function (c) { return c.label; }).join(", ") + ".";
        }
    }

    const seen = new Set();

    for (const f of d.fields) {

        if (!f.label.trim()) return "Every field needs a label.";

        const id = axSlug(f.label);

        if (!id) {
            return "\"" + f.label + "\" needs letters or numbers in its label.";
        }

        if (AX_RESERVED.includes(id.replace(/_/g, ""))) {
            return "\"" + f.label + "\" is reserved by the system. Rename the field.";
        }

        if (seen.has(id)) {
            return "Two fields share the label \"" + f.label + "\". Labels must be unique.";
        }

        seen.add(id);

        const source = axSourceOf(f);

        if (source) {

            if (!axSourceOptions(source).length) {
                return "Your \"" + f.label + "\" field takes its choices from Classes, and none are set up yet. " +
                    "Go to Classes in the menu, create your classes and sections, then come back to this form.";
            }

            continue;
        }

        if (AX_OPTIONS_REQUIRED.includes(f.type) && axParseOptions(f.optionsText).length < 2) {
            return "\"" + f.label + "\" needs at least two options.";
        }
    }

    return null;
}

function axBuildFields(d) {

    return d.fields.map(function (f) {

        const out = {
            id: axSlug(f.label),
            label: f.label.trim(),
            type: f.type,
            required: !!f.required
        };

        const source = axSourceOf(f);

        if (source) {

            out.options = axSourceOptions(source).slice();

        } else if (AX_OPTION_TYPES.includes(f.type)) {

            const options = axParseOptions(f.optionsText);

            if (options.length) {
                out.options = options;
            }
        }

        return out;
    });
}

async function axSaveForm(status) {

    const d = AX.draft;

    // Always check against the current Classes list when saving
    await axLoadClassOptions();

    const error = axValidate(d);

    if (error) {
        axFlash("error", error);
        return axRender();
    }

    const payload = {
        name: d.name.trim(),
        description: d.description.trim(),
        academicYear: d.academicYear,
        formType: d.formType === "custom" ? "custom" : "onboarding",
        status: status,
        fields: axBuildFields(d),
        updatedAt: serverTimestamp()
    };

    try {

        if (d.isNew) {

            let formId =
                axSlug(d.name + " " + d.academicYear) ||
                "form_" + axRand();

            const existing = await getDoc(
                doc(db, axBase() + "/applicationForms", formId)
            );

            if (existing.exists()) {
                formId += "_" + axRand().slice(0, 3);
            }

            await setDoc(
                doc(db, axBase() + "/applicationForms", formId),
                {
                    ...payload,
                    createdAt: serverTimestamp(),
                    createdBy: AX.uid
                }
            );

        } else {

            await updateDoc(
                doc(db, axBase() + "/applicationForms", d.formId),
                payload
            );
        }

        await axLoadForms();

        AX.draft = null;
        AX.view = "forms";
        AX.formsMode = "list";

        axFlash(
            "ok",
            status === "active"
                ? "Published \"" + payload.name + "\"."
                : d.keepStatus
                    ? "Saved \"" + payload.name + "\"."
                    : "Saved \"" + payload.name + "\" as a draft."
        );

    } catch (error) {

        console.error("Save form error:", error);

        axFlash(
            "error",
            error.code === "permission-denied"
                ? "Firestore rules blocked this save. Add the rules for applicationForms."
                : "Couldn't save the form. " + error.message
        );
    }

    axRender();
}

async function axSetStatus(formId, status) {

    try {

        await updateDoc(
            doc(db, axBase() + "/applicationForms", formId),
            { status: status, updatedAt: serverTimestamp() }
        );

        await axLoadForms();

        axFlash("ok", status === "closed" ? "Form closed." : "Form reopened.");

    } catch (error) {

        console.error("Update form status error:", error);

        axFlash("error", "Couldn't update the form. " + error.message);
    }

    axRender();
}

// Forms with no submissions (and all drafts) can be deleted.
function axCanDeleteForm(form) {

    return AX.canManage && (form.status === "draft" || axAppCount(form.id) === 0);
}

// Fields can be edited while nobody has applied yet, so that
// existing applications always match their form.
function axCanEditForm(form) {

    return AX.canManage &&
        (form.status === "draft" || axIsLegacy(form) || axAppCount(form.id) === 0);
}

async function axDeleteForm(formId) {

    const form = axFormById(formId);

    if (!form || !axCanDeleteForm(form)) return;

    if (!confirm("Delete the form \"" + form.name + "\"? This can't be undone.")) {
        return;
    }

    try {

        await deleteDoc(
            doc(db, axBase() + "/applicationForms", formId)
        );

        await axLoadForms();

        axFlash("ok", "Form deleted.");

    } catch (error) {

        console.error("Delete form error:", error);

        axFlash("error", "Couldn't delete the form. " + error.message);
    }

    axRender();
}

// Fields for the editor. Onboarding forms always get the core fields first,
// even if an older form doesn't have them yet.
function axFieldsForEdit(form, formType) {

    const stored = Array.isArray(form.fields) ? form.fields : [];

    const fromStored = function (f) {
        return axNewField(f.label, f.type, f.required, f.options || []);
    };

    if (formType !== "onboarding") {
        return stored.map(fromStored);
    }

    const coreIds = AX_CORE_FIELDS.map(function (c) { return axSlug(c.label); });

    const core = AX_CORE_FIELDS.map(function (c) {

        const found = stored.find(function (f) { return axSlug(f.label) === axSlug(c.label); });

        const f = found ? fromStored(found) : axNewField(c.label, c.type, true);

        f.label = c.label;
        f.type = c.type;
        f.required = true;
        f.locked = true;

        return f;
    });

    const extra = stored
        .filter(function (f) { return !coreIds.includes(axSlug(f.label)); })
        .map(fromStored);

    return core.concat(extra);
}

function axEditForm(formId) {

    const form = axFormById(formId);

    if (!form || !axCanEditForm(form)) return;

    const formType = axFormTypeOf(form);

    AX.draft = {
        formId: formId,
        isNew: false,
        keepStatus: form.status === "draft" ? null : form.status,
        formType: formType,
        name: form.name || "",
        description: form.description || "",
        academicYear: form.academicYear || axDefaultYear(),
        fields: axFieldsForEdit(form, formType)
    };

    AX.view = "forms";
    AX.formsMode = "create";
    AX.modal = null;

    axRender();
}


// ---------- Firestore: applications ----------

async function axLoadApplications() {

    const snap = await getDocs(
        collection(db, axBase() + "/applications")
    );

    function when(a) {
        const ts = a.submittedAt || a.createdAt;
        return (ts && ts.seconds) || 0;
    }

    AX.applications = snap.docs
        .map(function (d) { return { id: d.id, ...d.data() }; })
        .sort(function (a, b) { return when(b) - when(a); });
}

// Moves an application to a new status.
// Approval does NOT create an account or student record yet;
// that is a later phase. It only records the decision.
async function axUpdateApplicationStatus(appId, newStatus) {

    const app = axAppById(appId);

    if (!app) return;

    const current = axStatusOf(app);

    const allowed = {
        submitted: ["under_review", "approved", "rejected"],
        under_review: ["approved", "rejected"],
        rejected: ["under_review"],
        approved: []
    };

    if (!allowed[current].includes(newStatus)) return;

    const name = axSummary(app).name;

    if (newStatus === "approved" &&
        !confirm("Approve the application from " + name + "?\n\nThis creates the student's Academx record. The student then activates their own account and sets their own password in the Academx app.")) {
        return;
    }

    if (newStatus === "rejected" &&
        !confirm("Reject the application from " + name + "?")) {
        return;
    }

    const noteBox = document.getElementById("axReviewNote");

    const note = noteBox ? noteBox.value.trim().slice(0, 1000) : "";

    const update = {
        status: newStatus,
        reviewedBy: AX.uid,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    if (note) update.reviewNote = note;

    try {

        const ref = doc(db, axBase() + "/applications", appId);

        if (newStatus === "approved") {

            // Approval is done by a Cloud Function: it validates the application,
            // records the student, and cannot create duplicates.
            await axCallApprove(appId, note);

        } else {

            await updateDoc(ref, update);
        }

        const fresh = await getDoc(ref);

        if (fresh.exists()) {

            const index = AX.applications.findIndex(function (a) { return a.id === appId; });

            if (index >= 0) AX.applications[index] = { id: appId, ...fresh.data() };
        }

        if (noteBox) noteBox.value = "";

        axToast(
            newStatus === "under_review"
                ? "Marked as Under Review."
                : newStatus === "approved"
                    ? "Application approved. The student can now activate their account."
                    : "Application rejected.",
            "ok"
        );

    } catch (error) {

        console.error("Update application status error:", error);

        axToast(axErrorText(error, "Couldn't update the application. "), "error");
    }

    axRender();
}

// Calls the Academx API to approve an application / create its student record.
// Sends the signed-in user's Firebase ID token, so the server can check who is asking.
async function axCallApprove(appId, note) {

    const user = auth.currentUser;

    if (!user) {

        const err = new Error("Please sign in again.");
        err.code = "api/unauthenticated";
        throw err;
    }

    const token = await user.getIdToken();

    // The first request after a quiet period can take a while to wake the server
    axToast("Contacting the student service. This can take up to a minute the first time.", "ok");

    const controller = new AbortController();

    const timer = setTimeout(function () { controller.abort(); }, 90000);

    let response;

    try {

        response = await fetch(AX_API_BASE + "/api/approve-application", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({
                institutionId: AX.institutionId,
                applicationId: appId,
                reviewNote: note || ""
            }),
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

        console.error("Academx API error:", response.status, data);

        const err = new Error((data && data.message) || "Request failed");
        err.code = "api/" + ((data && data.code) || ("http-" + response.status));
        throw err;
    }

    return data;
}

// Turns API / Firestore errors into a message for staff.
function axErrorText(error, fallbackPrefix) {

    const code = error.code || "";

    if (code === "permission-denied") {
        return "Firestore rules blocked this change. Update the applications rules.";
    }

    if (code === "api/unreachable") {
        return "The student service did not respond, so nothing was confirmed. " +
            "Try again in a minute. If it keeps happening, tell your Academx administrator " +
            "(technical detail is in the browser console).";
    }

    // Messages written by our own API are safe and meant to be shown
    if (["api/failed-precondition", "api/invalid-argument", "api/permission-denied",
         "api/not-found", "api/unauthenticated"].includes(code)) {
        return error.message;
    }

    if (code.indexOf("api/") === 0) {
        return "The student service had a problem. Please try again.";
    }

    return fallbackPrefix + error.message;
}

// For applications approved before student records existed:
// runs the same (idempotent) function to create the student record.
async function axCreateStudentRecord(appId) {

    const app = axAppById(appId);

    if (!app || axStatusOf(app) !== "approved" || app.pendingStudentId) return;

    if (!confirm("Create the student record for " + axSummary(app).name + "?")) return;

    try {

        await axCallApprove(appId, "");

        const ref = doc(db, axBase() + "/applications", appId);

        const fresh = await getDoc(ref);

        if (fresh.exists()) {

            const index = AX.applications.findIndex(function (a) { return a.id === appId; });

            if (index >= 0) AX.applications[index] = { id: appId, ...fresh.data() };
        }

        axToast("Student record created. The student can now activate their account.", "ok");

    } catch (error) {

        console.error("Create student record error:", error);

        axToast(axErrorText(error, "Couldn't create the student record. "), "error");
    }

    axRender();
}


// ---------- opening the Applications page ----------

async function openApplications(options) {

    if (!appsRoot || !AX.institutionId) return;

    const refresh = !!(options && options.refresh);

    if (AX.loaded && !refresh) {

        axRender();

        return;
    }

    if (!AX.loaded) {

        appsRoot.innerHTML =
            "<p class=\"ax-muted\">Loading…</p>";
    }

    try {

        await Promise.all([axLoadForms(), axLoadApplications(), axLoadEnquiries(), axLoadClassOptions()]);

        AX.loaded = true;

    } catch (error) {

        console.error("Load applications module error:", error);

        const text =
            error.code === "permission-denied"
                ? "Firestore rules don't allow reading forms or applications yet."
                : "Couldn't load data. " + error.message;

        if (!AX.loaded) {

            appsRoot.innerHTML =
                "<p class=\"ax-error-text\">" + axEsc(text) + "</p>";

            return;
        }

        axFlash("error", text);
    }

    axRender();
}


// ---------- sidebar sync ----------

function axSyncNav() {

    document.querySelectorAll("[data-axnav]").forEach(function (item) {

        const key = item.dataset.axnav;

        const on =
            (key === "forms" && AX.view === "forms") ||
            (key === "apps" && AX.view === "applications") ||
            (key === "enquiries" && AX.view === "enquiries");

        item.classList.toggle("active", on);
    });

    const group = document.getElementById("applicationsGroup");

    const title = document.getElementById("pageTitle");

    const labels = { forms: "Forms", applications: "Applications", enquiries: "Custom forms" };

    if (group && title && group.classList.contains("open")) {

        title.textContent = "Applications · " + labels[AX.view];
    }
}


// ---------- rendering ----------

function axPageHeader(title, subtitle, actionsHtml) {

    return "<div class=\"ax-head\"><div><h2 class=\"ax-title\">" + axEsc(title) +
        "</h2><p class=\"ax-sub\">" + axEsc(subtitle) + "</p></div>" +
        (actionsHtml ? "<div class=\"ax-head-actions\">" + actionsHtml + "</div>" : "") +
        "</div>";
}

function axRender() {

    if (!appsRoot) return;

    const message = AX.msg
        ? "<div class=\"ax-msg ax-" + AX.msg.type + "\" role=\"status\">" +
          axEsc(AX.msg.text) + "</div>"
        : "";

    AX.msg = null;

    if (AX.view === "forms" && AX.formsMode === "create" && !AX.canManage) {
        AX.formsMode = "list";
    }

    let body;

    if (AX.view === "applications") body = axRenderApplicationsView();
    else if (AX.view === "enquiries") body = axRenderEnquiriesView();
    else body = axRenderFormsView();

    appsRoot.innerHTML = message + body;

    axSyncNav();

    axRenderModal();
}


// ----- Forms view -----

function axRenderFormsView() {

    const header = axPageHeader(
        "Forms",
        "The forms applicants fill out. Create a form, publish it, then share its link.",
        AX.canManage
            ? "<div class=\"ax-seg\" role=\"group\" aria-label=\"Forms options\">" +
              "<button type=\"button\" class=\"ax-seg-btn" + (AX.formsMode === "list" ? " on" : "") +
              "\" data-act=\"mode-list\">Forms</button>" +
              "<button type=\"button\" class=\"ax-seg-btn" + (AX.formsMode === "create" ? " on" : "") +
              "\" data-act=\"mode-create\">+ Create New Form</button></div>"
            : ""
    );

    return header + (AX.formsMode === "create" ? axRenderBuilder() : axRenderFormsList());
}

function axRenderFormsList() {

    const counts = {
        all: AX.forms.length,
        active: AX.forms.filter(function (f) { return f.status === "active"; }).length,
        draft: AX.forms.filter(function (f) { return f.status === "draft"; }).length,
        closed: AX.forms.filter(function (f) { return f.status === "closed"; }).length
    };

    const chips = [["all", "All"], ["active", "Active"], ["draft", "Drafts"], ["closed", "Closed"]]
        .map(function (c) {
            return "<button type=\"button\" class=\"ax-chip" +
                (AX.formsFilter === c[0] ? " is-on" : "") +
                "\" data-act=\"forms-filter\" data-s=\"" + c[0] + "\">" + c[1] +
                " <span class=\"ax-chip-count\">" + counts[c[0]] + "</span></button>";
        }).join("");

    const list = AX.forms.filter(function (f) {
        return AX.formsFilter === "all" || f.status === AX.formsFilter;
    });

    let body;

    if (!AX.forms.length) {

        body = "<div class=\"ax-empty\"><strong>No forms yet</strong>" +
            "<p class=\"ax-muted\">Create your first application form to start receiving applications.</p>" +
            (AX.canManage
                ? "<button type=\"button\" class=\"ax-btn ax-primary\" data-act=\"mode-create\">+ Create New Form</button>"
                : "") +
            "</div>";

    } else if (!list.length) {

        body = "<div class=\"ax-empty\"><p class=\"ax-muted\">No forms in this view.</p></div>";

    } else {

        body = "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr>" +
            "<th>Form name</th><th>Academic year</th><th>Status</th>" +
            "<th class=\"ax-num\">Applications</th><th>Created</th><th>Actions</th>" +
            "</tr></thead><tbody>" + list.map(axFormsRow).join("") + "</tbody></table></div>";
    }

    return "<section class=\"ax-panel\"><div class=\"ax-chips\">" + chips + "</div>" + body + "</section>";
}

function axFormsRow(f) {

    const type = axFormTypeOf(f);

    const count = axAppCount(f.id);

    const id = axEsc(f.id);

    const actions = [
        "<button type=\"button\" class=\"ax-btn ax-sm\" data-act=\"view-form\" data-id=\"" + id + "\">View</button>"
    ];

    if (axCanEditForm(f)) {
        actions.push("<button type=\"button\" class=\"ax-btn ax-sm\" data-act=\"edit\" data-id=\"" + id + "\">" +
            (axIsLegacy(f) && f.status !== "draft" ? "Add fields" : "Edit") + "</button>");
    }

    if (f.status === "active") {

        actions.push("<button type=\"button\" class=\"ax-btn ax-sm\" data-act=\"copy\" data-id=\"" + id + "\">Copy link</button>");

        if (type === "custom") {
            actions.push("<button type=\"button\" class=\"ax-btn ax-sm\" data-act=\"copy-embed\" data-id=\"" + id + "\">Copy embed code</button>");
        }

        if (AX.canManage) {
            actions.push("<button type=\"button\" class=\"ax-btn ax-sm\" data-act=\"close\" data-id=\"" + id + "\">Close</button>");
        }
    }

    if (f.status === "closed" && AX.canManage) {
        actions.push("<button type=\"button\" class=\"ax-btn ax-sm\" data-act=\"reopen\" data-id=\"" + id + "\">Reopen</button>");
    }

    if (axCanDeleteForm(f)) {
        actions.push("<button type=\"button\" class=\"ax-btn ax-sm ax-danger\" data-act=\"rm\" data-id=\"" + id + "\">Delete</button>");
    }

    return "<tr>" +
        "<td><strong>" + axEsc(f.name || "Untitled form") + "</strong>" +
        "<div class=\"ax-muted\">" + (type === "custom" ? "Custom form" : "Onboarding form") + "</div>" +
        (f.description ? "<div class=\"ax-muted\">" + axEsc(f.description) + "</div>" : "") + "</td>" +
        "<td>" + axEsc(f.academicYear || "—") + "</td>" +
        "<td>" + axBadge(f.status) + "</td>" +
        "<td class=\"ax-num\">" + count + "</td>" +
        "<td>" + axFmtDate(f.createdAt) + "</td>" +
        "<td><div class=\"ax-row-actions\">" + actions.join("") + "</div></td>" +
        "</tr>";
}

function axRenderBuilder() {

    if (!AX.draft) AX.draft = axBlankDraft("onboarding");

    const d = AX.draft;

    const years = axAcademicYears();

    if (!years.includes(d.academicYear)) years.unshift(d.academicYear);

    const lockedCount = d.fields.filter(function (f) { return f.locked; }).length;

    const typeCards = [
        ["onboarding", "Onboarding form",
            "For admissions. Applications are reviewed and approved here, and approval creates the student's Academx record."],
        ["custom", "Custom form",
            "For any purpose: admissions, enquiries, hiring, feedback or surveys. Nothing is approved; responses appear under Custom forms."]
    ].map(function (t) {

        const checked = d.formType === t[0] ? " checked" : "";
        const disabled = d.isNew ? "" : " disabled";

        return "<label class=\"ax-typecard\"><input type=\"radio\" name=\"axFormType\" data-ft=\"" + t[0] + "\"" +
            checked + disabled + "><span><strong>" + t[1] + "</strong>" + axEsc(t[2]) + "</span></label>";

    }).join("");

    const typeNote = d.isNew
        ? "<p class=\"ax-muted\">Switching type resets the fields below.</p>"
        : "<p class=\"ax-muted\">The form type can't be changed after a form is created.</p>";

    const fieldsNote = d.formType === "custom"
        ? "<p class=\"ax-muted\">Add the questions you need. Nothing is required by default.</p>"
        : "<p class=\"ax-muted\">These five fields are required on every onboarding form. They can't be removed, renamed or made optional. Add any other fields below them.</p>";

    const fields = d.fields.map(function (f, i) {

        const lock = f.locked ? " disabled" : "";

        const typeOptions = AX_FIELD_TYPES.map(function (t) {
            return "<option value=\"" + t.value + "\"" +
                (t.value === f.type ? " selected" : "") + ">" +
                t.label + "</option>";
        }).join("");

        const source = axSourceOf(f);

        const optionsBox = AX_OPTION_TYPES.includes(f.type)
            ? "<label class=\"ax-opts\"><span>" +
              (f.type === "checkbox"
                  ? "Choices (optional, one per line; leave empty for a single checkbox)"
                  : "Options (one per line)") +
              "</span><textarea rows=\"3\" data-f=\"" + i + "\" data-k=\"optionsText\"" + lock + ">" +
              axEsc(f.optionsText) + "</textarea></label>"
            : "";

        const options = source ? axSourceNote(source) : optionsBox;

        const actions = f.locked
            ? "<span class=\"ax-pill ax-submitted\">Required</span>"
            : "<div class=\"ax-field-actions\">" +
              "<button type=\"button\" class=\"ax-icon\" data-act=\"up\" data-i=\"" + i +
              "\" aria-label=\"Move field up\"" + (i <= lockedCount ? " disabled" : "") + ">↑</button>" +
              "<button type=\"button\" class=\"ax-icon\" data-act=\"down\" data-i=\"" + i +
              "\" aria-label=\"Move field down\"" + (i === d.fields.length - 1 ? " disabled" : "") + ">↓</button>" +
              "<button type=\"button\" class=\"ax-icon ax-danger\" data-act=\"del\" data-i=\"" + i +
              "\" aria-label=\"Delete field\">Delete</button></div>";

        return "<li class=\"ax-field\"><div class=\"ax-field-row\">" +
            "<label class=\"ax-grow\"><span>Field label</span>" +
            "<input type=\"text\" data-f=\"" + i + "\" data-k=\"label\" value=\"" + axEsc(f.label) + "\"" + lock +
            " placeholder=\"Type a field name\"></label>" +
            "<label><span>Type</span><select data-f=\"" + i + "\" data-k=\"type\"" + lock + ">" + typeOptions + "</select></label>" +
            "<label class=\"ax-check\"><input type=\"checkbox\" data-f=\"" + i + "\" data-k=\"required\"" +
            (f.required ? " checked" : "") + lock + "><span>Required</span></label>" +
            actions +
            "</div>" + options + "</li>";

    }).join("");

    const title = d.isNew
        ? "Create new form"
        : d.keepStatus ? "Edit form" : "Edit draft form";

    // Published/closed forms keep their status when edited
    // (only possible while nobody has responded).
    const actions = d.keepStatus
        ? "<button type=\"button\" class=\"ax-btn ax-primary\" data-act=\"keep\">Save changes</button>"
        : "<button type=\"button\" class=\"ax-btn\" data-act=\"draft\">Save draft</button>" +
          "<button type=\"button\" class=\"ax-btn ax-primary\" data-act=\"publish\">Publish form</button>";

    const yearOptions = years.map(function (y) {
        return "<option" + (y === d.academicYear ? " selected" : "") + ">" + y + "</option>";
    }).join("");

    return "<section class=\"ax-panel\">" +
        "<h3 class=\"ax-panel-title\">" + title + "</h3>" +
        "<div class=\"ax-typecards\">" + typeCards + "</div>" + typeNote +
        "<div class=\"ax-grid\">" +
        "<label class=\"ax-grow\"><span>Form name</span>" +
        "<input type=\"text\" id=\"axName\" value=\"" + axEsc(d.name) +
        "\" placeholder=\"Student Admission 2026-27\"></label>" +
        "<label><span>Academic year</span><select id=\"axYear\">" + yearOptions + "</select></label></div>" +
        "<label><span>Description</span><textarea id=\"axDesc\" rows=\"2\" " +
        "placeholder=\"What this form is for\">" + axEsc(d.description) + "</textarea></label>" +
        "<h4 class=\"ax-subtitle\">Fields</h4>" + fieldsNote +
        "<ul class=\"ax-fields\">" + (fields || "<li class=\"ax-muted\">No fields yet.</li>") + "</ul>" +
        "<button type=\"button\" class=\"ax-btn\" data-act=\"add\">Add field</button>" +
        "<div class=\"ax-bar\">" + actions +
        "<button type=\"button\" class=\"ax-btn\" data-act=\"cancel\">Cancel</button></div>" +
        "</section>";
}


// ----- Applications view -----

function axFilteredApplications() {

    const query = AX.appSearch.trim().toLowerCase();

    return AX.applications.filter(function (a) {

        if (AX.appStatus !== "all" && axStatusOf(a) !== AX.appStatus) return false;

        if (AX.appForm !== "all" && a.formId !== AX.appForm) return false;

        if (!query) return true;

        const s = axSummary(a);

        return [s.name, s.email, s.phone, s.cls, s.formName, a.id]
            .join(" ").toLowerCase().indexOf(query) !== -1;
    });
}

function axRenderApplicationsView() {

    const counts = axStatusCounts();

    const chips = ["all"].concat(AX_STATUSES).map(function (s) {
        return "<button type=\"button\" class=\"ax-chip" + (AX.appStatus === s ? " is-on" : "") +
            "\" data-act=\"status\" data-s=\"" + s + "\">" + AX_STATUS_LABEL[s] +
            " <span class=\"ax-chip-count\">" + counts[s] + "</span></button>";
    }).join("");

    // Only onboarding forms produce applications
    const onboardingForms = AX.forms.filter(function (f) { return axFormTypeOf(f) === "onboarding"; });

    const formOptions = "<option value=\"all\">All forms</option>" +
        onboardingForms.map(function (f) {
            return "<option value=\"" + axEsc(f.id) + "\"" + (AX.appForm === f.id ? " selected" : "") + ">" +
                axEsc((f.name || f.id) +
                    (f.academicYear ? " · " + f.academicYear : "") +
                    (f.status ? " · " + f.status : "")) + "</option>";
        }).join("") +
        (onboardingForms.length
            ? ""
            : "<option disabled>No onboarding forms yet. Create one under Forms.</option>");

    return axPageHeader(
            "Applications",
            "Onboarding applications. Review them and approve the ones you accept. Approval creates the student's Academx record.",
            "<button type=\"button\" class=\"ax-btn\" data-act=\"refresh\">Refresh</button>"
        ) +
        "<section class=\"ax-panel\">" +
        "<div class=\"ax-toolbar\">" +
        "<input type=\"search\" id=\"axSearch\" class=\"ax-search\" placeholder=\"Search name, email, phone, class or ID\" " +
        "aria-label=\"Search applications\" value=\"" + axEsc(AX.appSearch) + "\">" +
        "<select id=\"axFormFilter\" class=\"ax-formfilter\" aria-label=\"Filter by form\">" + formOptions + "</select>" +
        "</div>" +
        "<div class=\"ax-chips\">" + chips + "</div>" +
        "<div id=\"axAppsResults\">" + axAppsResultsHtml() + "</div>" +
        "</section>";
}

function axAppsResultsHtml() {

    const all = axFilteredApplications();

    const shown = all.slice(0, AX.appLimit);

    if (!AX.applications.length) {

        return "<div class=\"ax-empty\"><strong>No applications yet</strong>" +
            "<p class=\"ax-muted\">They appear here once applicants submit a published form.</p></div>";
    }

    if (!all.length) {

        return "<div class=\"ax-empty\"><p class=\"ax-muted\">No applications match your filters.</p></div>";
    }

    const rows = shown.map(function (a) {

        const s = axSummary(a);

        const year = a.academicYear || (axFormById(a.formId) || {}).academicYear || "—";

        return "<tr>" +
            "<td><strong>" + axEsc(s.name) + "</strong></td>" +
            "<td>" + axEsc(s.email || "—") + "</td>" +
            "<td>" + axEsc(s.phone || "—") + "</td>" +
            "<td>" + axEsc(s.cls || "—") + "</td>" +
            "<td>" + axEsc(s.formName) + "</td>" +
            "<td>" + axEsc(year) + "</td>" +
            "<td>" + axFmtDate(a.submittedAt || a.createdAt) + "</td>" +
            "<td>" + axBadge(axStatusOf(a)) + "</td>" +
            "<td><button type=\"button\" class=\"ax-btn ax-sm\" data-act=\"view-app\" data-id=\"" +
            axEsc(a.id) + "\">View</button></td>" +
            "</tr>";

    }).join("");

    return "<p class=\"ax-muted ax-resultcount\">Showing " + shown.length + " of " + all.length +
        " application" + (all.length === 1 ? "" : "s") + "</p>" +
        "<div class=\"ax-table-wrap\"><table class=\"ax-table ax-table-wide\"><thead><tr>" +
        "<th>Applicant</th><th>Email</th><th>Contact</th><th>Class</th><th>Form</th>" +
        "<th>Year</th><th>Submitted</th><th>Status</th><th></th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
        (all.length > shown.length
            ? "<div class=\"ax-more\"><button type=\"button\" class=\"ax-btn\" data-act=\"more\">Show more</button></div>"
            : "");
}


// ----- Detail modal (application or form) -----

function axDlRow(label, valueHtml) {

    return "<div class=\"ax-dl-row\"><dt>" + axEsc(label) + "</dt><dd>" + valueHtml + "</dd></div>";
}

function axAppModalHtml(a) {

    const form = axFormById(a.formId);

    const fields = form && Array.isArray(form.fields) ? form.fields : [];

    const d = a.data || {};

    const known = new Set(fields.map(function (f) { return f.id; }));

    const applicantRows = fields.map(function (f) {
        return axDlRow(f.label, axEsc(axFmtValue(d[f.id])));
    }).join("") +
        // Answers that aren't in the form definition any more
        Object.keys(d).filter(function (k) { return !known.has(k); }).map(function (k) {
            return axDlRow(k.replace(/_/g, " "), axEsc(axFmtValue(d[k])));
        }).join("");

    const status = axStatusOf(a);

    const s = axSummary(a);

    const infoRows =
        axDlRow("Form", axEsc(s.formName)) +
        axDlRow("Academic year", axEsc(a.academicYear || (form && form.academicYear) || "—")) +
        axDlRow("Submitted", axEsc(axFmtDateTime(a.submittedAt || a.createdAt))) +
        axDlRow("Application ID", "<span class=\"ax-mono\">" + axEsc(a.id) + "</span>") +
        axDlRow("Status", axBadge(status)) +
        (status === "approved"
            ? axDlRow("Student account",
                a.studentUid ? "Activated"
                : a.pendingStudentId ? "Waiting for the student to activate"
                : "Not created yet")
            : "") +
        (a.reviewedAt ? axDlRow("Last reviewed", axEsc(axFmtDateTime(a.reviewedAt))) : "") +
        (a.reviewNote ? axDlRow("Review note", axEsc(a.reviewNote)) : "");

    const btn = function (statusValue, label, extra) {
        return "<button type=\"button\" class=\"ax-btn " + (extra || "") + "\" data-act=\"set-status\" data-s=\"" +
            statusValue + "\">" + label + "</button>";
    };

    let actions = "";

    if (status === "submitted") {
        actions = btn("under_review", "Mark Under Review") +
            btn("approved", "Approve", "ax-primary") +
            btn("rejected", "Reject", "ax-danger");
    } else if (status === "under_review") {
        actions = btn("approved", "Approve", "ax-primary") + btn("rejected", "Reject", "ax-danger");
    } else if (status === "rejected") {
        actions = btn("under_review", "Reconsider (Under Review)");
    }

    const review = actions
        ? "<label class=\"ax-notebox\"><span>Review note (optional)</span>" +
          "<textarea id=\"axReviewNote\" rows=\"2\" maxlength=\"1000\" placeholder=\"Add a note for your records\"></textarea></label>" +
          "<div class=\"ax-bar ax-bar-modal\">" + actions + "</div>"
        : status === "approved"
            ? (a.studentUid
                ? "<p class=\"ax-info\">This student has activated their Academx account.</p>"
                : a.pendingStudentId
                    ? "<p class=\"ax-info\">Approved. The student can now open Academx, choose " +
                      "<strong>Activate your account</strong>, enter the email used on this application and " +
                      "set their own password.</p>"
                    : "<p class=\"ax-info\">This application was approved before student records existed.</p>" +
                      "<div class=\"ax-bar ax-bar-modal\"><button type=\"button\" class=\"ax-btn ax-primary\" " +
                      "data-act=\"create-student\">Create student record</button></div>")
            : "";

    return "<div class=\"ax-modal-head\"><div><h3 id=\"axModalTitle\">" + axEsc(s.name) + "</h3>" +
        "<div class=\"ax-muted\">" + axEsc(s.formName) + "</div></div>" +
        "<button type=\"button\" class=\"ax-icon\" data-act=\"close-modal\" aria-label=\"Close\">✕</button></div>" +
        "<div class=\"ax-modal-body\">" +
        "<h4 class=\"ax-subtitle\">Applicant information</h4><dl class=\"ax-dl\">" +
        (applicantRows || "<p class=\"ax-muted\">No answers were stored.</p>") + "</dl>" +
        "<h4 class=\"ax-subtitle\">Application information</h4><dl class=\"ax-dl\">" + infoRows + "</dl>" +
        review +
        "</div>";
}

function axFormModalHtml(f) {

    const count = axAppCount(f.id);

    const fields = Array.isArray(f.fields) ? f.fields : [];

    const fieldRows = fields.length
        ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Options</th></tr></thead><tbody>" +
          fields.map(function (x) {
              const typeLabel = (AX_FIELD_TYPES.find(function (t) { return t.value === x.type; }) || {}).label || x.type;
              return "<tr><td>" + axEsc(x.label) + "</td><td>" + axEsc(typeLabel) + "</td><td>" +
                  (x.required ? "Yes" : "No") + "</td><td>" +
                  axEsc(Array.isArray(x.options) ? x.options.join(", ") : "—") + "</td></tr>";
          }).join("") + "</tbody></table></div>"
        : "<p class=\"ax-muted\">This form has no fields yet.</p>";

    const link = f.status === "active"
        ? axDlRow("Public link",
            "<div class=\"ax-linkbox\"><input type=\"text\" readonly value=\"" + axEsc(axApplyLink(f.id)) +
            "\" aria-label=\"Public application link\"><button type=\"button\" class=\"ax-btn ax-sm\" data-act=\"copy\" data-id=\"" +
            axEsc(f.id) + "\">Copy link</button></div>")
        : "";

    const locked = !axCanEditForm(f) && AX.canManage
        ? "<p class=\"ax-info\">Fields are locked because applications have already been submitted to this form.</p>"
        : "";

    return "<div class=\"ax-modal-head\"><div><h3 id=\"axModalTitle\">" + axEsc(f.name || "Untitled form") + "</h3>" +
        "<div class=\"ax-muted\">" + axEsc(f.description || "") + "</div></div>" +
        "<button type=\"button\" class=\"ax-icon\" data-act=\"close-modal\" aria-label=\"Close\">✕</button></div>" +
        "<div class=\"ax-modal-body\"><dl class=\"ax-dl\">" +
        axDlRow("Status", axBadge(f.status)) +
        axDlRow("Academic year", axEsc(f.academicYear || "—")) +
        axDlRow("Created", axEsc(axFmtDate(f.createdAt))) +
        axDlRow("Applications", String(count)) +
        link + "</dl>" +
        "<h4 class=\"ax-subtitle\">Fields</h4>" + fieldRows + locked +
        "<div class=\"ax-bar ax-bar-modal\">" +
        "<button type=\"button\" class=\"ax-btn ax-primary\" data-act=\"form-apps\" data-id=\"" + axEsc(f.id) + "\">View applications</button>" +
        "</div></div>";
}

const axModalHost = document.createElement("div");

axModalHost.id = "axModalHost";

document.body.appendChild(axModalHost);

// Enquiries: loaded, shown and copied. They have no approval workflow.
async function axLoadEnquiries() {

    const snap = await getDocs(
        collection(db, axBase() + "/customResponses")
    );

    AX.enquiries = snap.docs
        .map(function (d) { return { id: d.id, ...d.data() }; })
        .sort(function (a, b) {
            return ((b.createdAt && b.createdAt.seconds) || 0) -
                   ((a.createdAt && a.createdAt.seconds) || 0);
        });
}

function axEmbedCode(formId) {

    return "<iframe src=\"" + axApplyLink(formId) + "\" width=\"100%\" height=\"800\" " +
        "style=\"border:0;max-width:720px\" title=\"Custom form\" loading=\"lazy\"></iframe>";
}

function axCopyEmbed(formId) {

    const code = axEmbedCode(formId);

    return axCopyText(code).then(function (ok) {

        if (ok) {
            axToast("Embed code copied. Paste it into your website page.", "ok");
        } else {
            axToast("Couldn't copy automatically. Copy the code from the box.", "error");
            window.prompt("Copy this embed code (Ctrl+C):", code);
        }
    });
}

function axRenderEnquiriesView() {

    const rows = AX.enquiries.map(function (e) {

        const s = axSummary(e);

        return "<tr><td><strong>" + axEsc(s.name === "Unnamed applicant" ? "Response" : s.name) + "</strong></td>" +
            "<td>" + axEsc(s.email || "—") + "</td>" +
            "<td>" + axEsc(s.phone || "—") + "</td>" +
            "<td>" + axEsc(s.formName) + "</td>" +
            "<td>" + axFmtDate(e.createdAt) + "</td>" +
            "<td><button type=\"button\" class=\"ax-btn ax-sm\" data-act=\"view-enquiry\" data-id=\"" +
            axEsc(e.id) + "\">View</button></td></tr>";
    }).join("");

    return axPageHeader(
            "Custom forms",
            "Responses to your custom forms. These are for information only and are not approved.",
            "<button type=\"button\" class=\"ax-btn\" data-act=\"refresh\">Refresh</button>"
        ) +
        "<section class=\"ax-panel\">" +
        (AX.enquiries.length
            ? "<div class=\"ax-table-wrap\"><table class=\"ax-table\"><thead><tr><th>Name</th><th>Email</th>" +
              "<th>Phone</th><th>Form</th><th>Received</th><th></th></tr></thead><tbody>" + rows +
              "</tbody></table></div>"
            : "<div class=\"ax-empty\"><strong>No responses yet</strong>" +
              "<p class=\"ax-muted\">Responses appear here once people submit a custom form.</p></div>") +
        "</section>";
}

function axEnquiryModalHtml(e) {

    const form = axFormById(e.formId);

    const fields = form && Array.isArray(form.fields) ? form.fields : [];

    const d = e.data || {};

    const known = new Set(fields.map(function (f) { return f.id; }));

    const answers = fields.map(function (f) {
        return axDlRow(f.label, axEsc(axFmtValue(d[f.id])));
    }).join("") +
        Object.keys(d).filter(function (k) { return !known.has(k); }).map(function (k) {
            return axDlRow(k.replace(/_/g, " "), axEsc(axFmtValue(d[k])));
        }).join("");

    return "<div class=\"ax-modal-head\"><div><h3 id=\"axModalTitle\">Response</h3>" +
        "<div class=\"ax-muted\">" + axEsc(e.formName || (form && form.name) || "") + "</div></div>" +
        "<button type=\"button\" class=\"ax-icon\" data-act=\"close-modal\" aria-label=\"Close\">✕</button></div>" +
        "<div class=\"ax-modal-body\">" +
        "<h4 class=\"ax-subtitle\">Answers</h4><dl class=\"ax-dl\">" +
        (answers || "<p class=\"ax-muted\">No answers were stored.</p>") + "</dl>" +
        "<h4 class=\"ax-subtitle\">Details</h4><dl class=\"ax-dl\">" +
        axDlRow("Received", axEsc(axFmtDateTime(e.createdAt))) +
        axDlRow("Status", axBadge(e.status || "new")) +
        "</dl></div>";
}

function axRenderModal() {

    let inner = "";

    if (AX.modal && AX.modal.type === "app") {

        const a = axAppById(AX.modal.id);

        if (a) inner = axAppModalHtml(a);
        else AX.modal = null;

    } else if (AX.modal && AX.modal.type === "form") {

        const f = axFormById(AX.modal.id);

        if (f) inner = axFormModalHtml(f);
        else AX.modal = null;

    } else if (AX.modal && AX.modal.type === "enquiry") {

        const e = AX.enquiries.find(function (x) { return x.id === AX.modal.id; });

        if (e) inner = axEnquiryModalHtml(e);
        else AX.modal = null;
    }

    if (!inner) {

        axModalHost.innerHTML = "";

        document.body.classList.remove("ax-noscroll");

        return;
    }

    const keepNote = document.getElementById("axReviewNote");

    const noteValue = keepNote ? keepNote.value : "";

    axModalHost.innerHTML =
        "<div class=\"ax-backdrop\" data-act=\"backdrop\">" +
        "<div class=\"ax-modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"axModalTitle\">" +
        inner + "</div></div>";

    const newNote = document.getElementById("axReviewNote");

    if (newNote && noteValue) newNote.value = noteValue;

    document.body.classList.add("ax-noscroll");
}

function axCloseModal() {

    AX.modal = null;

    axRenderModal();
}


// ---------- events (delegated, registered once) ----------

function axAction(act, target) {

    const id = target.dataset.id;
    const i = Number(target.dataset.i);
    const d = AX.draft;

    switch (act) {

        // --- Forms section ---
        case "mode-list":
            AX.formsMode = "list";
            return axRender();

        case "mode-create":
            if (!AX.canManage) return;
            if (!AX.draft || !AX.draft.isNew) AX.draft = axBlankDraft("onboarding");
            AX.formsMode = "create";
            axLoadClassOptions().then(axRender);
            return axRender();

        case "forms-filter":
            AX.formsFilter = target.dataset.s;
            return axRender();

        case "view-form":
            AX.modal = { type: "form", id: id };
            return axRenderModal();

        case "form-apps":
            AX.modal = null;
            AX.view = "applications";
            AX.appStatus = "all";
            AX.appForm = id;
            AX.appSearch = "";
            AX.appLimit = AX_PAGE_SIZE;
            return axRender();

        case "edit": return axEditForm(id);
        case "close": return axSetStatus(id, "closed");
        case "reopen": return axSetStatus(id, "active");
        case "rm": return axDeleteForm(id);
        case "copy": return axCopyLink(id, target);
        case "copy-embed": return axCopyEmbed(id);

        // --- Form builder ---
        case "add":
            if (!d) return;
            d.fields.push(axNewField());
            return axRender();

        case "del":
            if (!d || !d.fields[i] || d.fields[i].locked) return;
            d.fields.splice(i, 1);
            return axRender();

        case "up": {
            if (!d) return;
            const lockedCount = d.fields.filter(function (f) { return f.locked; }).length;
            if (i > lockedCount) {
                [d.fields[i - 1], d.fields[i]] = [d.fields[i], d.fields[i - 1]];
                axRender();
            }
            return;
        }

        case "down": {
            if (!d) return;
            if (i < d.fields.length - 1 && !d.fields[i].locked) {
                [d.fields[i + 1], d.fields[i]] = [d.fields[i], d.fields[i + 1]];
                axRender();
            }
            return;
        }

        case "draft":
            if (!d) return;
            return axSaveForm("draft");

        case "publish":
            if (!d) return;
            return axSaveForm("active");

        case "keep":
            if (!d) return;
            return axSaveForm(d.keepStatus);

        case "cancel":
            AX.draft = null;
            AX.formsMode = "list";
            return axRender();

        // --- Applications section ---
        case "status":
            AX.appStatus = target.dataset.s;
            AX.appLimit = AX_PAGE_SIZE;
            return axRender();

        case "more":
            AX.appLimit += AX_PAGE_SIZE;
            return axRender();

        case "refresh":
            return openApplications({ refresh: true });

        case "view-app":
            AX.modal = { type: "app", id: id };
            return axRenderModal();

        case "set-status":
            if (AX.modal && AX.modal.type === "app") {
                return axUpdateApplicationStatus(AX.modal.id, target.dataset.s);
            }
            return;

        case "create-student":
            if (AX.modal && AX.modal.type === "app") {
                return axCreateStudentRecord(AX.modal.id);
            }
            return;

        // --- Enquiries ---
        case "view-enquiry":
            AX.modal = { type: "enquiry", id: id };
            return axRenderModal();

        case "close-modal":
            return axCloseModal();
    }
}

if (appsRoot) {

    appsRoot.addEventListener("click", function (event) {

        const target = event.target.closest("[data-act]");

        if (target) axAction(target.dataset.act, target);
    });

    appsRoot.addEventListener("input", function (event) {

        const el = event.target;
        const d = AX.draft;

        if (el.id === "axSearch") {

            AX.appSearch = el.value;
            AX.appLimit = AX_PAGE_SIZE;

            // Only the results are redrawn, so the search box keeps focus
            const results = document.getElementById("axAppsResults");

            if (results) results.innerHTML = axAppsResultsHtml();

            return;
        }

        if (!d) return;

        if (el.id === "axName") d.name = el.value;
        else if (el.id === "axDesc") d.description = el.value;
        else if (el.dataset.f !== undefined && el.dataset.k !== "type" && el.dataset.k !== "required") {
            d.fields[Number(el.dataset.f)][el.dataset.k] = el.value;
        }
    });

    appsRoot.addEventListener("change", function (event) {

        const el = event.target;
        const d = AX.draft;

        if (el.id === "axFormFilter") {

            AX.appForm = el.value;
            AX.appLimit = AX_PAGE_SIZE;

            return axRender();
        }

        if (!d) return;

        if (el.id === "axYear") {
            d.academicYear = el.value;
        } else if (el.dataset.f !== undefined && el.dataset.k === "type") {
            d.fields[Number(el.dataset.f)].type = el.value;
            axRender();
        } else if (el.dataset.f !== undefined && el.dataset.k === "required") {
            d.fields[Number(el.dataset.f)].required = el.checked;
        }
    });
}

// Modal: buttons, backdrop click and the Escape key
axModalHost.addEventListener("click", function (event) {

    const target = event.target.closest("[data-act]");

    if (!target) return;

    if (target.dataset.act === "backdrop") {

        // only when the dark area itself was clicked, not the dialog
        if (event.target === target) axCloseModal();

        return;
    }

    axAction(target.dataset.act, target);
});

document.addEventListener("keydown", function (event) {

    if (event.key === "Escape" && AX.modal) axCloseModal();
});

// Sidebar items under "Applications"
document.querySelectorAll("[data-axnav]").forEach(function (item) {

    item.addEventListener("click", function () {

        if (!AX.institutionId || !AX.loaded) return;

        const key = item.dataset.axnav;

        if (key === "forms") {

            AX.view = "forms";
            AX.formsMode = "list";

        } else if (key === "enquiries") {

            AX.view = "enquiries";

        } else {

            AX.view = "applications";
            AX.appLimit = AX_PAGE_SIZE;
        }

        axRender();
    });
});

// Form type cards: only for a form that hasn't been created yet
appsRoot.addEventListener("change", function (event) {

    const el = event.target;

    if (el.dataset.ft === undefined || !AX.draft || !AX.draft.isNew) return;

    AX.draft.formType = el.dataset.ft === "custom" ? "custom" : "onboarding";
    AX.draft.fields = axStarterFields(AX.draft.formType);

    axRender();
});


// ============================================================
// LOGIN BUTTON
// ============================================================

if (loginButton) {

    loginButton.addEventListener(
        "click",
        login
    );
}


// ============================================================
// LOGOUT BUTTON
// ============================================================

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        logout
    );
}


// ============================================================
// FORGOT PASSWORD
// ============================================================

if (forgotPasswordButton) {

    forgotPasswordButton.addEventListener(
        "click",
        forgotPassword
    );
}


// ============================================================
// ENTER KEY
// ============================================================

passwordInput.addEventListener(
    "keydown",
    function (event) {

        if (event.key === "Enter") {

            login();
        }

    }
);


// ============================================================
// FIREBASE AUTH STATE
// ============================================================

onAuthStateChanged(
    auth,
    async function (user) {

        // ----------------------------------------------------
        // No logged-in user
        // ----------------------------------------------------

        if (!user) {

            resetApplications();

            showLoginScreen();

            return;
        }


        console.log(
            "Existing Firebase session:",
            user.uid
        );


        try {

            // ------------------------------------------------
            // Get Firestore profile
            // ------------------------------------------------

            const userRef =
                doc(
                    db,
                    "users",
                    user.uid
                );


            const userSnapshot =
                await getDoc(
                    userRef
                );


            if (!userSnapshot.exists()) {

                await signOut(auth);

                showLoginScreen();

                return;
            }


            const userData =
                userSnapshot.data();


            // ------------------------------------------------
            // Check role
            // ------------------------------------------------

            if (
                userData.role !== "admin" &&
                userData.role !== "teacher"
            ) {

                await signOut(auth);

                showLoginScreen();

                return;
            }


            // ------------------------------------------------
            // Check institution
            // ------------------------------------------------

            if (!userData.institutionId) {

                await signOut(auth);

                showLoginScreen();

                return;
            }


            // ------------------------------------------------
            // Valid SIS user
            // ------------------------------------------------

            setApplicationsContext(user.uid, userData);

            showSIS();


        } catch (error) {

            console.error(
                "Session verification error:",
                error
            );


            await signOut(auth);

            showLoginScreen();
        }

    }
);


// ============================================================
// INITIAL PAGE
// ============================================================

showLoginScreen();

showPage("home");