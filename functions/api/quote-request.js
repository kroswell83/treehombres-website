// Cloudflare Pages Function: POST /api/quote-request
// Emails a website quote request to you via Resend.
//
// Set these in Cloudflare (Pages project > Settings > Variables and Secrets):
//   RESEND_API_KEY  - same Resend key the app uses (add it as a Secret)
//   LEAD_EMAIL      - where quote requests go. Several allowed, comma-separated.

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY || !env.LEAD_EMAIL) {
    return json({ error: 'The quote form is not set up yet.' }, 500);
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request.' }, 400); }

  // spam trap: bots fill the hidden "website" field. Pretend it worked.
  if (clip(body.website, 200)) return json({ ok: true });

  const name = clip(body.name, 100);
  const phone = clip(body.phone, 40);
  const email = clip(body.email, 200);
  const address = clip(body.address, 300);
  const details = clip(body.details, 3000);
  const services = (Array.isArray(body.services) ? body.services : [])
    .map(s => clip(s, 60)).filter(Boolean).slice(0, 10);

  if (!name || !phone || !address) {
    return json({ error: 'Please fill in your name, phone, and property address.' }, 400);
  }
  if (phone.replace(/\D/g, '').length < 10) {
    return json({ error: 'Please enter a phone number with area code.' }, 400);
  }
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  const to = String(env.LEAD_EMAIL).split(',').map(s => s.trim()).filter(Boolean);
  const text =
    'New quote request from the website.\n\n' +
    'Name: ' + name + '\n' +
    'Phone: ' + phone + '\n' +
    'Email: ' + (email || '(not given)') + '\n' +
    'Property: ' + address + '\n' +
    'Services: ' + (services.length ? services.join(', ') : '(none checked)') + '\n\n' +
    'Details:\n' + (details || '(none)') + '\n\n' +
    (emailOk ? 'Reply to this email to answer the customer directly.' : 'No email given. Call or text them back.');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Tree Hombres Website <quotes@treehombres.com>',
        to,
        subject: 'New quote request: ' + name + ' (' + address + ')',
        text,
        ...(emailOk ? { reply_to: email } : {}),
      }),
    });
    if (!r.ok) return json({ error: 'Our email service had a hiccup.' }, 502);
    // sent: true tells the page the email really went out, so it can fire the
    // Google Ads conversion. The spam-trap path above returns ok without it.
    return json({ ok: true, sent: true });
  } catch (e) {
    return json({ error: 'Could not reach our email service.' }, 502);
  }
}

// anything other than POST
export async function onRequest() {
  return json({ error: 'Method not allowed' }, 405);
}
