// /api/oauth.js
// 安全版本：
// 1. redirect_uri 由後端自己組，不信任前端傳的
// 2. 驗證 origin 白名單

const ALLOWED_ORIGINS = [
  'https://home-familycy.vercel.app',
  'http://localhost:3000', // 本地開發用
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 驗證請求來源
  const origin = req.headers.origin || req.headers.referer || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  if (!allowed) {
    console.warn('oauth: blocked origin:', origin);
    return res.status(403).json({ error: 'forbidden' });
  }

  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'missing code' });

  // redirect_uri 由後端自己組，不信任前端傳的
  const host = ALLOWED_ORIGINS.find(o => origin.startsWith(o)) || ALLOWED_ORIGINS[0];
  const redirect_uri = host + '/auth/callback';

  try {
    const params = new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type:    'authorization_code',
    });

    const r = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params,
    });
    const data = await r.json();
    if (!r.ok) return res.status(400).json({ error: data.error_description || data.error });

    const { access_token, refresh_token, expires_in } = data;

    // refresh_token 存 httpOnly cookie（前端 JS 永遠看不到）
    if (refresh_token) {
      res.setHeader('Set-Cookie',
        `home_rt=${refresh_token}; HttpOnly; Secure; SameSite=Strict; Path=/api/refresh; Max-Age=34560000`
        // Max-Age=400天（Google refresh token 最長存活約 6 個月，設長一點無妨）
      );
    }

    // 只回傳 access_token（短效，1小時）
    res.json({ access_token, expires_in });

  } catch (err) {
    console.error('oauth:', err);
    res.status(500).json({ error: 'server error' });
  }
};
