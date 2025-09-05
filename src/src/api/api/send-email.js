const { Resend } = require('resend');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const resend = new Resend(process.env.RESEND_API_KEY);

    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload || '{}'); } catch { payload = {}; }
    } else if (!payload) {
      payload = {};
    }

    const { to, subject, csv, filename = 'jackattack_scores.csv', text } = payload;
    if (!to || !csv) return res.status(400).json({ error: 'Missing "to" or "csv"' });

    const base64 = Buffer.from(csv, 'utf8').toString('base64');

    const r = await resend.emails.send({
      from: 'Jack Attack Scorer <onboarding@resend.dev>',
      to,
      subject: subject || 'Jack Attack final score',
      text: text || 'Final score attached as CSV.',
      attachments: [{ filename, content: base64 }]
    });

    if (r?.error) return res.status(500).json({ error: r.error.message || 'Send failed' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
};
