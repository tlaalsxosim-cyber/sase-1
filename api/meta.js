// GET -> products.json의 최종 수정 시각만 가볍게 반환한다.
// 프론트에서 주기적으로 이 값만 확인해 실제 변경이 있을 때만 전체 데이터를 다시 불러온다.

const { head } = require('@vercel/blob');

module.exports = async (req, res) => {
  try {
    const info = await head('products.json');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, uploadedAt: info.uploadedAt });
  } catch (e) {
    res.status(404).json({ error: '데이터를 찾을 수 없습니다.' });
  }
};
