exports.handler = async function(event) {
  const KEY = process.env.GYMMASTER_API_KEY;
  const BASE = 'https://performotion.gymmasteronline.com/portal/api/v1';
  const type = (event.queryStringParameters || {}).type;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    let r, d;

    if (type === 'rawdebug') {
      // Test membership/{id}/members and other patterns
      // Known membership IDs from /memberships: 13159=Perf Base, 13014=Gym Access 24/7, 13160=Perf Base Plus
      const tests = [
        '/memberships/13159/members',
        '/memberships/13014/members',
        '/memberships/13159/member',
        '/reports',
        '/statistics',
        '/members?status=current',
        '/members?membershiptype=13159',
      ];
      const results = [];
      for (const path of tests) {
        try {
          const sep = path.includes('?') ? '&' : '?';
          const resp = await fetch(BASE + path + sep + 'api_key=' + KEY);
          const txt = await resp.text();
          results.push({ path, status: resp.status, snippet: txt.slice(0,150) });
        } catch(e) { results.push({ path, error: e.message }); }
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ results }) };
    }

    if (type === 'members') {
      r = await fetch(BASE + '/members?api_key=' + KEY);
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
          membership_name: m.membershiptypename || m.membershiptype || m.membership_name || m.membershipName || m.plan || '',
          join_date: m.joindate || m.join_date || null,
          cancel_date: m.leavedate || m.canceldate || m.cancel_date || null,
          last_visit: m.lastvisit || m.last_visit || null,
          visit_count: m.visitcount || m.visit_count || 0
        };
      });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ members }) };
    }

    // New: fetch members for a specific membership type ID and count them
    if (type === 'membershipcount') {
      // Fetch all memberships, then for each get members count
      r = await fetch(BASE + '/memberships?api_key=' + KEY);
      d = await r.json();
      const types = (d.result || []).filter(t => t.companyids && t.companyids.includes(2));
      const results = [];
      for (const t of types.slice(0,5)) { // test first 5
        try {
          const resp = await fetch(BASE + '/memberships/' + t.id + '/members?api_key=' + KEY);
          const txt = await resp.text();
          results.push({ id: t.id, name: t.name, status: resp.status, snippet: txt.slice(0,100) });
        } catch(e) { results.push({ id: t.id, name: t.name, error: e.message }); }
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ results }) };
    }

    if (type === 'memberships') { r = await fetch(BASE + '/memberships?api_key=' + KEY); d = await r.json(); return { statusCode: 200, headers: cors, body: JSON.stringify(d) }; }
    if (type === 'classes') { r = await fetch(BASE + '/booking/classes/schedule?api_key=' + KEY); d = await r.json(); return { statusCode: 200, headers: cors, body: JSON.stringify(d) }; }
    if (type === 'cancellations') { r = await fetch(BASE + '/memberships/cancel?api_key=' + KEY); d = await r.json(); return { statusCode: 200, headers: cors, body: JSON.stringify(d) }; }
    r = await fetch(BASE + '/version?api_key=' + KEY); d = await r.json();
    return { statusCode: 200, headers: cors, body: JSON.stringify(d) };
  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
