// SnippetApp Popup Script
// Handles auth, snippet display, and user interactions

let firebase = null;
let auth = null;
let db = null;
let currentUser = null;
let snippets = [];
let userSettings = { triggerPrefix: ';' };

// DOM Elements
const loadingView = document.getElementById('loadingView');
const signInView = document.getElementById('signInView');
const mainView = document.getElementById('mainView');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const userAvatar = document.getElementById('userAvatar');
const userDropdown = document.getElementById('userDropdown');
const settingsBtn = document.getElementById('settingsBtn');
const signOutBtn = document.getElementById('signOutBtn');
const searchInput = document.getElementById('searchInput');
const snippetList = document.getElementById('snippetList');
const emptyState = document.getElementById('emptyState');
const addSnippetBtn = document.getElementById('addSnippetBtn');

// Initialize Firebase SDKs
async function initFirebase() {
  return new Promise((resolve, reject) => {
    // Load Firebase App
    const appScript = document.createElement('script');
    appScript.src = window.FIREBASE_APP_URL;
    appScript.onload = () => {
      // Load Firebase Auth
      const authScript = document.createElement('script');
      authScript.src = window.FIREBASE_AUTH_URL;
      authScript.onload = () => {
        // Load Firebase Firestore
        const firestoreScript = document.createElement('script');
        firestoreScript.src = window.FIREBASE_FIRESTORE_URL;
        firestoreScript.onload = () => {
          // Initialize Firebase
          firebase = window.firebase;
          if (!firebase.apps.length) {
            firebase.initializeApp(window.firebaseConfig);
          }
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

// Check auth state
async function checkAuthState() {
  const result = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
  if (result.user) {
    currentUser = result.user;
    await loadUserData();
    showMainView();
  } else {
    showSignInView();
  }
}

// Google Sign In using Firebase Auth popup
async function signInWithGoogle() {
  try {
    showLoading();

    // Use Firebase Auth with popup
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');

    const userCredential = await auth.signInWithPopup(provider);
    const user = userCredential.user;

    // Create/update user document in Firestore
    await createOrUpdateUser(user);

    // Store user info locally
    currentUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    };

    await chrome.runtime.sendMessage({ type: 'SET_USER', user: currentUser });

    // Load snippets
    await loadUserData();
    showMainView();

  } catch (error) {
    console.error('Sign in error:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      alert('Sign in failed: ' + error.message);
    }
    showSignInView();
  }
}

// Create or update user document in Firestore
async function createOrUpdateUser(user) {
  const userRef = db.collection('users').doc(user.uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    // Create new user
    await userRef.set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      settings: {
        triggerPrefix: ';'
      }
    });
  } else {
    // Update existing user
    await userRef.update({
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    });
  }
}

// Load user data (settings and snippets)
async function loadUserData() {
  try {
    // Load settings
    const settingsResult = await chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' });
    userSettings = settingsResult.settings;

    // Fetch snippets from Firestore
    await fetchSnippets();

  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// Fetch snippets from Firestore
async function fetchSnippets() {
  if (!currentUser || !db) return;

  try {
    // Fetch own snippets
    const ownSnippetsQuery = db.collection('snippets')
      .where('ownerId', '==', currentUser.uid);
    const ownSnippetsSnapshot = await ownSnippetsQuery.get();

    const ownSnippets = ownSnippetsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      isOwned: true
    }));

    // Fetch shared snippets
    const sharedSnippetsQuery = db.collection('snippets')
      .where('sharedWith', 'array-contains', currentUser.uid);
    const sharedSnippetsSnapshot = await sharedSnippetsQuery.get();

    const sharedSnippets = sharedSnippetsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      isOwned: false,
      isSharedWithMe: true
    }));

    // Combine and sort by label
    snippets = [...ownSnippets, ...sharedSnippets].sort((a, b) =>
      (a.label || '').localeCompare(b.label || '')
    );

    // Update cache
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SNIPPET_CACHE',
      snippets: snippets
    });

    renderSnippets();

  } catch (error) {
    console.error('Error fetching snippets:', error);
  }
}

