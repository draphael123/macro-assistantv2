// SnippetApp Landing Page Script
// Handles Google Sign-In, demo animations, and UI interactions

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAo-QCPMIN64aQsFvtxHODLs28NDgX3LFY",
  authDomain: "snippetapp-ext.firebaseapp.com",
  projectId: "snippetapp-ext",
  storageBucket: "snippetapp-ext.firebasestorage.app",
  messagingSenderId: "316256352570",
  appId: "1:316256352570:web:406b90ef499258b1727803"
};

// Firebase SDK URLs
const FIREBASE_SDK_VERSION = "10.7.1";
const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`;
const FIREBASE_AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth-compat.js`;
const FIREBASE_FIRESTORE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore-compat.js`;

let firebase = null;
let auth = null;
let db = null;

// DOM Elements
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authStatus = document.getElementById('authStatus');
const demoLine = document.getElementById('demoLine');
const nav = document.querySelector('nav');

// Nav scroll state
function handleNavScroll() {
  if (window.scrollY > 10) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
}

window.addEventListener('scroll', handleNavScroll);
handleNavScroll(); // Check initial state

// Load Firebase SDK dynamically
async function loadFirebase() {
  return new Promise((resolve, reject) => {
    const appScript = document.createElement('script');
    appScript.src = FIREBASE_APP_URL;
    appScript.onload = () => {
      const authScript = document.createElement('script');
      authScript.src = FIREBASE_AUTH_URL;
      authScript.onload = () => {
        const firestoreScript = document.createElement('script');
        firestoreScript.src = FIREBASE_FIRESTORE_URL;
        firestoreScript.onload = () => {
          firebase = window.firebase;
          firebase.initializeApp(firebaseConfig);
          auth = firebase.auth();
          db = firebase.firestore();
          resolve();
        };
        firestoreScript.onerror = reject;
        document.head.appendChild(firestoreScript);
      };
      authScript.onerror = reject;
      document.head.appendChild(authScript);
    };
    appScript.onerror = reject;
    document.head.appendChild(appScript);
  });
}

// Sign in with Google
async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    const user = result.user;

    // Create/update user in Firestore
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      settings: {
        triggerPrefix: ';'
      }
    }, { merge: true });

    // Show success message
    showAuthSuccess();

  } catch (error) {
    console.error('Sign in error:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      alert('Sign in failed: ' + error.message);
    }
  }
}

// Show auth success
function showAuthSuccess() {
  googleSignInBtn.classList.add('hidden');
  authStatus.classList.remove('hidden');
}

// Check if already signed in
function checkAuthState() {
  auth.onAuthStateChanged((user) => {
    if (user) {
      showAuthSuccess();
    }
  });
}

// Demo animation - types shortcode then expands
function animateDemo() {
  const shortcode = ';ty';
  const expansion = 'Thank you so much for your help!';

  let phase = 0;
  // 0: typing shortcode
  // 1: pause
  // 2: expand (replace shortcode with expansion)
  // 3: pause with full expansion
  // 4: reset

  let charIndex = 0;

  function type() {
    if (phase === 0) {
      // Typing shortcode character by character
      if (charIndex <= shortcode.length) {
        const typed = shortcode.slice(0, charIndex);
        demoLine.innerHTML = `<span class="demo-shortcode">${typed}</span><span class="demo-cursor"></span>`;
        charIndex++;
        setTimeout(type, 120);
      } else {
        phase = 1;
        setTimeout(type, 600);
      }
    } else if (phase === 1) {
      // Brief pause before expansion
      phase = 2;
      charIndex = 0;
      type();
    } else if (phase === 2) {
      // Expansion animation - type out the expansion
      if (charIndex <= expansion.length) {
        const typed = expansion.slice(0, charIndex);
        demoLine.innerHTML = `<span class="demo-expansion">${typed}</span><span class="demo-cursor"></span>`;
        charIndex++;
        setTimeout(type, 25);
      } else {
        phase = 3;
        setTimeout(type, 2500);
      }
    } else if (phase === 3) {
      // Pause with full expansion shown
      phase = 4;
      type();
    } else if (phase === 4) {
      // Reset - clear and start over
      phase = 0;
      charIndex = 0;
      demoLine.innerHTML = '<span class="demo-cursor"></span>';
      setTimeout(type, 1000);
    }
  }

  // Start animation after a short delay
  setTimeout(type, 1500);
}

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href === '#') return;

    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// Event listeners
if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', signInWithGoogle);
}

// Initialize
(async function init() {
  try {
    await loadFirebase();
    checkAuthState();
    animateDemo();
  } catch (error) {
    console.error('Failed to load Firebase:', error);
    // Still run demo animation
    animateDemo();
  }
})();
