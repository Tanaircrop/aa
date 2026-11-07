
# Spec: Louvre V+A Photo Game
2026-11-07 · @TÂN
## Tổng quan
Game chụp ảnh góc nhìn thứ nhất chạy trên trình duyệt, đặt trong quảng trường Cour Napoléon (Louvre), dùng cho bài tập nhóm 10 phút tìm bố cục V + A. Mở link là chơi, không cài đặt, chạy được trên điện thoại.
- 
Mục tiêu sư phạm: học viên tự di chuyển, canh khung và chụp được ảnh có chữ A (cạnh sống kim tự tháp) và chữ V (đường dẫn hội tụ) cùng lúc, rồi giải thích đỉnh V dẫn mắt vào đâu.
- 
Người chơi: học viên lớp nhiếp ảnh, nhóm 3-4 người dùng chung 1 điện thoại hoặc laptop.
- 
Ưu tiên số 1 là bối cảnh đúng thật nhất có thể. Mặt bằng hồ và kim tự tháp lấy từ dữ liệu thật (OpenStreetMap), mặt tiền dựng đúng nhịp cửa và các pavilion, vật liệu PBR, ánh sáng hoàng hôn, kính và nước phản chiếu. Nhẹ là ưu tiên thứ hai, giải quyết bằng tải dần theo mức chi tiết.
- 
Phạm vi MVP: 1 màn (quảng trường), đi bộ và bay tự do (fly cam), chế độ máy ảnh, chụp và lưu ảnh, xuất ảnh nộp bài, chế độ giảng viên có overlay đáp án và ảnh kết quả mẫu.
- 
Ngoài phạm vi MVP: nhiều người chơi, tài khoản, chấm điểm tự động. Bản quét 3D (Gaussian Splatting) để dành cho M5 nếu có bản quét được phép dùng.
## Cách dùng với Claude Code Game Studios + Fable
Chạy repo ở modes.rigor: minimal, ép mọi agent dùng Fable, lấy spec này làm brief một trang, rồi đi vòng /create-stories → /dev-story ↔ /story-done. Chọn minimal vì chính tác giả repo đã đo: bản standard viết 30 tài liệu trước dòng code đầu tiên nhưng bị xếp hạng thấp nhất (README).
- 
Clone repo làm khung dự án:
```

```

- 
Ép toàn bộ agent chạy Fable. Repo khai báo sẵn: 3 director dùng Opus, lead-programmer và 15 specialist dùng Sonnet, 30 agent còn lại theo model của phiên. Biến môi trường CLAUDE_CODE_SUBAGENT_MODEL được ưu tiên hơn frontmatter của agent (tham khảo), nên chạy:
```

```

