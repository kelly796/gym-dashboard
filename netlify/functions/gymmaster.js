
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
    // ── Classes ──────────────────────────────────────────────────
  if (type === 'classes') {
    // Class definitions / types
    const paths = ['classes','class','classtype','class_types','classtypes'];
    let result = null;
    for (const p of paths) {
      try {
        const r = await fetch(`${BASE}/portal_api/v1/${p}?api_key=${KEY}`);
        if (r.ok) { const d = await r.json(); result = { path: p, status: r.status, data: d }; break; }
        else { if (!result) result = { path: p, status: r.status }; }
      } catch(e) {}
    }
    return { statusCode: 200, body: JSON.stringify(result || { error: 'no class endpoint found' }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
  }

  if (type === 'schedule') {
    // Class schedule / timetable
    const paths = ['classschedule','class_schedule','schedule','timetable','classtimetable','class_timetable'];
    const today = new Date().toISOString().split('T')[0];
    const weekEnd = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    let result = null;
    for (const p of paths) {
      try {
        const r = await fetch(`${BASE}/portal_api/v1/${p}?api_key=${KEY}&start_date=${today}&end_date=${weekEnd}`);
        if (r.ok) { const d = await r.json(); result = { path: p, status: r.status, data: d }; break; }
        else {
          // Try without date params
          const r2 = await fetch(`${BASE}/portal_api/v1/${p}?api_key=${KEY}`);
          if (r2.ok) { const d2 = await r2.json(); result = { path: p, status: r2.status, data: d2 }; break; }
          if (!result) result = { path: p, status: r.status };
        }
      } catch(e) {}
    }
    return { statusCode: 200, body: JSON.stringify(result || { error: 'no schedule endpoint found' }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
  }

  if (type === 'bookings') {
    const paths = ['classbooking','class_booking','classbookings','class_bookings','bookings','booking'];
    let result = null;
    for (const p of paths) {
      try {
        const r = await fetch(`${BASE}/portal_api/v1/${p}?api_key=${KEY}`);
        if (r.ok) { const d = await r.json(); result = { path: p, status: r.status, count: Array.isArray(d?.result) ? d.result.length : JSON.stringify(d).length, sample: JSON.stringify(d).substring(0,400) }; break; }
        else { if (!result) result = { path: p, status: r.status }; }
      } catch(e) {}
    }
    return { statusCode: 200, body: JSON.stringify(result || { error: 'no bookings endpoint found' }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
  }

  if (type === 'explore') {
    // Probe all possible GymMaster endpoints
    const candidates = [
      'classtimetable','class_timetable','timetable','timetables',
      'classschedule','class_schedule','classsessions','class_sessions',
      'classenrolments','class_enrolments','classenrollments',
      'classattendance','class_attendance','attendance',
      'program','programs','activity','activities',
      'session','sessions','group','groups',
      'payment','payments','invoice','invoices','transaction','transactions',
      'charge','charges','fee','fees',
      'visit','visits','checkin','check_in','checkins',
      'membervisit','member_visit','membervisits',
      'promotion','promotions','campaign','campaigns',
      'email','emails','communication','communications'
    ];
    const results = {};
    await Promise.all(candidates.map(async (p) => {
      try {
        const r = await fetch(`${BASE}/portal_api/v1/${p}?api_key=${KEY}`);
        results[p] = r.status;
      } catch(e) { results[p] = 'err'; }
    }));
    const ok = Object.entries(results).filter(([k,v]) => v === 200).map(([k]) => k);
    const notFound = Object.entries(results).filter(([k,v]) => v === 404).map(([k]) => k);
    const other = Object.entries(results).filter(([k,v]) => v !== 200 && v !== 404);
    return { statusCode: 200,
      body: JSON.stringify({ ok, notFound: notFound.length + ' paths', other }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
  }

  if (type === 'explore2') {
    // Test v2 API and member sub-paths
    const results = {};
    // Try v2 portal API
    const v2paths = ['members','classes','schedule','bookings','payments','visits'];
    await Promise.all(v2paths.map(async p => {
      try {
        const r = await fetch(`${BASE}/portal_api/v2/${p}?api_key=${KEY}`);
        results['v2_'+p] = r.status;
      } catch(e) { results['v2_'+p] = 'err'; }
    }));
    // Get first member ID to test sub-paths
    try {
      const mr = await fetch(`${BASE}/portal_api/v1/members?api_key=${KEY}&limit=1`);
      const md = await mr.json();
      const memberId = md?.result?.[0]?.id || md?.result?.[0]?.memberid || md?.result?.[0]?.member_id;
      if (memberId) {
        const subpaths = ['bookings','visits','payments','classes','membership','memberships','attendance'];
        await Promise.all(subpaths.map(async p => {
          try {
            const r = await fetch(`${BASE}/portal_api/v1/members/${memberId}/${p}?api_key=${KEY}`);
            results['member_'+p] = r.status;
          } catch(e) { results['member_'+p] = 'err'; }
        }));
        results['memberId'] = memberId;
        // Also test full member detail
        const rd = await fetch(`${BASE}/portal_api/v1/members/${memberId}?api_key=${KEY}`);
        results['member_detail'] = rd.status;
        if (rd.ok) { const dd = await rd.json(); results['member_detail_fields'] = Object.keys(dd?.result || dd || {}).slice(0,20); }
      }
    } catch(e) { results['member_err'] = e.message; }
    return { statusCode: 200, body: JSON.stringify(results),
      headers: {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'} };
  }

if (type === 'membership-counts') {
    const counts = await getMembershipCounts();
    const defaults = {'Gym Access 24/7':27,'Perf Base':11,'Perf Core':6,'Perf Plus':3,'Perf Prime':2,'Plus Online':4,'Community':1,'S&C Open Session':1};
    return { statusCode: 200, body: JSON.stringify(counts || defaults), headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } };
  }

  if (type === 'class-schedule') {
    const cors2 = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
    try {
      const today = new Date();
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Monday of current week
      const sat = new Date(mon);
      sat.setDate(mon.getDate() + 5); // Saturday
      const startStr = mon.toISOString().split('T')[0];
      const endStr = sat.toISOString().split('T')[0];

      const r = await fetch(`${BASE}/portal/api/v1/booking/classes/schedule?api_key=${KEY}&start_date=${startStr}&end_date=${endStr}`);
      const d = await r.json();
      const rows = d.result || d.data || d.classes || d.sessions || [];
      const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

      const sessions = rows.map(s => {
        const dt = s.classdatetime || s.start_time || s.starttime || s.start || s.datetime || s.date || '';
        const date = new Date(dt);
        const isValid = !isNaN(date.getTime());
        const day = isValid ? DAY_NAMES[date.getDay()] : '';
        const hh = isValid ? String(date.getHours()).padStart(2,'0') : '';
        const mm = isValid ? String(date.getMinutes()).padStart(2,'0') : '';
        const time = hh ? hh + ':' + mm : (typeof dt === 'string' && dt.length >= 16 ? dt.substring(11,16) : '');
        return {
          name: s.classname || s.class_name || s.name || s.title || s.description || '',
          day,
          time,
          bookings: Number(s.enrolled || s.booked || s.bookings || s.enrolled_count || s.registrations || s.enrolments || 0),
          capacity: Number(s.capacity || s.max || s.max_participants || s.maxparticipants || s.spots || 12)
        };
      }).filter(s => s.day && s.time);

      return { statusCode: 200, headers: cors2, body: JSON.stringify({ sessions, _raw_count: rows.length }) };
    } catch(e) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ sessions: [], error: e.message }) };
    }
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
