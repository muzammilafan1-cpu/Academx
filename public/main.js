import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const db = getFirestore(app);

// ===============================
// Modal Functions
// ===============================

window.openModal = function () {
    document.getElementById("contactModal").style.display = "flex";
};

window.closeModal = function () {
    document.getElementById("contactModal").style.display = "none";
};

// Close modal when clicking outside it
window.onclick = function (event) {
    const modal = document.getElementById("contactModal");

    if (event.target === modal) {
        closeModal();
    }
};

// ===============================
// Inquiry Form
// ===============================

const inquiryForm = document.getElementById("inquiryForm");

inquiryForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    const submitButton = inquiryForm.querySelector(".submit-btn");

    submitButton.innerHTML = "Submitting...";
    submitButton.disabled = true;

    try {

        const institutionName = document.getElementById("institutionName").value.trim();
        const contactPerson = document.getElementById("contactPerson").value.trim();
        const email = document.getElementById("email").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const institutionType = document.getElementById("institutionType").value;
        const message = document.getElementById("message").value.trim();

        // Email Validation
        if (!email.includes("@")) {
            alert("Please enter a valid email address.");
            submitButton.innerHTML = "Submit Inquiry";
            submitButton.disabled = false;
            return;
        }

        await addDoc(collection(db, "inquiries"), {
            institutionName,
            contactPerson,
            email,
            phone,
            institutionType,
            message,
            createdAt: serverTimestamp()
        });

        alert("Thank you! Our team will contact you shortly.");

        inquiryForm.reset();
        closeModal();

    } catch (error) {

        console.error("Inquiry Error:", error);

        alert("Unable to submit your inquiry. Please try again in a few moments.");

    }

    submitButton.innerHTML = "Submit Inquiry";
    submitButton.disabled = false;

});