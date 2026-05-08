/**
 * zapier-intake.js — Zapier webhook receiver for Halaxy booking source attribution
 *
 * PURPOSE: Bridges Halaxy (no UTM support) with GA4 by receiving structured data
 * from Zapier automations and storing it for the dashboard.
 *
 * SETUP:
 * 1. Create a Zapier automation: Halaxy trigger (New Appointment) → Webhook action
 * 2. Webhook URL: https://your-site.netlify.app/.netlify/functions/zapier-intake
 * 3. Method: POST
 * 4. Add header: X-Zapier-Secret: [your secret value]
 * 5. Set ZAPIER_WEBHOOK_SECRET env var in Netlify to same value
 *
 * ZAPIER_WEBHOOK_SECRET — A random string you generate, set in both Netlify env vars
 *                         and Zapier webhook header for authentication.
 *                         Generate: openssl rand -hex 32
 *
 * PAYLOAD FORMAT (from Zapier):
 * {
 *   "type": "appointment" | "cancellation" | "new_patient",
 *   "source": "instagram_hq" | "instagram_online" | "facebook" | "google_ads" | "organic" | "direct" | "referral",
 *   "patient_id": "xxx",
 *   "appointment_date": "2024-01-15",
 *   "appointment_type": "Initial Consultation",
 *   "practitioner": "Kelly",
 *   "notes": "optional"
 * }
 */

const { getStore } = require('@netlify/blobs');

const ZAPIER_SECRET = process.env.ZAPIER_WEBHOOK_SECRET;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Validate shared secret header
  if (ZAPIER_SECRET) {
    const incomingSecret =
      event.headers['x-zapier-secret'] || event.headers['X-Zapier-Secret'];
    if (incomingSecret !== ZAPIER_SECRET) {
      console.warn('zapier-intake: Invalid secret in request');
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }
  } else {
    console.warn('zapier-intake: ZAPIER_WEBHOOK_SECRET not set — accepting all requests (not recommended for production)');
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  // Validate required fields
  if (!payload.type) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing required field: type' }),
    };
  }

  try {
    const store = getStore('marketing-cache');

    // Load existing attribution data
    let attributionData = await store.get('zapier-attribution', { type: 'json' }).catch(() => null);
    if (!attributionData) {
      attributionData = {
        appointments: [],
        cancellations: [],
        newPatients: [],
        sourceBreakdown: {
          instagram_hq: 0,
          instagram_online: 0,
          facebook: 0,
          google_ads: 0,
          organic: 0,
          direct: 0,
          referral: 0,
          unknown: 0,
        },
        lastUpdated: null,
      };
    }

    const source = payload.source || 'unknown';
    const record = {
      ...payload,
      receivedAt: new Date().toISOString(),
    };

    // Append to appropriate array
    if (payload.type === 'appointment') {
      attributionData.appointments.push(record);
      // Keep last 500
      if (attributionData.appointments.length > 500) {
        attributionData.appointments = attributionData.appointments.slice(-500);
      }
    } else if (payload.type === 'cancellation') {
      attributionData.cancellations.push(record);
      if (attributionData.cancellations.length > 500) {
        attributionData.cancellations = attributionData.cancellations.slice(-500);
      }
    } else if (payload.type === 'new_patient') {
      attributionData.newPatients.push(record);
      if (attributionData.newPatients.length > 500) {
        attributionData.newPatients = attributionData.newPatients.slice(-500);
      }
    }

    // Update source breakdown
    if (attributionData.sourceBreakdown[source] !== undefined) {
      attributionData.sourceBreakdown[source]++;
    } else {
      attributionData.sourceBreakdown.unknown++;
    }

    attributionData.lastUpdated = new Date().toISOString();

    await store.setJSON('zapier-attribution', attributionData);

    console.log(`zapier-intake: Stored ${payload.type} from source ${source}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, type: payload.type, source }),
    };
  } catch (err) {
    console.error('zapier-intake error:', err.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
