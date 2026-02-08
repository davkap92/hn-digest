// Service Worker for HN Digest
// Handles background tasks and message passing

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('HN Digest installed');
    
    // Set default settings
    chrome.storage.sync.set({
      aiProvider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: ''
    });
  }
});

// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchItem') {
    // Fetch item from HN Algolia API
    fetchHnItem(request.itemId)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'summarize') {
    // Handle summarization request
    handleSummarize(request.data)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Fetch item from HN Algolia API
 */
async function fetchHnItem(itemId) {
  const response = await fetch(`https://hn.algolia.com/api/v1/items/${itemId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch item: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Handle summarization (placeholder for potential offscreen document use)
 */
async function handleSummarize(data) {
  // Currently handled directly in popup
  // Could be moved here for long-running operations
  return data;
}

// Log service worker lifecycle
console.log('HN Digest service worker started');
