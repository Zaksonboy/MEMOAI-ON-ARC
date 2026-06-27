export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const { address, amount, description } = req.body || {};

  // Need at least a description
  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }

  // Build prompt for Claude
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

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 60,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    const data = await response.json();

    // Handle API errors
    if (!response.ok) {
      console.error('Anthropic API error:', data);
      return res.status(500).json({ error: data.error?.message || 'AI API error' });
    }

    const memo = data.content?.[0]?.text?.trim() || '';

    if (!memo) {
      return res.status(500).json({ error: 'No memo returned from AI' });
    }

    return res.status(200).json({ memo });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
