// Salin file ini menjadi config.js lalu isi nilainya.
// (config.js sudah ada di .gitignore — jangan commit kunci Anda. Untuk Netlify/GitHub Pages, buat config.js saat build/deploy
//  atau commit versi yang hanya berisi ANON KEY + URL Supabase, yang memang dirancang untuk publik; jangan pernah commit service role key.)
window.APP_CONFIG = {
  SUPABASE_URL: "SUPABASE_URL",
  SUPABASE_ANON_KEY: "SUPABASE_ANON_KEY",          // anon/public key (aman di browser; akses dibatasi RLS)
  STORAGE_BUCKET: "dokumen",

  // Deteksi total invoice fisik (foto/scan) dengan Gemini.
  // Mode "edge"  : (disarankan) kunci Gemini disimpan rahasia di Supabase Edge Function `gemini-total`.
  // Mode "direct": browser memanggil Gemini langsung memakai GEMINI_API_KEY di bawah — batasi kunci ini
  //                per HTTP referrer (domain situs Anda) di Google AI Studio / Google Cloud Console.
  GEMINI_MODE: "edge",
  GEMINI_API_KEY: " ",
  GEMINI_MODEL: "gemini-3.8-flash",

  ALLOW_SIGNUP: false   // true = tampilkan tombol daftar akun sendiri (default: admin membuat user di Supabase)
};
