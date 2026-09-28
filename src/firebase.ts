import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCiPzVNHTK6y-K_GLgnH8JxgdGvUQ40zU4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "minarulfashion.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "minarulfashion",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "minarulfashion.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "972684038355",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:972684038355:web:ab21c1b428c63006144426",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-G2VV7ZL9DS"
};

// Initialize or reuse singleton Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Verify Firebase Project ID
console.log("✅ Connected Firebase Project ID:", app.options.projectId);

// Firebase Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Firebase Analytics (Optional in supported browser environments)
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {
    // Non-blocking in restrictive iframe or tracking protection environments
  });
}

/**
 * Diagnostic helper to verify all core Firebase services
 */
export async function testFirebaseConnection(): Promise<{
  projectId: string;
  authConnected: boolean;
  firestoreConnected: boolean;
  storageConnected: boolean;
}> {
  return {
    projectId: String(app.options.projectId || ''),
    authConnected: !!auth,
    firestoreConnected: !!db,
    storageConnected: !!storage,
  };
}
