exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = event.queryStringParameters?.token;
  if (!token) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valid: false, reason: 'No token provided' })
    };
  }

  try {
    // Search Airtable for matching token
    const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Customers?filterByFormula=${encodeURIComponent(`AND({Token}="${token}",{Active}=TRUE())`)}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`
      }
    });

    if (!res.ok) {
      throw new Error(`Airtable error: ${res.status}`);
    }

    const data = await res.json();
    const valid = data.records && data.records.length > 0;
    const name = valid ? (data.records[0].fields['Name'] || '') : '';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ valid, name })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: err.message })
    };
  }
};
