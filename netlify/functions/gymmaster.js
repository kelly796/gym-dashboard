exports.handler = async function(event) {
  const KEY = process.env.GYMMASTER_API_KEY;
  const BASE = 'https://performotion.gymmasteronline.com/portal/api/v1';
  const type = (event.queryStringParameters || {}).type;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    let r, d;

    if (type === 'members') {
      r = await fetch(BASE + '/members_api_key_' + KEY);
      d = await r.json();
      const members = (d.result || []).map(m => {
        const s = (m.status || '').toLowerCase();
        return {
          id: m.id,
          firstname: m.firstname || '',
          lastname: m.surname || '',
          status: ['expired','cancelled','inactive','recently expired'].includes(s) ? 'cancelled'
                : ['on hold','hold','suspended'].includes(s) ? 'hold' : 'active',
          membership_name: m.membershiptypename || m.membershiptype || m.membership_name
                        || (s === 'current' ? 'Standard Member' : (m.status || 'Standard Member')),
          join_date: m.joindate || null,
          cancel_date: m.leavedate || m.canceldate || null,
          last_visit: m.lastvisit || null,
          visit_count: m.visitcount || 0
        };
      });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ members }) };
    }

    if (type === 'memberships') {
      r = await fetch(BASE + '/memberships_api_key_' + KEY);
      d = await r.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify(d) };
    }

    if (type === 'classes') {
      r = await fetch(BASE + '/booking/classes/schedule_api_key_' + KEY);
      d = await r.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify(d) };
    }

    if (type === 'cancellations') {
      r = await fetch(BASE + '/memberships/cancel_api_key_' + KEY);
      d = await r.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify(d) };
    }

    r = await fetch(BASE + '/version_api_key_' + KEY);
    d = await r.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify(d) };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
