// POST { pathname } -> 지정한 backups/*.json 스냅샷 내용으로 products.json을 되돌린다.
// 되돌리기 직전 현재 상태도 다시 백업해서, 잘못 복원해도 한 번 더 되돌릴 수 있게 한다.

const { head, put } = require('@vercel/blob');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }

  try {
    const { pathname } = req.body || {};
    if (!pathname || !pathname.startsWith('backups/') || !pathname.endsWith('.json')) {
      res.status(400).json({ error: '잘못된 백업 경로입니다.' });
      return;
    }

    const backupInfo = await head(pathname).catch(() => null);
    if (!backupInfo) {
      res.status(404).json({ error: '해당 백업을 찾을 수 없습니다.' });
      return;
    }
    const backupRes = await fetch(backupInfo.url, { cache: 'no-store' });
    if (!backupRes.ok) throw new Error('백업 파일을 불러오지 못했습니다.');
    const backupText = await backupRes.text();

    let records;
    try {
      records = JSON.parse(backupText);
      if (!Array.isArray(records)) throw new Error('형식이 배열이 아닙니다.');
    } catch (e) {
      res.status(400).json({ error: '백업 파일 형식이 올바르지 않습니다.' });
      return;
    }

    // 복원 직전 현재 상태를 한 번 더 백업
    const currentInfo = await head('products.json').catch(() => null);
    if (currentInfo) {
      const curRes = await fetch(currentInfo.url, { cache: 'no-store' });
      if (curRes.ok) {
        const curText = await curRes.text();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await put(`backups/products-${stamp}.json`, curText, {
          access: 'public',
          addRandomSuffix: false,
          contentType: 'application/json',
        }).catch(() => {});
      }
    }

    await put('products.json', backupText, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });

    res.status(200).json({ ok: true, count: records.length, restoredFrom: pathname });
  } catch (e) {
    res.status(500).json({ error: e.message || '복원 중 오류가 발생했습니다.' });
  }
};
