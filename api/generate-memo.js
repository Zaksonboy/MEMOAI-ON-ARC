export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'API key not configured on server' });
    }

    const { address, amount, description } = req.body || {};

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const prompt = `You are a payment memo writer for Web3 transactions.

Generate a short, professional payment memo (maximum 15 words) for this USDC transaction on the Arc blockchain.

Payment details:
- Purpose: ${description}
${amount ? `- Amount: ${amount} USDC` : ''}
${address ? `- Recipient: ${address}` : ''}

Rules:
- Keep it under 15 words
- Make it clear and professional
- Do NOT include the amount or wallet address in the memo
- Write it like a bank transfer reference (e.g. "Freelance design work - Invoice #003")
- Return ONLY the memo text, nothing else, no quotes, no explanation`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 60
          }
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: 'AI API error', details: data });
    }

    const memo = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!memo) {
      return res.status(500).json({ error: 'No memo returned from AI', details: data });
    }

    return res.status(200).json({ memo });

  } catch (err) {
    return res.status(500).json({
      error: 'CRASH: ' + (err.message || String(err)),
      stack: err.stack || null
    });
  }
}
