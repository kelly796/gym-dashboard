
// Read membership counts from Netlify Blobs (updated by webhook)
async function getMembershipCounts() {
  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('gymmaster-data');
    const counts = await store.get('membership-counts', { type: 'json' });
    return counts;
  } catch(e) { return null; }
}

exports.handler = async function(event) {
  const KEY = process.env.GYMMASTER_API_KEY;
  const BASE = 'https://performotion.gymmasteronline.com';
  const type = (event.queryStringParameters || {}).type;
  if (type === 'membership-counts') {
    const counts = await getMembershipCounts();
    const defaults = {'Gym Access 24/7':27,'Perf Base':11,'Perf Core':6,'Perf Plus':3,'Perf Prime':2,'Plus Online':4,'Community':1,'S&C Open Session':1};
    return { statusCode: 200, body: JSON.stringify(counts || defaults), headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
  }

    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    let r, d;

    if (type === 'portal_explore') {
      // Try portal API with additional params and different endpoints
      const tests = [
        BASE + '/portal/api/v1/members?api_key=' + KEY + '&include_membership=1',
        BASE + '/portal/api/v1/members?api_key=' + KEY + '&detailed=1',
        BASE + '/portal/api/v1/members?api_key=' + KEY + '&membership=1',
        BASE + '/portal/api/v1/subscriptions?api_key=' + KEY,
        BASE + '/portal/api/v1/billing?api_key=' + KEY,
        BASE + '/portal/api/v1/member_plans?api_key=' + KEY,
        BASE + '/portal/api/v1/plans?api_key=' + KEY,
        BASE + '/portal/api/v1/charges?api_key=' + KEY,
        BASE + '/portal/api/v1/member_types?api_key=' + KEY,
      ];
      const results = [];
      for (const url of tests) {
        try {
          const resp = await fetch(url);
          const txt = await resp.text();
          const label = url.split('/portal/api/v1/')[1].split('?')[0];
          results.push({ endpoint: label, status: resp.status, snippet: txt.slice(0, 120) });
        } catch(e) { results.push({ endpoint: url, error: e.message }); }
      }
      return { statusCode: 200, headers: cors, body: JSON.stringify({ results }) };
    }

    if (type === 'gatekeeper_key') {
      // Try Gatekeeper API with Basic auth using api key as password
      const GKBASE = BASE + '/gatekeeper_api/v2';
      const basicAuth = Buffer.from('api:' + KEY).toString('base64');
      const tests = [
        { url: GKBASE + '/members', headers: { 'Authorization': 'Basic ' + basicAuth } },
        { url: GKBASE + '/memberships', headers: { 'Authorization': 'Basic ' + basicAuth } },
        { url: GKBASE + '/membertypes?key=' + KEY },
        { url: GKBASE + '/membershiptypes?key=' + KEY },
      ];
      const results = [];
      for (const t of tests) {
        try {
          const resp = await fetch(t.url, t.headers ? { headers: t.headers } : {});
          const txt = await resp.text();
          results.push({ url: t.url.replace(KEY,'***').replace(BASE,''), status: resp.status, snippet: txt.slice(0,150) });
        } catch(e) { results.push({ url: t.url.replace(KEY,'***').replace(BASE,''), error: e.message }); }
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
