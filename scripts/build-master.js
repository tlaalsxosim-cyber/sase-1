// 평택센터 파렛트 적재 기준 원본(xlsx)을 읽어
//   1) products.json                 - 로컬 참고용 스냅샷
//   2) 평택센터_상품마스터.xlsx         - 사람이 보는 정리된 마스터 엑셀
//   3) Vercel Blob의 products.json    - 앱이 실제로 읽는 데이터 (BLOB_READ_WRITE_TOKEN 있을 때만)
// 을 생성/갱신한다.
//
// 사용법:
//   node scripts/build-master.js                     -> 최신 원본 파일 자동 탐색
//   node scripts/build-master.js "새파일.xlsx"        -> 지정한 원본 파일 사용

if (process.loadEnvFile) {
  try { process.loadEnvFile('.env.local'); } catch (e) { /* .env.local 없으면 무시 */ }
}

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx-js-style');
const { parseWorkbook } = require('../lib/parse-master');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATTERN = /^평택센터 제품별 파렛트 적재 기준.*\.xlsx$/;

function findLatestSource() {
  const candidates = fs.readdirSync(ROOT)
    .filter(f => SOURCE_PATTERN.test(f) && !f.startsWith('~$'))
    .map(f => ({ file: f, mtime: fs.statSync(path.join(ROOT, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!candidates.length) {
    throw new Error('원본 파일을 찾지 못했습니다. "평택센터 제품별 파렛트 적재 기준*.xlsx" 파일을 폴더에 두거나 경로를 인자로 넘겨주세요.');
  }
  return candidates[0].file;
}

async function main() {
  const argPath = process.argv[2];
  const sourceFile = argPath ? path.resolve(argPath) : path.join(ROOT, findLatestSource());

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`파일을 찾을 수 없습니다: ${sourceFile}`);
  }

  console.log('원본 파일:', path.basename(sourceFile));

  const wbIn = XLSX.readFile(sourceFile);
  const { records, counts } = parseWorkbook(wbIn);

  console.log(`품목 ${counts.total}건 (사용중 ${counts.active} / 단종예정 ${counts.planned} / 단종 ${counts.discontinued})`);

  // 1) products.json (로컬 스냅샷)
  const jsonOut = path.join(ROOT, 'products.json');
  fs.writeFileSync(jsonOut, JSON.stringify(records));
  console.log('저장:', path.relative(ROOT, jsonOut));

  // 2) 평택센터_상품마스터.xlsx (정리된 보기용 엑셀)
  const headers = ['No', '창고', '품번', '품명', '제조사', '파렛트타입', 'N11형 적재수량(box)', 'N12형 적재수량(box)', '파렛트 적재기준(층당개수x단수)', '박스규격(mm)', '상태', '비고'];
  const aoa = [headers, ...records.map(d => [d.no, d.wh, d.code, d.name, d.maker, d.palletType, d.n11, d.n12, d.pattern, d.box, d.status, d.remark])];
  const wsOut = XLSX.utils.aoa_to_sheet(aoa);

  wsOut['!cols'] = [
    { wch: 5 }, { wch: 7 }, { wch: 18 }, { wch: 42 }, { wch: 10 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 50 },
  ];
  wsOut['!freeze'] = { xSplit: 0, ySplit: 1 };
  wsOut['!autofilter'] = { ref: `A1:L${aoa.length}` };
  wsOut['!rows'] = [{ hpt: 26 }];

  const headerStyle = {
    font: { bold: true, sz: 10, name: '맑은 고딕', color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '4472C4' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } },
  };
  const bodyStyle = {
    font: { sz: 10, name: '맑은 고딕' },
    alignment: { vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'D9D9D9' } }, bottom: { style: 'thin', color: { rgb: 'D9D9D9' } },
      left: { style: 'thin', color: { rgb: 'D9D9D9' } }, right: { style: 'thin', color: { rgb: 'D9D9D9' } },
    },
  };
  const centerBodyStyle = Object.assign({}, bodyStyle, { alignment: { horizontal: 'center', vertical: 'center' } });
  const statusFillDiscontinued = Object.assign({}, centerBodyStyle, { fill: { fgColor: { rgb: 'FCE4E4' } }, font: Object.assign({}, bodyStyle.font, { color: { rgb: 'C00000' } }) });
  const statusFillPlanned = Object.assign({}, centerBodyStyle, { fill: { fgColor: { rgb: 'FFF2CC' } }, font: Object.assign({}, bodyStyle.font, { color: { rgb: '9C6500' } }) });
  const centerCols = new Set([0, 1, 5, 6, 7, 8, 9, 10]);

  const range = XLSX.utils.decode_range(wsOut['!ref']);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!wsOut[addr]) continue;
      if (R === 0) { wsOut[addr].s = headerStyle; continue; }
      if (C === 10) {
        const val = wsOut[addr].v;
        wsOut[addr].s = val === '단종' ? statusFillDiscontinued : (val === '단종예정' ? statusFillPlanned : centerBodyStyle);
      } else if (centerCols.has(C)) {
        wsOut[addr].s = centerBodyStyle;
      } else {
        wsOut[addr].s = bodyStyle;
      }
    }
  }

  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, wsOut, '상품마스터');
  const xlsxOut = path.join(ROOT, '평택센터_상품마스터.xlsx');
  XLSX.writeFile(wbOut, xlsxOut);
  console.log('저장:', path.relative(ROOT, xlsxOut));

  // 3) Vercel Blob에도 반영 (토큰이 있을 때만 - 즉 배포된 앱이 즉시 이 데이터를 보게 됨)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require('@vercel/blob');
    const result = await put('products.json', JSON.stringify(records), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    console.log('Blob 업데이트 완료:', result.url);
  } else {
    console.log('\n(BLOB_READ_WRITE_TOKEN이 없어 Blob에는 반영하지 않았습니다. .env.local을 확인하세요.)');
  }

  console.log('\n완료. git add/commit/push로 원본을 저장소에도 남겨두는 것을 권장합니다.');
}

main().catch(e => { console.error(e); process.exit(1); });
