# SPEC: App nhập liệu local cho TikTok Fashion Coding (Codebook v4)

> Đây là bản spec gốc dùng để build app này. Trạng thái triển khai thực tế và
> hướng dẫn chạy nằm ở [`README.md`](README.md).

---

## 1. Mục tiêu

Đang mã hóa tay 500 video theo Codebook v4 (47 cột) trong sheet `3_Coding_Sheet`,
hiện copy-paste qua lại giữa nhiều tab Google Sheets rất dễ miss cột và lệch hàng.
App này giải quyết:

1. Nhập liệu nhanh bằng bàn phím, không cần chuột, không miss cột.
2. Tự động kéo sẵn dữ liệu đã có (URL, follower, likes/comments/shares/views,
   account type) từ `1_Account_List` và `2_Video_Queue`, để chỉ phải gõ phần thực sự
   cần coder quyết định (X, Y, W).
3. Tự tính các cột derived (X4c, ER%, ...) thay vì nhập tay, đúng như ghi chú trong
   sheet `4_Progress`: *"Không nhập tay V2, X3, X4c, X4 band, ER và QC_status"*.
4. Có chế độ IRR pilot (C1/C2 code độc lập 75 video) và xuất dữ liệu sẵn định dạng
   để tính Krippendorff's alpha.
5. Có dashboard xem tiến độ tổng thể.
6. Lưu local (SQLite) làm nguồn dữ liệu chính, xuất ra Excel đúng layout gốc, và có
   tuỳ chọn đồng bộ hai chiều với Google Sheets.

---

## 2. Phạm vi dữ liệu (import từ file gốc)

App đọc và nạp dữ liệu từ 6 sheet trong file gốc (`TikTok_Fashion_Research_Sheet_v2`):

| Sheet | Vai trò trong app |
|---|---|
| `0_Candidate_Pool` | Chỉ tham khảo, không cần import (đã lọc xong rồi) |
| `1_Account_List` | Nguồn lookup cho V1 Account_type, V3 Follower baseline, Tier |
| `2_Video_Queue` | Nguồn auto-pull cho V0.2 URL, V0.3 Upload_date, V0.4 Account_handle, V3 Follower_count, E1–E4 |
| `3_Coding_Sheet` | **Bảng chính app này phục vụ**, 47 cột, nơi coder làm việc |
| `4_Progress` | App tự tính lại, không cần import, chỉ dùng làm tham chiếu logic |
| `5_IRR_Pilot` | Chế độ IRR riêng, coding song song C1/C2 cho 75 video |
| `Y_Frame_Quick_Guide` | Nạp làm nội dung tooltip/help ngay trong form |

---

## 3. Kiến trúc tổng thể

```
File Excel gốc (.xlsx)
        |
        v  (import 1 lần, hoặc re-sync khi cần)
   SQLite (data.db)  <-- nguồn dữ liệu chính khi đang code
        |
        v  (export theo yêu cầu)
   File Excel xuất ra (đúng layout 3_Coding_Sheet)
        |
        v  (tuỳ chọn)
   Google Sheets (đồng bộ 2 chiều qua nút bấm, không tự động real-time)
```

Lý do không gõ trực tiếp vào Google Sheets API theo từng phím: mỗi lần gõ mà gọi API
sẽ chậm và dễ dính rate limit khi code liên tục 500 video. SQLite local nhanh gần như
tức thời; đồng bộ Sheets là hành động rõ ràng theo nút bấm ("Đẩy lên Sheet" /
"Kéo về từ Sheet"), có preview diff trước khi ghi đè.

---

## 4. Field Dictionary đầy đủ (47 cột `3_Coding_Sheet`)

**Auto** = app tự điền/tự tính, không cho sửa tay (trừ khi override thủ công có cảnh
báo). **Manual** = coder nhập. **Auto-pull** = lấy từ sheet khác, coder có thể sửa
nếu số liệu cũ.

