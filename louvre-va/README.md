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

## Khác với spec (ghi rõ để làm tiếp)

- Texture và bầu trời là **procedural** (canvas + Sky shader của Three.js), chưa dùng KTX2 / HDRI Poly Haven. Dung lượng tải cả game ≈ 240 KB gzip, dưới ngân sách 15 MB rất xa; có thể thêm PBR thật sau.
- Chưa có 3 **ảnh kết quả mẫu thật** của giảng viên (không có trong repo). Ba tư thế máy đã khai báo trong config kèm ghi chú giả định; giảng viên gắn ảnh thật qua panel (lưu IndexedDB) rồi dùng thanh trượt so sánh. Kiểm tra lệch ≤ 2 % cần ảnh thật để đo.
- Kích thước cánh nhà, tượng, Arc là ước lượng như spec cho phép; nhịp cửa 5,6 m. Cần đo lại theo ảnh tham chiếu khi có.
- SSAO và bóng cascaded chưa bật (bloom + PCFSoft 4096 ở mức cao).
- Không dùng repo Claude-Code-Game-Studios làm khung (mục "Cách dùng" của spec là quy trình, không phải tính năng game); cấu trúc `src/core`, `src/gameplay`, `src/ui`, `assets/data`, `production/qa/evidence` giữ theo luật đó.

## Bản quyền

Dữ liệu mặt bằng © OpenStreetMap contributors (ODbL). Kim tự tháp Louvre (I. M. Pei) còn bản quyền kiến trúc ở Pháp: dùng nội bộ lớp học, phi thương mại, trang đặt `noindex`.
