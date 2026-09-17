// GET -> 업로드/복원 시 자동 저장된 백업 스냅샷 목록(최신순)을 반환한다.

const { list } = require('@vercel/blob');

module.exports = async (req, res) => {
  try {
    const { blobs } = await list({ prefix: 'backups/' });
    const items = blobs
      .map(b => ({ pathname: b.pathname, uploadedAt: b.uploadedAt, size: b.size }))
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .slice(0, 20);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, backups: items });
  } catch (e) {
    res.status(500).json({ error: e.message || '백업 목록을 불러오지 못했습니다.' });
  }
};
