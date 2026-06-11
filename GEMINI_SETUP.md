# Gemini 2.5 Flash Integration Setup Guide

## Overview
Your MedSchoolPrep AI Coach now uses **Google Gemini 2.5 Flash** with automatic daily rate limiting. The implementation is exclusive to the AI Coach and does not affect other AI features in the app.

## What Changed

### Frontend (`src/App.jsx`)
- ✅ Created `callGeminiAI()` function to call the new Gemini API endpoint
- ✅ Updated `sendChat()` to use Gemini instead of OpenRouter
- ✅ Added token tracking state: `geminiTokensRemaining` and `geminiTokensUsedToday`
- ✅ Display token quota in AI Coach header (shows remaining tokens out of 1000)
- ✅ Shows quota exhaustion message and disables input when limit is reached
- ✅ Daily quota resets at midnight UTC

### Backend (`api/gemini.js`)
- ✅ New Vercel serverless function to proxy Gemini API calls
- ✅ **Daily Rate Limit**: 1000 tokens per day per IP
- ✅ **Per-Minute Rate Limit**: 15 requests per minute per IP
- ✅ Estimates token usage (4 chars ≈ 1 token) and tracks consumption
- ✅ Server-side API key (never exposed to browser)
- ✅ Returns remaining tokens in response for real-time UI updates

## Setup Instructions

### Step 1: Get Your Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click **Get API key** in the left sidebar
3. Click **Create new secret key**
4. Copy the generated API key (the one provided: `AIzaSyAiJ3d-sY0vL9IoggLNeyuHljxL58s_1Xc`)

### Step 2: Add Environment Variable to Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your `medschoolprep` project
3. Navigate to **Settings** → **Environment Variables**
4. Add new variable:
   - **Name**: `GEMINI_KEY`
   - **Value**: `AIzaSyAiJ3d-sY0vL9IoggLNeyuHljxL58s_1Xc`
   - **Environments**: Select all (Production, Preview, Development)
5. Click **Save**

### Step 3: Redeploy
1. Go to **Deployments** in Vercel
2. Click the latest deployment
3. Click **Redeploy** to rebuild with the new environment variable

## How It Works

### Daily Quota System
- **Limit**: 1000 tokens per day per user (IP address)
- **Resets**: At midnight UTC
- **Token Estimation**: ~4 characters = 1 token
- **Enforcement**: Server-side and client-side checks
  - Client prevents requests when quota is exhausted
  - Server returns 429 error if limit exceeded
  - Clear error message shows when to try again

### Rate Limiting
- **Per Minute**: 15 requests per minute (Gemini free tier limit)
- **Per Day**: 1000 tokens (conservative estimate for free tier)
- **Per IP**: Tracked separately for each user's IP

### Error Messages
- `"Daily Gemini quota reached (1000 tokens)"` → Quota exhausted for today
- `"Too many requests. 15 requests per minute limit"` → Rate limited for this minute
- `"Gemini API not configured"` → Missing GEMINI_KEY environment variable

## Token Display

### In the AI Coach Header
```
MetaBrain ✦
[messages count]  [tokens: remaining/1000]  [pathfocus]
```

Example: `5 messages  847/1000 tokens  Bio/Biochem focus`

### Quota Exhaustion Banner
When daily limit is reached:
- Banner appears: "Your daily Gemini quota (1000 tokens) has been reached. Try again tomorrow! 🚀"
- Textarea becomes disabled (faded)
- Send button becomes disabled
- User sees visual feedback

## API Response Format

```json
{
  "content": "Assistant response text...",
  "tokensUsedToday": 150,
  "tokensRemaining": 850,
  "dailyLimit": 1000
}
```

## Free Tier Details

### Google Gemini Free Tier Limits
- **Requests per minute**: 15
- **Tokens per day**: Up to 32,000 tokens total
- **Model**: `gemini-2.5-flash` (latest, fastest)
- **Cost**: $0 (free)

### Implementation Limits
- **1000 tokens per day** (conservative estimate)
- Leaves room for future free tier changes
- Can be adjusted in `api/gemini.js` if needed

## Customization

### Change Daily Token Limit
Edit `api/gemini.js`:
```javascript
const DAILY_LIMIT = 1000; // Change this value
```

### Change Model (if needed)
Edit `api/gemini.js`, line ~117:
```javascript
// Change this URL if using a different model
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`
```

## Testing

### Test the AI Coach
1. Open the app in your browser
2. Navigate to **AI Coach** (MetaBrain)
3. Ask a test question
4. Verify:
   - Response is generated with Gemini
   - Token count decreases in header
   - Error messages appear if quota exceeded

### Monitor Token Usage
- Check the header badge: `[tokens]/1000`
- Usage is tracked per IP address
- Resets daily at midnight UTC

## Troubleshooting

### "Gemini API not configured" Error
- Verify `GEMINI_KEY` is set in Vercel environment variables
- Redeploy after setting the variable
- Check that variable is set for all environments (Production, Preview, Development)

### "Daily quota reached" Error
- This is expected behavior when 1000 tokens are consumed
- Wait until next day (UTC midnight) for quota reset
- Can be adjusted by changing `DAILY_LIMIT` in `api/gemini.js`

### Slow Responses
- Gemini 2.5 Flash is optimized for speed
- If still slow, check your network connection
- API latency is typically 2-5 seconds

### Rate Limit Errors (429)
- Wait 60 seconds before retrying (per-minute limit)
- Or wait until next day for daily quota reset

## Files Modified

```
api/gemini.js                 → New Gemini API endpoint
src/App.jsx                   → Updated AI Coach to use Gemini
  - callGeminiAI() function
  - sendChat() function  
  - Token tracking state
  - tCoach() UI updates
```

## Next Steps

1. ✅ Add `GEMINI_KEY` to Vercel environment variables
2. ✅ Redeploy the project
3. ✅ Test the AI Coach with a sample question
4. ✅ Monitor token usage in the header badge
5. ✅ Share with users — quota resets daily!

---

**Happy tutoring with Gemini! 🚀**