- 
Tải spec này về dạng Markdown, lưu vào design/louvre-va-spec.md.
- 
Chạy /start: chọn "clear design", rigor minimal. Engine: Three.js trên web, không dùng Godot, Unity hay Unreal. Nếu /setup-engine không có lựa chọn web thì bỏ qua bước đó và nói rõ trong /start là dùng Three.js + Vite.
- 
Chạy /create-stories trỏ vào design/louvre-va-spec.md, rồi lặp /dev-story ↔ /story-done theo milestone ở mục Nghiệm thu.
- 
Repo hỏi duyệt trước khi ghi file. Muốn nhanh hơn thì nâng modes.automation qua /settings.
Lưu ý: story nào đổi thứ người chơi nhìn thấy chỉ được đóng khi game đã chạy thật và có ảnh chụp màn hình trong production/qa/evidence/. Đây là luật của repo, giữ nguyên. Chọn Three.js thay Godot vì bản web của Godot phải tải cả engine, nặng và khởi động chậm trên điện thoại; Three.js chỉ vài trăm KB.
## Bối cảnh 3D
Dựng quảng trường Cour Napoléon theo tỷ lệ 1 đơn vị = 1 m. Mặt bằng hồ và kim tự tháp lấy từ OpenStreetMap, mặt tiền dựng hình khối thật chứ không chỉ dán texture. Hệ toạ độ mặt bằng: gốc ở tâm kim tự tháp, x hướng đông (cánh Sully), y hướng bắc (cánh Richelieu). Trục quảng trường lệch khoảng 20° so với hướng đông thật, dùng số này để đặt mặt trời đúng giờ thật. Trong Three.js: X = x, Z = −y, Y hướng lên.
Quy luật mặt bằng: hình vuông lồng hình thoi lồng hình vuông. Vùng hồ là một hình vuông cạnh khoảng 76 m; nối trung điểm 4 cạnh của nó thành hình thoi; 4 góc kim tự tháp nằm gần đúng trên trung điểm 4 cạnh hình thoi. 7 hồ tam giác lấp các khoảng: 3 hồ trong áp mặt bắc, đông, nam của kim tự tháp; 2 hồ góc trọn (đông bắc, đông nam); 2 hồ nửa góc (tây bắc, tây nam). Phía tây không có hồ (Wikipedia). 3 kim tự tháp nhỏ đứng ngay ngoài trung điểm cạnh bắc, đông, nam, xoay 45°. Mọi mũi hồ đều là 45° hoặc 90°.
Đối tượng
Kích thước
Ghi chú
Kim tự tháp lớn
đáy 35 m, cao 21,6 m
Kính trong, khung lưới hình thoi (Louvre). OSM đo cạnh 36,6 m: căn lại theo ảnh
3 kim tự tháp nhỏ
đáy 7,9 m, cao 5 m
Xoay 45° so với kim tự tháp lớn (OSM)
7 hồ tam giác + đài phun
thành hồ cao 0,5 m, lối đi giữa hồ khoảng 2,5 m
Toạ độ ở khối JSON bên dưới (OSM). Thành hồ đá granite xám bo tròn, nước tràn mép
Cánh Richelieu (bắc), Sully (đông), Denon (nam)
ước lượng cao 25-30 m tới đỉnh mái
Dựng hình khối thật: vòm cửa tầng trệt, cột đôi, cửa sổ, lan can, mái mansard, ống khói, tượng trên mái. Pavilion Richelieu, Sully (Horloge), Denon chi tiết nhất
Tượng Louis XIV
ước lượng cao 6 m cả bệ
Phía tây, trước kim tự tháp
Arc du Carrousel
ước lượng cao 19 m
Phía tây, lệch trục so với kim tự tháp (Louvre)
Cột đèn
cao 4 m
Dọc các cánh nhà, đặt theo ảnh
Nền đá lát
toàn quảng trường
Hoa văn vuông và tam giác theo hình khối kim tự tháp
Hậu cảnh
skybox
Vườn Tuileries, tháp Eiffel, vòng quay, đúng hướng thật
Người đi bộ
50-100 NPC
Đi chậm, có nút bật/tắt đám đông
- 
Ràng buộc quan trọng nhất: hồ và kim tự tháp nhỏ phải khớp toạ độ JSON. Sai góc hồ là mất chữ V và sai luôn đáp án.
- 
Ảnh tham chiếu: lưu tất cả vào design/reference/ (ảnh gốc, 3 ảnh đánh dấu V + A, các ảnh kết quả mẫu của giảng viên).
- 
Kiểm tra độ thật: mỗi ảnh mẫu gắn với một tư thế máy (vị trí, hướng, tiêu cự). Render game tại tư thế đó rồi đặt chồng lên ảnh thật bằng thanh trượt. Lệch chân trời, kim tự tháp nhỏ hay mũi hồ quá 2% chiều rộng khung là phải sửa.
- 
Ánh sáng: 3 preset khớp với ảnh mẫu: hoàng hôn, trời mây mưa, nắng trưa. Mặt trời đặt theo hướng thật của Paris.
- 
Dữ liệu: toạ độ OSM chính xác khoảng 1 m, giấy phép ODbL, phải ghi "© OpenStreetMap contributors" trong màn credit. Các số "ước lượng" còn lại cần đo theo ảnh.
Hình học khởi tạo cho assets/data/scene.config.json (đơn vị mét, theo hệ toạ độ mặt bằng ở trên):
```

```

