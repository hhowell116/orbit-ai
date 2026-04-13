import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC1uA2s8g3qw0q3hNw2FJLFJfBhVY1lNww",
  authDomain: "orbitai.work",
  projectId: "orbitai-dashboard",
  storageBucket: "orbitai-dashboard.firebasestorage.app",
  messagingSenderId: "1094212533869",
  appId: "1:1094212533869:web:93287646c9fa3f15910964",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
