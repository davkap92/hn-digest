// Popup script for HN Digest
import { fetchItem, prepareForSummarization } from '../lib/hn-api.js';
import { 
  getApiSettings, 
  findInterestingComments 
} from '../lib/ai-client.js';

const SUMMARY_JOB_PREFIX = 'hn_digest_summary_job_';

// DOM Elements
const elements = {
  notHnPage: document.getElementById('notHnPage'),
  noApiKey: document.getElementById('noApiKey'),
  pageInfo: document.getElementById('pageInfo'),
  listPageInfo: document.getElementById('listPageInfo'),
  results: document.getElementById('results'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  
  // Page info elements
  pageTypeLabel: document.getElementById('pageTypeLabel'),
  storyTitle: document.getElementById('storyTitle'),
  points: document.getElementById('points'),
  comments: document.getElementById('comments'),
  author: document.getElementById('author'),
  
  // List page elements
  listPageTypeLabel: document.getElementById('listPageTypeLabel'),
  storyCount: document.getElementById('storyCount'),
  
  // Buttons
  settingsBtn: document.getElementById('settingsBtn'),
  openSettings: document.getElementById('openSettings'),
  summarizeBtn: document.getElementById('summarizeBtn'),
  interestingBtn: document.getElementById('interestingBtn'),
  retryBtn: document.getElementById('retryBtn'),
  summaryStatus: document.getElementById('summaryStatus'),
  
  // Results
  tldrText: document.getElementById('tldrText'),
  keyPointsList: document.getElementById('keyPointsList'),
  perspectivesList: document.getElementById('perspectivesList'),
  sentimentText: document.getElementById('sentimentText'),
  interestingComments: document.getElementById('interestingComments'),
  
  // Stats
  statComments: document.getElementById('statComments'),
  statAuthors: document.getElementById('statAuthors'),
  statAvgLen: document.getElementById('statAvgLen'),
  statDepth: document.getElementById('statDepth'),
  topAuthorsList: document.getElementById('topAuthorsList'),
  
  // Loading
  loadingText: document.getElementById('loadingText'),
  errorText: document.getElementById('errorText')
};

// State
let currentContext = null;
let currentData = null;
let currentSummaryJob = null;

/**
 * Initialize popup
 */
async function init() {
  setupEventListeners();
  await checkPageContext();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  elements.settingsBtn.addEventListener('click', openOptionsPage);
  elements.openSettings.addEventListener('click', openOptionsPage);
  elements.summarizeBtn.addEventListener('click', handleSummarize);
  elements.interestingBtn.addEventListener('click', handleFindInteresting);
  elements.retryBtn.addEventListener('click', () => checkPageContext());
  chrome.storage.onChanged.addListener(handleStorageChanges);
  
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

/**
 * Open options page
 */
function openOptionsPage() {
  chrome.runtime.openOptionsPage();
}

/**
 * Check current page context
 */
async function checkPageContext() {
  hideAll();
  showLoading('Checking page...');
  
  try {
    // Check if API key is configured
    const settings = await getApiSettings();
    if (!settings.apiKey) {
      hideLoading();
      elements.noApiKey.classList.remove('hidden');
      return;
    }
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url?.includes('news.ycombinator.com')) {
      hideLoading();
      elements.notHnPage.classList.remove('hidden');
      return;
    }
    
    // Get page context from content script
    const context = await chrome.tabs.sendMessage(tab.id, { action: 'getPageContext' });
    currentContext = context;
    
    hideLoading();
    
    if (context.type === 'item') {
      await showItemPage(context);
    } else if (context.type === 'list') {
      showListPage(context);
    } else {
      showError('Unknown HN page type');
    }
  } catch (error) {
    console.error('Error checking page context:', error);
    hideLoading();
    showError(error.message || 'Failed to read page');
  }
}

/**
 * Show item page info and fetch data
 */
async function showItemPage(context) {
  showLoading('Fetching discussion...');
  
  try {
    const item = await fetchItem(context.id);
    currentData = prepareForSummarization(item);
    
    // Update UI
    elements.pageTypeLabel.textContent = item.type === 'story' ? 'Story' : 'Comment';
    elements.storyTitle.textContent = item.title || 'Comment thread';
    elements.points.textContent = `${item.points || 0} points`;
    elements.comments.textContent = `${currentData.stats.totalComments} comments`;
    elements.author.textContent = `by ${item.author}`;
    
    // Update stats
    elements.statComments.textContent = currentData.stats.totalComments;
    elements.statAuthors.textContent = currentData.stats.uniqueAuthors;
    elements.statAvgLen.textContent = currentData.stats.averageLength;
    elements.statDepth.textContent = currentData.stats.maxDepth;
    
    // Top authors
    elements.topAuthorsList.innerHTML = currentData.stats.topAuthors
      .map(a => `<li><span class="author-name">${escapeHtml(a.author)}</span><span class="author-count">${a.count} comments</span></li>`)
      .join('');
    
    hideLoading();
    elements.pageInfo.classList.remove('hidden');
    await restoreSummaryJob(item.id);
  } catch (error) {
    console.error('Error fetching item:', error);
    hideLoading();
    showError(`Failed to fetch discussion: ${error.message}`);
  }
}

/**
 * Show list page info
 */
function showListPage(context) {
  const pageTypes = {
    news: 'Front Page',
    newest: 'New Stories',
    ask: 'Ask HN',
    show: 'Show HN',
    jobs: 'Jobs',
    best: 'Best Stories'
  };
  
  elements.listPageTypeLabel.textContent = pageTypes[context.pageType] || 'Stories';
  elements.storyCount.textContent = context.storyIds.length;
  elements.listPageInfo.classList.remove('hidden');
}

/**
 * Handle summarize button click
 */
async function handleSummarize() {
  if (!currentData || currentSummaryJob?.status === 'running') return;
  
  const forceRefresh = currentSummaryJob?.status === 'complete';
  applySummaryJob({
    storyId: currentData.story.id,
    storyTitle: currentData.story.title,
    status: 'running',
    startedAt: Date.now(),
    updatedAt: Date.now()
  });
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'startSummaryJob',
      data: currentData,
      forceRefresh
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to start background summarization.');
    }

    applySummaryJob(response.job);
  } catch (error) {
    console.error('Error summarizing:', error);
    applySummaryJob({
      storyId: currentData.story.id,
      status: 'error',
      updatedAt: Date.now(),
      error: error.message || 'Summarization failed.'
    });
  }
}

