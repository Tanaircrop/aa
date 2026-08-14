# TikTok Fashion Coding — app nhập liệu

App nhập liệu cho Codebook v4 (47 cột của sheet `3_Coding_Sheet`): FastAPI +
HTML/JS thuần, không cần build. Chạy được hai kiểu:

- **Local** — SQLite, một file `data.db`, không cần internet, không cần đăng nhập.
- **Online (Vercel)** — Postgres, mỗi coder một tài khoản, hai người nhập cùng lúc.

Mục tiêu: gõ 500 video bằng bàn phím mà không miss cột, không lệch hàng, các cột
derived (X4c, ER%, X3, X4 band, QC_status) do app tự tính.

---

## Chạy local

```bash
pip install -r requirements.txt

# Chưa có file gốc? Sinh dữ liệu demo để xem app chạy thế nào:
python seed/make_demo_xlsx.py --n 500 --pilot 75

# Có file gốc rồi thì đặt vào seed/ và nạp:
python seed/import_seed.py seed/TikTok_Fashion_Research_Sheet_v2.xlsx

python app.py          # tự mở http://127.0.0.1:8000/app/coding.html
```

Tuỳ chọn: `python app.py --port 8080 --no-browser`.
Dữ liệu nằm trong `data.db` ở thư mục gốc (đổi bằng `TIKTOK_CODING_DB`).

Chạy local mà không muốn phải đăng nhập: đặt `DISABLE_AUTH=1`. **Chỉ dùng ở
máy mình** — biến này bỏ qua toàn bộ kiểm tra quyền.

Chạy test (84 test, chạy được ở bất kỳ thứ tự nào):

```bash
pip install pytest httpx && python -m pytest tests/ -q
```

---

## Đưa lên Vercel

Vercel chạy serverless: filesystem bị xoá sau mỗi request, nên **SQLite không
dùng được** — phải có Postgres. Bốn bước:

**1. Tạo database.** Trong dashboard Vercel: **Storage → Create Database →
Postgres**. Tạo xong vào tab `.env.local` copy giá trị `POSTGRES_URL`.

**2. Tạo bảng + đặt mật khẩu** (chạy ở máy mình, trỏ thẳng vào DB vừa tạo):

```bash
export DATABASE_URL='postgres://...'        # Windows: set DATABASE_URL=...

python seed/bootstrap_remote.py --init      # tạo bảng, hỏi mật khẩu C1 và C2
python seed/bootstrap_remote.py --import-xlsx seed/TikTok_Fashion.xlsx
python seed/bootstrap_remote.py --status    # kiểm tra lại
```

Mật khẩu nhập bằng `getpass` nên không hiện lên màn hình và không vào shell
history. Đổi về sau: `python seed/bootstrap_remote.py --set-password C2`.

**3. Khai báo biến môi trường** ở Vercel → Settings → Environment Variables:

| Biến | Giá trị | Bắt buộc |
|---|---|---|
| `DATABASE_URL` | connection string ở bước 1 | ✅ |
| `SESSION_SECRET` | chuỗi ngẫu nhiên dài, VD `python -c "import secrets;print(secrets.token_hex(32))"` | ✅ |
| `SKIP_DB_INIT` | `1` — bảng đã tạo ở bước 2, khỏi kiểm tra lại mỗi cold start | nên có |

`SESSION_SECRET` là khoá ký cookie đăng nhập. Đổi giá trị này = đăng xuất tất cả
mọi người ngay lập tức (dùng khi nghi lộ mật khẩu).

**4. Deploy.**

```bash
npx vercel --prod
```

Hoặc nối repo GitHub vào Vercel để mỗi lần push là tự deploy.

Xong thì mở `https://<project>.vercel.app` — app sẽ hỏi đăng nhập.
`/api/health` để công khai (không cần đăng nhập) cho uptime check.

### Sau khi deploy

- Nạp thêm/cập nhật dữ liệu: dùng trang **Dữ liệu** trong app (upload `.xlsx`
  qua trình duyệt) hoặc chạy lại `bootstrap_remote.py --import-xlsx`. Cả hai
  đều idempotent.
- Sao lưu: bấm xuất `full.xlsx` ở Dashboard, hoặc `pg_dump` từ connection string.
- Vercel Hobby ngủ đông khi không ai dùng, nên request đầu tiên sau một lúc
  vắng sẽ chậm vài giây (cold start). Không mất dữ liệu — dữ liệu nằm ở Postgres.

