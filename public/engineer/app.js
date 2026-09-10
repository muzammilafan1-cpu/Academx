import { initializeApp }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    collection,
    getDocs
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {

    apiKey: "AIzaSyC0xiNgbWSDeKP7QHifTPPMGUa1PylRbqk",

    authDomain: "school-app-backend-38e01.firebaseapp.com",

    projectId: "school-app-backend-38e01",

    storageBucket: "school-app-backend-38e01.firebasestorage.app",

    messagingSenderId: "601113409800",

    appId: "1:601113409800:web:543470df04f660464d14bd",

    measurementId: "G-SCTKJLXJ38"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

const loginForm = document.getElementById("loginForm");

const errorText = document.getElementById("errorText");

loginForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    errorText.innerHTML = "";

    const email = document.getElementById("email").value;

    const password = document.getElementById("password").value;

    try {

        const userCredential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

        const uid = userCredential.user.uid;

        const userDoc =
            await getDoc(doc(db, "internalUsers", uid));

        if (!userDoc.exists()) {

            errorText.innerHTML =
                "User record not found.";

            return;
        }

        const userData = userDoc.data();

        if (
            userData.role !== "Engineer"
        ) {

            errorText.innerHTML =
                "Access denied.";

            return;
        }

        if (
            userData.isActive !== true
        ) {

            errorText.innerHTML =
                "Account disabled.";

            return;
        }

        document.getElementById("loginScreen").style.display = "none";

        document.getElementById("portalContainer").style.display = "flex";

        loadUsers();

    } catch (error) {

        console.error(error);

        errorText.innerHTML =
            "Invalid email or password.";

    }

});
window.showPage = function(page) {

    // HIDE ALL PAGES

    document.getElementById("homePage")
        .style.display = "none";

    document.getElementById("inquiriesPage")
        .style.display = "none";

    document.getElementById("institutionsPage")
        .style.display = "none";

    document.getElementById("usersPage")
        .style.display = "none";

    document.getElementById("addAdminPage")
        .style.display = "none";

    // REMOVE ACTIVE NAV

    document.getElementById("homeNav")
        .classList.remove("active");

    document.getElementById("inquiriesNav")
        .classList.remove("active");

    document.getElementById("institutionsNav")
        .classList.remove("active");

    document.getElementById("usersNav")
        .classList.remove("active");

    const addDropdownMenu =
        document.getElementById("addDropdownMenu");

    if (addDropdownMenu) {

        addDropdownMenu.style.display = "none";

    }

    // SHOW SELECTED PAGE

    document.getElementById(page + "Page")
        .style.display = "block";

    const navElement =
        document.getElementById(page + "Nav");

    if (navElement) {

        navElement.classList.add("active");

    }

};

/* LOAD USERS */

async function loadUsers() {

    const usersTableBody =
        document.getElementById("usersTableBody");

    usersTableBody.innerHTML = "";

    try {

        const querySnapshot =
            await getDocs(collection(db, "users"));

        querySnapshot.forEach((docSnapshot) => {

            const user = docSnapshot.data();

            const row = `
                <tr>

                    <td>⋮</td>

                    <td>${user.name || "-"}</td>

                    <td>${user.email || "-"}</td>

                    <td>${user.institutionId || "---"}</td>

                    <td>${user.role || "-"}</td>

                    <td>
                        <span class="${user.isActive === false ? "status-inactive" : "status-active"}">
                            ${user.isActive === false ? "Inactive" : "Active"}
                        </span>
                    </td>

                </tr>
            `;

            usersTableBody.innerHTML += row;

        });

    } catch (error) {

        console.error(error);

    }

}
/* ADD DROPDOWN */

window.toggleAddMenu = function() {

    const menu =
        document.getElementById("addDropdownMenu");

    if (menu.style.display === "block") {

        menu.style.display = "none";

    } else {

        menu.style.display = "block";

    }

};
