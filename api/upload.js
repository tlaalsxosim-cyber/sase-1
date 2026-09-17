// POST { filename, base64 } -> 원본 엑셀을 파싱해 Blob 스토어의 products.json을 덮어쓴다.
// 인증 없이 누구나 호출 가능(요청에 따른 설정). 대신 업로드 전 백업을 남겨 되돌릴 수 있게 한다.

const { put, head } = require('@vercel/blob');
const { parseSourceBuffer } = require('../lib/parse-master');

const MAX_BYTES = 8 * 1024 * 1024; // 8MB 원본 파일 상한

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }

  try {
    const { filename, base64 } = req.body || {};
    if (!base64) {
      res.status(400).json({ error: '파일 데이터가 없습니다.' });
      return;
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_BYTES) {
      res.status(400).json({ error: `파일이 너무 큽니다 (최대 ${MAX_BYTES / 1024 / 1024}MB).` });
      return;
    }
    if (buffer.length === 0) {
      res.status(400).json({ error: '빈 파일입니다.' });
      return;
    }

    let parsed;
    try {
      parsed = parseSourceBuffer(buffer);
    } catch (e) {
      res.status(400).json({ error: `엑셀을 읽지 못했습니다: ${e.message}` });
      return;
    }

    const { records, counts } = parsed;
    const json = JSON.stringify(records);

    // 덮어쓰기 전, 지금까지의 products.json을 그대로 백업해둔다 (새 데이터가 아니라 이전 데이터!)
    const currentInfo = await head('products.json').catch(() => null);
    if (currentInfo) {
      const curRes = await fetch(currentInfo.url, { cache: 'no-store' }).catch(() => null);
      if (curRes && curRes.ok) {
        const curText = await curRes.text();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await put(`backups/products-${stamp}.json`, curText, {
          access: 'public',
          addRandomSuffix: false,
          contentType: 'application/json',
        }).catch(() => {}); // 백업 실패는 업로드 자체를 막지 않음
      }
    }

    const result = await put('products.json', json, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });

    res.status(200).json({
      ok: true,
      filename: filename || null,
      url: result.url,
      counts,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || '업로드 처리 중 오류가 발생했습니다.' });
  }
};
