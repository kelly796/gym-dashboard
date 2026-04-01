exports.handler = async function(event) {
  const KEY = process.env.GYMMASTER_API_KEY;
  const BASE = 'https://performotion.gymmasteronline.com';
  const type = (event.queryStringParameters || {}).type;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    let r, d;

    if (type === 'explore') {
      // Explore different API versions and endpoints for membership type data
      const paths = [
        '/portal/api/v2/members',
        '/portal/api/v1/member_memberships',
        '/portal/api/v1/active_members',
        '/portal/api/v1/memberships/current',
        '/portal/api/v1/reports/membership_summary',
        '/portal/api/v1/reports',
        '/portal/api/v1/kpi',
        '/portal/api/v1/dashboard',
        '/gatekeeper_api/v2/memberships',
        '/gatekeeper_api/v2/members',
        '/portal/api/v2/memberships/members',
        '/portal/api/v1/members/memberships',
      ];
      const results = [];
      for (const p of paths) {
        try {
          const sep = p.includes('?') ? '&' : '?';
          const resp = await fetch(BASE + p + sep + 'api_key=' + KEY);
          const txt = await resp.text();
          results.push({ path: p, status: resp.status, snippet: txt.slice(0,100) });
        } catch(e) { results.push({ path: p, error: e.message }); }
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ results }) };
    }

    if (type === 'v2explore') {
      // Try v2 reporting API with different auth
      const paths = [
        '/portal/api/v2/members',
        '/portal/api/v2/memberships',
        '/portal/api/v2/reports/memberships',
        '/portal/api/v2/kpi',
        '/portal/reporting/api/members',
        '/portal/reporting/api/memberships',
      ];
      const results = [];
      for (const p of paths) {
        try {
          const resp = await fetch(BASE + p + '?api_key=' + KEY);
          const txt = await resp.text();
          results.push({ path: p, status: resp.status, snippet: txt.slice(0,120) });
        } catch(e) { results.push({ path: p, error: e.message }); }
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
