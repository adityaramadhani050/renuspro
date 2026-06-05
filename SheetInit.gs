/**
 * RenusPro - PT. RENUS GLOBAL INDONESIA
 * Inisialisasi sheet default (fallback bila sheet belum ada).
 */

function buatSheetKlienDefault(ss) {
  const sheet = ss.insertSheet('Master_Klien');
  const data = [
    ['ID', 'Nama Klien', 'Perusahaan', 'Alamat', 'Kontak'],
    ['K001', 'PT SUMMIT GLOBAL TEKNOLOGI', 'C&I', 'Tangerang', '081283576437'],
    ['K002', 'PT MAJU JAYA PRIMA', 'Retail', 'Jakarta', '081122334455']
  ];
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  return sheet;
}

function buatSheetProdukDefault(ss) {
  const sheet = ss.insertSheet('Master_Produk');
  const data = [
    ['ID', 'Nama Jasa/Produk', 'Unit', 'Harga Satuan', 'HPP'],
    ['P001', 'Panel Surya Jinko 625Wp Total 10.400Wp', 'unit', 2500000, 1900000],
    ['P002', 'Inverter Hybrid Off-Grid 3 Fasa Deye 10.000 W + Wifi', 'unit', 42000000, 35000000],
    ['P003', 'Baterai Lithium 51,2V 100Ah Total 10,24kWh', 'unit', 16500000, 13000000],
    ['P004', 'Rack baterai (3 slot)', 'unit', 1000000, 750000],
    ['P005', 'Panel Proteksi PLTS (DC Combiner + AC Distribution)', 'unit', 8000000, 6200000],
    ['P006', 'Panel Proteksi Baterai', 'unit', 2000000, 1500000],
    ['P007', 'Solar PV Aluminium Mounting', 'kWp', 1200000, 900000],
    ['P008', 'Kabel PV1-F 1x4mm2', 'm', 18000, 13000],
    ['P009', 'Sistem Grounding (Rod, Kabel, Box, dll)', 'set', 1500000, 1100000],
    ['P010', 'Jasa instalasi, Pembuatan DED, dan Komisioning', 'kWp', 2000000, 1300000],
    ['P011', 'Packing Standar dan Pengiriman', 'Ls', 2000000, 1500000]
  ];
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  return sheet;
}

function buatSheetTemplatePaket(ss) {
  const sheet = ss.insertSheet('Template_Paket');
  const data = [
    ['ID', 'Nama Paket', 'Daftar Item (JSON)'],
    ['PKT001', 'PAKET PLTS OFF-GRID 10KWP DEFAULT', '[{"produkId":"P001","deskripsi":"Panel Surya Jinko 625Wp Total 10.400Wp","qty":17,"unit":"unit","harga":2500000,"hpp":1900000},{"produkId":"P002","deskripsi":"Inverter Hybrid Off-Grid 3 Fasa Deye 10.000 W + Wifi","qty":1,"unit":"unit","harga":42000000,"hpp":35000000},{"produkId":"P003","deskripsi":"Baterai Lithium 51,2V 100Ah Total 10,24kWh","qty":2,"unit":"unit","harga":16500000,"hpp":13000000},{"produkId":"P004","deskripsi":"Rack baterai (3 slot)","qty":1,"unit":"unit","harga":1000000,"hpp":750000},{"produkId":"P005","deskripsi":"Panel Proteksi PLTS (DC Combiner + AC Distribution)","qty":1,"unit":"unit","harga":8000000,"hpp":6200000},{"produkId":"P007","deskripsi":"PV Aluminium Mounting","qty":10.4,"unit":"kWp","harga":1200000,"hpp":900000},{"produkId":"P008","deskripsi":"Kabel PV1-F 1x4mm2","qty":150,"unit":"m","harga":18000,"hpp":13000},{"produkId":"P010","deskripsi":"Jasa instalasi, Pembuatan DED, dan Komisioning","qty":10.4,"unit":"kWp","harga":2000000,"hpp":1300000}]'],
  ];
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  return sheet;
}

function buatSheetPenawaranDefault(ss) {
  const sheet = ss.insertSheet('Penawaran_Main');
  sheet.appendRow([
    'No Penawaran', 'Rev', 'Tanggal', 'Valid Hingga', 'Nama Project',            
    'Klien ID', 'Dibuat Oleh', 'Subtotal', 'Diskon', 'Pajak (PPN)', 'Grand Total',             
    'Total HPP', 'Estimasi Keuntungan', 'Margin Profit (%)', 'Syarat Ketentuan (JSON)', 
    'Rincian Item (JSON)', 'Status'                   
  ]);
  return sheet;
}
