/**
 * fetch-gsc.js — Google Search Console data fetcher
 *
 * CREDENTIALS NEEDED:
 * GSC_SITE_URL            — Your verified property URL in Search Console
 *                           e.g. https://performotion.net OR sc-domain:performotion.net
 *                           Found at: Google Search Console → property selector
 * GA4_SERVICE_ACCOUNT_JSON— Same service account JSON used for GA4
 *                           Additional setup: Google Search Console → Settings → Users and permissions
 *                           → Add user → paste service account email → set "Full" permission
 *
 * Scopes needed: https://www.googleapis.com/auth/webmasters.readonly
 *
 * ZAPIER ALTERNATIVE: No — GSC does not have Zapier integration. Service account is required.
 *
 * API DOCS: https://developers.google.com/webmaster-tools/v1/api_reference_index
 */

const { getStore } = require('@netlify/blobs');

const SITE_URL = process.env.GSC_SITE_URL;
const SERVICE_ACCOUNT_JSON = process.env.GA4_SERVICE_ACCOUNT_JSON; // reuse same SA

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

async function getServiceAccountToken(serviceAccount) {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const base64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign
    .sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Failed to get GSC access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

async function gscQuery(token, body) {
  const encodedSite = encodeURIComponent(SITE_URL);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GSC API error ${res.status}: ${err}`);
  }
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    if (!SITE_URL) throw new Error('GSC_SITE_URL not set');
    if (!SERVICE_ACCOUNT_JSON) throw new Error('GA4_SERVICE_ACCOUNT_JSON not set');

    const serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
    const token = await getServiceAccountToken(serviceAccount);

    // Date range: last 28 days (GSC data typically lags by ~2-3 days)
    const until = new Date();
    until.setDate(until.getDate() - 3); // account for lag
    const since = new Date(until);
    since.setDate(since.getDate() - 28);

    const sinceStr = since.toISOString().split('T')[0];
    const untilStr = until.toISOString().split('T')[0];

    // Prior period for comparison
    const priorSince = new Date(since);
    priorSince.setDate(priorSince.getDate() - 28);
    const priorUntil = new Date(since);
    priorUntil.setDate(priorUntil.getDate() - 1);

    // --- Query 1: Top keywords by clicks ---
    const keywordsData = await gscQuery(token, {
      startDate: sinceStr,
      endDate: untilStr,
      dimensions: ['query'],
      rowLimit: 50,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    });

    // --- Query 2: Top pages ---
    const pagesData = await gscQuery(token, {
      startDate: sinceStr,
      endDate: untilStr,
      dimensions: ['page'],
      rowLimit: 20,
      orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
    });

    // --- Query 3: Overall totals ---
    const totalsData = await gscQuery(token, {
      startDate: sinceStr,
      endDate: untilStr,
      dimensions: [],
      rowLimit: 1,
    });

    // --- Query 4: Prior period totals (for WoW comparison) ---
    const priorTotalsData = await gscQuery(token, {
      startDate: priorSince.toISOString().split('T')[0],
      endDate: priorUntil.toISOString().split('T')[0],
      dimensions: [],
      rowLimit: 1,
    });

    // --- Query 5: Daily trend ---
    const dailyData = await gscQuery(token, {
      startDate: sinceStr,
      endDate: untilStr,
      dimensions: ['date'],
      rowLimit: 30,
      orderBy: [{ fieldName: 'date', sortOrder: 'ASCENDING' }],
    });

    // Parse keyword rows and categorise by brand
    const HQ_KEYWORDS = [
      'exercise physiologist brisbane', 'exercise physiologist teneriffe',
      "women's health exercise physiology", 'ep near me', 'chronic pain exercise physiology',
      'ndis exercise physiology', 'medicare exercise physiology', 'strength training with injury',
      'exercise physiology near me', 'teneriffe physio',
    ];
    const ONLINE_KEYWORDS = [
      'online powerlifting coach', 'online exercise physiologist', 'powerlifting program australia',
      'strength rehab online', 'online ep coach', 'powerlifting coach australia',
      'online strength coach',
    ];

    const keywords = (keywordsData.rows || []).map((row) => {
      const query = row.keys[0];
      const lq = query.toLowerCase();
      const brand = HQ_KEYWORDS.some((k) => lq.includes(k.split(' ')[0]) && lq.includes('brisbane') || lq === k)
        ? 'HQ'
        : ONLINE_KEYWORDS.some((k) => lq.includes('online') || lq.includes('powerlifting') || lq.includes('coach'))
        ? 'Online'
        : 'HQ'; // default to HQ
      return {
        keyword: query,
        brand,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: (row.ctr * 100).toFixed(1),
        position: row.position.toFixed(1),
      };
    });

    const totals = totalsData.rows?.[0] || {};
    const priorTotals = priorTotalsData.rows?.[0] || {};

    const result = {
      dataSource: 'live',
      fetchedAt: new Date().toISOString(),
      period: { since: sinceStr, until: untilStr },
      totals: {
        clicks: totals.clicks || 0,
        impressions: totals.impressions || 0,
        ctr: totals.ctr ? (totals.ctr * 100).toFixed(1) : '0.0',
        avgPosition: totals.position ? totals.position.toFixed(1) : '0.0',
      },
      priorTotals: {
        clicks: priorTotals.clicks || 0,
        impressions: priorTotals.impressions || 0,
        avgPosition: priorTotals.position ? priorTotals.position.toFixed(1) : '0.0',
      },
      keywords,
      pages: (pagesData.rows || []).map((row) => ({
        page: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: (row.ctr * 100).toFixed(1),
        position: row.position.toFixed(1),
      })),
      daily: (dailyData.rows || []).map((row) => ({
        date: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position.toFixed(1),
      })),
    };

    try {
      const store = getStore('marketing-cache');
      await store.setJSON('gsc', result);
    } catch (blobErr) {
      console.warn('Blob cache write failed:', blobErr.message);
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };
  } catch (err) {
    console.error('fetch-gsc error:', err.message);

    try {
      const store = getStore('marketing-cache');
      const cached = await store.get('gsc', { type: 'json' });
      if (cached) {
        cached.dataSource = 'cached';
        cached.cacheWarning = `Live fetch failed: ${err.message}`;
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(cached) };
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
