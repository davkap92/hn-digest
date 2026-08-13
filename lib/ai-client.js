// AI Client for OpenAI and OpenRouter
// Supports BYOK (Bring Your Own Key)

/**
 * AI Provider configuration
 */
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    models: [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-haiku',
      'openai/gpt-4o-mini',
      'openai/gpt-4o',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
      'deepseek-v4-flash-0731'
    ]
  }
};

const OPENROUTER_REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
];

/**
 * Get stored API settings
 * @returns {Promise<Object>} - API settings
 */
export async function getApiSettings() {
  const result = await chrome.storage.sync.get([
    'aiProvider',
    'apiKey',
    'model',
    'reasoningEffort'
  ]);
  return {
    provider: result.aiProvider || 'openai',
    apiKey: result.apiKey || '',
    model: result.model || PROVIDERS.openai.defaultModel,
    reasoningEffort: result.reasoningEffort || ''
  };
}

/**
 * Save API settings
 * @param {Object} settings - Settings to save
 */
export async function saveApiSettings(settings) {
  await chrome.storage.sync.set({
    aiProvider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    reasoningEffort: settings.reasoningEffort || ''
  });
}

/**
 * Get available models for a provider
 * @param {string} provider - Provider name
 * @returns {Array} - Available models
 */
export function getModelsForProvider(provider) {
  return PROVIDERS[provider]?.models || [];
}

/**
 * Get all providers
 * @returns {Object} - Provider configurations
 */
export function getProviders() {
  return PROVIDERS;
}

/**
 * Get the reasoning effort levels supported by OpenRouter's unified API.
 * @returns {Array<string>} - Available reasoning effort levels
 */
export function getOpenRouterReasoningEfforts() {
  return OPENROUTER_REASONING_EFFORTS;
}

/**
 * Make a chat completion request
 * @param {Array} messages - Chat messages
 * @param {Object} options - Request options
 * @returns {Promise<string>} - AI response text
 */
