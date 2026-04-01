exports.handler = async function(event) {
  const KEY = process.env.GYMMASTER_API_KEY;
  const BASE = 'https://performotion.gymmasteronline.com/portal/api/v1';
  const type = (event.queryStringParameters || {}).type;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    let r, d;
    if (type === 'debug') {
      const url = BASE + '/members_api_key_' + (KEY || 'MISSING');
      r = await fetch(url);
      const raw = await r.text();
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        keyPresent: KEY ? ('yes len=' + KEY.length) : 'MISSING',
        httpStatus: r.status,
        rawSlice: raw.slice(0, 500)
      })};
    }
    if (type === 'members') {
      r = await fetch(BASE + '/members_api_key_' + KEY);
      d = await r.json();
      const rows = d.result || d.data || d.members || d.member || [];
      const members = rows.map(m => {
        const s = (m.status || '').toLowerCase();
        return {
          id: m.id,
          firstname: m.firstname || m.first_name || '',
          lastname: m.surname || m.lastname || m.last_name || '',
          status: ['expired','cancelled','inactive','recently expired'].includes(s) ? 'cancelled'
                : ['on hold','hold','suspended'].includes(s) ? 'hold' : 'active',
          membership_name: m.membershiptypename || m.membershiptype || m.membership_name
                        || (s === 'current' ? 'Standard Member' : (m.status || 'Standard Member')),
          join_date: m.joindate || m.join_date || null,
          cancel_date: m.leavedate || m.canceldate || m.cancel_date || null,
          last_visit: m.lastvisit || m.last_visit || null,
          visit_count: m.visitcount || m.visit_count || 0
        };
      });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ members }) };
    }
    if (type === 'memberships') { r = await fetch(BASE + '/memberships_api_key_' + KEY); d = await r.json(); return { statusCode: 200, headers: cors, body: JSON.stringify(d) }; }
    if (type === 'classes') { r = await fetch(BASE + '/booking/classes/schedule_api_key_' + KEY); d = await r.json(); return { statusCode: 200, headers: cors, body: JSON.stringify(d) }; }
    if (type === 'cancellations') { r = await fetch(BASE + '/memberships/cancel_api_key_' + KEY); d = await r.json(); return { statusCode: 200, headers: cors, body: JSON.stringify(d) }; }
    r = await fetch(BASE + '/version_api_key_' + KEY); d = await r.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify(d) };
  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