---

## Đăng nhập và phân quyền

Mỗi coder một tài khoản (`C1`, `C2`). Đăng nhập rồi thì:

- Ô "Coder" trên thanh trên cùng **không còn chọn tự do** — luôn là tài khoản
  đang đăng nhập, nên `Coder_ID` không bao giờ bị ghi nhầm người.
- Màn hình IRR **khoá vai trò theo tài khoản**: đăng nhập C1 thì chỉ code được
  vai trò C1; gọi thẳng API của vai trò kia trả về `403`. Đây là chốt chống bias
  thật sự — trước đây vai trò chỉ là một dropdown, ai cũng đổi được.
- Toàn bộ `/api/*` (trừ `/api/health`) đòi cookie hợp lệ; mở thẳng một trang khi
  chưa đăng nhập thì bị chuyển về `/app/login.html`.
- Phiên giữ 30 ngày. Mật khẩu băm PBKDF2-HMAC-SHA256 (240k vòng, salt riêng từng
  tài khoản) — không lưu mật khẩu thô ở đâu cả.

Tài khoản `is_admin` bỏ qua được khoá vai trò IRR (để sửa dữ liệu khi cần).
Mặc định C1/C2 **không** phải admin.

---

## Bốn màn hình

| Trang | Đường dẫn | Dùng để |
|---|---|---|
| Nhập liệu | `/app/coding.html` | Màn hình chính: sidebar 500 video, form 47 field, panel derived realtime |
| Dashboard | `/app/dashboard.html` | KPI, biểu đồ, bảng "cần review", data grid sửa nhanh, xuất Excel/CSV |
| IRR Pilot | `/app/irr.html` | Code song song C1/C2, màn hình so sánh, xuất ma trận IRR |
| Dữ liệu | `/app/index.html` | Nạp file Excel, xuất file, xem rule derived, cấu hình sync Google Sheets |
| Đăng nhập | `/app/login.html` | Trang duy nhất mở được khi chưa đăng nhập |

API docs tự sinh ở `/docs`.

---

## Phím tắt (màn hình Nhập liệu)

| Phím | Tác dụng |
|---|---|
| `0` `1` `2` `9` | Đặt giá trị cho field đang focus rồi **tự nhảy sang field kế tiếp** |
| `Tab` / `Shift+Tab` | Di chuyển tới/lui, không đổi giá trị |
| `↑` / `↓` | Như Tab / Shift+Tab |
| `Alt+Enter` | Lưu video hiện tại + sang video tiếp theo (theo filter đang bật) |
| `Alt+←` / `Alt+→` | Video trước / sau (autosave, không cần lưu tay) |
| `Ctrl+F` | Nhảy vào ô tìm kiếm sidebar |
| `Ctrl+Enter` | Mở video trên TikTok |
| `Esc` | Bỏ focus khỏi ô đang gõ |

Với field enum chữ (Coder_ID = C1/C2), phím `1`/`2` chọn theo thứ tự option.

**Autosave**: mọi thay đổi ghi ngay vào SQLite (debounce ~0.3s). Nút
"Lưu & Video tiếp" chỉ chạy validate rồi điều hướng — không có trạng thái "chưa lưu".

---

## Cột derived: cái nào chắc, cái nào tạm

Công thức nằm trong `backend/rules_config.json`, **không hard-code trong logic**.
Sửa file đó rồi bấm "Nạp lại rules" ở trang Dữ liệu là xong — không cần sửa code,
không cần restart.

**Đã xác nhận từ dữ liệu mẫu** (mẫu số = 0 hoặc rỗng thì để trống, không crash):

```
X4c              = X4b / X4a * 100
ER_view_core     = (E1+E2+E3) / E4 * 100
ER_view_plus_save= (E1+E2+E3+E5) / E4 * 100     (trống nếu chưa có E5)
ER_follower      = (E1+E2+E3) / V3 * 100
```

**Còn tạm, chờ manual v0.1** — hiện badge vàng `TẠM` cạnh field trong UI:

