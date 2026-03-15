Berikut adalah langkah-langkah aman dan bersih untuk mem-push kode dari komputer lokal Anda ke GitHub, lalu menarik pembaruannya (pull) ke VPS Anda!

TAHAP 1: Push Kode dari Komputer Lokal ke GitHub
Buka terminal/Command Prompt di Visual Studio Code komputer Anda (pastikan berada di folder project trondex), lalu jalankan baris perintah berikut satu per satu:

bash
# 1. Tambahkan semua perubahan file ke dalam stage
git add .
# 2. Buat checkpoint (commit) dengan pesan apa saja yang Anda ubah
git commit -m "Fix UI Landing page terpotong & teks referral 0.3%"
# 3. Dorong (push) kode tersebut ke GitHub (biasanya ke branch 'main' atau 'master')
git push origin main
(Catatan: Jika branch utama Anda bernama master, ganti kata main menjadi master).

TAHAP 2: Update Kode Terbaru di Server VPS
Setelah kode berhasil masuk ke GitHub, silakan login SSH ke VPS Anda seperti biasa. Karena awalnya Anda memakai git clone, VPS Anda sudah terhubung (tracking) ke GitHub Anda, jadi cukup ditarik saja.

Jalankan perintah ini di terminal VPS:

bash
# 1. Pindah ke folder project Trondex di VPS
cd /var/www/trondex
# 2. Tarik update terbaru dari GitHub
git pull origin main
(Sama seperti di atas, gunakan git pull origin master jika branch-nya master).

TAHAP 3: Terapkan Perubahan (Build Ulang)
Karena yang baru saja kita ubah adalah UI Frontend (berbasis React/Vite), maka kita wajib melakukan build ulang agar file 

.tsx
 yang kita tulis tadi diubah menjadi HTML/CSS/JS final yang dibaca oleh Nginx.

bash
# 1. Masuk ke folder client
cd /var/www/trondex/client
# 2. Kosongkan cache lama dan buat build versi baru (tunggu sampai selesai)
bun run build
# 3. Restart Nginx agar sistem membaca file statis yang baru
sudo systemctl restart nginx