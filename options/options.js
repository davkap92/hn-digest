// Options page script for HN Digest
import { 
  getApiSettings, 
  saveApiSettings, 
  getModelsForProvider,
  getProviders,
  getOpenRouterReasoningEfforts,
  testConnection 
} from '../lib/ai-client.js';

// DOM Elements
const elements = {
  form: document.getElementById('settingsForm'),
  provider: document.getElementById('provider'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  reasoningEffort: document.getElementById('reasoningEffort'),
  reasoningEffortGroup: document.getElementById('reasoningEffortGroup'),
  toggleKey: document.getElementById('toggleKey'),
  testBtn: document.getElementById('testBtn'),
  testResult: document.getElementById('testResult'),
  saveStatus: document.getElementById('saveStatus'),
  providerHelp: document.getElementById('providerHelp')
};

// Provider descriptions
const providerDescriptions = {
  openai: 'Direct access to GPT models. Requires OpenAI API key (starts with sk-).',
  openrouter: 'Access to 100+ models including Claude, GPT, Gemini, Llama. Often cheaper than direct APIs.'
};

/**
 * Initialize options page
 */
async function init() {
  updateReasoningEffortOptions();
  setupEventListeners();
  await loadSettings();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  elements.provider.addEventListener('change', handleProviderChange);
  elements.toggleKey.addEventListener('click', toggleKeyVisibility);
  elements.testBtn.addEventListener('click', handleTestConnection);
  elements.form.addEventListener('submit', handleSave);
}

/**
 * Load and display current settings
 */
async function loadSettings() {
  const settings = await getApiSettings();
  
  elements.provider.value = settings.provider;
  elements.apiKey.value = settings.apiKey;
  
  // Update model options
  updateModelOptions(settings.provider);
  elements.model.value = settings.model;
  elements.reasoningEffort.value = settings.reasoningEffort;
  updateReasoningEffortVisibility(settings.provider);
  
  // Update help text
  elements.providerHelp.textContent = providerDescriptions[settings.provider];
}

/**
 * Handle provider change
 */
function handleProviderChange() {
  const provider = elements.provider.value;
  const providers = getProviders();
  
  updateModelOptions(provider);
  elements.model.value = providers[provider].defaultModel;
  elements.providerHelp.textContent = providerDescriptions[provider];
  updateReasoningEffortVisibility(provider);
  
  // Hide test result when changing provider
  elements.testResult.classList.add('hidden');
}

/**
 * Update model select options
 */
function updateModelOptions(provider) {
  const models = getModelsForProvider(provider);
  
  elements.model.innerHTML = models
    .map(m => `<option value="${m}">${m}</option>`)
    .join('');
}

/**
 * Populate the OpenRouter reasoning effort options.
 */
function updateReasoningEffortOptions() {
  const efforts = getOpenRouterReasoningEfforts();
  elements.reasoningEffort.innerHTML = [
    '<option value="">Model default</option>',
    ...efforts.map(effort => (
      `<option value="${effort}">${formatReasoningEffort(effort)}</option>`
    ))
  ].join('');
}

/**
 * Show reasoning effort only when OpenRouter is selected.
 */
function updateReasoningEffortVisibility(provider) {
  elements.reasoningEffortGroup.classList.toggle('hidden', provider !== 'openrouter');
}

/**
 * Format a reasoning effort value for display.
 */
function formatReasoningEffort(effort) {
  if (effort === 'xhigh') return 'Extra high';
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

/**
 * Toggle API key visibility
 */
function toggleKeyVisibility() {
  const isPassword = elements.apiKey.type === 'password';
  elements.apiKey.type = isPassword ? 'text' : 'password';
  elements.toggleKey.textContent = isPassword ? '🙈' : '👁️';
}

/**
 * Handle test connection button
 */
async function handleTestConnection() {
  if (!elements.apiKey.value) {
    showTestResult('Please enter an API key first.', false);
    return;
  }
  
  elements.testBtn.disabled = true;
  elements.testBtn.textContent = 'Testing...';
  elements.testResult.classList.add('hidden');
  
  // Temporarily save settings for test
  await saveApiSettings({
    provider: elements.provider.value,
    apiKey: elements.apiKey.value,
    model: elements.model.value,
    reasoningEffort: elements.reasoningEffort.value
  });
  
  try {
    const success = await testConnection();
    if (success) {
      showTestResult('✓ Connection successful! Your API key is working.', true);
    } else {
      showTestResult('Connection test returned unexpected response.', false);
    }
  } catch (error) {
    showTestResult(`✗ Connection failed: ${error.message}`, false);
  } finally {
    elements.testBtn.disabled = false;
    elements.testBtn.textContent = 'Test Connection';
  }
}

/**
 * Show test result
 */
function showTestResult(message, success) {
  elements.testResult.textContent = message;
  elements.testResult.className = `test-result ${success ? 'success' : 'error'}`;
  elements.testResult.classList.remove('hidden');
}

/**
 * Handle form save
 */
async function handleSave(e) {
  e.preventDefault();
  
  await saveApiSettings({
    provider: elements.provider.value,
    apiKey: elements.apiKey.value,
    model: elements.model.value,
    reasoningEffort: elements.reasoningEffort.value
  });
  
  // Show save confirmation
  elements.saveStatus.classList.remove('hidden');
  setTimeout(() => {
    elements.saveStatus.classList.add('hidden');
  }, 2000);
}

// Initialize
init();
