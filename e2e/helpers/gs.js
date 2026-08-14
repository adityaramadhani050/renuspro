// Pemanggil fungsi backend lewat shim google.script.run (migrasi/gs-run-shim.js).
// Mengembalikan Promise berisi objek hasil override — dipakai test numerik untuk
// menguji logika bisnis (stok/HPP/pembayaran) tanpa bergantung selector form.
//
// Pakai: const res = await gsCall(page, 'namaFungsi', arg0, arg1, ...);
async function gsCall(page, fn, ...args) {
  return page.evaluate(
    ({ fn, args }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('gsCall timeout: ' + fn)), 30000);
        try {
          window.google.script.run
            .withSuccessHandler((r) => { clearTimeout(timer); resolve(r); })
            .withFailureHandler((e) => { clearTimeout(timer); reject(new Error((e && e.message) || String(e))); })
            [fn](...args);
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      }),
    { fn, args }
  );
}

module.exports = { gsCall };
