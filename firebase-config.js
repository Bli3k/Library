// Firebase Configuration — BCST Library System
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyAz7248dbOki2PMVs4pgp9SYWF-sBfnWck",
  authDomain: "library-1e4eb.firebaseapp.com",
  projectId: "library-1e4eb",
  storageBucket: "library-1e4eb.firebasestorage.app",
  messagingSenderId: "1038418997545",
  appId: "1:1038418997545:web:b98fc3af283de2b4c50738",
  measurementId: "G-EDG8T6W0XH"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
export default app;