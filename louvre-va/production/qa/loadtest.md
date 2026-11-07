# Load test: 30 thiết bị vào cùng lúc

Ngày 2026-11-07, chạy từ Vercel Sandbox (vùng cdg1, Paris) tới https://louvre-va-photo-game.vercel.app.

Game là trang tĩnh (HTML + CSS + JS, 885 KB chưa nén, ~240 KB gzip) trên CDN của Vercel.
Không có backend, không có database: mỗi thiết bị tự chạy game trên GPU của nó, server chỉ phát file.

## Kết quả

| Kịch bản | Kết quả |
|---|---|
| 30 thiết bị tải đủ 4 file cùng lúc (120 request đồng thời từ 1 IP) | 30/30 thiết bị nhận đủ 4 × HTTP 200, 884 739 byte mỗi thiết bị, xong trong ~1,1 s mỗi thiết bị |
| 300 request HTML trong ~2 s, 50 luồng, từ 1 IP | 134 × 200, 166 × 403 `x-vercel-mitigated: challenge` |
| Lặp lại 30 thiết bị ngay sau đợt 300 request | 0/4 (403) trong khoảng 60 giây, IP bị chống DDoS tạm chặn |

## Kết luận

- 20-30 thiết bị vào cùng lúc: thoải mái. Lớp học trên cùng Wi-Fi (cùng 1 IP công cộng) với 30 máy × 4 file = 120 request đã test, không bị chặn.
- Giới hạn thật là hệ thống chống DDoS mặc định của Vercel: bắn hàng trăm request/giây từ 1 IP sẽ bị thử thách (403 challenge) vài chục giây. Người dùng thật không tới mức đó; nếu lớp 100+ máy cùng F5 một lúc thì cân nhắc tắt Attack Challenge Mode hoặc bật rule "allow" cho dải IP trường trong Vercel Firewall.
- Nút cổ chai thực tế là máy của học viên (GPU, bộ nhớ), không phải server. Điện thoại tầm trung chạy mức "trung", máy yếu chọn mức "thấp" trong Menu.