| Cột | Rule tạm đang dùng |
|---|---|
| `X4 Intensity_band` | X1=0 → 0; X4c ≤33 → 1; ≤66 → 2; >66 → 3 (ngưỡng 33/66 là best-guess) |
| `X3 Visibility_level` | đếm X2.1–X2.7 = 1: 0→0, 1–2→1, 3–4→2, 5+→3 |
| `V2 Observed_commercial_relationship` | **app không tự tính**, coder nhập tay; panel phải chỉ *gợi ý* một giá trị |
| `QC_status` | CHECK nếu thiếu field bắt buộc / X4b>X4a / vi phạm ràng buộc Y7 / X1 mâu thuẫn X2 / có Missing_data_notes |
| `V4 Dominant_format`, `W2 AI_label_source` | enum tạm, xem `backend/columns.py` |
| `Y9 = 0` | tạm hiểu là "không có appeal rõ", khác 9 = "không xác định" |

Mỗi field derived đều có ô **"ghi đè"** bên cạnh: nhập tay để override, app sẽ
đánh dấu `ghi đè` và không tính đè lên nữa.

Khi có manual v0.1, chỉ cần sửa `rules_config.json`. Ví dụ đổi ngưỡng band:

```json
"x4_intensity_band": {
  "kind": "cases",
  "confirmed": true,
  "require": ["X1"],
  "cases": [
    { "when": "X1 == 0", "then": 0 },
    { "require": ["X4c"], "when": "X4c < 25", "then": 1 },
    { "require": ["X4c"], "when": "X4c < 75", "then": 2 },
    { "require": ["X4c"], "when": "X4c >= 75", "then": 3 }
  ],
  "else": null
}
```

Đổi `confirmed` thành `true` là badge `TẠM` biến mất. Biểu thức chạy qua một bộ
đánh giá AST giới hạn (`backend/services/expr.py`) — chỉ so sánh, số học và vài
hàm whitelist, nên sửa config không thể thành chạy code tuỳ ý.

---

## Ràng buộc logic khi nhập

Không chặn cứng (thực địa luôn có case biên) — hiện cảnh báo và cho lưu:

- **Đỏ (hard)**: Y7 = 1–6 mà Y tương ứng ≠ 1 · Y7 = 7 (Mixed) mà có dưới 2 frame ·
  X4b > X4a.
- **Vàng (soft)**: X1 = 0 nhưng vẫn có tín hiệu X2.x hoặc X4b > 0 · X1 = 1 mà không
  có tín hiệu disclosure nào · W1 = 0 mà W2 vẫn chọn nguồn · ER > 100%.
- **Field bắt buộc** để QC = OK: Coder_ID, Account_type, X1, Y1–Y9, W1. Thiếu thì
  "Lưu & tiếp" hỏi lại, vẫn có lựa chọn "Bỏ qua, lưu tạm".

Nút "Chép cảnh báo vào Boundary_notes" ở panel phải dán nhanh toàn bộ cảnh báo
đang có vào ô ghi chú.

---

## IRR Pilot

- Vai trò khoá theo tài khoản đăng nhập (xem mục "Đăng nhập và phân quyền").
  API **không bao giờ** trả giá trị của vai trò kia khi đang code (metadata thì
  vẫn auto-pull), và gọi sang vai trò không phải của mình thì `403` — hai lượt
  code độc lập thật.
- Màn hình "So sánh" chỉ mở khi cả C1 và C2 đã code xong video đó (trước đó trả 409),
  tô đỏ field lệch, có ô "Ghi chú khác biệt" ứng với cột cuối sheet gốc.
- App tính sẵn **% đồng thuận thô** để xem nhanh, và **cố ý không tự tính
  Krippendorff's alpha** — vẫn nên tính bằng R/Python từ file CSV xuất ra.
- Hai định dạng xuất, thang đo theo đúng sheet gốc (X4a/X4b = interval, Y8 = ordinal,
  còn lại nominal):
  - `irr_matrix_wide.csv` — mỗi biến 2 cột `<field>_C1`, `<field>_C2`, dòng 2 ghi
    scale_type. Hợp với R (`irr`).
  - `irr_long.csv` — `unit, coder, variable, scale_type, value`. Hợp với Python
    (`krippendorff`).

```r
library(irr)
d <- read.csv("irr_matrix_wide.csv", skip = 0)
d <- d[-1, ]   # bỏ dòng scale_type
kripp.alpha(t(as.matrix(d[, c("y8_cta_C1", "y8_cta_C2")])), method = "ordinal")
```

Chưa có danh sách pilot? Nút "Chọn lại 75 video pilot" lấy mẫu hệ thống từ hàng đợi.

---

## Import / Export / Sync

