# HN Digest

AI-powered summaries of Hacker News discussions.

## Features

- 📝 **Summarize Discussions** - Get TL;DR, key points, and sentiment analysis
- 🔍 **Find Interesting Comments** - AI identifies the most valuable comments
- 📊 **Discussion Stats** - Comment counts, top authors, thread depth
- 🔑 **BYOK (Bring Your Own Key)** - Use your OpenAI or OpenRouter API key

<img width="407" height="597" alt="image" src="https://github.com/user-attachments/assets/d28a9282-e8e7-42a6-9406-e905facb7412" />

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension folder

## Setup

1. Click the extension icon
2. Click "Configure API Key" or the ⚙️ settings button
3. Choose your AI provider:
   - **OpenAI** - Direct GPT access ([Get API key](https://platform.openai.com/api-keys))
   - **OpenRouter** - 100+ models, often cheaper ([Get API key](https://openrouter.ai/keys))
4. Enter your API key
5. Click "Test Connection" to verify
6. Save settings

## Usage

1. Navigate to any Hacker News page:
   - Story with comments: `news.ycombinator.com/item?id=...`
   - Front page: `news.ycombinator.com`
   
2. Click the HN Digest extension icon

3. On a story page:
   - Click **"Summarize Discussion"** for a full summary
   - Click **"Find Interesting"** to discover notable comments
   - View **Stats** tab for discussion metrics

## API Costs

Typical costs per summarization (estimates):
- **GPT-4o-mini**: ~$0.001-0.005
- **GPT-4o**: ~$0.01-0.05
- **Claude 3.5 Sonnet** (via OpenRouter): ~$0.01-0.03

## Privacy

- Your API key is stored locally in Chrome's sync storage
- Page data is sent only to the HN Algolia API and your chosen AI provider
- No analytics or tracking

## Tech Stack

- Manifest V3 Chrome Extension
- HN Algolia API for fetching discussions
- OpenAI / OpenRouter APIs for summarization
- Vanilla JS, no build step required

## License

MIT