| # | Cột | Nhóm | Loại | Nguồn / Cách nhập | Ghi chú |
|---|---|---|---|---|---|
| 1 | STT | - | int | Auto | Số thứ tự theo bảng |
| 2 | V1 Video_ID | Meta | text | Auto-pull từ `2_Video_Queue` | Rút từ URL video |
| 3 | V0.2 URL | Meta | text (link) | Auto-pull | Có nút "Mở video" |
| 4 | V0.3 Upload_date | Meta | date | Auto-pull | |
| 5 | V0.4 Account_handle | Meta | text | Auto-pull | |
| 6 | V0.5 Coder_ID | Meta | select | Manual | Dropdown C1/C2/..., mặc định = coder đang chọn |
| 7 | V0.6 Coding_date | Meta | date | Auto = hôm nay, cho sửa | |
| 8 | V0.7 Snapshot_time | Meta | datetime | Auto = lúc lưu, cho sửa | Thời điểm chốt số liệu engagement |
| 9 | V1 Account_type | Meta | enum {1,2} | Auto-pull từ `1_Account_List` | 1=Influencer/KOC, 2=Brand |
| 10 | V2 Observed_commercial_relationship | Meta | enum | **Auto derived** | Công thức chưa xác nhận, xem mục 5.2 |
| 11 | V3 Follower_count | Meta | int | Auto-pull | Follower tại thời điểm lấy mẫu |
| 12 | V4 Dominant_format | Meta | enum | Manual | Danh sách giá trị cần xác nhận |
| 13 | X1 Commercial_content | X | bool {0,1} | Manual | Video có nội dung thương mại không |
| 14 | X2.1 Platform_label | X | bool {0,1} | Manual | Nhãn "Paid partnership" của TikTok |
| 15 | X2.2 Verbal_disclosure | X | bool {0,1} | Manual | Nói bằng lời |
| 16 | X2.3 Onscreen_disclosure | X | bool {0,1} | Manual | Chữ hiện trên màn hình |
| 17 | X2.4 Explicit_hashtag | X | bool {0,1} | Manual | #ad #quangcao... |
| 18 | X2.5 Brand_tag | X | bool {0,1} | Manual | Tag @brand |
| 19 | X2.6 Product_link_tag | X | bool {0,1} | Manual | Gắn giỏ hàng/link sản phẩm |
| 20 | X2.7 Promo_affiliate_code | X | bool {0,1} | Manual | Mã giảm giá/affiliate |
| 21 | X3 Visibility_level | X | enum | **Auto derived** | Từ tổ hợp X2.1–X2.7 |
| 22 | X4a Video_sec | X | number | Manual | Tổng số giây video |
| 23 | X4b Commercial_sec | X | number | Manual | Số giây có nội dung thương mại |
| 24 | X4c Commercial_share (%) | X | number | **Auto** = X4b / X4a * 100 | Đã xác nhận |
| 25 | X4 Intensity_band | X | enum | **Auto derived** | Từ X4c theo ngưỡng |
| 26 | Y1 Information | Y | {0,1,9} | Manual | |
| 27 | Y2 Experience | Y | {0,1,9} | Manual | |
| 28 | Y3 Aesthetic_trend | Y | {0,1,9} | Manual | |
| 29 | Y4 Price_promotion | Y | {0,1,9} | Manual | |
| 30 | Y5 Social_proof | Y | {0,1,9} | Manual | |
| 31 | Y6 Problem_solution | Y | {0,1,9} | Manual | |
| 32 | Y7 Dominant_frame | Y | {0; 1–6; 7; 9} | Manual | Ràng buộc logic, xem mục 6 |
| 33 | Y8 CTA | Y | {0,1,2,9} | Manual | 0=không, 1=soft, 2=hard |
| 34 | Y9 Observed_appeal | Y | {0–5, 9} | Manual | 1=identification, 2=aspiration, 3=resolution, 4=pure info, 5=mixed |
| 35 | W1 AI_disclosure | W | bool {0,1} | Manual | |
| 36 | W2 AI_label_source | W | enum/text | Manual | Danh sách giá trị cần xác nhận |
| 37 | E1 Likes | E | int | Auto-pull, cho sửa | |
| 38 | E2 Comments | E | int | Auto-pull, cho sửa | |
| 39 | E3 Shares | E | int | Auto-pull, cho sửa | |
| 40 | E4 Views | E | int | Auto-pull, cho sửa | |
| 41 | E5 Saves | E | int | Manual | Không có sẵn trong Video_Queue |
| 42 | ER_view_core (%) | E | number | **Auto** = (E1+E2+E3)/E4*100 | |
| 43 | ER_view_plus_save (%) | E | number | **Auto** = (E1+E2+E3+E5)/E4*100 | Bỏ trống nếu E5 chưa nhập |
| 44 | ER_follower (%) | E | number | **Auto** = (E1+E2+E3)/V3*100 | |
| 45 | QC_status | QC | enum {OK, CHECK} | **Auto derived** | |
| 46 | Missing_data_notes | QC | text | Manual | |
| 47 | Boundary_notes | QC | text | Manual | |

