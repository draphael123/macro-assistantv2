// Firebase configuration
// Replace these values with your Firebase project config from:
// Firebase Console > Project Settings > General > Your apps > Web app

const firebaseConfig = {
  apiKey: "AIzaSyAo-QCPMIN64aQsFvtxHODLs28NDgX3LFY",
  authDomain: "snippetapp-ext.firebaseapp.com",
  projectId: "snippetapp-ext",
  storageBucket: "snippetapp-ext.firebasestorage.app",
  messagingSenderId: "316256352570",
  appId: "1:316256352570:web:406b90ef499258b1727803"
};

// Firebase SDK URLs (using CDN for extension compatibility)
const FIREBASE_SDK_VERSION = "10.7.1";
const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`;
const FIREBASE_AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth-compat.js`;
const FIREBASE_FIRESTORE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore-compat.js`;

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.firebaseConfig = firebaseConfig;
  window.FIREBASE_APP_URL = FIREBASE_APP_URL;
  window.FIREBASE_AUTH_URL = FIREBASE_AUTH_URL;
  window.FIREBASE_FIRESTORE_URL = FIREBASE_FIRESTORE_URL;
}