// Render snippets list
function renderSnippets(filterText = '') {
  const filteredSnippets = snippets.filter(s => {
    const searchLower = filterText.toLowerCase();
    return (s.label || '').toLowerCase().includes(searchLower) ||
           (s.shortcode || '').toLowerCase().includes(searchLower);
  });

  if (filteredSnippets.length === 0) {
    snippetList.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  snippetList.classList.remove('hidden');
  emptyState.classList.add('hidden');

  snippetList.innerHTML = filteredSnippets.map(snippet => `
    <div class="snippet-item" data-id="${snippet.id}">
      <div class="snippet-info">
        <div class="snippet-label">
          ${escapeHtml(snippet.label || 'Untitled')}
          ${snippet.isSharedWithMe ? '<span class="shared-badge">Shared</span>' : ''}
        </div>
        <div class="snippet-shortcode">${userSettings.triggerPrefix}${escapeHtml(snippet.shortcode)}</div>
        <div class="snippet-preview">${escapeHtml(truncate(snippet.expansion, 50))}</div>
      </div>
    </div>
  `).join('');

  // Add click handlers
  snippetList.querySelectorAll('.snippet-item').forEach(item => {
    item.addEventListener('click', () => {
      const snippetId = item.dataset.id;
      const snippet = snippets.find(s => s.id === snippetId);
      if (snippet) {
        copySnippetExpansion(snippet);
      }
    });
  });
}

// Copy snippet expansion to clipboard
async function copySnippetExpansion(snippet) {
  try {
    let expansion = snippet.expansion;
    expansion = applyDynamicTokens(expansion);
    await navigator.clipboard.writeText(expansion);

    // Show brief feedback
    const item = snippetList.querySelector(`[data-id="${snippet.id}"]`);
    if (item) {
      item.style.background = '#e8f5e9';
      setTimeout(() => {
        item.style.background = 'white';
      }, 200);
    }
  } catch (error) {
    console.error('Failed to copy:', error);
  }
}

// Apply dynamic tokens
function applyDynamicTokens(text) {
  const now = new Date();

  // {date} - Today's date
  text = text.replace(/\{date\}/g, now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }));

  // {time} - Current time
  text = text.replace(/\{time\}/g, now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }));

  // {cursor} - Remove for clipboard copy (only used in content script)
  text = text.replace(/\{cursor\}/g, '');

  return text;
}

// Sign out
async function signOut() {
  try {
    // Sign out of Firebase
    if (auth) {
      await auth.signOut();
    }

    // Clear local data
    await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });

    currentUser = null;
    snippets = [];
    showSignInView();

  } catch (error) {
    console.error('Sign out error:', error);
  }
}

// UI Helpers
function showLoading() {
  loadingView.classList.remove('hidden');
  signInView.classList.add('hidden');
  mainView.classList.add('hidden');
}

function showSignInView() {
  loadingView.classList.add('hidden');
  signInView.classList.remove('hidden');
  mainView.classList.add('hidden');
}

function showMainView() {
  loadingView.classList.add('hidden');
  signInView.classList.add('hidden');
  mainView.classList.remove('hidden');

  if (currentUser && currentUser.photoURL) {
    userAvatar.src = currentUser.photoURL;
  } else {
    userAvatar.src = 'data:image/svg+xml,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#999">
        <circle cx="12" cy="8" r="4"/>
        <path d="M12 14c-6 0-9 3-9 6v2h18v-2c0-3-3-6-9-6z"/>
      </svg>
    `);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Event Listeners
googleSignInBtn.addEventListener('click', signInWithGoogle);

userAvatar.addEventListener('click', (e) => {
  e.stopPropagation();
  userDropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  userDropdown.classList.add('hidden');
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

signOutBtn.addEventListener('click', signOut);

searchInput.addEventListener('input', (e) => {
  renderSnippets(e.target.value);
});

addSnippetBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Listen for refresh triggers from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRIGGER_REFRESH') {
    fetchSnippets();
  }
});

// Initialize
(async function init() {
  try {
    await initFirebase();
    await checkAuthState();
  } catch (error) {
    console.error('Initialization error:', error);
    showSignInView();
  }
})();