/**
 * Handle find interesting button click
 */
async function handleFindInteresting() {
  if (!currentData) return;
  
  elements.interestingBtn.disabled = true;
  elements.interestingBtn.textContent = '⏳ Finding...';
  elements.summarizeBtn.disabled = true;
  
  try {
    const interesting = await findInterestingComments(currentData);
    displayInterestingComments(interesting);
    elements.results.classList.remove('hidden');
    switchTab('interesting');
  } catch (error) {
    console.error('Error finding interesting:', error);
    showError(`Failed to find interesting comments: ${error.message}`);
  } finally {
    elements.interestingBtn.disabled = false;
    elements.interestingBtn.textContent = 'Find Interesting';
    elements.summarizeBtn.disabled = currentSummaryJob?.status === 'running';
  }
}

/**
 * Restore a background summary job when the popup is reopened.
 */
async function restoreSummaryJob(storyId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getSummaryJob',
      storyId
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to restore summary status.');
    }

    applySummaryJob(response.job);
  } catch (error) {
    console.warn('Failed to restore summary job:', error);
    applySummaryJob(null);
  }
}

/**
 * React to persisted job updates while the popup is open.
 */
function handleStorageChanges(changes, areaName) {
  if (areaName !== 'local' || !currentData?.story?.id) return;

  const key = `${SUMMARY_JOB_PREFIX}${currentData.story.id}`;
  if (changes[key]) {
    applySummaryJob(changes[key].newValue || null);
  }
}

/**
 * Render the current background job state.
 */
