# Louvre V+A Photo Game

Game chụp ảnh góc nhìn thứ nhất trên trình duyệt, đặt trong quảng trường Cour Napoléon (Louvre),
dùng cho bài tập nhóm 10 phút tìm bố cục **V + A**. Mở link là chơi, không cài đặt, chạy trên điện thoại.

Spec gốc: [`design/louvre-va-spec.md`](design/louvre-va-spec.md). Ảnh bằng chứng QA: [`production/qa/evidence/`](production/qa/evidence/).

## Chạy local

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # test đáp án: 21 mũi hồ -> 5 chuẩn, 2 tranh luận, 14 loại
npm run build      # dist/ (trang tĩnh)
npm run evidence   # chạy bản build trong Chromium headless, chụp ảnh vào production/qa/evidence/
```

Chế độ giảng viên: `/?mode=teacher&pin=1789` (PIN trong `assets/data/scene.config.json`).

## Kiến trúc

| Thư mục | Nội dung |
|---|---|
| `assets/data/scene.config.json` | Mọi số đo cảnh: toạ độ OSM của hồ, kim tự tháp, cánh nhà, điểm dịch chuyển, cửa sổ, tiêu cự, preset ánh sáng, đáp án kỳ vọng. Không hard-code số đo trong code. |
| `src/core/` | Vòng lặp và render (`engine.ts`), input, mức chất lượng, vị trí mặt trời. |
| `src/scene/` | Dựng cảnh: hồ + kim tự tháp + tượng + Arc (`plaza.ts`), mặt tiền module (`facades.ts`), bầu trời / mặt trời / mưa / hậu cảnh Paris (`environment.ts`), đám đông (`crowd.ts`), overlay đáp án (`overlay.ts`), texture procedural (`textures.ts`). |
| `src/gameplay/` | Thuật toán đáp án (`answers.ts`), va chạm 2D/3D (`collision.ts`), người chơi đi bộ + bay (`player.ts`), máy ảnh và chụp (`photo.ts`), thư viện IndexedDB (`gallery.ts`), đồng hồ bài tập (`session.ts`). |
| `src/ui/` | HUD, bản đồ nhỏ, khung ngắm, thư viện, vẽ A/V, xuất trang tổng hợp, màn hình vào, điều khiển cảm ứng, panel giảng viên, menu. |
| `tests/` | Vitest cho đáp án. |
| `scripts/evidence.mjs` | Playwright: chụp ảnh bằng chứng cho từng màn. |

Hệ toạ độ: mặt bằng `x` hướng đông (Sully), `y` hướng bắc (Richelieu), gốc ở tâm kim tự tháp. Three.js: `X = x`, `Z = -y`, `Y` hướng lên. Trục quảng trường lệch 20,2° so với hướng đông thật, dùng để đặt mặt trời đúng giờ Paris.

## Đã làm theo milestone

- **M1** mặt bằng từ `scene.config.json`, đi bộ 1,4 / 4 m/s, fly cam 1-15 m/s có quán tính, va chạm (hồ, kim tự tháp, tường, tượng, cột đèn, hộp bao khi bay), bản đồ nhỏ có hình nón tầm nhìn theo tiêu cự, 5 điểm dịch chuyển trung tính, 4 điểm nhìn cửa sổ, test đáp án tự động.
- **M2** khung ngắm full-frame giả lập: 5 tiêu cự (vFOV = 2·atan(12/f)), 4 tỷ lệ khung, lưới 1/3 / chéo / tâm, thước cân bằng (Z/X nghiêng máy), độ cao máy 0,3-2,0 m, chụp 1800 px sạch giao diện, nhãn "drone, độ cao…" / "chụp được ngoài đời (cửa sổ…)", metadata đầy đủ, màn trập + tiếng tách, thư viện 20 ảnh/nhóm trong IndexedDB.
- **M3** màn hình vào (tên nhóm, hình mẫu, 30 giây), đồng hồ đếm ngược với 2 mốc nhắc (60 % và 80 % thời lượng), khoá chụp + 1 phút xuất bài, vẽ A nét liền / V nét đứt / chấm đỏ / ghi chú, xuất PNG từng ảnh và trang tổng hợp; chế độ giảng viên (PIN, thời gian 5/10/15, đám đông, bay, ánh sáng, overlay 5 đáp án xanh + T1/T2 + V phối cảnh vàng, nút "đến vị trí", 3 tư thế ảnh mẫu với "đến góc này" và thanh trượt so sánh, thêm ảnh mẫu lúc chạy).
- **M4** mặt tiền module (vòm cửa, cột đôi, cửa sổ, lan can, mái mansard, dormer, ống khói, tượng, pavilion có mái vòm) bằng InstancedMesh; kim tự tháp khung thép lưới thoi 17 hàng, kính transmission (mức cao) / env map (trung, thấp); nước phản chiếu planar (cao) / env map; đài phun particle; 3 preset ánh sáng theo vị trí mặt trời thật của Paris; mưa; hậu cảnh Tuileries, tháp Eiffel, vòng quay đúng hướng; đám đông instanced; 3 mức chất lượng tự chọn theo thiết bị; tải dần (hồ + kim tự tháp trước, mặt tiền và hậu cảnh sau); bloom (cao); deploy Vercel, noindex.

## Hướng dẫn trong game

Lần đầu vào, một vòng tròn vàng ở mũi hồ trong phía bắc (vị trí 1, một góc V + A thật) là **checkpoint**. Đi tới đó, nét xanh hiện ngay trong cảnh 3D: hai bờ hồ (V) và hai sống kim tự tháp (A). Game dẫn qua 6 bước có kiểm tra điều kiện thật: giơ máy, chọn 16 mm, canh cho hai huy hiệu **A** và **V** trên khung ngắm cùng sáng, chụp, mở thư viện, vẽ A và V. Sau đó còn 4 góc để tự tìm; chỉ gợi ý nhỏ khi đứng gần mũi hồ 90°. "Bỏ qua" tắt hướng dẫn (lưu trong trình duyệt).

## Bảng điều khiển giảng viên (server)

- Link: `/admin.html` trên cùng domain (ví dụ https://louvre-va-photo-game.vercel.app/admin.html). Nhập mã admin (giữ riêng, xem tin nhắn bàn giao hoặc bảng `lva_settings` trong Supabase).
- Hiện: bản đồ trực tiếp vị trí mọi thiết bị (3 giây/lần), trạng thái, thời gian còn lại, điểm, góc V+A, Easter egg, câu trả lời cuối; bấm nhóm để xem ảnh (kèm nét vẽ, ghi chú); nút xoá bảng cho lớp mới.
- Backend: Supabase project `an-fine-fabrics` (bảng `lva_devices`, `lva_photos`, `lva_results`, `lva_settings`, bucket riêng `lva-photos`). Thiết bị chỉ ghi qua 3 hàm `lva_presence`, `lva_photo`, `lva_result` (SECURITY DEFINER) và upload vào bucket; không đọc được gì bằng key công khai. Dashboard đọc qua edge function `lva-admin` với header `x-admin-token`.
- Mỗi thiết bị có `device_id` riêng (localStorage) nên ảnh và kết quả của hai nhóm trùng tên trên hai máy không lẫn nhau. Ảnh gửi lên server là JPEG 1200 px; bản gốc 1800 px vẫn ở trình duyệt.

## Luồng bài 15 phút

1. Màn hình vào: ảnh thật từ cửa sổ Sully với A, V, chấm đỏ tự vẽ; 2 ví dụ Easter egg X và C.
2. Vào sân: hướng dẫn 6 bước tại góc V+A thật, **chưa tính giờ**.
3. Popup "Hướng dẫn kết thúc" rồi bấm bắt đầu 15 phút (bỏ qua hướng dẫn thì tính giờ ngay).
4. Sau 5 phút, nút 💡 Gợi ý (1 lần): dịch chuyển tới góc V+A chuẩn, máy đã canh sẵn, chỉ việc chụp.
5. Hết giờ: câu hỏi "có bao nhiêu góc hội tụ đủ V và A" (đáp án 5, +100), kết quả gửi server, 1 phút xuất bài.

## Lớp game

- **Huy hiệu bố cục** trên khung ngắm: A sáng khi đỉnh và đáy kim tự tháp trong khung; V sáng khi đứng sát mũi hồ, nhìn theo đường phân giác, bờ hồ chụm về đáy khung. Cả hai sáng: "V + A, chụp đi!".
- **Điểm và sao** mỗi ảnh: +10 chụp, +20 A, +20 V, +5 cân bằng, +5 đỉnh ở 1/3 trên, +30 V + A ở góc chuẩn, +50 lần đầu khám phá góc đó, +15 góc tranh luận, +15 khi vẽ xong và ghi chú. 3 sao từ 80 điểm.
- **Khám phá** 5 góc V + A chuẩn, hiện trên HUD (`⭐ điểm · góc V+A n/5`), lưu theo tên nhóm.
- **Nóng / lạnh**: sau 4 phút mà chưa tìm được 2 góc, HUD hiện 🔥 / 🌡 / ❄️ theo khoảng cách tới góc chưa khám phá gần nhất.
- **Easter egg**: giàn giáo trùng tu với thanh chéo Saint-André (chữ X) ở đầu tây cánh Richelieu, cổng Métro Art Nouveau kiểu Guimard (chữ C) gần lối vào tây nam. Đưa vào khung khi chụp: huy hiệu vàng sáng, +40 mỗi cái lần đầu.
- **Tổng kết** khi hết giờ: điểm, số góc, số ảnh; thư viện gắn nhãn V+A và sao; trang tổng hợp ghi kèm.

Màn hình vào có animation vẽ A, V, chấm đỏ lặp lại để học viên hiểu quy ước trước khi chơi.

## Vẽ lên ảnh

A và V là **đường thẳng 2 điểm**: kéo một lần để đặt, kéo đầu mút (chấm trắng) để chỉnh. Không vẽ tự do nên nét không méo. Chấm đỏ kéo được. Hoàn tác, xoá nét, lưu, tải PNG.

## Điều khiển máy ảnh

Bật máy: `C` hoặc chuột phải (điện thoại: nút 📷). Máy ảnh hiện trong tay ở góc dưới phải khi chưa bật, giơ lên khi bật.
Zoom: con lăn chuột, phím `1`-`5`, hoặc pinch 2 ngón trên điện thoại (bước qua 16 / 24 / 35 / 50 / 85 mm).
`T` đổi tỷ lệ khung, `L` đổi lưới, `Z`/`X` nghiêng máy, `Space` chụp. `Esc` thả chuột để bấm nút trên khung ngắm.

## Bố cục cảnh

Theo ảnh trên cao: sân chữ U với 3 pavilion mỗi cánh (Turgot, Richelieu, Colbert / Mollien, Denon, Daru), Pavillon de l'Horloge (Sully) ở đông, Cour Carrée phía sau; cánh Rohan-Marsan và Flore kéo dài về tây tới Pavillon de Marsan / Flore; Place du Carrousel có vòng xuyến, bãi cỏ hình thoi và kim tự tháp ngược; vườn Carrousel có hàng rào xanh, bãi cỏ và hàng cây dẫn tới Arc du Carrousel; mái kính trên các sân trong Marly, Puget, Visconti. Bầu trời là shader riêng (gradient + mặt trời + mây sprite) với 4 preset: trời xanh nhiều mây (mặc định), hoàng hôn, trời mây mưa, nắng trưa.

Người đi bộ là hình người 6 phần (đầu, thân, 2 tay, 2 chân) có chu kỳ bước, tránh bán kính 3,5 m quanh 21 mũi hồ, điểm xuất phát và checkpoint.

## Điện thoại

Nút ⛶ bật toàn màn hình (Android/Chrome). iPhone: Chia sẻ → Thêm vào MH chính, mở từ icon sẽ chạy toàn màn hình (manifest `display: fullscreen`). Đã chặn chọn chữ / copy khi đè giữ, chặn pinch-zoom trang, vùng vuốt nhìn nằm dưới hàng nút trên cùng nên Thư viện / Menu luôn bấm được.

## Hiệu năng khi bay

Bay trên 12 m: tắt pass phản chiếu nước (nhìn từ trên không thấy khác), bóng chỉ cập nhật mỗi 3 khung, đám đông được cull theo một bounding sphere, màu NPC chỉ upload một lần.

## Tải và hiệu năng

Trang tĩnh trên CDN Vercel, không backend. Test 30 thiết bị vào cùng lúc: xem [`production/qa/loadtest.md`](production/qa/loadtest.md).

## Khác với spec (ghi rõ để làm tiếp)

- Texture và bầu trời là **procedural** (canvas + Sky shader của Three.js), chưa dùng KTX2 / HDRI Poly Haven. Dung lượng tải cả game ≈ 240 KB gzip, dưới ngân sách 15 MB rất xa.
- **Giống 100 % ngoài đời** không đạt được bằng hình khối procedural. Mặt tiền hiện dựng đúng nhịp: vòm rustic tầng trệt, cột đôi, cửa sổ có pediment tam giác / cung xen kẽ, tượng trên lan can, tầng áp mái, dentil, mái mansard có dormer, pavilion có cửa vòm lớn và mái vòm. Muốn chính xác từng phù điêu phải thay `src/scene/facades.ts` bằng một trong hai nguồn: (a) mô hình 3D Louvre có bản quyền sử dụng (Sketchfab / CGTrader, định dạng glTF, nạp bằng `GLTFLoader`), hoặc (b) bản quét Gaussian Splatting (spec M5). Hồ, kim tự tháp, va chạm và đáp án vẫn lấy từ `scene.config.json` nên không đổi.
- Chưa có 3 **ảnh kết quả mẫu thật** của giảng viên (không có trong repo). Ba tư thế máy đã khai báo trong config kèm ghi chú giả định; giảng viên gắn ảnh thật qua panel (lưu IndexedDB) rồi dùng thanh trượt so sánh. Kiểm tra lệch ≤ 2 % cần ảnh thật để đo.
- Kích thước cánh nhà, tượng, Arc là ước lượng như spec cho phép; nhịp cửa 5,6 m. Cần đo lại theo ảnh tham chiếu khi có.
- SSAO và bóng cascaded chưa bật (bloom + PCFSoft 4096 ở mức cao).
- Không dùng repo Claude-Code-Game-Studios làm khung (mục "Cách dùng" của spec là quy trình, không phải tính năng game); cấu trúc `src/core`, `src/gameplay`, `src/ui`, `assets/data`, `production/qa/evidence` giữ theo luật đó.

## Bản quyền

Dữ liệu mặt bằng © OpenStreetMap contributors (ODbL). Kim tự tháp Louvre (I. M. Pei) còn bản quyền kiến trúc ở Pháp: dùng nội bộ lớp học, phi thương mại, trang đặt `noindex`.
