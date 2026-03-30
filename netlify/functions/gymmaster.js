exports.handler = async function(event) {
  const API_KEY = process.env.GYMMASTER_API_KEY;
  const SITE_ID = process.env.GYMMASTER_SITE_ID;
  const BASE = 'https://performotion.gymmasteronline.com/portal/api/v1/' + SITE_ID;
  const type = event.queryStringParameters && event.queryStringParameters.type;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const res = await fetch(BASE + '/members?status=all&limit=1000', {
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
  } catch(err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
