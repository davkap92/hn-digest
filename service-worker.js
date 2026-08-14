// Service Worker for HN Digest
// Handles background tasks and message passing

import {
  isValidSummaryResult,
  summarizeDiscussion
} from './lib/ai-client.js';

const SUMMARY_JOB_PREFIX = 'hn_digest_summary_job_';
const startupReady = recoverInterruptedSummaryJobs().catch(error => {
  console.warn('Failed to recover summary jobs:', error);
});

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
  
  if (request.action === 'getSummaryJob') {
    startupReady
      .then(() => getSummaryJob(request.storyId))
      .then(job => sendResponse({ success: true, job }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'startSummaryJob') {
    startupReady
      .then(() => startSummaryJob(request.data, request.forceRefresh))
      .then(job => sendResponse({ success: true, job }))
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

function getSummaryJobKey(storyId) {
  return `${SUMMARY_JOB_PREFIX}${storyId}`;
}

async function getSummaryJob(storyId) {
  if (!storyId) return null;

  const key = getSummaryJobKey(storyId);
  const stored = await chrome.storage.local.get(key);
  const job = stored[key] || null;

  if (job?.status === 'complete' && !isValidSummaryResult(job.result)) {
    return saveSummaryJob(key, {
      ...job,
      status: 'error',
      updatedAt: Date.now(),
      error: 'The saved summary was incomplete. Try generating it again.'
    });
  }

  return job;
}

async function saveSummaryJob(key, job) {
  await chrome.storage.local.set({ [key]: job });
  return job;
}

/**
 * Run a summary request independently of the popup and persist its state.
 */
async function startSummaryJob(data, forceRefresh = false) {
  const storyId = data?.story?.id;
  if (!storyId) {
    throw new Error('Cannot summarize a discussion without a story ID.');
  }

  const key = getSummaryJobKey(storyId);
  const existing = await getSummaryJob(storyId);

  if (existing?.status === 'running') {
    return existing;
  }

  const startedAt = Date.now();
  await saveSummaryJob(key, {
    storyId,
    storyTitle: data.story.title || 'HN discussion',
    status: 'running',
    startedAt,
    updatedAt: startedAt
  });

  try {
    const result = await summarizeDiscussion(data, {
      forceRefresh,
      stream: true
    });
    return await saveSummaryJob(key, {
      storyId,
      storyTitle: data.story.title || 'HN discussion',
      status: 'complete',
      startedAt,
      updatedAt: Date.now(),
      result
    });
  } catch (error) {
    const failedJob = {
      storyId,
      storyTitle: data.story.title || 'HN discussion',
      status: 'error',
      startedAt,
      updatedAt: Date.now(),
      error: error?.message || 'Summarization failed.'
    };
    await saveSummaryJob(key, failedJob);
    return failedJob;
  }
}

/**
 * A worker can be stopped while a request is in flight. Mark those jobs as
 * retryable when the worker starts again instead of showing a permanent loader.
 */
async function recoverInterruptedSummaryJobs() {
  const stored = await chrome.storage.local.get(null);
  const updates = {};

  for (const [key, job] of Object.entries(stored)) {
    if (!key.startsWith(SUMMARY_JOB_PREFIX)) continue;

    const wasInterrupted = job?.status === 'running';
    const hasInvalidResult = (
      job?.status === 'complete' && !isValidSummaryResult(job.result)
    );
    if (!wasInterrupted && !hasInvalidResult) continue;

    updates[key] = {
      ...job,
      status: 'error',
      updatedAt: Date.now(),
      error: wasInterrupted
        ? 'The background request was interrupted. Reopen the story and try again.'
        : 'The saved summary was incomplete. Try generating it again.'
    };
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

// Log service worker lifecycle
console.log('HN Digest service worker started');
