const API_KEY = process.env.GYMMASTER_API_KEY;
const SITE_ID = process.env.GYMMASTER_SITE_ID;
const BASE = `https://api.gymmaster.com/v1/${SITE_ID}`;

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

async function fetchGM(path) {
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`GymMaster API error: ${res.status} ${path}`);
  return res.json();
}

exports.handler = async function(event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const type = event.queryStringParameters && event.queryStringParameters.type;

    if (type === 'members') {
      const data = await fetchGM('/members?status=all&limit=1000');
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (type === 'cancellations') {
      const data = await fetchGM('/members?status=cancelled&limit=1000');
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (type === 'holds') {
      const data = await fetchGM('/members?status=hold&limit=1000');
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (type === 'visits') {
      const data = await fetchGM('/visits?limit=1000');
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (type === 'classes') {
      const data = await fetchGM('/classes?limit=500');
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing type parameter' }) };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message })
    };
  }
};
