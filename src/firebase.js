import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  increment,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBRK2YzwSKnhLxk_pdtLrI3WUDm6Ww_PrA",
  authDomain: "rj-portfolio-f7ab8.firebaseapp.com",
  projectId: "rj-portfolio-f7ab8",
  storageBucket: "rj-portfolio-f7ab8.firebasestorage.app",
  messagingSenderId: "839622942280",
  appId: "1:839622942280:web:519ba3a92e652ad58d427d",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── Works (each work is its own document in "works" collection) ──
export async function fetchWorks() {
  const snap = await getDocs(collection(db, "works"));
  return snap.docs.map((d) => d.data());
}

export async function saveWork(work) {
  await setDoc(doc(db, "works", work.id), work);
}

export async function deleteWork(id) {
  await deleteDoc(doc(db, "works", id));
}

// ── Settings (single document) ────────────────────────────────
export async function fetchSettings() {
  const snap = await getDoc(doc(db, "meta", "settings"));
  return snap.exists() ? snap.data() : null;
}

export async function saveSettings(settings) {
  await setDoc(doc(db, "meta", "settings"), settings);
}

// ── Visitor counter (single document, atomic increment) ───────
export async function incrementVisitorCount() {
  const ref = doc(db, "meta", "visitorCount");
  try {
    await setDoc(ref, { count: increment(1) }, { merge: true });
  } catch (e) {
    console.error("Failed to increment visitor count:", e);
  }
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data().count : 0;
}

export async function fetchVisitorCount() {
  const snap = await getDoc(doc(db, "meta", "visitorCount"));
  return snap.exists() ? snap.data().count : 0;
}

// ── Likes (stored on each work document as likeCount) ──────────
export async function setWorkLikeCount(workId, newCount) {
  await setDoc(doc(db, "works", workId), { likeCount: newCount }, { merge: true });
}

export async function adjustWorkLike(workId, delta) {
  const ref = doc(db, "works", workId);
  await setDoc(ref, { likeCount: increment(delta) }, { merge: true });
}
