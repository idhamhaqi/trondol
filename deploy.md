# Panduan Deployment Trondex (Ubuntu VPS - 4 Core, 8GB RAM)

Panduan ini berisi langkah-langkah *end-to-end* yang disesuaikan secara khusus untuk men-deploy aplikasi **Trondex** (Frontend React + Backend Node/Bun, MySQL, Redis) pada *Virtual Private Server* (VPS) dengan sistem operasi **Ubuntu**.

Sesuai spesifikasi Anda (4 Core, 8GB RAM), kita akan memanfaatkan **Bun** (karena jauh lebih cepat eksekusinya dibandingkan Node.js konvensional) dikombinasikan dengan fitur **Systemd Multi-Instance (Native)** bawaan Ubuntu untuk menjalankan 4 proses *backend* secara terpisah agar performa 4 Core CPU Anda maksimal. **Nginx** akan bertugas ganda sebagai *Load Balancer* dan *Reverse Proxy* untuk SSL Termination.

---

## 1. Persiapan Server Awal (Initial Server Setup)

Setelah Anda membeli VPS Ubuntu dan mendapatkan akses SSH (menggunakan akun `root`), lakukan pembaruan sistem dan buat *user* baru untuk keamanan.

```bash
# Update dan upgrade seluruh paket bawaan Ubuntu
apt update && apt upgrade -y

# Instal dependensi dasar yang wajib ada
apt install -y curl wget git vim build-essential unzip ufw htop
```

*(Opsional tapi disarankan)* Buat *user* selain root:
```bash
adduser trondex_admin
usermod -aG sudo trondex_admin
su - trondex_admin
```
Dari poin ini ke bawah, asumsikan Anda menjalankan perintah menggunakan *user* `trondex_admin` (tambahkan `sudo` jika diperlukan).

---

## 2. Instalasi Database & Cache (MySQL & Redis)

Trondex membutuhkan MySQL untuk menyimpan data *user* dan *history trade*, serta Redis untuk *Pub/Sub WebSocket* dan *caching* harga.

### A. Instalasi & Konfigurasi MySQL
```bash
sudo apt install mysql-server -y

# Amankan instalasi MySQL (Ikuti instruksi di layar, set password root)
sudo mysql_secure_installation

# Masuk ke MySQL console
sudo mysql -u root -p
```
Di dalam MySQL console, buat database dan user untuk aplikasi:
```sql
CREATE DATABASE trondex COLLATE utf8mb4_unicode_ci;
CREATE USER 'trondex_user'@'localhost' IDENTIFIED BY 'PasswordKuatAnda123!';
GRANT ALL PRIVILEGES ON trondex.* TO 'trondex_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### B. Instalasi Redis
```bash
sudo apt install redis-server -y
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

---

## 3. Instalasi Environment Aplikasi (Bun & Nginx)

Kita menggunakan **Bun** sebagai *runtime* backend utama dan pembuat *build* frontend.

### A. Install Bun
```bash
curl -fsSL https://bun.sh/install | bash

# Muat ulang bash profile agar perintah 'bun' bisa diakses
source ~/.bashrc
```

### B. Install Nginx
```bash
sudo apt install nginx -y
sudo systemctl enable nginx
```

---

## 4. Kloning dan Build Project (Frontend & Backend)

### A. Kloning Repositori
```bash
# Pindah ke direktori web (atau biarkan di home jika Anda prefer di home)
cd /var/www
sudo mkdir trondex
sudo chown -R ubuntu:ubuntu /var/www/trondex

# Clone repo Anda (Ganti URL dengan link GitHub/GitLab Anda)
git clone https://github.com/idhamhaqi/trondol.git /var/www/trondex
cd /var/www/trondex
```

### B. Build Frontend (React / Vite)
```bash
cd /var/www/trondex/client

# Instal depedensi menggunakan bun (sangat cepat)
bun install

# Buat file .env untuk production (ubah URL sesuai domain Anda)
nano .env
```
Isi file `.env` di **client**:
```env
VITE_API_BASE_URL=https://trondex.xyz
VITE_WS_URL=wss://trondex.xyz/api/ws
```
Simpan (Ctrl+O, Enter, Ctrl+X), lalu *build*:
```bash
bun run build
# Hasil build aplikasi web akan ada di folder /var/www/trondex/client/dist
```

