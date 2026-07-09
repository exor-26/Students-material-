// employee-management/public/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-analytics.js";

// Your Firebase configuration object
const firebaseConfig = {
    apiKey: "AIzaSyCS4D3HMQnEDihCCkFEWnF8upVWuNxolXM",
    authDomain: "employee-management-faa27.firebaseapp.com",
    projectId: "employee-management-faa27",
    storageBucket: "employee-management-faa27.firebasestorage.app",
    messagingSenderId: "359482574331",
    appId: "1:359482574331:web:30ce33787c55ef1eeef75e",
    measurementId: "G-5W73G49HWK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export the initialized app (and other services if needed)
export { app, analytics };
