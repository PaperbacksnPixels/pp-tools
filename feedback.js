exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);

    const record = {
      fields: {
        'Name': body.name || '',
        'Email': body.email || '',
        'Role': body.role || '',
        'Tools Tried': body.tools || [],
        'Comments': body.comments || '',
        'Submitted': new Date().toISOString().split('T')[0]
      }
    };

    const response = await fetch(`https://api.airtable.com/v0/appeWKgAt8UFDapc8/tblNNW8xn1gzoLeEm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ records: [record] })
    });

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify(data) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };

  } catch(err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