---

## 5. Công thức derived field

### 5.1 Xác nhận được từ dữ liệu mẫu (implement cứng)

```
X4c               = X4b / X4a * 100
ER_view_core      = (E1 + E2 + E3) / E4 * 100
ER_view_plus_save = (E1 + E2 + E3 + E5) / E4 * 100
ER_follower       = (E1 + E2 + E3) / V3 * 100
```

Nếu mẫu số = 0 hoặc rỗng thì để trống, không chia lỗi (tránh crash / hiện `NaN`).

### 5.2 Chưa xác nhận được, cần manual gốc (`manual v0.1`)

- **V2 Observed_commercial_relationship**: có vẻ suy ra từ tổ hợp X2.1–X2.7, nhưng
  mapping chính xác (0/1/2/3 nghĩa là gì) chưa rõ.
- **X3 Visibility_level**: khả năng cao là tổng/mức cao nhất của các tín hiệu X2.1–X2.7.
- **X4 Intensity_band**: khả năng là band theo ngưỡng % của X4c (band 0 khi X1=0, sau
  đó chia 3 mức thấp/vừa/cao), nhưng ngưỡng % chính xác chưa rõ.
- **QC_status**: rule kiểm tra hoàn chỉnh + logic hợp lệ, tiêu chí cụ thể chưa rõ.
- **Y9 = 0**: quick guide chỉ liệt kê 1–5, không rõ 0 khác gì với 9.
- **V4 Dominant_format**, **W2 AI_label_source**: danh sách giá trị enum chưa có.

**Cách xử lý trong app**: module `derive.py` tách riêng, đọc rule từ file cấu hình
`rules_config.json`, không hard-code trong logic chính. Ship với công thức best-guess,
đánh dấu rõ trong UI (icon cảnh báo màu vàng cạnh field) rằng giá trị này là
"auto (tạm), cần review", cho phép coder override tay. Khi có manual gốc, chỉ cần sửa
`rules_config.json`, không cần sửa code.

---

## 6. Ràng buộc logic khi nhập (validation)

Áp dụng ngay khi coder gõ, không chặn cứng (cho phép lưu kèm cảnh báo, vì thực địa
luôn có case biên), nhưng hiện rõ cảnh báo màu và gợi ý ghi vào `Boundary_notes`:

1. **Y7 = 1–6** chỉ hợp lệ khi Y tương ứng (Y1–Y6) đã = 1.
2. **Y7 = 7 (Mixed)** chỉ hợp lệ khi có từ 2 giá trị Y1–Y6 = 1 trở lên.
3. **X4b ≤ X4a**, không cho commercial giây nhiều hơn tổng video.
4. Nếu **X1 = 0** thì X2.1–X2.7 nên đều = 0, X4b nên = 0 (cảnh báo vàng, không chặn).
5. **E5 Saves** trống thì `ER_view_plus_save` để trống, không tính lỗi.
6. Field bắt buộc để QC = OK: V0.5 Coder_ID, V1 Account_type, X1, Y1–Y9, W1. Thiếu bất
   kỳ field nào => QC_status tự set CHECK.

---

## 7. UX / Luồng nhập liệu

### 7.1 Layout tổng thể

```
+------------------------------------------------------------------+
| Sidebar trái          | Panel chính                    | Panel   |
| (danh sách 500 video, | (form nhập theo nhóm            | phải    |
| filter + search,      | V / X / Y / W / QC)             | (preview|
| status màu)           |                                  | derived |
|                        |                                  | realtime|
+------------------------------------------------------------------+
| Thanh dưới: [< Video trước] [Lưu & Video tiếp >] [Đánh dấu review]|
+------------------------------------------------------------------+
```

### 7.2 Nhập bằng bàn phím

