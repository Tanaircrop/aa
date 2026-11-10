# lva-admin

Edge function phục vụ bảng điều khiển giảng viên (`/admin.html`). Triển khai với `verify_jwt = false`; xác thực bằng header `x-admin-token` so với `lva_settings.admin_token`.

| action | method | trả về |
|---|---|---|
| `overview` | GET | thiết bị 6 giờ gần nhất, kết quả, số ảnh |
| `photos&device_id=` | GET | ảnh một thiết bị kèm signed URL 1 giờ |
| `all_photos` | GET | toàn bộ ảnh lớp hiện tại (tối đa 2000) cho chấm điểm tự động |
| `reset&confirm=yes` | POST | xoá bảng cho lớp mới |
