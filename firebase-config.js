// firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

export const firebaseConfig = {
    apiKey: "AIzaSyD33FV6wnVeEiM3-DhSgqigSZcp88a2ztc",
    authDomain: "edupath-lanka-af6ae.firebaseapp.com",
    projectId: "edupath-lanka-af6ae",
    databaseURL: "https://edupath-lanka-af6ae-default-rtdb.asia-southeast1.firebasedatabase.app/",
    storageBucket: "edupath-lanka-af6ae.firebasestorage.app",
    messagingSenderId: "855275808922",
    appId: "1:855275808922:web:746f7329dc12ad248f1723"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
