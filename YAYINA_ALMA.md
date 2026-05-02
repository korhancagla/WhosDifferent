# Kim Farkli Yayina Alma

Bu proje iki parca olarak yayina alinir:

- Backend: Render.com uzerinde Node + Socket.io servisi.
- Frontend: Natro Windows hosting uzerinde `frontend/dist` statik dosyalari.
- GitHub: Render'in backend kodunu cekmesi icin kaynak repo.

## 1. GitHub'a Yuklenecek Dosyalar

Repo kokunde su klasor/dosyalar olmali:

- `backend/`
- `frontend/`
- `render.yaml`
- `.gitignore`
- `YAYINA_ALMA.md`

Yukleme:

```bash
git add .
git commit -m "Kim Farkli MVP deploy setup"
git push
```

GitHub'a yuklenmemesi gerekenler:

- `backend/node_modules/`
- `frontend/node_modules/`
- `frontend/dist/`
- `.DS_Store`
- `.env` dosyalari

## 2. Render Backend

Render'da iki yoldan biri kullanilabilir.

### Secenek A: Blueprint

1. Render Dashboard > New > Blueprint.
2. GitHub reposunu sec.
3. Render repo kokundeki `render.yaml` dosyasini okur.
4. Servis adi: `kim-farkli-api`.
5. Deploy bitince sana su tipte bir URL verir:

```text
https://kim-farkli-api.onrender.com
```

### Secenek B: Manuel Web Service

1. Render Dashboard > New > Web Service.
2. GitHub reposunu sec.
3. Root Directory: `backend`
4. Runtime: `Node`
5. Build Command: `npm ci`
6. Start Command: `npm start`
7. Health Check Path: `/health`
8. Environment Variable:

```text
NODE_ENV=production
```

Deploy sonrasi test:

```text
https://RENDER-SERVIS-ADIN.onrender.com/health
```

Beklenen cevap:

```json
{"ok":true,"game":"Kim Farkli"}
```

## 3. Natro Frontend Dist Hazirlama

Render backend URL'ini aldiktan sonra frontend'i o URL ile build et.

Mac/Linux:

```bash
cd frontend
VITE_SOCKET_URL=https://RENDER-SERVIS-ADIN.onrender.com npm run build
```

Windows PowerShell:

```powershell
cd frontend
$env:VITE_SOCKET_URL="https://RENDER-SERVIS-ADIN.onrender.com"
npm run build
```

Windows CMD:

```bat
cd frontend
set VITE_SOCKET_URL=https://RENDER-SERVIS-ADIN.onrender.com && npm run build
```

Sonra Natro'ya `frontend/dist` klasorunun icindeki dosyalari yukle:

- `index.html`
- `favicon.svg`
- `icons.svg`
- `assets/`

Genelde hedef klasor sitenin yayin klasorudur. Eski duzende `Dist` klasorune atiyorsan yine `frontend/dist` icindeki dosyalari oraya koy.

## 4. Deploy Sonrasi Kontrol

1. Natro sitesini ac.
2. Bir tarayicida Oda Kur.
3. Baska tarayici veya gizli sekmede oda koduyla katil.
4. Host 3-4 kelime girsin, ana/farkli kelime secsin.
5. Oyunu Baslat.
6. Canvas'ta cizim yap, diger sekmede gorunmeli.
7. Oylamaya Gec, oy ver, sonuc ekrani acilmali.

## 5. Sik Hatalar

- Sayfa aciliyor ama oda kurulmuyor: Frontend build edilirken `VITE_SOCKET_URL` yanlis verilmis olabilir.
- Render uyuyor/gec aciliyor: Ucretsiz planlarda ilk istek yavas olabilir.
- Eski oyun gorunuyor: Natro'ya yeni `frontend/dist` icindeki dosyalarin tamamini yeniden yukle.
- Render deploy basarisiz: Render ayarlarinda Root Directory `backend`, Start Command `npm start` olmali.
