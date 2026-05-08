/**
 * update-dashboard.js — Central dashboard orchestrator
 *
 * CALLED BY:
 * - "Refresh Now" button in the dashboard UI (POST request)
 * - Scheduled functions: update-dashboard-tuesday.js, update-dashboard-friday.js, update-dashboard-monthly.js
 * - AI Insights panel (POST with action: "ai-insights")
 *
 * CREDENTIALS NEEDED:
 * ANTHROPIC_API_KEY — console.anthropic.com → API Keys → Create Key
 *                     Used for AI insights generation via claude-sonnet-4-20250514
 *
 * All other credentials are used by the individual fetch-*.js functions.
 */

const { getStore } = require('@netlify/blobs');
const Anthropic = require('@anthropic-ai/sdk');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

// Internal base URL for calling sibling Netlify functions
function getSiblingFunctionUrl(functionName, event) {
  // In Netlify, functions can call each other via the site URL
  const host = event.headers?.host || event.headers?.Host || 'localhost:8888';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}/.netlify/functions/${functionName}`;
}

async function callFunction(url, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { dataSource: 'error', error: `HTTP ${res.status}` };
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    return { dataSource: 'error', error: err.message };
  }
}

// ---- Prompts ----

const HQ_SYSTEM_PROMPT = `You are a marketing analyst for PerforMotion HQ, a clinical Exercise Physiology facility in Teneriffe, Brisbane. Brand voice: warm, clinical, community-focused. Speaks to people navigating injury, chronic illness, women's health, or wanting supported strength training in a credible environment. Analyse the provided dashboard data and give exactly: (1) A 3-sentence HQ performance summary. (2) The single biggest HQ content opportunity this month. (3) The single biggest HQ audience risk right now. (4) One specific Instagram HQ post idea — must be in HQ voice: warm, clinical, credibility-led. No hype. No generic fitness language. (5) One specific Facebook post idea — clinical focus, women's health or community angle. Be direct, specific, and actionable.`;

const ONLINE_SYSTEM_PROMPT = `You are a marketing analyst for PerforMotion Online, an online Exercise Physiology and powerlifting coaching brand. Brand voice: performance-driven, technical, peer-to-peer. Speaks to trained athletes, competitive powerlifters, and serious gym goers who expect coaching expertise. Analyse the provided dashboard data and give exactly: (1) A 3-sentence Online performance summary. (2) The single biggest Online content opportunity this month. (3) The single biggest Online audience risk right now. (4) One specific Instagram Online post idea — technical, performance-led, peer-level authority. No beginner framing. (5) One specific YouTube video concept — either long-form powerlifting content or short-form exercise tip. Include suggested title and hook sentence. Be direct and specific.`;

async function generateAiInsights(brand, dashboardData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });

  const systemPrompt = brand === 'hq' ? HQ_SYSTEM_PROMPT : ONLINE_SYSTEM_PROMPT;
  const brandLabel = brand === 'hq' ? 'HQ' : 'Online';

  // Build a concise data summary for the AI
  const dataSummary = {
    brand: brandLabel,
    reportDate: new Date().toISOString().split('T')[0],
    meta: dashboardData.meta ? {
      hqInstagramFollowers: dashboardData.meta.hq?.instagram?.account?.followers_count,
      hqFbReach7d: dashboardData.meta.hq?.facebook?.insights7d,
      onlineIgFollowers: dashboardData.meta.online?.instagram?.account?.followers_count,
      adSpend: dashboardData.meta.ads?.account?.data?.[0]?.spend,
    } : 'not available',
    email: dashboardData.activecampaign ? {
      totalActiveContacts: dashboardData.activecampaign.totalActiveContacts,
      recentCampaigns: dashboardData.activecampaign.campaigns?.slice(0, 3),
    } : 'not available',
    bookings: dashboardData.halaxy ? {
      totalAppointments30d: dashboardData.halaxy.summary?.totalAppointments30d,
      newPatients30d: dashboardData.halaxy.summary?.newPatients30d,
      cancellationRate: dashboardData.halaxy.summary?.cancellationRate,
    } : 'not available',
    youtube: brand === 'online' && dashboardData.youtube ? {
      subscriberCount: dashboardData.youtube.statistics?.subscriberCount,
      avgEngagementRate: dashboardData.youtube.metrics?.avgEngagementRate,
      topVideo: dashboardData.youtube.topVideo?.title,
    } : 'not applicable',
    seo: dashboardData.gsc ? {
      totalClicks28d: dashboardData.gsc.totals?.clicks,
      avgPosition: dashboardData.gsc.totals?.avgPosition,
    } : 'not available',
  };

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Here is the current dashboard data for PerforMotion ${brandLabel}:\n\n${JSON.stringify(dataSummary, null, 2)}\n\nPlease provide your analysis.`,
      },
    ],
  });

  return {
    brand,
    insights: message.content[0]?.text || 'No insights generated.',
    generatedAt: new Date().toISOString(),
    model: 'claude-sonnet-4-20250514',
    tokensUsed: message.usage?.output_tokens || 0,
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const store = getStore('marketing-cache');

  // --- Handle AI insights request ---
  if (event.httpMethod === 'POST') {
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (_) {}

    if (body.action === 'ai-insights') {
      const brand = body.brand || 'hq';
      try {
        // Load cached dashboard data
        const dashboardData = await store.get('dashboard', { type: 'json' }).catch(() => ({}));
        const insights = await generateAiInsights(brand, dashboardData || {});

        // Cache insights
        await store.setJSON(`ai-insights-${brand}`, insights).catch(() => {});

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(insights) };
      } catch (err) {
        console.error('AI insights error:', err.message);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: err.message }),
        };
      }
    }
  }

  // --- Full dashboard refresh (POST or scheduled GET) ---
  console.log('update-dashboard: Starting full refresh');

  const baseUrl = getSiblingFunctionUrl('', event).replace(/\/[^/]+$/, '');

  // Fetch all data sources in parallel
  const [metaData, acData, ga4Data, youtubeData, halaxyData, gscData, attributionData] = await Promise.all([
    callFunction(`${baseUrl}/fetch-meta`),
    callFunction(`${baseUrl}/fetch-activecampaign`),
    callFunction(`${baseUrl}/fetch-ga4`),
    callFunction(`${baseUrl}/fetch-youtube`),
    callFunction(`${baseUrl}/fetch-halaxy`),
    callFunction(`${baseUrl}/fetch-gsc`),
    store.get('zapier-attribution', { type: 'json' }).catch(() => null),
  ]);

  // Calculate marketing health scores
  function calcHqHealthScore(meta, ac, halaxy) {
    let score = 0;
    // Reach (20 pts): 7-day reach > 1000
    if (meta?.dataSource !== 'error') score += 15;
    // Engagement (20 pts): based on email open rate
    if (ac?.campaigns?.length > 0) {
      const avgOpen = ac.campaigns.reduce((s, c) => s + parseFloat(c.openRate || 0), 0) / ac.campaigns.length;
      if (avgOpen >= 25) score += 20;
      else if (avgOpen >= 21) score += 15;
      else if (avgOpen >= 15) score += 10;
      else score += 5;
    } else score += 10;
    // Bookings (20 pts)
    if (halaxy?.summary?.totalAppointments30d >= 80) score += 20;
    else if (halaxy?.summary?.totalAppointments30d >= 50) score += 15;
    else if (halaxy?.summary?.totalAppointments30d >= 20) score += 10;
    else score += 5;
    // Cancellation rate (20 pts)
    if (halaxy?.summary?.cancellationRate <= 10) score += 20;
    else if (halaxy?.summary?.cancellationRate <= 15) score += 12;
    else score += 5;
    // List growth (20 pts)
    if (ac?.dataSource !== 'error' && ac?.totalActiveContacts > 500) score += 20;
    else score += 10;
    return Math.min(100, score);
  }

  function calcOnlineHealthScore(meta, ac, youtube) {
    let score = 0;
    if (meta?.dataSource !== 'error') score += 15;
    if (youtube?.statistics?.subscriberCount >= 1500) score += 20;
    else if (youtube?.statistics?.subscriberCount >= 1000) score += 15;
    else score += 8;
    if (youtube?.metrics?.avgEngagementRate >= 3) score += 20;
    else if (youtube?.metrics?.avgEngagementRate >= 2) score += 14;
    else score += 7;
    if (ac?.dataSource !== 'error') score += 15;
    score += 20; // base for being active
    return Math.min(100, score);
  }

  const hqScore = calcHqHealthScore(metaData, acData, halaxyData);
  const onlineScore = calcOnlineHealthScore(metaData, acData, youtubeData);
  const overallScore = Math.round((hqScore + onlineScore) / 2);

  const dashboard = {
    lastUpdated: new Date().toISOString(),
    healthScores: { hq: hqScore, online: onlineScore, overall: overallScore },
    meta: metaData,
    activecampaign: acData,
    ga4: ga4Data,
    youtube: youtubeData,
    halaxy: halaxyData,
    gsc: gscData,
    attribution: attributionData,
  };

  // Store in Netlify Blobs
  try {
    await store.setJSON('dashboard', dashboard);
    console.log('update-dashboard: Cached to Netlify Blobs');
  } catch (blobErr) {
    console.warn('update-dashboard: Blob write failed:', blobErr.message);
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(dashboard),
  };
};
