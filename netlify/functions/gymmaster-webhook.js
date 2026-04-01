const { getStore } = require('@netlify/blobs');

// Default membership counts from April 2026 GymMaster report
const DEFAULTS = {
  'Gym Access 24/7': 27,
  'Perf Base': 11,
  'Perf Core': 6,
  'Perf Plus': 3,
  'Perf Prime': 2,
  'Plus Online': 4,
  'Community': 1,
  'S&C Open Session': 1
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const store = getStore('gymmaster-data');

    // Get current counts (or use defaults)
    let counts = await store.get('membership-counts', { type: 'json' });
    if (!counts) counts = { ...DEFAULTS };

    // Parse GymMaster webhook payload
    const body = JSON.parse(event.body || '{}');
    
    // GymMaster sends events like: member.signup, member.cancel, member.membership_change
    const eventType = (body.event || body.type || body.action || '').toLowerCase();
    const membershipType = (
      body.membership_name || 
      body.membership_type || 
      body.member?.membership_name ||
      body.member?.membership_type ||
      ''
    ).trim();

    const oldType = (
      body.old_membership_name ||
      body.old_membership_type ||
      body.member?.old_membership_name ||
      ''
    ).trim();

    console.log('GymMaster webhook:', eventType, membershipType, oldType);

    if (eventType.includes('signup') || eventType.includes('join') || eventType.includes('creat') || eventType.includes('new')) {
      // New member signed up
      if (membershipType && counts.hasOwnProperty(membershipType)) {
        counts[membershipType]++;
      }
    } else if (eventType.includes('cancel') || eventType.includes('delet') || eventType.includes('terminat')) {
      // Member cancelled
      if (membershipType && counts.hasOwnProperty(membershipType) && counts[membershipType] > 0) {
        counts[membershipType]--;
      }
    } else if (eventType.includes('change') || eventType.includes('updat') || eventType.includes('transfer')) {
      // Membership type changed
      if (oldType && counts.hasOwnProperty(oldType) && counts[oldType] > 0) {
        counts[oldType]--;
      }
      if (membershipType && counts.hasOwnProperty(membershipType)) {
        counts[membershipType]++;
      }
    }

    // Store updated counts
    await store.setJSON('membership-counts', counts);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, event: eventType, counts })
    };

  } catch (err) {
    console.error('Webhook error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
