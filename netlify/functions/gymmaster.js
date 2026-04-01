exports.handler = async function(event) {
  const KEY = process.env.GYMMASTER_API_KEY;
  const BASE = 'https://performotion.gymmasteronline.com';
  const type = (event.queryStringParameters || {}).type;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    let r, d;

    if (type === 'gatekeeper') {
      // Try gatekeeper API with different auth methods
      const tests = [
        { url: BASE + '/gatekeeper_api/v2/members?key=' + KEY, label: 'key param' },
        { url: BASE + '/gatekeeper_api/v2/members?api_key=' + KEY, label: 'api_key param' },
        { url: BASE + '/gatekeeper_api/v2/members?token=' + KEY, label: 'token param' },
        { url: BASE + '/gatekeeper_api/v2/members', label: 'Bearer header', headers: { 'Authorization': 'Bearer ' + KEY } },
        { url: BASE + '/gatekeeper_api/v2/members', label: 'X-API-Key header', headers: { 'X-API-Key': KEY } },
        { url: BASE + '/gatekeeper_api/v2/membertypes?api_key=' + KEY, label: 'membertypes' },
        { url: BASE + '/gatekeeper_api/v2/membershiptypes?api_key=' + KEY, label: 'membershiptypes' },
        { url: BASE + '/gatekeeper_api/v2/membership?api_key=' + KEY, label: 'membership' },
      ];
      const results = [];
      for (const t of tests) {
        try {
          const resp = await fetch(t.url, t.headers ? { headers: t.headers } : {});
          const txt = await resp.text();
          results.push({ label: t.label, status: resp.status, snippet: txt.slice(0, 120) });
        } catch(e) { results.push({ label: t.label, error: e.message }); }
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ results }) };
    }

    if (type === 'members') {
      r = await fetch(BASE + '/portal/api/v1/members?api_key=' + KEY);
      d = await r.json();
      const rows = d.result || d.data || d.members || [];
      const members = rows.map(m => {
        const s = (m.status || '').toLowerCase();
        return {
          id: m.id,
          firstname: m.firstname || '',
          lastname: m.surname || m.lastname || '',
          status: ['expired','cancelled','inactive','recently expired'].includes(s) ? 'cancelled'
                : ['on hold','hold','suspended'].includes(s) ? 'hold' : 'active',
          membership_name: m.membershiptypename || m.membershiptype || m.membership_name || '',
          join_date: m.joindate || null,
          cancel_date: m.leavedate || m.canceldate || null,
          last_visit: m.lastvisit || null,
          visit_count: m.visitcount || 0
        };
      });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ members }) };
    }
    if (type === 'memberships') {
      r = await fetch(BASE + '/portal/api/v1/memberships?api_key=' + KEY);
      d = await r.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify(d) };
    }
    if (type === 'classes') {
      r = await fetch(BASE + '/portal/api/v1/booking/classes/schedule?api_key=' + KEY);
      d = await r.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify(d) };
    }
    if (type === 'cancellations') {
      r = await fetch(BASE + '/portal/api/v1/memberships/cancel?api_key=' + KEY);
      d = await r.json();
      return { statusCode: 200, headers: cors, body: JSON.stringify(d) };
    }
    r = await fetch(BASE + '/portal/api/v1/version?api_key=' + KEY);
    d = await r.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify(d) };
  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
