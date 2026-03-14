const crypto = require('crypto');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verify Stripe webhook signature
  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    // Manual HMAC verification (no Stripe SDK needed)
    const payload = event.body;
    const parts = sig.split(',').reduce((acc, part) => {
      const [key, val] = part.split('=');
      acc[key] = val;
      return acc;
    }, {});

    const timestamp = parts.t;
    const signature = parts.v1;
    const signedPayload = `${timestamp}.${payload}`;
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    if (expected !== signature) {
      return { statusCode: 400, body: 'Invalid signature' };
    }

    stripeEvent = JSON.parse(payload);
  } catch (err) {
    return { statusCode: 400, body: `Webhook error: ${err.message}` };
  }

  // Only handle completed checkouts
  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'Event ignored' };
  }

  const session = stripeEvent.data.object;
  const customerEmail = session.customer_details?.email;
  const customerName = session.customer_details?.name || '';
  const sessionId = session.id;

  if (!customerEmail) {
    return { statusCode: 400, body: 'No email found' };
  }

  // Generate unique access token
  const token = crypto.randomUUID();
  const accessUrl = `https://author-helpers.netlify.app/?token=${token}`;
  const createdDate = new Date().toISOString().split('T')[0];

  try {
    // Store in Airtable
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent('Customers')}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [{
            fields: {
              'Name': customerName,
              'Email': customerEmail,
              'Token': token,
              'Stripe Session ID': sessionId,
              'Created': createdDate,
              'Active': true
            }
          }]
        })
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.json();
      throw new Error(`Airtable error: ${JSON.stringify(err)}`);
    }

    // Send access email via Gmail API
    const emailBody = `Hi ${customerName || 'there'},

Thanks for getting access to the Paperbacks & Pixels Author Tools.

Here's your personal access link:

${accessUrl}

Bookmark it — this is how you get back in. It's unique to you, so please don't share it.

The link will work in any browser. If you ever lose it, just reply to this email and I'll resend it.

Inside you'll find six tools:
— Find Your Voice (start here)
— Author Launch Pad
— Book Promotion Copy
— Workshop Launcher
— Find Your Comp Authors
— Substack Strategy Builder

New tools get added as they're built. You have access to everything.

Julie
Paperbacks & Pixels
paperbacksandpixels.com`;

    // Encode email for Gmail API
    const emailLines = [
      `To: ${customerEmail}`,
      `From: Julie Trelstad <${process.env.GMAIL_USER}>`,
      `Subject: Your access to the Author Tools`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      emailBody
    ].join('\r\n');

    const encodedEmail = Buffer.from(emailLines).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const gmailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GMAIL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encodedEmail })
      }
    );

    if (!gmailRes.ok) {
      // Log but don't fail — token is stored, email can be resent manually
      console.error('Gmail send failed:', await gmailRes.text());
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
