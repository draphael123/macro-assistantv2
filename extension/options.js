// SnippetApp Options Page Script
// Handles snippet CRUD, settings, and sharing

let firebase = null;
let auth = null;
let db = null;
let currentUser = null;
let snippets = [];
let userSettings = { triggerPrefix: ';' };
let editingSnippetId = null;
let sharingSnippetId = null;
let deletingSnippetId = null;

// DOM Elements
const loadingView = document.getElementById('loadingView');
const signInView = document.getElementById('signInView');
const mainView = document.getElementById('mainView');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const signOutBtn = document.getElementById('signOutBtn');
const triggerPrefixSelect = document.getElementById('triggerPrefixSelect');
const customPrefixRow = document.getElementById('customPrefixRow');
const customPrefixInput = document.getElementById('customPrefixInput');
const addSnippetBtn = document.getElementById('addSnippetBtn');
const snippetTableContainer = document.getElementById('snippetTableContainer');
const snippetTableBody = document.getElementById('snippetTableBody');
const emptyState = document.getElementById('emptyState');

// Modal Elements
const snippetModal = document.getElementById('snippetModal');
const modalTitle = document.getElementById('modalTitle');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const modalSave = document.getElementById('modalSave');
const snippetLabel = document.getElementById('snippetLabel');
const snippetShortcode = document.getElementById('snippetShortcode');
const snippetExpansion = document.getElementById('snippetExpansion');
const snippetTags = document.getElementById('snippetTags');

// Share Modal Elements
const shareModal = document.getElementById('shareModal');
const shareModalClose = document.getElementById('shareModalClose');
const shareModalCancel = document.getElementById('shareModalCancel');
const shareEmail = document.getElementById('shareEmail');
const addShareBtn = document.getElementById('addShareBtn');
const shareUserList = document.getElementById('shareUserList');

// Delete Modal Elements
const deleteModal = document.getElementById('deleteModal');
const deleteModalClose = document.getElementById('deleteModalClose');
const deleteModalCancel = document.getElementById('deleteModalCancel');
const deleteModalConfirm = document.getElementById('deleteModalConfirm');

