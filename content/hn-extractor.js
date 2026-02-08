// Content script for extracting HN page context
// Runs on news.ycombinator.com pages

(function() {
  'use strict';

  /**
   * Detect the type of HN page and extract relevant IDs
   */
  function extractPageContext() {
    const url = window.location.href;
    const params = new URLSearchParams(window.location.search);
    
    // Item page (story or comment)
    if (url.includes('/item')) {
      const id = params.get('id');
      if (id) {
        return {
          type: 'item',
          id: parseInt(id, 10),
          url: url
        };
      }
    }
    
    // User page
    if (url.includes('/user')) {
      const userId = params.get('id');
      return {
        type: 'user',
        userId: userId,
        url: url
      };
    }
    
    // Front page, news, newest, etc - extract visible story IDs
    const storyIds = extractStoryIdsFromPage();
    if (storyIds.length > 0) {
      return {
        type: 'list',
        storyIds: storyIds,
        url: url,
        pageType: detectListPageType(url)
      };
    }
    
    return {
      type: 'unknown',
      url: url
    };
  }

  /**
   * Extract story IDs from list pages (front page, /news, /newest, etc.)
   */
  function extractStoryIdsFromPage() {
    const ids = [];
    
    // HN uses class="athing" for story rows with id attribute
    const storyRows = document.querySelectorAll('tr.athing');
    storyRows.forEach(row => {
      const id = row.getAttribute('id');
      if (id) {
        ids.push(parseInt(id, 10));
      }
    });
    
    return ids;
  }

  /**
   * Detect which type of list page we're on
   */
  function detectListPageType(url) {
    if (url.includes('/newest')) return 'newest';
    if (url.includes('/front')) return 'front';
    if (url.includes('/ask')) return 'ask';
    if (url.includes('/show')) return 'show';
    if (url.includes('/jobs')) return 'jobs';
    if (url.includes('/best')) return 'best';
    return 'news'; // default front page
  }

  /**
   * Extract additional metadata from item page DOM (as fallback/supplement)
   */
  function extractItemMetadata() {
    const metadata = {};
    
    // Title
    const titleEl = document.querySelector('.titleline > a');
    if (titleEl) {
      metadata.title = titleEl.textContent;
      metadata.articleUrl = titleEl.href;
    }
    
    // Score
    const scoreEl = document.querySelector('.score');
    if (scoreEl) {
      const match = scoreEl.textContent.match(/(\d+)/);
      if (match) metadata.score = parseInt(match[1], 10);
    }
    
    // Author
    const authorEl = document.querySelector('.hnuser');
    if (authorEl) {
      metadata.author = authorEl.textContent;
    }
    
    // Time
    const ageEl = document.querySelector('.age');
    if (ageEl) {
      metadata.ageText = ageEl.textContent.trim();
    }
    
    // Comment count (visible in subtext)
    const commentLink = document.querySelector('a[href^="item?id="]');
    if (commentLink && commentLink.textContent.includes('comment')) {
      const match = commentLink.textContent.match(/(\d+)/);
      if (match) metadata.commentCount = parseInt(match[1], 10);
    }
    
    return metadata;
  }

  // Listen for messages from popup/service worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPageContext') {
      const context = extractPageContext();
      
      // If on an item page, include DOM metadata as supplement
      if (context.type === 'item') {
        context.metadata = extractItemMetadata();
      }
      
      sendResponse(context);
    }
    
    return true; // Keep channel open for async response
  });

  // Expose for debugging
  window.__HN_DIGEST__ = {
    extractPageContext,
    extractStoryIdsFromPage,
    extractItemMetadata
  };
})();
