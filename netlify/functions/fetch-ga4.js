/**
 * fetch-ga4.js — Google Analytics 4 data fetcher
 *
 * CREDENTIALS NEEDED:
 * GA4_PROPERTY_ID         — GA4 → Admin → Property Settings → Property ID (numeric, e.g. 123456789)
 * GA4_SERVICE_ACCOUNT_JSON— JSON string of service account key from Google Cloud Console
 *                           Steps:
 *                           1. Google Cloud Console → IAM & Admin → Service Accounts → Create
 *                           2. Download JSON key
 *                           3. GA4 → Admin → Property Access Management → Add user (Viewer role)
 *                              using service account email
 *                           4. Paste entire JSON as env var value (minified or escaped)
 *
 * Scopes needed: https://www.googleapis.com/auth/analytics.readonly
 * API DOCS: https://developers.google.com/analytics/devguides/reporting/data/v1
 */

const { getStore } = require('@netlify/blobs');

const PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const SERVICE_ACCOUNT_JSON = process.env.GA4_SERVICE_ACCOUNT_JSON;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

// Minimal JWT + OAuth for service account auth without heavy dependencies
async function getServiceAccountToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
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

  // Use Node crypto for RS256 signing
  const crypto = require('crypto');
  const privateKey = serviceAccount.private_key;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKey, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signingInput}.${signature}`;

  // Exchange JWT for access token
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
    throw new Error(`Failed to get GA4 access token: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

async function runReport(token, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`,
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
    throw new Error(`GA4 API error ${res.status}: ${err}`);
  }
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    if (!PROPERTY_ID) throw new Error('GA4_PROPERTY_ID not set');
    if (!SERVICE_ACCOUNT_JSON) throw new Error('GA4_SERVICE_ACCOUNT_JSON not set');

    const serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
    const token = await getServiceAccountToken(serviceAccount);

    // --- Report 1: Active users last 30 days, daily ---
    const activeUsersReport = await runReport(token, {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    // --- Report 2: Booking link clicks (event: click, link contains "halaxy" or "book") ---
    const bookingClicksReport = await runReport(token, {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'eventName', stringFilter: { value: 'click' } } },
            {
              orGroup: {
                expressions: [
                  { filter: { fieldName: 'linkUrl', stringFilter: { matchType: 'CONTAINS', value: 'halaxy' } } },
                  { filter: { fieldName: 'linkUrl', stringFilter: { matchType: 'CONTAINS', value: 'book' } } },
                ],
              },
            },
          ],
        },
      },
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    });

    // --- Report 3: Traffic sources ---
    const trafficSourceReport = await runReport(token, {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'conversions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    });

    // --- Report 4: Top pages ---
    const topPagesReport = await runReport(token, {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'averageSessionDuration' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    });

    // --- Report 5: UTM source breakdown for booking page ---
    const utmReport = await runReport(token, {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaign' }],
      metrics: [{ name: 'sessions' }, { name: 'conversions' }],
      dimensionFilter: {
        filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: 'book' } },
      },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    });

    // Parse helpers
    const parseRows = (report) => {
      if (!report || !report.rows) return [];
      const dimNames = report.dimensionHeaders?.map((h) => h.name) || [];
      const metNames = report.metricHeaders?.map((h) => h.name) || [];
      return report.rows.map((row) => {
        const obj = {};
        row.dimensionValues?.forEach((v, i) => { obj[dimNames[i]] = v.value; });
        row.metricValues?.forEach((v, i) => { obj[metNames[i]] = parseFloat(v.value); });
        return obj;
      });
    };

    const result = {
      dataSource: 'live',
      fetchedAt: new Date().toISOString(),
      activeUsers: parseRows(activeUsersReport),
      bookingClicks: parseRows(bookingClicksReport),
      trafficSources: parseRows(trafficSourceReport),
      topPages: parseRows(topPagesReport),
      utmBreakdown: parseRows(utmReport),
      totals: {
        activeUsers30d: activeUsersReport.totals?.[0]?.metricValues?.[0]?.value || 0,
        sessions30d: activeUsersReport.totals?.[0]?.metricValues?.[1]?.value || 0,
        bookingClicks30d: bookingClicksReport.totals?.[0]?.metricValues?.[0]?.value || 0,
      },
    };

    try {
      const store = getStore('marketing-cache');
      await store.setJSON('ga4', result);
    } catch (blobErr) {
      console.warn('Blob cache write failed:', blobErr.message);
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };
  } catch (err) {
    console.error('fetch-ga4 error:', err.message);

    try {
      const store = getStore('marketing-cache');
      const cached = await store.get('ga4', { type: 'json' });
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
