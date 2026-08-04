/**
 * Penerjemah pesan galat Supabase Auth.
 *
 * Supabase menjawab dalam bahasa Inggris teknis — "email rate limit exceeded",
 * "Email not confirmed". Pesan seperti itu tidak memberi tahu pengguna apa yang
 * harus dilakukan, dan yang lebih buruk, tidak memberi tahu apakah kesalahannya
 * ada pada mereka atau pada sistem. Saat 22 orang menetapkan password di hari
 * yang sama, selisih itu menentukan berapa banyak yang menelepon administrator.
 *
 * Yang tidak dikenali dibiarkan apa adanya, bukan diganti "terjadi kesalahan":
 * pesan asli setidaknya masih bisa dicari, sedangkan pesan umum menghapus
 * satu-satunya petunjuk yang tersisa.
 */

type GalatSupabase = { message?: string; code?: string; status?: number };

export function pesanGalatAuth(galat: GalatSupabase): string {
  const kode = galat.code ?? '';
  const pesan = galat.message ?? '';
  const cocok = (pola: RegExp) => pola.test(kode) || pola.test(pesan);

  // Batas pengiriman email. Ini bukan kesalahan pengguna, dan mereka perlu
  // tahu itu — kalau tidak, tombolnya akan ditekan berkali-kali dan justru
  // memperpanjang masa tunggunya.
  if (cocok(/over_email_send_rate_limit|email rate limit exceeded/i)) {
    return (
      'Batas pengiriman email tercapai. Ini batasan layanan email, bukan ' +
      'kesalahan Anda — tunggu sekitar satu jam lalu coba lagi, atau minta ' +
      'administrator mengirimkan tautannya langsung.'
    );
  }

  if (cocok(/over_request_rate_limit|rate limit/i)) {
    return 'Terlalu banyak percobaan dalam waktu singkat. Tunggu beberapa menit lalu coba lagi.';
  }

  // Akun dibuat importer tanpa konfirmasi email. Kalau Supabase mewajibkan
  // konfirmasi, gejalanya menyerupai "password salah" padahal bukan.
  if (cocok(/email_not_confirmed|Email not confirmed/i)) {
    return (
      'Email ini belum dikonfirmasi. Pakai tombol "Lupa password?" untuk ' +
      'menetapkan password sekaligus mengonfirmasi email Anda.'
    );
  }

  if (cocok(/invalid_credentials|Invalid login credentials/i)) {
    return 'Username/email atau password salah.';
  }

  if (cocok(/validation_failed|Unable to validate email|invalid format/i)) {
    return 'Format email tidak dikenali. Tulis alamat email lengkap beserta domainnya.';
  }

  if (cocok(/same_password/i)) {
    return 'Password baru masih sama dengan yang lama. Pilih yang berbeda.';
  }

  if (cocok(/weak_password|Password should be/i)) {
    return 'Password terlalu mudah ditebak. Perpanjang atau campur dengan angka dan simbol.';
  }

  if (cocok(/session_not_found|session_expired|expired|jwt/i)) {
    return 'Sesi pemulihan sudah berakhir. Mintalah tautan baru lalu ulangi.';
  }

  return pesan || 'Terjadi kesalahan yang tidak dikenali.';
}
