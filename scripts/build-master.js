// 평택센터 파렛트 적재 기준 원본(xlsx)을 읽어
//   1) products.json      - 조회 앱(index.html)이 fetch로 읽는 데이터
//   2) 평택센터_상품마스터.xlsx - 사람이 보는 정리된 마스터 엑셀
// 을 생성한다.
//
// 사용법:
//   node scripts/build-master.js                     -> 최신 원본 파일 자동 탐색
//   node scripts/build-master.js "새파일.xlsx"        -> 지정한 원본 파일 사용

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx-js-style');

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

const argPath = process.argv[2];
const sourceFile = argPath ? path.resolve(argPath) : path.join(ROOT, findLatestSource());

if (!fs.existsSync(sourceFile)) {
  throw new Error(`파일을 찾을 수 없습니다: ${sourceFile}`);
}

console.log('원본 파일:', path.basename(sourceFile));

const s = v => (v === undefined || v === null ? '' : String(v).trim());

const wbIn = XLSX.readFile(sourceFile);
const sheetName = wbIn.SheetNames[0];
const ws = wbIn.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

const dataRows = rows.slice(1).filter(r => s(r[1]) !== '');

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

console.log(`품목 ${records.length}건 (사용중 ${records.length - discontinued - planned} / 단종예정 ${planned} / 단종 ${discontinued})`);

// 1) products.json
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

console.log('\n완료. git add/commit/push 후 "npm run deploy"로 배포하세요.');
