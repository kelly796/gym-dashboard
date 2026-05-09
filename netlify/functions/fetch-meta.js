/**
 * fetch-meta.js — Meta (Facebook/Instagram) data fetcher
 *
 * CREDENTIALS NEEDED:
 * META_ACCESS_TOKEN  — Meta Business Suite → Settings → Business Info → System User Token
 *                      OR Facebook Developer → Tools → Graph API Explorer → Generate Token
 *                      Scopes: pages_read_engagement, ads_read, instagram_basic,
 *                              instagram_manage_insights, read_insights
 * META_AD_ACCOUNT_ID — Business Manager → Ad Accounts → select account → ID (format: act_XXXXXXXXX)
 * META_HQ_PAGE_ID    — HQ Facebook Page → About → Page ID (numeric)
 * META_ONLINE_PAGE_ID— Online Facebook/Instagram Page → About → Page ID (numeric)
 *
 * API DOCS: https://developers.facebook.com/docs/graph-api/reference/page/insights/
 * Ad Insights: https://developers.facebook.com/docs/marketing-api/reference/adaccount/insights/
 */

const { getStore } = require('@netlify/blobs');

const BASE = 'https://graph.facebook.com/v19.0';
const TOKEN = process.env.META_ACCESS_TOKEN;
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const HQ_PAGE_ID = process.env.META_HQ_PAGE_ID;
const ONLINE_PAGE_ID = process.env.META_ONLINE_PAGE_ID;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

async function fetchMeta(url) {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}access_token=${TOKEN}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function getPageInsights(pageId, metrics, period = 'day', since, until) {
  // period: day | week | days_28 | month | lifetime
  const url = `${BASE}/${pageId}/insights?metric=${metrics.join(',')}&period=${period}&since=${since}&until=${until}`;
  return fetchMeta(url);
}

async function getInstagramInsights(igAccountId, metrics, period, since, until) {
  const url = `${BASE}/${igAccountId}/insights?metric=${metrics.join(',')}&period=${period}&since=${since}&until=${until}`;
  return fetchMeta(url);
}

async function getIgAccountId(pageId) {
  const data = await fetchMeta(`${BASE}/${pageId}?fields=instagram_business_account`);
  return data.instagram_business_account?.id;
}

async function getAdInsights(since, until) {
  // Fetches last 30 days of ad account data
  const url = `${BASE}/${AD_ACCOUNT}/insights?fields=spend,reach,impressions,clicks,cpc,cpm,cpp,actions,action_values&time_range={"since":"${since}","until":"${until}"}&level=account`;
  return fetchMeta(url);
}

async function getCampaignInsights(since, until) {
  const url = `${BASE}/${AD_ACCOUNT}/insights?fields=campaign_name,spend,reach,impressions,clicks,cpc,actions&time_range={"since":"${since}","until":"${until}"}&level=campaign&limit=20`;
  return fetchMeta(url);
}

async function getPageFollowers(pageId) {
  const data = await fetchMeta(`${BASE}/${pageId}?fields=fan_count,followers_count,name`);
  return data;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Date range: last 30 days
  const until = new Date();
  const since = new Date(until);
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split('T')[0];
  const untilStr = until.toISOString().split('T')[0];

  // 7-day range for reach
  const since7 = new Date(until);
  since7.setDate(since7.getDate() - 7);
  const since7Str = since7.toISOString().split('T')[0];

  let dataSource = 'live';

  try {
    if (!TOKEN) throw new Error('META_ACCESS_TOKEN not set');
    if (!HQ_PAGE_ID) throw new Error('META_HQ_PAGE_ID not set');

    // --- HQ Page (Facebook) ---
    const hqPageInfo = await getPageFollowers(HQ_PAGE_ID);

    const hqFbInsights7d = await getPageInsights(
      HQ_PAGE_ID,
      ['page_impressions', 'page_reach', 'page_engaged_users', 'page_post_engagements'],
      'week',
      since7Str,
      untilStr
    );

    const hqFbInsights30d = await getPageInsights(
      HQ_PAGE_ID,
      ['page_impressions', 'page_reach', 'page_fan_adds'],
      'month',
      sinceStr,
      untilStr
    );

    // --- HQ Instagram ---
    const hqIgId = await getIgAccountId(HQ_PAGE_ID);
    let hqIgData = null;
    if (hqIgId) {
      const hqIgInsights = await getInstagramInsights(
        hqIgId,
        ['reach', 'impressions', 'profile_views', 'website_clicks'],
        'day',
        since7Str,
        untilStr
      );
      const hqIgAccount = await fetchMeta(`${BASE}/${hqIgId}?fields=followers_count,media_count,biography`);
      hqIgData = { insights: hqIgInsights, account: hqIgAccount };
    }

    // --- Online Page ---
    let onlinePageInfo = null;
    let onlineIgData = null;
    if (ONLINE_PAGE_ID) {
      onlinePageInfo = await getPageFollowers(ONLINE_PAGE_ID);
      const onlineFbInsights7d = await getPageInsights(
        ONLINE_PAGE_ID,
        ['page_impressions', 'page_reach', 'page_engaged_users'],
        'week',
        since7Str,
        untilStr
      );

      const onlineIgId = await getIgAccountId(ONLINE_PAGE_ID);
      if (onlineIgId) {
        const onlineIgInsights = await getInstagramInsights(
          onlineIgId,
          ['reach', 'impressions', 'profile_views'],
          'day',
          since7Str,
          untilStr
        );
        const onlineIgAccount = await fetchMeta(`${BASE}/${onlineIgId}?fields=followers_count,media_count`);
        onlineIgData = { insights: onlineIgInsights, account: onlineIgAccount };
      }
    }

    // --- Ad Account ---
    let adData = null;
    let campaignData = null;
    if (AD_ACCOUNT) {
      adData = await getAdInsights(sinceStr, untilStr);
      campaignData = await getCampaignInsights(sinceStr, untilStr);
    }

    const result = {
      dataSource,
      fetchedAt: new Date().toISOString(),
      hq: {
        facebook: {
          pageInfo: hqPageInfo,
          insights7d: hqFbInsights7d,
          insights30d: hqFbInsights30d,
        },
        instagram: hqIgData,
      },
      online: {
        facebook: onlinePageInfo ? { pageInfo: onlinePageInfo } : null,
        instagram: onlineIgData,
      },
      ads: {
        account: adData,
        campaigns: campaignData,
      },
    };

    // Cache in Netlify Blobs
    try {
      const store = getStore('marketing-cache');
      await store.setJSON('meta', result);
    } catch (blobErr) {
      console.warn('Blob cache write failed:', blobErr.message);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error('fetch-meta error:', err.message);

    // Try to return cached data
    try {
      const store = getStore('marketing-cache');
      const cached = await store.get('meta', { type: 'json' });
      if (cached) {
        cached.dataSource = 'cached';
        cached.cacheWarning = `Live fetch failed: ${err.message}`;
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(cached),
        };
      }
    } catch (blobErr) {
      console.warn('Blob cache read failed:', blobErr.message);
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message, dataSource: 'error' }),
    };
  }
};
