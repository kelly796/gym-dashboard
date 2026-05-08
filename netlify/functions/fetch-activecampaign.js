/**
 * fetch-activecampaign.js — ActiveCampaign email marketing data fetcher
 *
 * CREDENTIALS NEEDED:
 * AC_API_KEY  — ActiveCampaign → Settings → Developer → API Access → Key
 * AC_BASE_URL — Your AC account URL, e.g. https://youraccountname.api-us1.com
 *               Found at: Settings → Developer → API Access → URL
 *
 * API DOCS: https://developers.activecampaign.com/reference/overview
 */

const { getStore } = require('@netlify/blobs');

const AC_API_KEY = process.env.AC_API_KEY;
const AC_BASE_URL = process.env.AC_BASE_URL; // e.g. https://youraccountname.api-us1.com

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

async function acFetch(path, params = {}) {
  const url = new URL(`${AC_BASE_URL}/api/3${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      'Api-Token': AC_API_KEY,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AC API error ${res.status}: ${err}`);
  }
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    if (!AC_API_KEY) throw new Error('AC_API_KEY not set');
    if (!AC_BASE_URL) throw new Error('AC_BASE_URL not set');

    // Fetch all lists
    // Lists represent the HQ and Online subscriber segments
    const listsData = await acFetch('/lists', { limit: 100 });

    // Fetch contacts summary
    const contactsData = await acFetch('/contacts', { limit: 1, status: 1 }); // status=1 active

    // Fetch recent campaigns (last 20)
    const campaignsData = await acFetch('/campaigns', {
      limit: 20,
      orders: { sdate: 'DESC' },
      'filters[status]': 'sent',
    });

    // For each campaign get its message (open/click stats)
    const campaignDetails = [];
    if (campaignsData.campaigns) {
      for (const campaign of campaignsData.campaigns.slice(0, 10)) {
        try {
          const detail = await acFetch(`/campaigns/${campaign.id}`);
          campaignDetails.push(detail.campaign || campaign);
        } catch (e) {
          campaignDetails.push(campaign);
        }
      }
    }

    // Fetch automations
    const automationsData = await acFetch('/automations', { limit: 50 });

    // Fetch unsubscribes (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const unsubData = await acFetch('/contacts', {
      limit: 1,
      status: 2, // unsubscribed
      'filters[created_after]': thirtyDaysAgo.toISOString(),
    });

    // Build list-level stats
    const listStats = (listsData.lists || []).map((list) => ({
      id: list.id,
      name: list.name,
      subscriberCount: parseInt(list.subscriber_count || 0),
      unsubscribeCount: parseInt(list.unsubscriberCount || 0),
    }));

    // Build campaign stats
    const campaignStats = campaignDetails.map((c) => ({
      id: c.id,
      name: c.name,
      subject: c.subject,
      sentDate: c.sdate,
      sendamt: parseInt(c.sendamt || 0),
      opens: parseInt(c.uniqueopens || 0),
      clicks: parseInt(c.uniquelinkclicks || 0),
      unsubscribes: parseInt(c.unsubscribes || 0),
      openRate: c.sendamt > 0 ? ((parseInt(c.uniqueopens || 0) / parseInt(c.sendamt)) * 100).toFixed(1) : '0.0',
      clickRate: c.sendamt > 0 ? ((parseInt(c.uniquelinkclicks || 0) / parseInt(c.sendamt)) * 100).toFixed(1) : '0.0',
      unsubRate: c.sendamt > 0 ? ((parseInt(c.unsubscribes || 0) / parseInt(c.sendamt)) * 100).toFixed(2) : '0.00',
    }));

    const result = {
      dataSource: 'live',
      fetchedAt: new Date().toISOString(),
      lists: listStats,
      totalActiveContacts: parseInt(contactsData.meta?.total || 0),
      campaigns: campaignStats,
      automations: (automationsData.automations || []).map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        contactsEntered: parseInt(a.entered || 0),
      })),
      unsubscribesLast30d: parseInt(unsubData.meta?.total || 0),
    };

    // Cache
    try {
      const store = getStore('marketing-cache');
      await store.setJSON('activecampaign', result);
    } catch (blobErr) {
      console.warn('Blob cache write failed:', blobErr.message);
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };
  } catch (err) {
    console.error('fetch-activecampaign error:', err.message);

    try {
      const store = getStore('marketing-cache');
      const cached = await store.get('activecampaign', { type: 'json' });
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
