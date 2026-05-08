/**
 * fetch-halaxy.js — Halaxy practice management data fetcher
 *
 * CREDENTIALS NEEDED:
 * HALAXY_API_KEY    — Halaxy → Settings → Integrations → API → Generate API Key
 * HALAXY_PRACTICE_ID— Halaxy → Settings → Practice Details → Practice ID
 *                     (also visible in your Halaxy URL: app.halaxy.com/practice/XXXXXX)
 *
 * API DOCS: https://api.halaxy.com/docs (Halaxy API — requires approved access)
 * NOTE: Halaxy API access may need to be requested from their support team.
 *
 * ZAPIER ALTERNATIVE: Yes — Halaxy has Zapier integration for appointment events.
 * Set up: Zapier → Halaxy trigger (New Appointment, Cancelled Appointment) →
 *         Webhook action → POST to /.netlify/functions/zapier-intake
 *         Then track source attribution via zapier-intake.js
 */

const { getStore } = require('@netlify/blobs');

const API_KEY = process.env.HALAXY_API_KEY;
const PRACTICE_ID = process.env.HALAXY_PRACTICE_ID;
const HALAXY_BASE = 'https://api.halaxy.com/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

async function halaxyFetch(endpoint, params = {}) {
  const url = new URL(`${HALAXY_BASE}/${endpoint}`);
  url.searchParams.set('practice_id', PRACTICE_ID);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Halaxy API error ${res.status}: ${err}`);
  }
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    if (!API_KEY) throw new Error('HALAXY_API_KEY not set');
    if (!PRACTICE_ID) throw new Error('HALAXY_PRACTICE_ID not set');

    // Date range: last 30 days
    const until = new Date();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().split('T')[0];
    const untilStr = until.toISOString().split('T')[0];

    // --- Appointments last 30 days ---
    const appointmentsData = await halaxyFetch('appointments', {
      start_date: sinceStr,
      end_date: untilStr,
      limit: 500,
    });

    const appointments = appointmentsData.data || appointmentsData.appointments || [];

    // --- Patients (new this month) ---
    const startOfMonth = new Date(until.getFullYear(), until.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const newPatientsData = await halaxyFetch('patients', {
      created_after: startOfMonth,
      limit: 500,
    });

    const newPatients = newPatientsData.data || newPatientsData.patients || [];

    // --- All patients for returning calc ---
    const allPatientsData = await halaxyFetch('patients', {
      limit: 1,
    });
    const totalPatients = allPatientsData.meta?.total || allPatientsData.total || 0;

    // Process appointments
    const cancelled = appointments.filter(
      (a) => a.status === 'cancelled' || a.status === 'canceled'
    );
    const noShow = appointments.filter(
      (a) => a.status === 'no_show' || a.status === 'did_not_attend'
    );
    const completed = appointments.filter(
      (a) => a.status === 'completed' || a.status === 'attended'
    );

    // Daily appointment counts (last 30 days)
    const dailyCounts = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      dailyCounts[d.toISOString().split('T')[0]] = 0;
    }
    appointments.forEach((a) => {
      const day = (a.date || a.start_time || '').split('T')[0];
      if (dailyCounts[day] !== undefined) {
        dailyCounts[day]++;
      }
    });

    // Appointment types breakdown
    const typeBreakdown = {};
    appointments.forEach((a) => {
      const type = a.appointment_type || a.type || 'Other';
      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
    });

    // Lead time calculation (days between booking_date and appointment date)
    const leadTimes = appointments
      .filter((a) => a.booking_date && a.date)
      .map((a) => {
        const booked = new Date(a.booking_date);
        const appt = new Date(a.date);
        return Math.max(0, Math.round((appt - booked) / (1000 * 60 * 60 * 24)));
      });
    const avgLeadTime =
      leadTimes.length > 0
        ? Math.round(leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length)
        : 0;

    // Returning vs new patient split
    const uniquePatientIds = new Set(appointments.map((a) => a.patient_id).filter(Boolean));
    const returningPatients = uniquePatientIds.size - newPatients.length;

    const cancellationRate =
      appointments.length > 0
        ? ((cancelled.length / appointments.length) * 100).toFixed(1)
        : '0.0';

    const noShowRate =
      appointments.length > 0
        ? ((noShow.length / appointments.length) * 100).toFixed(1)
        : '0.0';

    const result = {
      dataSource: 'live',
      fetchedAt: new Date().toISOString(),
      summary: {
        totalAppointments30d: appointments.length,
        completedAppointments: completed.length,
        cancelledAppointments: cancelled.length,
        noShowAppointments: noShow.length,
        cancellationRate: parseFloat(cancellationRate),
        noShowRate: parseFloat(noShowRate),
        newPatients30d: newPatients.length,
        returningPatients: Math.max(0, returningPatients),
        avgLeadTimeDays: avgLeadTime,
        totalPatients,
      },
      dailyAppointments: Object.entries(dailyCounts).map(([date, count]) => ({
        date,
        count,
      })),
      appointmentTypes: Object.entries(typeBreakdown)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    };

    try {
      const store = getStore('marketing-cache');
      await store.setJSON('halaxy', result);
    } catch (blobErr) {
      console.warn('Blob cache write failed:', blobErr.message);
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };
  } catch (err) {
    console.error('fetch-halaxy error:', err.message);

    try {
      const store = getStore('marketing-cache');
      const cached = await store.get('halaxy', { type: 'json' });
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
