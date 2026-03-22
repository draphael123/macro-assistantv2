// SnippetApp Content Script
// Listens for keystrokes and expands shortcodes into full snippets

let snippetCache = [];
let userSettings = { triggerPrefix: ';' };
let isEnabled = true;

// Load snippets and settings from background
async function loadData() {
  try {
    const [snippetsResult, settingsResult] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_SNIPPETS' }),
      chrome.runtime.sendMessage({ type: 'GET_USER_SETTINGS' })
    ]);

    snippetCache = snippetsResult.snippets || [];
    userSettings = settingsResult.settings || { triggerPrefix: ';' };
  } catch (error) {
    console.error('SnippetApp: Error loading data', error);
  }
}

// Get text before cursor in an input/textarea
function getTextBeforeCursor(element) {
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    const cursorPos = element.selectionStart;
    return element.value.substring(0, cursorPos);
  }
  return '';
}

// Get text before cursor in a contenteditable element
function getTextBeforeCursorContentEditable() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return '';

  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(range.startContainer);
  preCaretRange.setEnd(range.startContainer, range.startOffset);

  return preCaretRange.toString();
}

// Get the last word from text (the potential shortcode)
function getLastWord(text) {
  // Match word characters, allowing for the trigger prefix
  const match = text.match(/(\S+)$/);
  return match ? match[1] : '';
}

// Replace text in input/textarea
function replaceInInputElement(element, shortcodeWithPrefix, expansion) {
  const cursorPos = element.selectionStart;
  const textBefore = element.value.substring(0, cursorPos);
  const textAfter = element.value.substring(cursorPos);

  // Find the position where the shortcode starts
  const shortcodeStart = textBefore.lastIndexOf(shortcodeWithPrefix);
  if (shortcodeStart === -1) return false;

  const newTextBefore = textBefore.substring(0, shortcodeStart);

  // Handle {cursor} token
  let finalExpansion = expansion;
  let cursorOffset = expansion.length;
  const cursorMatch = expansion.match(/\{cursor\}/);
  if (cursorMatch) {
    cursorOffset = cursorMatch.index;
    finalExpansion = expansion.replace(/\{cursor\}/g, '');
  }

  element.value = newTextBefore + finalExpansion + textAfter;

  // Set cursor position
  const newCursorPos = newTextBefore.length + cursorOffset;
  element.setSelectionRange(newCursorPos, newCursorPos);

  // Trigger input event for frameworks that listen to it
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  return true;
}

// Replace text in contenteditable element
function replaceInContentEditable(shortcodeWithPrefix, expansion) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return false;

  const range = selection.getRangeAt(0);
  const textNode = range.startContainer;

  if (textNode.nodeType !== Node.TEXT_NODE) return false;

  const text = textNode.textContent;
  const cursorPos = range.startOffset;
  const textBefore = text.substring(0, cursorPos);

  // Find the shortcode position
  const shortcodeStart = textBefore.lastIndexOf(shortcodeWithPrefix);
  if (shortcodeStart === -1) return false;

  // Handle {cursor} token
  let finalExpansion = expansion;
  let cursorOffset = expansion.length;
  const cursorMatch = expansion.match(/\{cursor\}/);
  if (cursorMatch) {
    cursorOffset = cursorMatch.index;
    finalExpansion = expansion.replace(/\{cursor\}/g, '');
  }

  const newText = text.substring(0, shortcodeStart) + finalExpansion + text.substring(cursorPos);
  textNode.textContent = newText;

  // Set cursor position
  const newCursorPos = shortcodeStart + cursorOffset;
  const newRange = document.createRange();
  newRange.setStart(textNode, newCursorPos);
  newRange.setEnd(textNode, newCursorPos);
  selection.removeAllRanges();
  selection.addRange(newRange);

  // Trigger input event
  textNode.parentElement.dispatchEvent(new Event('input', { bubbles: true }));

  return true;
}

// Apply dynamic tokens to expansion text
async function applyDynamicTokens(text) {
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

  // {clipboard} - Clipboard content
  try {
    const clipboardText = await navigator.clipboard.readText();
    text = text.replace(/\{clipboard\}/g, clipboardText);
  } catch (error) {
    // Clipboard access denied, remove the token
    text = text.replace(/\{clipboard\}/g, '');
  }

  return text;
}

// Try to expand a shortcode
async function tryExpand(element, isContentEditable) {
  if (!isEnabled || snippetCache.length === 0) return;

  const prefix = userSettings.triggerPrefix || ';';

  let textBefore;
  if (isContentEditable) {
    textBefore = getTextBeforeCursorContentEditable();
  } else {
    textBefore = getTextBeforeCursor(element);
  }

  const lastWord = getLastWord(textBefore);

  // Check if word starts with the trigger prefix
  if (!lastWord.startsWith(prefix)) return;

  // Get the shortcode (without prefix)
  const shortcode = lastWord.slice(prefix.length);
  if (!shortcode) return;

  // Find matching snippet
  const snippet = snippetCache.find(s =>
    s.shortcode && s.shortcode.toLowerCase() === shortcode.toLowerCase()
  );

  if (!snippet) return;

  // Apply dynamic tokens
  let expansion = await applyDynamicTokens(snippet.expansion);

  // Replace the shortcode with expansion
  if (isContentEditable) {
    replaceInContentEditable(lastWord, expansion);
  } else {
    replaceInInputElement(element, lastWord, expansion);
  }
}

// Handle keyup events
function handleKeyUp(event) {
  // Only trigger on space, enter, tab, or punctuation (to complete a word)
  const triggerKeys = [' ', 'Enter', 'Tab', '.', ',', '!', '?', ':', ';', ')', ']', '}'];
  if (!triggerKeys.includes(event.key)) return;

  const element = event.target;

  // Check if this is an editable element
  const isInput = element.tagName === 'INPUT' &&
    ['text', 'email', 'search', 'url', 'tel', 'password'].includes(element.type);
  const isTextarea = element.tagName === 'TEXTAREA';
  const isContentEditable = element.isContentEditable || element.contentEditable === 'true';

  if (!isInput && !isTextarea && !isContentEditable) return;

  // For space/enter, we need to check the word BEFORE the trigger key
  // So we look at text minus the last character
  tryExpand(element, isContentEditable);
}

// Alternative: Handle input events for immediate expansion
function handleInput(event) {
  const element = event.target;

  // Check if this is an editable element
  const isInput = element.tagName === 'INPUT' &&
    ['text', 'email', 'search', 'url', 'tel', 'password'].includes(element.type);
  const isTextarea = element.tagName === 'TEXTAREA';
  const isContentEditable = element.isContentEditable || element.contentEditable === 'true';

  if (!isInput && !isTextarea && !isContentEditable) return;

  // Check if user just typed a trigger character (space, etc.)
  const data = event.data;
  if (!data || ![' ', '.', ',', '!', '?', ':', '\n'].includes(data)) return;

  tryExpand(element, isContentEditable);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SNIPPETS_UPDATED') {
    loadData();
  }
});

// Initialize
loadData();

// Use input event for better reliability across different sites
document.addEventListener('input', handleInput, true);

// Also listen for keyup as backup for special cases
document.addEventListener('keyup', handleKeyUp, true);

console.log('SnippetApp content script loaded');