- Field 0/1/9 hoặc 0/1/2/9: gõ đúng phím số sẽ set giá trị **và tự nhảy sang field kế
  tiếp** theo thứ tự cố định.
- `Tab` / `Shift+Tab`: di chuyển tới/lui không đổi giá trị.
- `Alt+Enter`: lưu video hiện tại và nhảy sang video tiếp theo (theo filter đang bật).
- `Alt+←` / `Alt+→`: video trước / sau (tự autosave).
- `Ctrl+F`: focus ô tìm kiếm sidebar.
- Mỗi field có chấm xám (chưa nhập) → chấm xanh (đã nhập). Field bắt buộc còn thiếu
  hiện viền đỏ nhạt; "Lưu & tiếp" hỏi lại, vẫn có "Bỏ qua, lưu tạm".
- Autosave: mọi thay đổi lưu ngay vào SQLite.

### 7.3 Tooltip hướng dẫn

Mỗi field Y1–Y9, X2.x có icon (?) hiện tooltip lấy nội dung từ `Y_Frame_Quick_Guide`
("Đo cái gì?", "Dễ nhầm với", "Ví dụ nhanh").

---

## 8. Dashboard

- **KPI**: tổng mục tiêu 500, đã code / còn lại / %, QC OK vs CHECK, breakdown theo
  Coder_ID và Account_type.
- **Biểu đồ**: line theo ngày (V0.6), bar Y7, bar Y9, donut X1, bar X4 band, bar/box
  ER_view_core theo Account_type / Tier.
- **Bảng "Videos cần review"** (QC = CHECK), click nhảy thẳng tới video trong form.
- **Data grid** dạng spreadsheet, filter/sort, sửa nhanh inline, nút xuất Excel/CSV.

---

## 9. Chế độ IRR Pilot

- Tab riêng cho danh sách 75 video pilot.
- Coder chọn vai trò C1 hoặc C2, **không thấy giá trị của vai trò kia** trong lúc code.
- Sau khi cả hai code xong, màn hình "So sánh" hiện 2 cột song song, tô đỏ field lệch,
  có ô "Ghi chú khác biệt".
- Nút "Xuất ma trận IRR" xuất CSV wide (mỗi biến 2 cột C1/C2) cho R (`irr`) hoặc Python
  (`krippendorff`), theo đúng loại thang đo: X4a/X4b interval, Y8 ordinal, còn lại nominal.
- App tính sẵn % đồng thuận đơn giản, **không tự tính Krippendorff's alpha**.

---

## 10. Import / Export / Sync

- **Import**: `seed/import_seed.py` đọc `.xlsx` bằng `openpyxl`, nạp Account_List →
  `accounts`, Video_Queue → `videos`, Coding_Sheet → `coding_entries`, IRR_Pilot →
  `irr_entries`. Phải **idempotent**, match theo Video_ID.
- **Export**: ghi `coding_entries` ra `.xlsx` đúng thứ tự 47 cột; xuất riêng từng sheet
  hoặc full workbook.
- **Sync Google Sheets** (tuỳ chọn): `gspread` + service account. "Kéo về từ Sheet" và
  "Đẩy lên Sheet" đều hiện diff trước khi ghi. Không tự động real-time.

---

## 11. Tech stack

- Backend: Python + FastAPI · DB: SQLite qua SQLModel
- Frontend: HTML + JS thuần · Excel I/O: openpyxl
- Google Sheets sync (tuỳ chọn): gspread + google-auth

---

## 12. Câu hỏi mở cần xác nhận

1. Công thức chính xác của **V2 Observed_commercial_relationship** (mapping 0/1/2/3)?
2. Công thức chính xác của **X3 Visibility_level**?
3. Ngưỡng % chính xác cho **X4 Intensity_band** (band 1/2/3 chia ở đâu)?
4. Tiêu chí đầy đủ để set **QC_status = CHECK** (ngoài thiếu field)?
5. Danh sách enum đầy đủ cho **V4 Dominant_format** và **W2 AI_label_source**?
6. **Y9 = 0** nghĩa là gì, khác **Y9 = 9** ở điểm nào?

Nếu có file "manual v0.1" gốc thì nạp đúng công thức vào `rules_config.json` thay vì
dùng best-guess tạm.
