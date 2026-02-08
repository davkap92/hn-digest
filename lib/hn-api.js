// HN Algolia API client
// Docs: https://hn.algolia.com/api

const HN_ALGOLIA_BASE = 'https://hn.algolia.com/api/v1';

/**
 * Fetch a single item (story or comment) with all nested comments
 * @param {number} itemId - The HN item ID
 * @returns {Promise<Object>} - Full item data with nested children
 */
export async function fetchItem(itemId) {
  const response = await fetch(`${HN_ALGOLIA_BASE}/items/${itemId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch item ${itemId}: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Search HN stories
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} - Search results
 */
export async function searchStories(query, options = {}) {
  const params = new URLSearchParams({
    query,
    tags: options.tags || 'story',
    hitsPerPage: options.hitsPerPage || 20,
    page: options.page || 0
  });
  
  if (options.numericFilters) {
    params.set('numericFilters', options.numericFilters);
  }
  
  const response = await fetch(`${HN_ALGOLIA_BASE}/search?${params}`);
  
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Get front page stories
 * @param {number} limit - Number of stories to fetch
 * @returns {Promise<Array>} - Array of story objects
 */
export async function getFrontPageStories(limit = 30) {
  const response = await fetch(`${HN_ALGOLIA_BASE}/search?tags=front_page&hitsPerPage=${limit}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch front page: ${response.status}`);
  }
  
  const data = await response.json();
  return data.hits;
}

/**
 * Flatten nested comments into a flat array with depth info
 * @param {Object} item - Item with nested children
 * @returns {Array} - Flat array of comments with depth
 */
export function flattenComments(item) {
  const comments = [];
  
  function traverse(children, depth = 0) {
    if (!children) return;
    
    for (const child of children) {
      if (child.type === 'comment' && child.text) {
        comments.push({
          id: child.id,
          author: child.author,
          text: child.text,
          created_at: child.created_at,
          depth: depth,
          children_count: child.children?.length || 0
        });
      }
      
      if (child.children) {
        traverse(child.children, depth + 1);
      }
    }
  }
  
  traverse(item.children);
  return comments;
}

/**
 * Get comment statistics
 * @param {Array} comments - Flattened comments array
 * @returns {Object} - Statistics about the comments
 */
export function getCommentStats(comments) {
  const authors = new Set();
  let totalLength = 0;
  let maxDepth = 0;
  
  for (const comment of comments) {
    authors.add(comment.author);
    totalLength += comment.text?.length || 0;
    maxDepth = Math.max(maxDepth, comment.depth);
  }
  
  return {
    totalComments: comments.length,
    uniqueAuthors: authors.size,
    totalTextLength: totalLength,
    averageLength: comments.length > 0 ? Math.round(totalLength / comments.length) : 0,
    maxDepth: maxDepth,
    topAuthors: getTopAuthors(comments, 5)
  };
}

/**
 * Get authors with most comments
 * @param {Array} comments - Comments array
 * @param {number} limit - Number of top authors to return
 * @returns {Array} - Top authors with counts
 */
function getTopAuthors(comments, limit) {
  const authorCounts = {};
  
  for (const comment of comments) {
    if (comment.author) {
      authorCounts[comment.author] = (authorCounts[comment.author] || 0) + 1;
    }
  }
  
  return Object.entries(authorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([author, count]) => ({ author, count }));
}

/**
 * Strip HTML tags from comment text
 * @param {string} html - HTML string
 * @returns {string} - Plain text
 */
export function stripHtml(html) {
  if (!html) return '';
  
  // Create temp element to decode HTML entities and strip tags
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}

/**
 * Prepare comments for summarization
 * @param {Object} item - Full item with nested comments
 * @param {Object} options - Options for preparation
 * @returns {Object} - Prepared data for summarization
 */
export function prepareForSummarization(item, options = {}) {
  const comments = flattenComments(item);
  const stats = getCommentStats(comments);
  
  // Filter and limit comments based on options
  let filteredComments = comments;
  
  // Optionally skip deep replies
  if (options.maxDepth !== undefined) {
    filteredComments = filteredComments.filter(c => c.depth <= options.maxDepth);
  }
  
  // Limit total comments
  const maxComments = options.maxComments || 100;
  if (filteredComments.length > maxComments) {
    filteredComments = filteredComments.slice(0, maxComments);
  }
  
  // Convert to plain text
  const plainTextComments = filteredComments.map(c => ({
    ...c,
    text: stripHtml(c.text)
  }));
  
  return {
    story: {
      id: item.id,
      title: item.title,
      url: item.url,
      author: item.author,
      points: item.points,
      created_at: item.created_at
    },
    comments: plainTextComments,
    stats: stats
  };
}