## Điều khiển và di chuyển
Có 2 chế độ di chuyển. Đi bộ: góc nhìn thứ nhất, mắt ở độ cao 1,6 m, đi 1,4 m/s, chạy 4 m/s. Bay (fly cam): bay tự do để học viên sáng tạo góc từ trên cao. Chơi được bằng bàn phím lẫn cảm ứng, tự nhận thiết bị để hiện đúng bộ điều khiển.
Thao tác
Máy tính
Điện thoại
Đổi đi bộ ↔ bay
Phím F
Nút bay
Di chuyển
WASD hoặc phím mũi tên
Joystick ảo góc trái dưới
Xoay góc nhìn
Click vào cảnh để khoá chuột, rồi rê chuột
Vuốt nửa phải màn hình
Chạy hoặc bay nhanh
Giữ Shift
Nút tăng tốc
Lên / xuống (khi bay)
E / Q
2 nút lên, xuống bên phải
Nâng / hạ máy (khi đi bộ)
E / Q
Thanh trượt dọc bên phải
Tốc độ bay
Con lăn chuột
Thanh trượt trong menu
Bật máy ảnh
Chuột phải hoặc phím C
Nút máy ảnh
Chụp
Space hoặc click (khi đang bật máy ảnh)
Nút chụp tròn
Bản đồ nhỏ
Phím M
Nút bản đồ
- 
Fly cam: bay tự do 6 hướng, tốc độ 1-15 m/s, độ cao 0,3-60 m (cao hơn mái nhà để chụp toàn cảnh). Có quán tính nhẹ cho mượt như drone. Không xuyên tường, mái, kim tự tháp. Chuyển về đi bộ thì hạ êm xuống mặt sân.
- 
Nhãn ảnh: ảnh chụp khi bay gắn nhãn "drone" kèm độ cao. Ảnh chụp ở tầm người đứng hoặc từ một cửa sổ có thật gắn nhãn "chụp được ngoài đời". Giảng viên nhìn nhãn là biết khi chấm.
- 
Giảng viên tắt được chế độ bay khi muốn bài chỉ cho đi bộ.
- 
Va chạm: không đi xuyên kim tự tháp, tường nhà, tượng, cột đèn. Thành hồ chặn lại, không rơi xuống nước. Khi đi bộ, va chạm làm bằng đa giác 2D nhìn từ trên; khi bay, dùng hộp bao đơn giản cho từng khối nhà.
- 
Phạm vi: đi bộ trong Cour Napoléon tới vòng xuyến trước Arc du Carrousel; bay trong hộp 200 × 200 m quanh kim tự tháp. Ra khỏi ranh giới thì bị chặn mềm.
- 
Bản đồ nhỏ: góc trên phải, hiện vị trí, hướng nhìn, độ cao và hình nón tầm nhìn theo tiêu cự đang chọn.
- 
Điểm dịch chuyển nhanh: 5 điểm trung tính ở rìa quảng trường. Không đặt trùng 5 vị trí đáp án, không thì lộ đáp án.
- 
Điểm nhìn từ cửa sổ: các cửa sổ tầng trên ở cánh Sully, Richelieu, Denon, khớp với tư thế máy của các ảnh mẫu.
## Chế độ máy ảnh
Bật máy ảnh là màn hình thành khung ngắm của máy full-frame giả lập: chọn tiêu cự, bật lưới, chỉnh độ cao, chụp, rồi vẽ V + A ngay trên ảnh vừa chụp.
Tiêu cự và góc nhìn. Quy đổi theo cảm biến 36 × 24 mm, dùng góc nhìn dọc (f tính bằng mm):
```

```