export async function chatCompletion(messages, options = {}) {
  const settings = await getApiSettings();
  
  if (!settings.apiKey) {
    throw new Error('API key not configured. Please add your API key in the extension settings.');
  }
  
  const provider = PROVIDERS[settings.provider];
  if (!provider) {
    throw new Error(`Unknown provider: ${settings.provider}`);
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${settings.apiKey}`
  };
  
  // OpenRouter requires additional headers
  if (settings.provider === 'openrouter') {
    headers['HTTP-Referer'] = chrome.runtime.getURL('');
    headers['X-Title'] = 'HN Digest';
  }
  
  const body = {
    model: options.model || settings.model,
    messages: messages,
    max_tokens: options.maxTokens || 2000,
    temperature: options.temperature ?? 0.7
  };

  if (options.response_format) {
    body.response_format = options.response_format;
  }

  const reasoningEffort = options.reasoningEffort ?? settings.reasoningEffort;
  if (
    settings.provider === 'openrouter' &&
    OPENROUTER_REASONING_EFFORTS.includes(reasoningEffort)
  ) {
    body.reasoning = { effort: reasoningEffort };
  }
  
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`AI request failed: ${error.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

/**
 * Summarize HN discussion
 * @param {Object} data - Prepared discussion data
 * @returns {Promise<Object>} - Summary object
 */
export async function summarizeDiscussion(data) {
  const { story, comments, stats } = data;
  
  // Check cache for existing summary (Smart Caching)
  const CACHE_KEY = `hn_digest_summary_${story.id}`;
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  try {
    const cached = await chrome.storage.local.get(CACHE_KEY);
    if (cached[CACHE_KEY]) {
      const { timestamp, content } = cached[CACHE_KEY];
      // Check if cache is fresh
      if (Date.now() - timestamp < CACHE_TTL) {
        return {
          ...content,
          stats: stats, // Use fresh stats from page
          cached: true
        };
      }
    }
  } catch (err) {
    console.warn('Cache check failed:', err);
  }
  
  // Build the prompt
  const commentsText = comments
    .slice(0, 50) // Limit for token management
    .map((c, i) => `[${c.author}${c.depth > 0 ? ` (reply depth ${c.depth})` : ''}]: ${c.text}`)
    .join('\n\n');
  
  const systemPrompt = `You are an expert at summarizing Hacker News discussions.
Return a structured JSON object with the following schema:
{
  "tldr": "2-3 sentences max summarizing the discussion",
  "keyPoints": ["point 1", "point 2", ...],
  "perspectives": ["viewpoint 1", "viewpoint 2", ...],
  "sentiment": "overall sentiment of the discussion (e.g., positive, negative, mixed) and brief explanation"
}

Your summaries must be:
- Concise but comprehensive
- Focused on key insights and debates
- Neutral and factual`;

  const userPrompt = `Summarize this Hacker News discussion.

**Story:** ${story.title}
**URL:** ${story.url || 'N/A (Ask HN / Show HN)'}
**Points:** ${story.points}
**Total Comments:** ${stats.totalComments}
**Unique Commenters:** ${stats.uniqueAuthors}

**Comments:**
${commentsText}`;

  const response = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { response_format: { type: "json_object" } });
  
  const result = {
    raw: response,
    parsed: parseSummaryResponse(response),
    stats: stats
  };
  
  // Save to cache
  try {
    await chrome.storage.local.set({
      [CACHE_KEY]: {
        timestamp: Date.now(),
        content: {
          raw: result.raw,
          parsed: result.parsed
        }
      }
    });
  } catch (err) {
    console.warn('Cache save failed:', err);
  }
  
  return result;
}

/**
 * Find most interesting comments
 * @param {Object} data - Prepared discussion data
 * @returns {Promise<Array>} - Interesting comments
 */
export async function findInterestingComments(data) {
  const { story, comments } = data;
  
  const commentsText = comments
    .slice(0, 50)
    .map((c, i) => `[${i}] ${c.author}: ${c.text}`)
    .join('\n\n');
  
  const systemPrompt = `You identify the most valuable comments in Hacker News discussions. Look for:
- Unique insights or expertise
- Well-reasoned arguments
- Contrarian but valid perspectives
- Helpful information or resources
- Entertaining or clever observations

Return the indices of the top 5 most interesting comments as a JSON array.`;

  const userPrompt = `Story: ${story.title}

Comments:
${commentsText}

Return only a JSON array of indices, e.g., [3, 7, 12, 1, 9]. No other text.`;

  const response = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { temperature: 0.3 });
  
  try {
    // Extract JSON array from response
    const match = response.match(/\[[\d,\s]+\]/);
    if (match) {
      const indices = JSON.parse(match[0]);
      return indices
        .filter(i => i >= 0 && i < comments.length)
        .map(i => comments[i]);
    }
  } catch (e) {
    console.error('Failed to parse interesting comments response:', e);
  }
  
  return [];
}

/**
 * Parse the summary response into structured data
 * @param {string} response - Raw AI response
 * @returns {Object} - Parsed summary
 */
function parseSummaryResponse(response) {
  try {
    // Handle potential markdown code blocks
    const cleanResponse = response.replace(/^```json\s*|\s*```$/g, '').trim();
    const data = JSON.parse(cleanResponse);
    
    return {
      tldr: data.tldr || '',
      keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : [],
      perspectives: Array.isArray(data.perspectives) ? data.perspectives : [],
      sentiment: data.sentiment || ''
    };
  } catch (e) {
    console.error('Failed to parse JSON summary:', e);
    return {
      tldr: 'Failed to generate summary.',
      keyPoints: [],
      perspectives: [],
      sentiment: ''
    };
  }
}

/**
 * Test API connection
 * @returns {Promise<boolean>} - True if connection works
 */
export async function testConnection() {
  try {
    const response = await chatCompletion([
      { role: 'user', content: 'Say "OK" and nothing else.' }
    ], { maxTokens: 10 });
    return response.toLowerCase().includes('ok');
  } catch (error) {
    throw error;
  }
}
