# PageFly Support Insights: thiết kế

Ngày: 2026-10-08 · Trạng thái: đã build bản đầu (chạy local)

## Mục tiêu
Web nội bộ cho khoảng 150 người (CS, Dev, Marketing, Partner). Dữ liệu đọc từ sheet Recap. Phục vụ: insight phát triển app, tìm khách tiềm năng (upsell), chất lượng support, hiệu suất FL/TS/Dev.

## Quyết định đã chốt với người dùng
| # | Quyết định |
|---|---|
| 1 | Web **chỉ đọc** sheet; một bên khác ghi dữ liệu vào sheet. |
| 2 | Sheet mới theo schema anh/chị mô tả (49 trường, đã bỏ `ts`) + 2 trường thêm `priority`, `team_owner`. Trong lúc sheet chưa có cột mới, dùng dữ liệu giả lập đúng schema. |
| 3 | Chưa cần đăng nhập. |
| 4 | Số liệu do code tính; nhận định do Claude Haiku viết (`claude-haiku-4-5`). |
| 5 | Báo cáo xem trên web và có nút xuất Excel. |
| 6 | Chạy local trước, deploy sau. |
| 7 | Phần còn lại: người dùng giao tôi tự quyết theo hướng "chuẩn doanh nghiệp". |

## Quyết định kỹ thuật tôi tự chọn
- **Next.js 16 full-stack** (App Router, Cache Components), tính toán trong bộ nhớ, cache sheet 5 phút. Không dùng database ở giai đoạn này. Lớp `getDataset()` được tách riêng để sau này thay bằng database mà không phải sửa UI.
- **Hợp đồng cột là nguồn duy nhất** (`src/lib/schema/fields.ts`). Tài liệu cho bên ghi sheet, trang Chất lượng dữ liệu và bảng Chi tiết đều sinh từ đây.
- **Không bỏ dòng sai một cách âm thầm**: dòng sai vẫn được nhận, nhưng hiện trong trang Chất lượng dữ liệu.
- **Một session = một ticket**: sheet thật có 1.443 dòng nhưng chỉ 888 session vì một ticket được recap nhiều lần. Web giữ recap mới nhất và ghi lại số lần recap.
- **Bậc xử lý** (dùng cho các ô "FL tự xử lý / TS / Cần Dev") được suy ra: có Dev trong `role_pic`, hoặc kết quả là *Đợi dev check / Ticket cần dev note*, hoặc `team_owner = Dev` → **Dev**. Có TS hoặc `escalated = Yes` → **TS**. Còn lại → **FL**.
- **Compare**: so với khoảng liền trước có cùng số ngày, cho phép tự chọn kỳ khác. Ngưỡng báo động xem README.
- **Báo cáo**: cột "Thay đổi" so sánh 2 kỳ đã đủ ngày gần nhất, không so kỳ đang chạy dở.
- **AI**: server tự tính lại số liệu từ bộ lọc; đầu ra JSON theo schema; cache 6 giờ; báo lỗi rõ ràng khi thiếu key, key sai hoặc bị rate limit.
- **Màu biểu đồ**: Feedback, Issue, Improve dùng 3 màu đã chạy validator mù màu trên nền tối (CVD ΔE ≥ 9.4). Các phần còn lại dùng một tông violet duy nhất theo style guide.

## Điểm còn mở (cần người dùng xác nhận)
1. Định nghĩa `review_verdict` (đang hiểu là RIPE / NOT_YET / DO_NOT_ASK, cần hỏi Eli).
2. Ngưỡng báo động có phù hợp thực tế không.
3. "Số lượng reply trung bình của mỗi FL": sheet không có số tin nhắn reply, nên đang hiểu là số ticket trung bình mỗi FL xử lý. Nếu cần đếm reply thật thì phải thêm cột `reply_count`.
4. Phân quyền khi bật đăng nhập: team nào được xem `review_pic` và hiệu suất cá nhân.
