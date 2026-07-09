// employee-management/public/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-analytics.js";

// Your Firebase configuration object
const firebaseConfig = {
    apiKey: "....",
    authDomain: "employee-management-faa27.firebaseapp.com",
    projectId: "....",
    storageBucket: "...",
    messagingSenderId: ".,..",
    appId: "....",
    measurementId: "..."
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export the initialized app (and other services if needed)
export { app, analytics };
