// GET -> Blob 스토어에 저장된 현재 상품 마스터(products.json)를 반환한다.
// 조회 앱(index.html)이 이 엔드포인트로 데이터를 불러온다.

const { head } = require('@vercel/blob');

module.exports = async (req, res) => {
  try {
    const info = await head('products.json');
    const r = await fetch(info.url, { cache: 'no-store' });
    if (!r.ok) throw new Error('blob fetch failed: ' + r.status);
    const text = await r.text();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (info.uploadedAt) {
      res.setHeader('Last-Modified', new Date(info.uploadedAt).toUTCString());
    }
    res.status(200).send(text);
  } catch (e) {
    res.status(404).json({ error: '데이터를 아직 찾을 수 없습니다.' });
  }
};
