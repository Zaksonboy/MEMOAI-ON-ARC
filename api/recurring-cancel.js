import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, walletAddress } = req.body;
  if (!id || !walletAddress) return res.status(400).json({ error: 'Missing id or walletAddress' });

  const raw = await redis.get(`recurring:${id}`);
  if (!raw) return res.status(404).json({ error: 'Not found' });

  const order = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (order.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
    return res.status(403).json({ error: 'Not authorized to cancel this order' });
  }

  await redis.srem('recurring:index', id);
  await redis.del(`recurring:${id}`);

  return res.status(200).json({ success: true });
}
