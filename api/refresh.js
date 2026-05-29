// /api/refresh.js
module.exports = async function handler(req, res) {

  // DELETE → 登出，清除 cookie
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'home_rt=; HttpOnly; Secure; SameSite=Strict; Path=/api/refresh; Max-Age=0');
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), v.join('=')];
    })
  );
  const refresh_token = cookies['home_rt'];
  if (!refresh_token) return res.status(401).json({ error: 'no refresh token' });

  try {
    const params = new URLSearchParams({
      refresh_token,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type:    'refresh_token',
    });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params,
    });
    const data = await r.json();
    if (!r.ok) {
      res.setHeader('Set-Cookie', 'home_rt=; HttpOnly; Secure; SameSite=Strict; Path=/api/refresh; Max-Age=0');
      return res.status(401).json({ error: data.error_description || 'token_expired' });
    }
    res.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (err) {
    console.error('refresh:', err);
    res.status(500).json({ error: 'server error' });
  }
};
