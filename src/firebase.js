import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCAFXdXRxZBD8e45ARF4NiU7lYVTnjInAU",
  authDomain: "agromind-2df80.firebaseapp.com",
  projectId: "agromind-2df80",
  storageBucket: "agromind-2df80.firebasestorage.app",
  messagingSenderId: "474460735163",
  appId: "1:474460735163:web:a8743da7ad56ce98b2cb9e",
  measurementId: "G-13MBFFYVNF"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;