### C. Build Backend & Setup `.env`
```bash
cd /var/www/trondex/server

# Instal dependensi backend
bun install

# Buat file konfigurasi environment
nano .env
```
# Isi file .env di server:
# (Tidak perlu mendefinisikan PORT jika menggunakan sistem Multi-Instance Port %i di bawah)
NODE_ENV=production

# MySQL (Sesuai dengan `dbInit.ts` & native syntax Trondex)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=trondex_user
DB_PASSWORD=PasswordKuatAnda123!
DB_NAME=trondex

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Keamanan & Admin (Ganti dengan data Anda)
ADMIN_KEY=@Polar007
ADMIN_TRON_ADDRESS=TNYXqFD2aBmta8HSqocsVn8MbB2M9i1Tw1
CORS_ORIGINS=https://trondex.xyz,https://www.trondex.xyz

# Pengaturan Aplikasi Standard (Jangan diubah)
TRADE_WINDOW_START_WIB=7
TRADE_WINDOW_END_WIB=15
MIN_DEPOSIT_TRX=10
MIN_WITHDRAWAL_TRX=10
TRADE_REWARD_RATE=0.03
```
*(Catatan: Anda tidak perlu men-generate struktur tabel ke MySQL secara manual karena script `dbInit.ts` di backend Trondex sudah menangani pembuatan tabel `IF NOT EXISTS` secara otomatis saat server menyala).*

Karena Trondex menggunakan Bun, **Anda tidak perlu melakukan proses build (*compile*) ke JavaScript untuk backend**. Bun bisa langsung menjalankan file TypeScript secara *native* dan sangat cepat.

---

## 5. Menjalankan Backend dengan Systemd (Native Multi-Instance Bun)

Anda sangat tepat, Bun belum sepenuhnya komprehensif mengadopsi modul `cluster` Node.js secara transparan tanpa masalah kinerja. Cara *native* Ubuntu—dan yang paling stabil untuk Nginx—adalah dengan memanfaatkan **Systemd Templates**. Kita akan membuat 1 file servis, lalu menyuruh sistem untuk menjalankan 4 '*cloning*'-nya pada *port* yang berbeda (misal: 3000, 3001, 3002, 3003).

### A. Buat Systemd Service Template
Buka editor teks membuat servis baru berakhiran `@.service` (ini menandakan template):
```bash
sudo nano /etc/systemd/system/trondex@.service
```

Isikan konfigurasi berikut. Ganti `ubuntu` dengan nama *user* instalasi Anda jika berbeda. (Asumsi *binary* Bun ter-*install* di `/home/ubuntu/.bun/bin/bun`).

```ini
[Unit]
Description=Trondex Backend API Instance on Port %i
After=network.target redis-server.service mysql.service
Wants=mysql.service redis-server.service

[Service]
User=ubuntu
WorkingDirectory=/var/www/trondex/server

# Environment: PORT akan mengambil nilai di belakang karakter '@' (misal: 3001)
Environment="PORT=%i"
Environment="NODE_ENV=production"

# Ganti lokasi bun jika Anda install via root (gunakan perintah 'which bun' untuk mencari lokasi persisnya)
ExecStart=/home/ubuntu/.bun/bin/bun run src/index.ts

Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

atau 
```ini
[Unit]
Description=Trondex Server Instance %i
After=network.target mysql.service redis-server.service
Wants=mysql.service redis-server.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/var/www/trondex/server
EnvironmentFile=/var/www/trondex/server/.env.production


Environment=PORT=%i

ExecStart=/home/ubuntu/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=trondex-%i

# Batasi resource per instance
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Simpan dan keluar `(Ctrl+O, Enter, Ctrl+X)`.

### B. Nyalakan ke-4 Instance API
Sekarang, kita aktifkan 4 servis Trondex dari port 3000 sampai 3003 sekaligus:
```bash
sudo systemctl daemon-reload

for port in 3000 3001 3002 3003; do
  sudo systemctl enable trondex@$port
  sudo systemctl start trondex@$port
