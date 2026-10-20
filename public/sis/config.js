// ============================================================
// Academx SIS: Settings > Configuration (read-only)
//
// Shows the school's details from institutions/{institutionId}.
// Nothing here can be changed from the SIS. Plan, billing and subscription
// are not shown.
//
// app.js creates this with initConfig({ db }).
// ============================================================

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


export function initConfig(env) {

    const db = env.db;

    const root = document.getElementById("configRoot");

    let S = { inst: null, data: null, error: "" };

    function esc(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
    }

    function row(label, valueHtml) {
        return "<div class=\"ax-dl-row\"><dt>" + esc(label) + "</dt><dd>" + valueHtml + "</dd></div>";
    }

    function setContext(institutionId) {
        if (S.inst !== institutionId) S = { inst: institutionId, data: null, error: "" };
        S.inst = institutionId;
    }

    function reset() {
        S = { inst: null, data: null, error: "" };
        if (root) root.innerHTML = "";
    }

    async function open() {

        if (!root || !S.inst) return;

        root.innerHTML = "<p class=\"ax-muted\">Loading…</p>";

        try {

            const snap = await getDoc(doc(db, "institutions/" + S.inst));

            S.data = snap.exists() ? snap.data() : null;

        } catch (error) {

            console.error("Configuration load error:", error);

            root.innerHTML = "<p class=\"ax-error-text\">" + esc(
                error.code === "permission-denied"
                    ? "Firestore rules don't allow reading the school details for this account yet."
                    : "Couldn't load the school details. " + error.message
            ) + "</p>";

            return;
        }

        render();
    }

    function render() {

        const d = S.data || {};

        const logo = typeof d.logoUrl === "string" && d.logoUrl.indexOf("https://") === 0
            ? "<img src=\"" + esc(d.logoUrl) + "\" alt=\"School logo\" style=\"max-width:160px;max-height:90px\">"
            : "<span class=\"ax-muted\">No logo</span>";

        const colour = typeof d.primaryColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(d.primaryColor)
            ? "<span style=\"display:inline-block;width:14px;height:14px;border-radius:4px;background:" +
              esc(d.primaryColor) + ";vertical-align:middle;margin-right:6px\"></span>" + esc(d.primaryColor)
            : "<span class=\"ax-muted\">Not set</span>";

        root.innerHTML =
            "<div class=\"ax-head\"><div><h2 class=\"ax-title\">Configuration</h2>" +
            "<p class=\"ax-sub\">School details. These are read-only here.</p></div></div>" +
            (S.data
                ? "<section class=\"ax-panel\"><dl class=\"ax-dl\">" +
                  row("School name", esc(d.name || "—")) +
                  row("Type", esc(d.type || "—")) +
                  row("Address", esc(d.address || "—")) +
                  row("Logo", logo) +
                  row("Brand colour", colour) +
                  row("School ID", "<span class=\"ax-mono\">" + esc(S.inst) + "</span>") +
                  "</dl></section>"
                : "<div class=\"ax-empty\"><strong>No school details yet</strong><p class=\"ax-muted\">Academx staff add these when the school is set up.</p></div>");
    }

    return {
        setContext: setContext,
        reset: reset,
        open: open
    };
}