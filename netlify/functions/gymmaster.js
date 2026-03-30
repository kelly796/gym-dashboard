exports.handler = async function(event) {
  const API_KEY = process.env.GYMMASTER_API_KEY;
  const BASE = 'https://performotion.gymmasteronline.com/portal/api/v1';
  const type = event.queryStringParameters && event.queryStringParameters.type;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    let res, data;

    if (type === 'members') {
      res = await fetch(BASE + '/members?api_key=' + API_KEY);
      data = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (type === 'memberships') {
      res = await fetch(BASE + '/memberships?api_key=' + API_KEY);
      data = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (type === 'classes') {
      res = await fetch(BASE + '/booking/classes/schedule?api_key=' + API_KEY);
      data = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (type === 'cancellations') {
      res = await fetch(BASE + '/memberships/cancel?api_key=' + API_KEY);
      data = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    // Default test
    res = await fetch(BASE + '/version?api_key=' + API_KEY);
    data = await res.json();
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };

  } catch(err) {
    return { 
      statusCode: 500, 
      headers: corsHeaders, 
      body: JSON.stringify({ error: err.message }) 
    };
  }
};
