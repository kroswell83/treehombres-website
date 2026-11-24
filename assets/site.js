// Tree Hombres shared page script: used by every page.
// Handles: phone links, Google Ads call-tracking number swap, and the quote form
// (including the Google Ads "Website quote form" conversion).
(function () {
  // ============================================================
  //  BUSINESS PHONE NUMBER: change it here and every page updates.
  //  While it's blank, every Call/Text button stays hidden.
  // ============================================================
  const PHONE = '(512) 887-8722';

  const yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  const digits = PHONE.replace(/\D/g, '');
  if (digits.length >= 10) {
    const e164 = '+1' + digits.slice(-10);
    document.querySelectorAll('.phone-link').forEach(a => a.href = 'tel:' + e164);
    document.querySelectorAll('.sms-link').forEach(a => a.href = 'sms:' + e164);
    document.querySelectorAll('.phone-text').forEach(el => el.textContent = PHONE);
    const bar = document.getElementById('mobileBar');
    if (bar) { bar.classList.add('on'); document.body.classList.add('has-bar'); }
  } else {
    document.querySelectorAll('[data-phone-show]').forEach(el => el.classList.add('hidden'));
  }

  // Google forwarding number swap (set up by the Google tag in each page's <head>).
  // Only call links change; the "Send a text" link keeps the real number,
  // because Google forwarding numbers can't receive texts.
  window.thApplyForwardingNumber = function () {
    const g = window.thForwardingNumber;
    if (!g) return;
    const fwd = String(g.mobile || g.formatted || '').replace(/\D/g, '');
    if (fwd.length < 10) return;
    document.querySelectorAll('.phone-link').forEach(a => a.href = 'tel:+1' + fwd.slice(-10));
    if (g.formatted) document.querySelectorAll('.phone-text').forEach(el => el.textContent = g.formatted);
  };
  window.thApplyForwardingNumber();

  // "Get a Quote" links (header button, photo, etc.): bring the form into view,
  // put the cursor in "Your name" (opens the keyboard on phones) and pulse the card.
  // Focus happens right in the tap, because phones only open the keyboard then.
  document.addEventListener('click', function (ev) {
    const a = ev.target.closest && ev.target.closest('a[href="#quote"]');
    if (!a) return;
    const box = document.getElementById('quote');
    const field = box && box.querySelector('input[name="name"]');
    const card = box && (box.querySelector('form.card') || box);
    if (!field || !card) return; // no form here: let the link work normally
    ev.preventDefault();

    const header = document.querySelector('header');
    const top = header ? header.getBoundingClientRect().bottom : 0;
    const r = field.getBoundingClientRect();
    const inView = r.top >= top && r.bottom <= window.innerHeight;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function pulse() {
      card.classList.remove('quote-pulse');
      void card.offsetWidth; // restart the animation if tapped again
      card.classList.add('quote-pulse');
    }
    try { field.focus({ preventScroll: true }); } catch (e) { field.focus(); }

    if (inView) { pulse(); return; }
    box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // Pulse once the page stops scrolling (watch the position; works in every browser).
    let done = false, last = -1, still = 0;
    const finish = function () { if (!done) { done = true; pulse(); } };
    const watch = function () {
      if (done) return;
      const y = window.scrollY;
      still = (y === last) ? still + 1 : 0;
      last = y;
      if (still >= 4) finish(); else requestAnimationFrame(watch);
    };
    setTimeout(function () { requestAnimationFrame(watch); }, 120);
    setTimeout(finish, 2500); // never wait longer than this
  });
  document.addEventListener('animationend', function (ev) {
    if (ev.animationName === 'quotePulse') ev.target.classList.remove('quote-pulse');
  });

  // Quote form (one per page, id="quoteForm")
  const form = document.getElementById('quoteForm');
  if (!form) return;
  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('formMsg');
  const btnLabel = btn.textContent;
  function show(kind, text) { msg.className = 'form-msg ' + kind; msg.textContent = text; }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const data = {
      name: (fd.get('name') || '').trim(),
      phone: (fd.get('phone') || '').trim(),
      email: (fd.get('email') || '').trim(),
      address: (fd.get('address') || '').trim(),
      services: fd.getAll('services'),
      details: (fd.get('details') || '').trim(),
      website: (fd.get('website') || '').trim(),
      page: location.pathname
    };
    if (!data.name || !data.phone || !data.address) {
      return show('err', 'Please fill in your name, phone, and property address.');
    }
    if (data.phone.replace(/\D/g, '').length < 10) {
      return show('err', 'Please enter a phone number with area code.');
    }
    btn.disabled = true; btn.textContent = 'Sending...'; msg.className = ''; msg.textContent = '';
    try {
      const r = await fetch('/api/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Something went wrong.');
      // Google Ads "Website quote form" conversion. Fires only when the backend
      // confirms the email was actually sent (sent: true), never on page load,
      // button click, a failed submission, or a blocked spam submission.
      if (d.sent === true && typeof gtag === 'function') {
        gtag('event', 'conversion', {
          'send_to': 'AW-18554671497/0D_DCN-v1LQdEImjx49F',
          'value': 1000.0,
          'currency': 'USD'
        });
      }
      form.reset();
      show('ok', 'Thanks, ' + data.name.split(' ')[0] + '! We got your request and will be in touch soon.');
      btn.textContent = 'Sent ✓';
    } catch (e) {
      show('err', 'Sorry, that didn’t go through. ' + e.message + ' Please try again.');
      btn.disabled = false; btn.textContent = btnLabel;
    }
  });
})();
