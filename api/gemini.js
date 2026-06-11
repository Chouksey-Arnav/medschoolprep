// /api/gemini.js — Vercel serverless function
// Proxies requests to Google Gemini 3 Flash API server-side (key never exposed to browser)
// Daily rate limit: 1000 tokens per IP per day (Gemini free tier: 32k tokens/day)
// Per-minute limit: 15 requests per minute per IP (Gemini free tier limit)

const dailyMap = new Map(); // ip -> { tokenCount, resetAt }
const minuteMap = new Map(); // ip -> { count, resetAt }
const DAILY_LIMIT = 1000; // tokens per day
const MINUTE_LIMIT = 15; // requests per minute
const DAILY_MS = 24 * 60 * 60 * 1000; // 24 hours
const MINUTE_MS = 60 * 1000; // 1 minute

function isDailyLimited(ip) {
  const now = Date.now();
  const entry = dailyMap.get(ip);
  if (!entry || now > entry.resetAt) {
    dailyMap.set(ip, { tokenCount: 0, resetAt: now + DAILY_MS });
    return false;
  }
  return entry.tokenCount >= DAILY_LIMIT;
}

function getTokensUsedToday(ip) {
  const entry = dailyMap.get(ip);
  if (!entry) return 0;
  if (Date.now() > entry.resetAt) return 0;
  return entry.tokenCount;
}

function addTokensToday(ip, tokens) {
  const now = Date.now();
  const entry = dailyMap.get(ip);
  if (!entry || now > entry.resetAt) {
    dailyMap.set(ip, { tokenCount: tokens, resetAt: now + DAILY_MS });
  } else {
    entry.tokenCount += tokens;
  }
}

function isMinuteLimited(ip) {
  const now = Date.now();
  const entry = minuteMap.get(ip);
  if (!entry || now > entry.resetAt) {
    minuteMap.set(ip, { count: 1, resetAt: now + MINUTE_MS });
    return false;
  }
  if (entry.count >= MINUTE_LIMIT) return true;
  entry.count += 1;
  return false;
}

// Sanitize incoming messages to prevent prompt injection
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  return messages
    .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
    .map(m => ({
      role: ['user', 'assistant', 'model'].includes(m.role) ? (m.role === 'assistant' ? 'model' : m.role) : 'user',
      parts: [{ text: String(m.content).slice(0, 4000) }],
    }))
    .slice(-20); // keep last 20 messages only
}

export default async function handler(req, res) {
  // ── CORS preflight ─────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Get client IP ──────────────────────────────────────────────────────────
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();

  // ── Per-minute rate limiting ───────────────────────────────────────────────
  if (isMinuteLimited(ip)) {
    return res.status(429).json({ 
      error: 'Too many requests. Gemini free tier limit: 15 requests per minute. Please wait before sending more messages.' 
    });
  }

  // ── API key check ──────────────────────────────────────────────────────────
  const GEMINI_KEY = process.env.GEMINI_KEY;
  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'Gemini API not configured. Set GEMINI_KEY in Vercel environment variables.' });
  }

  // ── Parse and validate body ────────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }

  const { system, message, messages: rawMessages, maxTokens = 700 } = body || {};

  if (!message && !rawMessages) {
    return res.status(400).json({ error: 'No message provided.' });
  }

  // ── Build messages array for Gemini ────────────────────────────────────────
  let geminiMessages = [];

  // Gemini uses 'parts' structure with 'text' field
  if (rawMessages) {
    const cleaned = sanitizeMessages(rawMessages);
    if (cleaned) geminiMessages = cleaned;
  } else if (message) {
    geminiMessages.push({
      role: 'user',
      parts: [{ text: String(message).slice(0, 4000) }],
    });
  }

  if (geminiMessages.length === 0) {
    return res.status(400).json({ error: 'No valid messages to send.' });
  }

  // ── Check daily token limit ────────────────────────────────────────────────
  const tokensUsedToday = getTokensUsedToday(ip);
  const remainingTokens = DAILY_LIMIT - tokensUsedToday;
  
  if (isDailyLimited(ip)) {
    return res.status(429).json({ 
      error: `Daily AI limit reached (${DAILY_LIMIT} tokens). Your free Gemini quota has been used for today. Try again tomorrow.`,
      tokensRemaining: 0,
      dailyLimit: DAILY_LIMIT
    });
  }

  // ── Call Gemini API ────────────────────────────────────────────────────────
  try {
    const clampedTokens = Math.min(Math.max(50, parseInt(maxTokens) || 700), 1500);
    
    const systemPrompt = system 
      ? String(system).slice(0, 2000)
      : 'You are MetaBrain, an expert MCAT tutor and medical school admissions coach. Be concise, accurate, and encouraging.';

    // Build request body with proper Gemini API format
    const requestBody = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: clampedTokens,
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || `Gemini error (${response.status})`;
      console.error('Gemini API error:', errMsg);
      
      // Check for quota exceeded errors
      if (response.status === 429 || errMsg.includes('quota')) {
        return res.status(429).json({ 
          error: 'Gemini API rate limit reached. Please wait a moment and try again.' 
        });
      }
      
      return res.status(502).json({ error: errMsg });
    }

    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      return res.status(502).json({ error: 'Empty response from Gemini.' });
    }

    // ── Calculate tokens used (rough estimate: 4 chars ≈ 1 token) ─────────────
    const inputLength = message ? message.length : geminiMessages.reduce((sum, m) => sum + (m.parts?.[0]?.text?.length || 0), 0);
    const estimatedTokens = Math.ceil((content.length + inputLength) / 4);
    addTokensToday(ip, estimatedTokens);
    const newTokensUsedToday = getTokensUsedToday(ip);
    const newRemaining = Math.max(0, DAILY_LIMIT - newTokensUsedToday);

    return res.status(200).json({ 
      content,
      tokensUsedToday: newTokensUsedToday,
      tokensRemaining: newRemaining,
      dailyLimit: DAILY_LIMIT,
    });

  } catch (err) {
    console.error('API handler error:', err);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
}
