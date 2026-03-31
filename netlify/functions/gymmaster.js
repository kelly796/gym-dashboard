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
      res = await fetch(BASE + '/members_api_key_' + API_KEY);
      data = await res.json();
      const members = (data.result || []).map(m => {
        const s = (m.status || '').toLowerCase();
        // GymMaster uses m.status as the membership type/state
        // 'current' = active standard member; other values = membership type name or state
        const statusMapped =
          ['expired','cancelled','inactive'].includes(s) ? 'cancelled' :
          s === 'recently expired' ? 'cancelled' :
          ['on hold','hold','suspended'].includes(s) ? 'hold' : 'active';
        // membership_name: use original status field as type name, map 'current' → actual type
        const membershipName = s === 'current'
          ? (m.membershiptypename || m.membership_name || m.membershipname || 'Standard Member')
          : (m.membershiptypename || m.membership_name || m.membershipname || m.status || 'Standard Member');
        return {
          id: m.id,
          firstname: m.firstname || '',
          lastname: m.surname || '',
          status: statusMapped,
          membership_name: membershipName,
          join_date: m.joindate || null,
          cancel_date: m.leavedate || m.canceldate || null,
          last_visit: m.lastvisit || null,
          visit_count: m.visitcount || 0,
          _raw_status: m.status || ''
        };
      });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ members }) };
    }

    if (type === 'memberships') {
      res = await fetch(BASE + '/memberships_api_key_' + API_KEY);
      data = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (type === 'classes') {
      res = await fetch(BASE + '/booking/classes/schedule_api_key_' + API_KEY);
      data = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (type === 'cancellations') {
      res = await fetch(BASE + '/memberships/cancel_api_key_' + API_KEY);
      data = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    res = await fetch(BASE + '/version_api_key_' + API_KEY);
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