function applySummaryJob(job) {
  currentSummaryJob = job;
  const buttonText = elements.summarizeBtn.querySelector('.btn-text');

  elements.summarizeBtn.classList.toggle('loading', job?.status === 'running');
  elements.summarizeBtn.disabled = job?.status === 'running';
  elements.summaryStatus.className = 'summary-status hidden';

  if (!job) {
    buttonText.textContent = 'Summarize Discussion';
    return;
  }

  if (job.status === 'running') {
    buttonText.textContent = 'Summarize Discussion';
    elements.summaryStatus.textContent = 'Summarizing in the background — you can close this popup.';
    elements.summaryStatus.classList.remove('hidden');
    return;
  }

  if (job.status === 'complete' && job.result) {
    const resultsWereHidden = elements.results.classList.contains('hidden');
    const activeTab = document.querySelector('.tab.active')?.dataset.tab;

    buttonText.textContent = 'Refresh Summary';
    elements.summaryStatus.textContent = `Summary ready · ${formatJobTime(job.updatedAt)}`;
    elements.summaryStatus.classList.add('success');
    elements.summaryStatus.classList.remove('hidden');
    displaySummary(job.result);
    elements.results.classList.remove('hidden');
    if (resultsWereHidden || activeTab === 'summary') {
      switchTab('summary');
    }
    return;
  }

  if (job.status === 'error') {
    buttonText.textContent = 'Try Again';
    elements.summaryStatus.textContent = job.error || 'Summarization failed. Try again.';
    elements.summaryStatus.classList.add('error');
    elements.summaryStatus.classList.remove('hidden');
  }
}

function formatJobTime(timestamp) {
  if (!timestamp) return 'just now';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

/**
 * Display summary results
 */
function displaySummary(summary) {
  const { parsed } = summary;
  console.log('Parsed summary:', parsed);
  
  const cachedHtml = summary.cached 
    ? '<span class="badge-cached" title="Loaded from local cache (24h)">⚡️ Cached</span>' 
    : '';
    
  elements.tldrText.innerHTML = cachedHtml + escapeHtml(parsed.tldr || 'No summary available');
  
  elements.keyPointsList.innerHTML = parsed.keyPoints.length > 0
    ? parsed.keyPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')
    : '<li>No key points identified</li>';
  
  elements.perspectivesList.innerHTML = parsed.perspectives.length > 0
    ? parsed.perspectives.map(p => `<li>${escapeHtml(p)}</li>`).join('')
    : '<li>No notable perspectives identified</li>';
  
  elements.sentimentText.textContent = parsed.sentiment || 'Unknown';
}

/**
 * Display interesting comments
 */
function displayInterestingComments(comments) {
  if (comments.length === 0) {
    elements.interestingComments.innerHTML = '<p class="subtext">No interesting comments found.</p>';
    return;
  }
  
  elements.interestingComments.innerHTML = comments.map(c => `
    <div class="comment-card">
      <div class="comment-author">${escapeHtml(c.author)}</div>
      <div class="comment-text">${escapeHtml(c.text).slice(0, 300)}${c.text.length > 300 ? '...' : ''}</div>
    </div>
  `).join('');
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}Content`).classList.add('active');
}

/**
 * Show loading state
 */
function showLoading(text) {
  elements.loadingText.textContent = text;
  elements.loading.classList.remove('hidden');
}

/**
 * Hide loading state
 */
function hideLoading() {
  elements.loading.classList.add('hidden');
}

/**
 * Show error message
 */
function showError(message) {
  elements.errorText.textContent = message;
  elements.error.classList.remove('hidden');
}

/**
 * Hide all main sections
 */
function hideAll() {
  elements.notHnPage.classList.add('hidden');
  elements.noApiKey.classList.add('hidden');
  elements.pageInfo.classList.add('hidden');
  elements.listPageInfo.classList.add('hidden');
  elements.results.classList.add('hidden');
  elements.loading.classList.add('hidden');
  elements.error.classList.add('hidden');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize
init();