**Import** (`python seed/import_seed.py <file.xlsx>` hoặc trang Dữ liệu) là
**idempotent**: khớp theo Video_ID, chạy lại bao nhiêu lần cũng không tạo dòng trùng,
và ô trống trong file nguồn **không xoá** dữ liệu đã nhập trong app. Header được so
khớp lỏng (bỏ dấu, bỏ hoa/thường, có bảng alias) nên file chỉnh tay vẫn nạp được.

**Export** giữ đúng thứ tự và đúng tên 47 cột, paste thẳng lại vào Google Sheets:
`3_Coding_Sheet.xlsx`, full workbook (kèm `5_IRR_Pilot`), CSV, và ma trận IRR.

**Google Sheets sync** (tuỳ chọn, Phase 6): `pip install gspread google-auth`, tạo
service account, share sheet cho email service account (quyền Editor), rồi khai báo
ở trang Dữ liệu. Không đồng bộ real-time — mỗi lần "Kéo về" / "Đẩy lên" đều hiện
**diff từng ô** trước khi ghi.

---

## Cấu trúc

```
api/
  index.py               Điểm vào cho Vercel (ASGI), chỉ là cầu nối tới backend/
vercel.json              Rewrite mọi request vào api/index + includeFiles
backend/
  app.py                 FastAPI entrypoint
  columns.py             ĐỊNH NGHĨA 47 CỘT — nguồn sự thật duy nhất
  models.py              SQLModel: Coder, Account, Video, CodingEntry, IRREntry, ...
  database.py            SQLite (local, WAL) hoặc Postgres (khi có DATABASE_URL)
  rules_config.json      Công thức derived + rule validate + scale IRR
  routers/               auth · meta · videos · coding · dashboard · irr · io · sync
  services/
    auth.py              Băm mật khẩu PBKDF2 + cookie phiên ký HMAC
    expr.py              Bộ đánh giá biểu thức an toàn cho rules_config
    derive.py            Tính cột derived
    validate.py          Ràng buộc logic mục 6
    entries.py           Auto-pull, patch, payload dùng chung
    importer.py          Nạp .xlsx (idempotent)
    excel_io.py          Đọc/ghi .xlsx
    quick_guide.py       Nội dung tooltip
    sheets_sync.py       Google Sheets (tuỳ chọn)
frontend/
  login.html · coding.html · dashboard.html · irr.html · index.html
  static/js/  coding.js · dashboard.js · irr.js · data.js · login.js · charts.js · common.js
  static/css/style.css
seed/
  import_seed.py         CLI nạp file gốc vào DB local
  bootstrap_remote.py    CLI tạo bảng / đặt mật khẩu / nạp dữ liệu lên Postgres
  make_demo_xlsx.py      Sinh dữ liệu demo
tests/                   84 test: derive, validate, expr, API, auth, cấu hình deploy
```

Thêm/sửa cột: sửa `backend/columns.py` và thêm field tương ứng vào
`CodingEntryBase` trong `models.py` — form, export, data grid và thứ tự nhảy phím
tự cập nhật theo.

---

## Ghi chú kỹ thuật

- **Biểu đồ tự vẽ bằng SVG** (`static/js/charts.js`) thay vì Chart.js qua CDN, để app
  chạy được cả khi không có mạng. Cùng bộ loại biểu đồ: line, bar, grouped bar, donut.
- **Tên cột trong file gốc**: cột 2 và cột 9 đều mang tiền tố `V1`
  (`V1 Video_ID` và `V1 Account_type`). App giữ nguyên header khi export để paste lại
  đúng, nhưng khoá nội bộ thì tách riêng (`video_id` / `account_type`).
- `Coder_ID` được điền sẵn theo tài khoản đang đăng nhập khi mở video, nhưng chỉ tính
  là "của coder đó" sau khi thực sự nhập gì đó — lướt qua không làm bẩn thống kê.
- **Không thêm thư viện cho phần đăng nhập**: băm mật khẩu và ký cookie đều dùng
  `hashlib`/`hmac` của thư viện chuẩn, nên `requirements.txt` vẫn mỏng và cold start
  trên Vercel không phải nạp thêm gì.
- **Postgres trên serverless dùng `NullPool`**: mỗi lambda là một process sống rất
  ngắn, giữ connection pool chỉ tổ ăn hết connection limit — việc gộp connection để
  pooler của Vercel/Neon lo.
- Muốn quay lại chạy local sau khi đã deploy: chỉ cần **bỏ** `DATABASE_URL`, app tự
  về SQLite. Cùng một code, không có nhánh riêng cho production.
