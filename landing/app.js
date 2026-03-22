// SnippetApp Landing Page Script
// Handles Google Sign-In and demo animations

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
const navSignIn = document.getElementById('navSignIn');
const authStatus = document.getElementById('authStatus');
const demoLine = document.getElementById('demoLine');

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
  navSignIn.textContent = 'Signed In';
  navSignIn.style.background = '#28a745';
}

// Check if already signed in
function checkAuthState() {
  auth.onAuthStateChanged((user) => {
    if (user) {
      showAuthSuccess();
    }
  });
}

// Demo animation
function animateDemo() {
  const shortcode = ';sig';
  const expansion = `Best regards,
Daniel Raphael
Fountain Vitality`;

  let phase = 0; // 0: typing shortcode, 1: pause, 2: expand, 3: pause, 4: reset
  let charIndex = 0;

  function type() {
    if (phase === 0) {
      // Typing shortcode
      if (charIndex <= shortcode.length) {
        demoLine.innerHTML = `<span class="demo-shortcode">${shortcode.slice(0, charIndex)}</span><span class="demo-cursor"></span>`;
        charIndex++;
        setTimeout(type, 150);
      } else {
        phase = 1;
        setTimeout(type, 800);
      }
    } else if (phase === 1) {
      // Pause before expansion
      phase = 2;
      charIndex = 0;
      type();
    } else if (phase === 2) {
      // Expanding
      const lines = expansion.split('\n');
      const displayLines = lines.slice(0, Math.min(3, lines.length));
      demoLine.innerHTML = `<span class="demo-expansion">${displayLines.join('<br>')}</span><span class="demo-cursor"></span>`;
      phase = 3;
      setTimeout(type, 3000);
    } else if (phase === 3) {
      // Pause after expansion
      phase = 4;
      type();
    } else if (phase === 4) {
      // Reset
      phase = 0;
      charIndex = 0;
      demoLine.innerHTML = '<span class="demo-cursor"></span>';
      setTimeout(type, 1000);
    }
  }

  // Start animation after a short delay
  setTimeout(type, 2000);
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
googleSignInBtn.addEventListener('click', signInWithGoogle);
navSignIn.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('get-started').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
});

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