done
```
Untuk memastikannya berjalan dengan mulus:
```bash
sudo systemctl status "trondex@*"
```

---

## 6. Konfigurasi Nginx (Upstream Load Balancer & Frontend)

Kita perlu membuat blok Nginx yang membagi *traffic* API secara adil *(round-robin)* ke mesin `trondex@3000` hingga `3003` yang kita jalankan sebelumnya.

```bash
sudo nano /etc/nginx/sites-available/trondex
```

Isikan dengan konfigurasi mutakhir dan aman ini:

```nginx
# ==========================================
# DEFINE BUN CLUSTER (Native Load Balancing)
# Nginx akan meneruskan request API & WebSocket secara merata ke 4 Core / Port ini
# ==========================================
upstream trondex_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
    # Keepalive connections ke backend
    keepalive 64;
}

# ==========================================
# 1. FRONTEND SERVER BLOCK (Landing Page / Web App)
# ==========================================
server {
    listen 80;
    server_name domainanda.com www.domainanda.com;
    
    root /var/www/trondex/client/dist;
    index index.html;

    location / {
        # Sangat Penting untuk React Router
        try_files $uri $uri/ /index.html;
    }

    # ── Security Headers ──
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Optimasi Cache Asset
    location ~* \.(?:ico|css|js|gif|jpe?g|png|svg|woff2?|eot|ttf|mp4)$ {
        expires 6M;
        access_log off;
        add_header Cache-Control "public, max-age=15552000, immutable";
    }
}

    # ==========================================
    # 2. BACKEND API & WEBSOCKET SERVER BLOCK
    # ==========================================
    server {
        listen 80;
        server_name api.domainanda.com;

        # ── WebSocket proxy (/ws) ──
        location /ws {
            proxy_pass http://trondex_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            
            # IP Tracking Pass-through
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # WebSocket timeout
            proxy_read_timeout  3600s;
            proxy_send_timeout  3600s;
            proxy_connect_timeout 10s;
        }

        # ── API proxy (/api) ──
        location /api {
            proxy_pass http://trondex_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            
            # IP Tracking Pass-through
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";

            # Request timeout
            proxy_connect_timeout 10s;
            proxy_read_timeout    30s;
            proxy_send_timeout    30s;

            # Upload size max (jika ada file submission di masa depan)
            client_max_body_size 1m;
        }
    }
```

Simpan file, lalu aktifkan konfigurasi dan uji *syntax*:
```bash
sudo ln -s /etc/nginx/sites-available/trondex /etc/nginx/sites-enabled/
sudo nginx -t

# (Pastikan OK) Jika ada error, bongkar kembali file konfigurasi.
# Jika SUCCESS:
sudo systemctl restart nginx
```

---

## 7. Instalasi SSL / HTTPS dengan Certbot (Let's Encrypt)

Agar aplikasi web (Frontend) dan koneksi WebSocket aman (`https://` dan `wss://`), pasang SSL gratis dari Let's Encrypt.

```bash
sudo apt install certbot python3-certbot-nginx -y

# Jalankan certbot untuk Frontend dan API
sudo certbot --nginx -d domainanda.com -d www.domainanda.com -d api.domainanda.com
```

Certbot akan menanyakan beberapa hal (email persetujuan lisensi). Pilih opsi **Redirect HTTP to HTTPS** saat diminta. Setelah selesai, *restart* kembali Nginx:

```bash
sudo systemctl restart nginx
```

---

## 8. Setup Keamanan Server (Firewall / UFW)

Pastikan port server Anda diawasi dengan mengaktifkan UFW. Kita hanya perlu membuka port SSH (22), HTTP (80), dan HTTPS (443). Port MySQL dan Redis tidak dibuka ke internet publik demi keamanan; aplikasi langsung membaca *local port*.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
# Tekan Y saat muncul peringatan SSH disconnect
```

## 🎉 Selesai! Aplikasi Anda Sudah LIVE.

### *Troubleshooting Guide (Cheatsheet)*
Jika terjadi masalah seiring berjalannya aplikasi, gunakan alat pemantauan ini:

- **Melihat status instance backend yang menyala:**
  `sudo systemctl status "trondex-api@*"`

- **Melihat log backend / error (Semua Port secara Live):**
  `sudo journalctl -u "trondex-api@*" -f`

- **Melihat log Port Spesifik (misal Port 3001):**
  `sudo journalctl -u trondex-api@3001 -f`

- **Nginx error log (Jika API Crash 502/504):**
  `sudo tail -f /var/log/nginx/error.log`