Tiêu cự
vFOV
Dùng cho
16 mm
73,7°
Góc rộng, chữ V xòe mạnh
24 mm
53,1°
Mặc định
35 mm
37,8°
Gần mắt người
50 mm
27,0°
Nén hậu cảnh
85 mm
16,1°
Chân dung, cô lập chủ thể
- 
Khung ngắm: tỷ lệ 3:2 (mặc định), 4:5, 1:1, 16:9. Vùng ngoài khung tối mờ.
- 
Lưới: 1/3, đường chéo, tâm khung. Bật tắt từng loại.
- 
Thước cân bằng: hiện độ nghiêng chân trời, xanh khi lệch dưới 1°.
- 
Độ cao máy: từ 0,3 m (sát đất) tới 2,0 m (giơ cao), hiện số trên khung ngắm. Đây là nút quan trọng nhất để học viên thấy chữ V bờ hồ thay đổi ra sao.
- 
Chụp: render đúng vùng trong khung ra ảnh 1800 × 1200 px (theo tỷ lệ đang chọn), không dính giao diện. Kèm metadata: vị trí, hướng nhìn, tiêu cự, độ cao máy, giờ chụp, tên nhóm. Có hiệu ứng màn trập và tiếng tách.
- 
Thư viện: tối đa 20 ảnh mỗi nhóm, lưu trong trình duyệt (IndexedDB), xem lại và xoá được.
- 
Công cụ vẽ trên ảnh: nét liền đỏ cho chữ A, nét đứt đỏ cho chữ V, chấm đỏ cho vị trí chủ thể, cộng ô ghi chú 1 câu. Hoàn tác và xoá nét được.
- 
Xuất bài: tải từng ảnh PNG đã vẽ, hoặc một trang tổng hợp tất cả ảnh kèm ghi chú để nộp.
- 
Người mẫu (sau MVP): một ma-nơ-canh kéo thả được vào cảnh để đặt đúng chấm đỏ.
## Gameplay bài tập V + A
Một lượt chơi là một bài tập nhóm 10 phút: vào game, đi tìm, chụp ít nhất 2 góc có V + A, vẽ lên ảnh, rồi xuất bài nộp. Game không tự chấm điểm; giảng viên chấm theo lập luận.
Luồng của học viên
- 
Màn hình vào: nhập tên nhóm, xem hình mẫu V + A trong 30 giây, đọc quy ước (A nét liền, V nét đứt, chấm đỏ là chủ thể).
- 
Đồng hồ đếm ngược 10:00. Nhắc ở phút 6 ("chuyển sang vẽ") và phút 8 ("chuẩn bị trình bày").
- 
Đi, bật máy ảnh, chụp. Thanh nhiệm vụ hiện số ảnh đã chụp và số ảnh đã vẽ xong.
- 
Vẽ A, V, chấm đỏ và ghi 1 câu cho từng ảnh.
- 
Hết giờ: khoá chụp, còn 1 phút để xuất trang tổng hợp.
Chế độ giảng viên (mở bằng ?mode=teacher kèm mã PIN)
- 
Chỉnh thời gian bài (5, 10 hoặc 15 phút), bật tắt đám đông, bật tắt chế độ bay, đổi ánh sáng (hoàng hôn, trời mây mưa, nắng trưa).
- 
Overlay đáp án trong cảnh 3D: 5 vị trí chuẩn vẽ A, V và chấm đỏ màu xanh lá. T1, T2 và V phối cảnh về Arc du Carrousel vẽ màu vàng "để tranh luận". Chi tiết ở mục Đáp án chuẩn.
- 
Nút "đến vị trí" để đưa camera tới từng đáp án khi chữa bài trên máy chiếu.
- 
Ảnh kết quả mẫu: bản đầu có 3 ảnh của giảng viên (hoàng hôn từ trên cao, trời mưa từ trên cao, sát mép hồ góc siêu rộng), đóng gói sẵn trong assets/reference/. Mỗi ảnh gắn một tư thế máy. Bấm "đến góc này" là camera bay tới đúng tư thế, kèm thanh trượt so sánh ảnh thật với render.
- 
Thêm ảnh mẫu mới: giảng viên đứng ở tư thế máy mong muốn rồi gắn ảnh vào. Ảnh thêm lúc chạy lưu trong trình duyệt của giảng viên.
- 
Camera bay tự do để trình chiếu toàn cảnh.
Sau MVP
- 
Gợi ý tự động: khi đang ngắm, game kiểm tra đỉnh kim tự tháp có trong khung không và các cạnh hồ có hội tụ không, rồi hiện huy hiệu "Có A", "Có V".
- 
Thư viện chung cả lớp (cần backend, ngoài phạm vi MVP).
## Đáp án chuẩn: 5 vị trí
Tính trên mặt bằng thật, quảng trường có 21 mũi hồ. 5 mũi cho V + A chuẩn, 2 mũi để tranh luận, 14 mũi bị loại.
Luật tính: V là 2 bờ hồ chụm lại ở một mũi, A là kim tự tháp lớn. Một mũi đạt chuẩn khi đứng ở mũi đó, nhìn theo đường phân giác, thì cả đáy kim tự tháp nằm trọn trong lòng chữ V.