// Initialize Firebase SDKs
async function initFirebase() {
  return new Promise((resolve, reject) => {
    const appScript = document.createElement('script');
    appScript.src = window.FIREBASE_APP_URL;
    appScript.onload = () => {
      const authScript = document.createElement('script');
      authScript.src = window.FIREBASE_AUTH_URL;
      authScript.onload = () => {
        const firestoreScript = document.createElement('script');
        firestoreScript.src = window.FIREBASE_FIRESTORE_URL;
        firestoreScript.onload = () => {
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

// Load user data
async function loadUserData() {
  try {
    // Load settings from storage
    const settingsResult = await chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' });
    userSettings = settingsResult.settings;
    updateSettingsUI();

    // Also try to load from Firestore for sync
    if (db && currentUser) {
      const userDoc = await db.collection('users').doc(currentUser.uid).get();
      if (userDoc.exists && userDoc.data().settings) {
        userSettings = userDoc.data().settings;
        await chrome.runtime.sendMessage({ type: 'SET_USER_SETTINGS', settings: userSettings });
        updateSettingsUI();
      }
    }

    // Fetch snippets
    await fetchSnippets();

  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// Update settings UI
function updateSettingsUI() {
  const prefix = userSettings.triggerPrefix || ';';
  const standardPrefixes = [';', '//', '::', '\\\\'];

  if (standardPrefixes.includes(prefix)) {
    triggerPrefixSelect.value = prefix;
    customPrefixRow.classList.add('hidden');
  } else {
    triggerPrefixSelect.value = 'custom';
    customPrefixRow.classList.remove('hidden');
    customPrefixInput.value = prefix;
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

    // Combine and sort
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

// Render snippets table
function renderSnippets() {
  if (snippets.length === 0) {
    snippetTableContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  snippetTableContainer.classList.remove('hidden');
  emptyState.classList.add('hidden');

  snippetTableBody.innerHTML = snippets.map(snippet => `
    <tr data-id="${snippet.id}">
      <td>
        ${escapeHtml(snippet.label || 'Untitled')}
        ${snippet.isSharedWithMe ? '<span class="shared-badge">Shared with me</span>' : ''}
      </td>
      <td class="snippet-shortcode">${userSettings.triggerPrefix}${escapeHtml(snippet.shortcode)}</td>
      <td class="snippet-expansion">${escapeHtml(snippet.expansion || '')}</td>
      <td class="snippet-actions">
        ${snippet.isOwned ? `
          <button class="action-btn edit" data-action="edit" data-id="${snippet.id}">Edit</button>
          <button class="action-btn share" data-action="share" data-id="${snippet.id}">Share</button>
          <button class="action-btn delete" data-action="delete" data-id="${snippet.id}">Delete</button>
        ` : `
          <span style="color: #999; font-size: 13px;">Read only</span>
        `}
      </td>
    </tr>
  `).join('');

  // Add event listeners
  snippetTableBody.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', handleSnippetAction);
  });
}

// Handle snippet action buttons
function handleSnippetAction(event) {
  const action = event.target.dataset.action;
  const snippetId = event.target.dataset.id;
  const snippet = snippets.find(s => s.id === snippetId);

  if (!snippet) return;

  switch (action) {
    case 'edit':
      openEditModal(snippet);
      break;
    case 'share':
      openShareModal(snippet);
      break;
    case 'delete':
      openDeleteModal(snippet);
      break;
  }
}

// Open snippet modal for adding
function openAddModal() {
  editingSnippetId = null;
  modalTitle.textContent = 'New Snippet';
  snippetLabel.value = '';
  snippetShortcode.value = '';
  snippetExpansion.value = '';
  snippetTags.value = '';
  snippetModal.classList.remove('hidden');
  snippetLabel.focus();
}

// Open snippet modal for editing
function openEditModal(snippet) {
  editingSnippetId = snippet.id;
  modalTitle.textContent = 'Edit Snippet';
  snippetLabel.value = snippet.label || '';
  snippetShortcode.value = snippet.shortcode || '';
  snippetExpansion.value = snippet.expansion || '';
  snippetTags.value = (snippet.tags || []).join(', ');
  snippetModal.classList.remove('hidden');
  snippetLabel.focus();
}

// Close snippet modal
function closeSnippetModal() {
  snippetModal.classList.add('hidden');
  editingSnippetId = null;
}

// Save snippet
async function saveSnippet() {
  const label = snippetLabel.value.trim();
  const shortcode = snippetShortcode.value.trim().toLowerCase();
  const expansion = snippetExpansion.value;
  const tags = snippetTags.value.split(',').map(t => t.trim()).filter(t => t);

  if (!shortcode) {
    alert('Please enter a shortcode');
    snippetShortcode.focus();
    return;
  }

  if (!expansion) {
    alert('Please enter an expansion');
    snippetExpansion.focus();
    return;
  }

  // Check for duplicate shortcode (excluding current snippet if editing)
  const existingSnippet = snippets.find(s =>
    s.shortcode.toLowerCase() === shortcode &&
    s.id !== editingSnippetId &&
    s.isOwned
  );

  if (existingSnippet) {
    alert('A snippet with this shortcode already exists');
    snippetShortcode.focus();
    return;
  }

  try {
    const snippetData = {
      label,
      shortcode,
      expansion,
      tags,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (editingSnippetId) {
      // Update existing snippet
      await db.collection('snippets').doc(editingSnippetId).update(snippetData);
    } else {
      // Create new snippet
      snippetData.ownerId = currentUser.uid;
      snippetData.isShared = false;
      snippetData.sharedWith = [];
      snippetData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('snippets').add(snippetData);
    }

    closeSnippetModal();
    await fetchSnippets();

  } catch (error) {
    console.error('Error saving snippet:', error);
    alert('Failed to save snippet: ' + error.message);
  }
}

// Open share modal
async function openShareModal(snippet) {
  sharingSnippetId = snippet.id;
  shareEmail.value = '';
  await renderSharedUsers(snippet);
  shareModal.classList.remove('hidden');
  shareEmail.focus();
}

// Render shared users list
async function renderSharedUsers(snippet) {
  const sharedWith = snippet.sharedWith || [];

  if (sharedWith.length === 0) {
    shareUserList.innerHTML = '<p style="color: #999; text-align: center; padding: 16px;">Not shared with anyone yet</p>';
    return;
  }

  // Fetch user emails
  const userEmails = await Promise.all(sharedWith.map(async (uid) => {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      return { uid, email: userDoc.exists ? userDoc.data().email : 'Unknown user' };
    } catch (error) {
      return { uid, email: 'Unknown user' };
    }
  }));

  shareUserList.innerHTML = userEmails.map(user => `
    <div class="share-user-item">
      <span class="share-user-email">${escapeHtml(user.email)}</span>
      <button class="remove-share-btn" data-uid="${user.uid}">&times;</button>
    </div>
  `).join('');

  // Add remove handlers
  shareUserList.querySelectorAll('.remove-share-btn').forEach(btn => {
    btn.addEventListener('click', () => removeShare(btn.dataset.uid));
  });
}

// Add share
async function addShare() {
  const email = shareEmail.value.trim().toLowerCase();

  if (!email) {
    alert('Please enter an email address');
    return;
  }

  try {
    // Look up user by email
    const usersQuery = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (usersQuery.empty) {
      alert('No user found with that email. They need to sign in to SnippetApp first.');
      return;
    }

    const targetUser = usersQuery.docs[0];
    const targetUserId = targetUser.id;

    if (targetUserId === currentUser.uid) {
      alert("You can't share a snippet with yourself");
      return;
    }

    // Update snippet's sharedWith array
    await db.collection('snippets').doc(sharingSnippetId).update({
      sharedWith: firebase.firestore.FieldValue.arrayUnion(targetUserId),
      isShared: true
    });

    shareEmail.value = '';
    await fetchSnippets();

    const snippet = snippets.find(s => s.id === sharingSnippetId);
    if (snippet) {
      await renderSharedUsers(snippet);
    }

  } catch (error) {
    console.error('Error sharing snippet:', error);
    alert('Failed to share snippet: ' + error.message);
  }
}

// Remove share
async function removeShare(uid) {
  try {
    await db.collection('snippets').doc(sharingSnippetId).update({
      sharedWith: firebase.firestore.FieldValue.arrayRemove(uid)
    });

    await fetchSnippets();

    const snippet = snippets.find(s => s.id === sharingSnippetId);
    if (snippet) {
      // Check if still shared with anyone
      if (snippet.sharedWith.length === 0) {
        await db.collection('snippets').doc(sharingSnippetId).update({
          isShared: false
        });
      }
      await renderSharedUsers(snippet);
    }

  } catch (error) {
    console.error('Error removing share:', error);
    alert('Failed to remove share: ' + error.message);
  }
}

// Close share modal
function closeShareModal() {
  shareModal.classList.add('hidden');
  sharingSnippetId = null;
}

// Open delete modal
function openDeleteModal(snippet) {
  deletingSnippetId = snippet.id;
  deleteModal.classList.remove('hidden');
}

// Close delete modal
function closeDeleteModal() {
  deleteModal.classList.add('hidden');
  deletingSnippetId = null;
}

// Confirm delete
async function confirmDelete() {
  if (!deletingSnippetId) return;

  try {
    await db.collection('snippets').doc(deletingSnippetId).delete();
    closeDeleteModal();
    await fetchSnippets();
  } catch (error) {
    console.error('Error deleting snippet:', error);
    alert('Failed to delete snippet: ' + error.message);
  }
}

// Save settings
async function saveSettings() {
  let prefix = triggerPrefixSelect.value;

  if (prefix === 'custom') {
    prefix = customPrefixInput.value.trim();
    if (!prefix) {
      alert('Please enter a custom prefix');
      customPrefixInput.focus();
      return;
    }
  }

  userSettings.triggerPrefix = prefix;

  try {
    // Save to local storage
    await chrome.runtime.sendMessage({ type: 'SET_USER_SETTINGS', settings: userSettings });

    // Save to Firestore
    if (db && currentUser) {
      await db.collection('users').doc(currentUser.uid).update({
        'settings.triggerPrefix': prefix
      });
    }

    // Notify content scripts
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SNIPPET_CACHE',
      snippets: snippets
    });

    // Update table display
    renderSnippets();

  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Sign out
async function signOut() {
  try {
    if (auth) {
      await auth.signOut();
    }

    await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
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

  if (currentUser) {
    userName.textContent = currentUser.displayName || currentUser.email;
    if (currentUser.photoURL) {
      userAvatar.src = currentUser.photoURL;
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event Listeners
signOutBtn.addEventListener('click', signOut);

triggerPrefixSelect.addEventListener('change', () => {
  if (triggerPrefixSelect.value === 'custom') {
    customPrefixRow.classList.remove('hidden');
    customPrefixInput.focus();
  } else {
    customPrefixRow.classList.add('hidden');
    saveSettings();
  }
});

customPrefixInput.addEventListener('blur', saveSettings);
customPrefixInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveSettings();
  }
});

addSnippetBtn.addEventListener('click', openAddModal);

modalClose.addEventListener('click', closeSnippetModal);
modalCancel.addEventListener('click', closeSnippetModal);
modalSave.addEventListener('click', saveSnippet);

shareModalClose.addEventListener('click', closeShareModal);
shareModalCancel.addEventListener('click', closeShareModal);
addShareBtn.addEventListener('click', addShare);
shareEmail.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addShare();
  }
});

deleteModalClose.addEventListener('click', closeDeleteModal);
deleteModalCancel.addEventListener('click', closeDeleteModal);
deleteModalConfirm.addEventListener('click', confirmDelete);

// Close modals on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSnippetModal();
    closeShareModal();
    closeDeleteModal();
  }
});

// Close modals on overlay click
snippetModal.addEventListener('click', (e) => {
  if (e.target === snippetModal) closeSnippetModal();
});
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) closeShareModal();
});
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteModal();
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
