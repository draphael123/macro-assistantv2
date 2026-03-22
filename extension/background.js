// SnippetApp Background Service Worker
// Handles auth state, snippet caching, and periodic refresh

const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SNIPPETS') {
    getSnippetsFromCache().then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'REFRESH_SNIPPETS') {
    refreshSnippetCache().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_AUTH_STATE') {
    chrome.storage.local.get(['user'], (result) => {
      sendResponse({ user: result.user || null });
    });
    return true;
  }

  if (message.type === 'SET_USER') {
    chrome.storage.local.set({ user: message.user }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'SIGN_OUT') {
    chrome.storage.local.remove(['user', 'snippetCache'], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_USER_SETTINGS') {
    chrome.storage.local.get(['userSettings'], (result) => {
      sendResponse({ settings: result.userSettings || { triggerPrefix: ';' } });
    });
    return true;
  }

  if (message.type === 'SET_USER_SETTINGS') {
    chrome.storage.local.set({ userSettings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Get snippets from local cache
async function getSnippetsFromCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['snippetCache', 'cacheTimestamp'], (result) => {
      resolve({
        snippets: result.snippetCache || [],
        timestamp: result.cacheTimestamp || null
      });
    });
  });
}

// Refresh snippet cache (called from popup after Firestore fetch)
async function refreshSnippetCache() {
  // This is triggered by the popup/options page after fetching from Firestore
  // The actual Firestore call happens in the UI context where Firebase is loaded
  return { success: true };
}

// Update cache with new snippets
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_SNIPPET_CACHE') {
    chrome.storage.local.set({
      snippetCache: message.snippets,
      cacheTimestamp: Date.now()
    }, () => {
      // Notify all content scripts of the update
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'SNIPPETS_UPDATED' }).catch(() => {
            // Tab might not have content script, ignore error
          });
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }
});

// Set up periodic cache refresh alarm
chrome.alarms.create('refreshSnippets', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshSnippets') {
    // Trigger a cache refresh check
    chrome.storage.local.get(['user'], (result) => {
      if (result.user) {
        // Notify popup to refresh if it's open
        chrome.runtime.sendMessage({ type: 'TRIGGER_REFRESH' }).catch(() => {
          // Popup not open, will refresh on next open
        });
      }
    });
  }
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('SnippetApp installed');
    // Initialize default settings
    chrome.storage.local.set({
      userSettings: { triggerPrefix: ';' },
      snippetCache: [],
      cacheTimestamp: null
    });
  }
});

// Handle window focus to refresh cache
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    chrome.storage.local.get(['user', 'cacheTimestamp'], (result) => {
      if (result.user && result.cacheTimestamp) {
        const age = Date.now() - result.cacheTimestamp;
        if (age > CACHE_REFRESH_INTERVAL) {
          chrome.runtime.sendMessage({ type: 'TRIGGER_REFRESH' }).catch(() => {});
        }
      }
    });
  }
});
