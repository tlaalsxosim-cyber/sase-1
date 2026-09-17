// 평택센터 파렛트 적재 기준 원본 엑셀(워크북)을 상품 마스터 레코드 배열로 변환한다.
// scripts/build-master.js(로컬 CLI)와 api/upload.js(웹 업로드) 양쪽에서 공용으로 쓴다.

const XLSX = require('xlsx-js-style');

const s = v => (v === undefined || v === null ? '' : String(v).trim());

function parseWorkbook(wb) {
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

  const dataRows = rows.slice(1).filter(r => s(r[1]) !== '');
  if (!dataRows.length) {
    throw new Error('데이터 행을 찾지 못했습니다. 원본 파일 형식을 확인해 주세요.');
  }

  const records = [];
  let no = 0;
  let discontinued = 0, planned = 0;

  for (const r of dataRows) {
    no++;
    const warehouse = s(r[0]) || '평택';
    const code = s(r[1]);
    const name = s(r[2]);
    const n11 = r[3] === '' ? '' : r[3];
    const n12 = r[4] === '' ? '' : r[4];
    const maker = s(r[5]);
    const remarkMain = s(r[6]);
    const loadPattern = s(r[7]);
    const boxSize = s(r[8]);
    const extraNotes = [s(r[9]), s(r[10]), s(r[11]), s(r[12]), s(r[13])].filter(x => x !== '');

    let palletType = '미기재';
    if (n11 !== '' && n12 !== '') palletType = '공통(교차사용)';
    else if (n11 !== '') palletType = 'N11형';
    else if (n12 !== '') palletType = 'N12형';

    const remarksAll = [remarkMain, ...extraNotes].filter(x => x !== '');
    const remarkJoined = remarksAll.join(' / ');

    let status = '사용중';
    if (/단종예정/.test(remarkJoined)) { status = '단종예정'; planned++; }
    else if (/단종/.test(remarkJoined)) { status = '단종'; discontinued++; }

    records.push({
      no, wh: warehouse, code, name, maker,
      palletType, n11, n12, pattern: loadPattern, box: boxSize,
      status, remark: remarkJoined,
    });
  }

  return {
    records,
    counts: {
      total: records.length,
      discontinued,
      planned,
      active: records.length - discontinued - planned,
    },
  };
}

// buffer(Buffer/ArrayBuffer) -> { records, counts }
function parseSourceBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return parseWorkbook(wb);
}

module.exports = { parseWorkbook, parseSourceBuffer };