Mặt bằng dựng từ toạ độ OpenStreetMap. Chấm xanh 1-5 là vị trí chuẩn, chấm vàng T1, T2 là vị trí tranh luận, mũi tên là hướng nhìn.
#
Vị trí (x, y)
Mũi hồ
Nhìn về
Kim tự tháp trong khung
Tiêu cự gợi ý
1
(0, 36), sát kim tự tháp nhỏ N
Đỉnh hồ trong N, 90°
Nam
Chính diện, đối xứng
16-20 mm
2
(36, 0), sát kim tự tháp nhỏ E
Đỉnh hồ trong E, 90°
Tây, hậu cảnh Arc du Carrousel
Chính diện, đối xứng
16-20 mm
3
(0, -36), sát kim tự tháp nhỏ S
Đỉnh hồ trong S, 90°
Bắc
Chính diện, đối xứng
16-20 mm
4
(38, 37), góc đông bắc
Góc vuông hồ NE, 90°
Tây nam
Chéo, sống kim tự tháp ở giữa khung
24-35 mm
5
(37, -38), góc đông nam
Góc vuông hồ SE, 90°
Tây bắc
Chéo, sống kim tự tháp ở giữa khung
24-35 mm
- 
Vì sao vị trí 1-3 cần 16-20 mm: đứng ở đỉnh hồ trong, đáy kim tự tháp trải 90° trước mặt, mà kim tự tháp nhỏ ngay sau lưng chỉ cho lùi 3 m. Ở 24 mm sẽ mất 2 góc đáy; vẫn dùng được nếu chỉ cần phần trên chữ A.
- 
Vì sao bài trên ảnh ra 3 mà trong game ra 5: ảnh gốc chụp từ cửa sổ cánh Sully, chỉ thấy được V ở vị trí 1, 2, 3. Vị trí 4, 5 là góc vuông của hồ góc: nhìn từ trên cao chỉ thấy một góc vuông, phải đứng sát mép nhìn chéo vào kim tự tháp mới thành V. Đây là điểm dạy hay để nói khi chữa bài.
- 
Để tranh luận (3): T1 và T2 là góc ngoài của 2 hồ nửa (tây bắc, tây nam), 45°: kim tự tháp chỉ nằm một nửa trong lòng V vì góc kim tự tháp nằm ngay trên một cạnh V. Thêm V phối cảnh của 2 dãy nhà hội tụ về Arc du Carrousel: có V nhưng không phải V của hồ.
- 
Bị loại (14): 6 mũi 45° chạm góc đáy kim tự tháp (kim tự tháp thành một cạnh của V), 6 mũi 45° ở trung điểm cạnh ngoài (V mở sang ngang, không chứa kim tự tháp), 2 góc vuông của hồ nửa (V mở ra ngoài, kim tự tháp sau lưng).
- 
Ảnh mẫu của giảng viên: ảnh sát mép hồ góc siêu rộng có bố cục của vị trí 1-3, nhiều khả năng là vị trí 2. Ảnh trời mưa nhìn từ trên cao xuống hồ trong N, tức vị trí 1 bản trên cao. Ảnh hoàng hôn cần gắn tư thế máy mới xác định được.
- 
Kiểm tra tự động: viết một test đọc scene.config.json, tính lại 21 mũi hồ theo luật trên và phải ra đúng 5 chuẩn, 2 tranh luận. Ai chỉnh toạ độ hồ mà làm đổi đáp án thì test báo đỏ.
## Kỹ thuật
Three.js + TypeScript + Vite, build ra trang tĩnh, deploy lên Vercel, không cần backend. Ưu tiên chân thực: laptop chạy chất lượng cao mặc định, điện thoại chạy mức trung. Tải dần: vào game nhanh với mức chi tiết thấp, rồi nạp chi tiết cao trong nền.
Hạng mục
Laptop (cao)
Điện thoại (trung)
Dung lượng tải để vào game
≤ 15 MB
≤ 15 MB
Tổng dung lượng khi đã nạp đủ chi tiết
≤ 80 MB
≤ 35 MB
Thời gian vào game qua 4G
≤ 10 giây
≤ 10 giây
FPS
≥ 60
≥ 30
Draw call mỗi khung
≤ 400
≤ 150
Tam giác trong tầm nhìn
≤ 2 triệu
≤ 400.000
Texture lớn nhất
4096 px, nén KTX2
2048 px, nén KTX2
- 
Mặt tiền: bộ module (vòm cửa, cửa sổ, cột đôi, lan can, mái mansard, ống khói, tượng) lắp theo đúng nhịp cửa thật đếm từ ảnh. Phần lặp dùng InstancedMesh, 3 mức LOD. Tượng dùng mesh thật ở gần, billboard ở xa.
- 
Kim tự tháp: dựng thật khung thép lưới thoi, mỗi mặt 17 hàng thoi cộng viền tam giác (Wikipedia). Kính dùng transmission trên laptop, env map trên điện thoại.
- 
Vật liệu: đá vôi vàng nhạt, mái đá phiến xanh đen, kẽm, granite xám thành hồ, đá lát sân. Chỉ dùng texture và HDRI giấy phép CC0 (Poly Haven, ambientCG), không dùng ảnh có bản quyền làm texture.
- 
Nước hồ: phản chiếu phẳng (planar) trên laptop, env map trên điện thoại. Nước tràn mép thành hồ, đài phun làm bằng particle.
- 
Ánh sáng: mặt trời theo giờ và ngày thật của Paris, tính cả độ lệch 20° của quảng trường. HDRI bầu trời cho 3 preset. Bóng mềm nhiều tầng (cascaded) trên laptop.
- 
Hậu kỳ: tone mapping ACES, bloom nhẹ, SSAO trên laptop.
- 
Đám đông: InstancedMesh, chuyển động đơn giản, không dùng nhiều nhân vật có xương.
- 
3 mức chất lượng: thấp, trung, cao. Tự chọn theo thiết bị, đổi được trong menu.
- 
Ảnh chụp: render ra render target riêng đúng kích thước ảnh, luôn ở mức chất lượng cao nhất máy chịu được, kể cả khi màn hình đang chạy mức thấp.
- 
Lưu trữ: IndexedDB trên trình duyệt. Không tài khoản, không thu thập dữ liệu cá nhân.
- 
Trình duyệt: Chrome, Edge, Safari iOS 16 trở lên. Test kỹ Safari trên iPhone.
- 
Cấu trúc code theo luật của repo: logic game ở src/gameplay/, vòng lặp và render ở src/core/, giao diện ở src/ui/, số liệu cảnh ở assets/data/scene.config.json. Không hard-code số đo trong code.
- 
Deploy: Vercel, mỗi lần push tạo một link preview để thử trên điện thoại.
- 
Bản quyền và credit: kim tự tháp Louvre (I. M. Pei) còn bản quyền kiến trúc ở Pháp: dùng nội bộ lớp học, không thương mại, đặt noindex. Ghi "© OpenStreetMap contributors" cho dữ liệu mặt bằng.
- 
M5 (tuỳ chọn): nếu có bản quét 3D được phép dùng, thay mặt tiền bằng Gaussian Splatting; hồ, kim tự tháp và va chạm vẫn giữ theo JSON để đáp án không đổi.
## Milestone và nghiệm thu
Làm theo 4 milestone, mỗi cái chạy được và test được trên điện thoại trước khi sang cái kế. Độ thật là ưu tiên số 1 nên game đưa vào lớp sau M4. M5 là tuỳ chọn.
- 
M1. Mặt bằng đúng và đi lại: cảnh khối xám dựng từ scene.config.json, đi bộ và bay, va chạm, bản đồ nhỏ, điểm nhìn cửa sổ, test đáp án tự động.
- 
M2. Máy ảnh: khung ngắm, 5 tiêu cự, lưới, thước cân bằng, độ cao máy, chụp, nhãn "drone", thư viện.
- 
M3. Bài tập và giảng viên: màn hình vào, đồng hồ 10 phút, công cụ vẽ, xuất trang tổng hợp, overlay đáp án, ảnh kết quả mẫu kèm thanh trượt so sánh.
- 
M4. Chân thực: mặt tiền module, khung kính kim tự tháp, vật liệu, nước, 3 preset ánh sáng, đám đông, 3 mức chất lượng, đạt ngân sách hiệu năng, khớp ảnh mẫu, deploy Vercel.
- 
M5. Tuỳ chọn: mặt tiền bằng Gaussian Splatting nếu có bản quét được phép dùng.
Checklist nghiệm thu cuối
- 
Laptop giữ 60 fps ở mức cao. iPhone và Android tầm trung vào game trong 10 giây, giữ 30 fps ở mức trung.
- 
Tại tư thế máy của từng ảnh mẫu, render khớp ảnh thật: chân trời, kim tự tháp nhỏ và mũi hồ lệch không quá 2% chiều rộng khung.
- 
Test đáp án tự động ra đúng 5 vị trí chuẩn và 2 mũi hồ tranh luận.
- 
Tại cả 5 vị trí chuẩn, chụp được ảnh thấy rõ cả V và A với tiêu cự gợi ý.
- 
Fly cam bay mượt, không xuyên nhà, ảnh chụp khi bay có nhãn "drone" và độ cao.
- 
Ảnh chụp không dính giao diện, đúng tỷ lệ khung, có đủ metadata.
- 
Vẽ được A, V, chấm đỏ và ghi chú; xuất được trang tổng hợp.
- 
Chế độ giảng viên hiện 5 đáp án màu xanh, 3 trường hợp tranh luận màu vàng, và 3 ảnh mẫu có nút "đến góc này".
- 
Đồng hồ 10 phút và 2 mốc nhắc chạy đúng.
- 
Mỗi story có ảnh bằng chứng trong production/qa/evidence/.
- 
Một nhóm 3-4 người chơi thử và hoàn thành bài trong 10 phút.
## Prompt khởi động cho Claude Code
Dán prompt này sau khi đã chạy /start và đặt spec vào design/louvre-va-spec.md, ảnh tham chiếu vào design/reference/.
```

```
