// Cloudflare Pages Function: POST /api/google-lead
// Receives Google Ads lead form submissions (webhook) and emails them to you.
//
// Set these in Cloudflare (Pages project > Settings > Variables and Secrets):
//   GOOGLE_LEAD_KEY - the "Key" you enter in the Google Ads lead form webhook (add it as a Secret)
//   RESEND_API_KEY  - already set for the quote form
//   LEAD_EMAIL      - already set for the quote form (same inbox)
//
// This does NOT fire the website Google Ads conversion. Google counts
// lead form submissions on its own.

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// compare without leaking timing
function sameKey(a, b) {
  a = String(a ?? ''); b = String(b ?? '');
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// FULL_NAME -> "Full name", for columns Google sends without a column_name
const pretty = id => {
  const s = String(id || 'Field').replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request.' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'Bad request.' }, 400);

  if (!sameKey(body.google_key, env.GOOGLE_LEAD_KEY)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Valid lead from here on: always answer 200 {} so Google doesn't retry.
  try {
    const cols = (Array.isArray(body.user_column_data) ? body.user_column_data : []).slice(0, 50);
    const byId = {};
    const lines = cols.map(c => {
      const id = clip(c && c.column_id, 100).toUpperCase();
      const label = clip(c && c.column_name, 200) || pretty(id);
      const val = clip(c && c.string_value, 2000);
      if (id && !(id in byId)) byId[id] = val;
      return label + ': ' + (val || '(blank)');
    });

    const name =
      byId.FULL_NAME ||
      [byId.FIRST_NAME, byId.LAST_NAME].filter(Boolean).join(' ') ||
      '(no name)';
    const email = byId.EMAIL || byId.WORK_EMAIL || '';
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    const isTest = body.is_test === true || body.is_test === 'true';

    const text =
      (isTest ? 'TEST LEAD (sent from the Google Ads "Send test data" button).\n\n' : '') +
      'New lead from a Google Ads lead form.\n\n' +
      (lines.length ? lines.join('\n') : '(Google sent no form fields)') + '\n\n' +
      'Campaign ID: ' + (clip(body.campaign_id, 50) || '(none)') + '\n' +
      'Ad group ID: ' + (clip(body.adgroup_id, 50) || '(none)') + '\n' +
      'Form ID: ' + (clip(body.form_id, 50) || '(none)') + '\n' +
      'Lead ID: ' + (clip(body.lead_id, 200) || '(none)') + '\n' +
      'GCLID: ' + (clip(body.gcl_id, 300) || '(none)') + '\n\n' +
      (emailOk ? 'Reply to this email to answer the customer directly.' : 'No email given. Call or text them back.');

    if (!env.RESEND_API_KEY || !env.LEAD_EMAIL) {
      console.error('google-lead: RESEND_API_KEY or LEAD_EMAIL missing; lead not emailed', clip(body.lead_id, 200));
      return json({});
    }

    const to = String(env.LEAD_EMAIL).split(',').map(s => s.trim()).filter(Boolean);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Tree Hombres Website <quotes@treehombres.com>',
        to,
        subject: (isTest ? '[TEST] ' : '') + 'New Google Ads lead form: ' + clip(name, 100),
        text,
        ...(emailOk ? { reply_to: email } : {}),
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('google-lead: Resend failed', r.status, detail.slice(0, 500), 'lead', clip(body.lead_id, 200));
    }
  } catch (e) {
    console.error('google-lead: error emailing lead', e && e.message, 'lead', clip(body && body.lead_id, 200));
  }
  return json({});
}

// anything other than POST
export async function onRequest() {
  return json({ error: 'Method not allowed' }, 405);
}
