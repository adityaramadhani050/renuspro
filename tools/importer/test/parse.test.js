/**
 * Tes parser impor.
 *
 * Parser adalah bagian yang paling bisa merusak data secara DIAM-DIAM:
 * tanggal yang tertukar hari/bulan atau angka yang salah baca tidak akan
 * memunculkan error apa pun — datanya cuma jadi salah. Karena itu bagian ini
 * diuji lebih ketat daripada yang lain.
 *
 * Jalankan: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDate,
  parseTimestamp,
  parseNumber,
  parseBool,
  parseJson,
  parseQuotationItems,
  parseTemplateItems,
  extractDocSeq,
  parseWoNumber,
  splitWoNumber,
} from '../src/parse.js';

test('parseDate membaca dd/MM/yyyy sebagai hari/bulan — bukan bulan/hari', () => {
  // 03/04/2026 di sistem ini berarti 3 April, BUKAN 4 Maret.
  assert.equal(parseDate('03/04/2026'), '2026-04-03');
  assert.equal(parseDate('15/03/2026'), '2026-03-15');
  assert.equal(parseDate('1/1/2026'), '2026-01-01');
  // Tanggal > 12 membuktikan urutannya benar tanpa ambiguitas
  assert.equal(parseDate('25/12/2025'), '2025-12-25');
});

test('parseDate membaca angka serial Google Sheets', () => {
  // 45000 = 2023-03-15 pada epoch 1899-12-30
  assert.equal(parseDate(45000), '2023-03-15');
  assert.equal(parseDate(1), '1899-12-31');
});

test('parseDate menolak nilai tak dikenali tanpa melempar', () => {
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate(undefined), null);
  assert.equal(parseDate('bukan tanggal'), null);
  assert.equal(parseDate('99/99/2026'), null);
  assert.equal(parseDate(0), null);
});

test('parseTimestamp menangani "dd/MM/yyyy HH:mm" dari WorkOrder.gs', () => {
  assert.equal(parseTimestamp('03/04/2026 14:30'), '2026-04-03T14:30:00.000Z');
  assert.equal(parseTimestamp('03/04/2026'), '2026-04-03T00:00:00.000Z');
  assert.equal(parseTimestamp(''), null);
});

test('parseNumber menangani format angka Indonesia', () => {
  assert.equal(parseNumber(2500000), 2500000);
  assert.equal(parseNumber('2.500.000'), 2500000);
  assert.equal(parseNumber('2.500.000,50'), 2500000.5);
  assert.equal(parseNumber('Rp 42.000.000'), 42000000);
  // Titik tunggal bukan pemisah ribuan — "1.5" tetap satu koma lima
  assert.equal(parseNumber('1.5'), 1.5);
  assert.equal(parseNumber(''), 0);
  assert.equal(parseNumber('teks'), 0);
  assert.equal(parseNumber(null, 99), 99);
});

test('parseBool membaca TRUE/FALSE bergaya sheet', () => {
  assert.equal(parseBool('TRUE'), true);
  assert.equal(parseBool('FALSE'), false);
  assert.equal(parseBool('true'), true);
  assert.equal(parseBool(''), true, 'sel kosong dianggap aktif, sama seperti Auth.gs:58');
  assert.equal(parseBool('sampah'), true);
});

test('parseJson mengembalikan fallback untuk JSON rusak, tidak melempar', () => {
  assert.deepEqual(parseJson('{"a":1}', null), { a: 1 });
  assert.deepEqual(parseJson('{rusak', []), []);
  assert.deepEqual(parseJson('', []), []);
});

test('parseQuotationItems membaca struktur kelompok → subItems', () => {
  const raw = JSON.stringify([
    {
      kelompok: 'A',
      namaKelompok: 'PAKET PLTS OFF-GRID',
      subtotal: 84500000,
      subItems: [
        {
          noItem: 1,
          produkId: 'P001',
          deskripsi: 'Panel Surya Jinko 625Wp',
          qty: 17,
          unit: 'unit',
          harga: 2500000,
          hpp: 1900000,
          total: 42500000,
        },
        {
          noItem: 2,
          produkId: 'P002',
          deskripsi: 'Inverter Deye 10kW',
          qty: 1,
          unit: 'unit',
          harga: 42000000,
          hpp: 35000000,
          total: 42000000,
        },
      ],
    },
  ]);

  const groups = parseQuotationItems(raw);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].code, 'A');
  assert.equal(groups[0].name, 'PAKET PLTS OFF-GRID');
  assert.equal(groups[0].subtotal, 84500000);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].items[0].productLegacyCode, 'P001');
  assert.equal(groups[0].items[0].qty, 17);
  assert.equal(groups[0].items[0].lineTotal, 42500000);
  assert.equal(groups[0].items[1].sortOrder, 2);
});

test('parseQuotationItems membungkus array datar warisan menjadi satu kelompok', () => {
  // Penawaran dari sebelum fitur sub-paket ada. Tidak boleh hilang.
  const raw = JSON.stringify([
    { produkId: 'P001', deskripsi: 'Panel', qty: 2, unit: 'unit', harga: 100, hpp: 80, total: 200 },
  ]);

  const groups = parseQuotationItems(raw);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].code, null);
  assert.equal(groups[0].subtotal, 200);
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[0].items[0].description, 'Panel');
});

test('parseQuotationItems menghitung ulang total baris yang hilang', () => {
  const raw = JSON.stringify([
    { kelompok: 'A', namaKelompok: 'X', subtotal: 0,
      subItems: [{ produkId: 'P001', deskripsi: 'Panel', qty: 3, harga: 1000 }] },
  ]);
  assert.equal(parseQuotationItems(raw)[0].items[0].lineTotal, 3000);
});

test('parseQuotationItems aman terhadap JSON kosong atau rusak', () => {
  assert.deepEqual(parseQuotationItems(''), []);
  assert.deepEqual(parseQuotationItems('[]'), []);
  assert.deepEqual(parseQuotationItems('{rusak'), []);
});

test('parseTemplateItems membaca array datar Template_Paket', () => {
  const raw = JSON.stringify([
    { produkId: 'P001', deskripsi: 'Panel Surya', qty: 17, unit: 'unit', harga: 2500000, hpp: 1900000 },
  ]);
  const items = parseTemplateItems(raw);
  assert.equal(items.length, 1);
  assert.equal(items[0].productLegacyCode, 'P001');
  assert.equal(items[0].lineTotal, 17 * 2500000);
});

test('extractDocSeq mengenali format nomor lama maupun baru', () => {
  assert.equal(extractDocSeq('quotation', '012/QUOT/III/2026'), 12);
  assert.equal(extractDocSeq('invoice', '007/RGI/INV/I/2026'), 7);
  assert.equal(extractDocSeq('invoice', '007/RGI-INV/I/2026'), 7, 'varian lama RGI-INV');
  assert.equal(extractDocSeq('receipt', '003/RGI/KWT/V/2026'), 3);
  assert.equal(extractDocSeq('receipt', '003/RGI-KW/V/2026'), 3, 'varian lama RGI-KW');
  assert.equal(extractDocSeq('quotation', 'entah apa'), null);
});

test('parseWoNumber menangani No WO yang tersimpan sebagai angka', () => {
  // WorkOrder.gs:333 menulis setValue(Number(noWO))
  assert.equal(parseWoNumber(26012), '26012');
  assert.equal(parseWoNumber('26012'), '26012');
  assert.equal(parseWoNumber(''), null);
  assert.equal(parseWoNumber('bukan-wo'), null);
});

test('splitWoNumber memisahkan tahun dan urutan', () => {
  assert.deepEqual(splitWoNumber('26012'), { year: 2026, seq: 12 });
  assert.deepEqual(splitWoNumber('27001'), { year: 2027, seq: 1 });
  assert.equal(splitWoNumber(null), null);
});
