# Hợp đồng cột: Sheet Recap ↔ Web Support Insights

> File này được sinh tự động từ `src/lib/schema/fields.ts` (`npm run contract`). Đừng sửa tay.

Bên ghi dữ liệu vào sheet cần giữ đúng các quy tắc sau:

- Hàng 1 là tên cột, **đúng tên trong cột "Tên cột"** bên dưới. Thứ tự cột không quan trọng. Cột thừa sẽ bị bỏ qua.
- Mỗi hàng là **một ticket**, khoá duy nhất là `session_id`. Nếu trùng session, web giữ hàng nằm dưới cùng.
- Trường **bắt buộc** (`*`) để trống thì hàng vẫn được nhận nhưng bị đánh dấu lỗi ở trang *Chất lượng dữ liệu*.
- Giá trị dạng danh sách không phân biệt hoa thường. Giá trị ngoài danh sách vẫn hiển thị nhưng bị cảnh báo và không được tính vào ô thống kê tương ứng.
- Mọi thời gian ghi theo **giờ Việt Nam**.

Tổng cộng **57 trường**.

## Thông tin cơ bản

| Tên cột | Tên hiển thị | Kiểu | Giá trị cho phép / ví dụ | Mô tả |
|---|---|---|---|---|
| `recap_at_vn` * | Thời gian recap | Ngày giờ VN (`2026-09-14 10:49` hoặc `12:23 13/04/2026`) | vd. `2026-09-14 10:49` | Thời điểm ghi recap, giờ Việt Nam. Dùng làm mốc lọc thời gian của toàn bộ web. |
| `shift` | Ca | Chữ | vd. `8-11` | Ca làm việc. |
| `shift_lead` | Shift lead | Chữ | vd. `Marcel Oketch` | Shift lead của ca. |
| `triggered_by` * | Người handle | Chữ | vd. `Eli Nguyen` | Người note recap (FL handle ticket). |

## Thông tin khách hàng

| Tên cột | Tên hiển thị | Kiểu | Giá trị cho phép / ví dụ | Mô tả |
|---|---|---|---|---|
| `store_domain` * | Store domain | Chữ | vd. `loganstore.myshopify.com` | Domain myshopify của store. Nếu cột cũ dạng "Tên · domain" web tự tách.<br>Tên cũ vẫn nhận: `store` |
| `store_name` | Tên store | Chữ | vd. `loganstore` | Tên store. |
| `pagefly_plan` | Plan PageFly | Chữ | vd. `24 slot` | Plan PageFly hiện tại.<br>Tên cũ vẫn nhận: `plan` |
| `pagefly_price` | Giá plan ($) | Số | vd. `24` | Chi phí plan hiện tại, USD/tháng. Chỉ ghi số.<br>Tên cũ vẫn nhận: `plan_price` |
| `shopify_plan` | Plan Shopify | Chữ | vd. `Basic` | Plan Shopify. |
| `timezone` | Múi giờ | Chữ | vd. `Asia/Ho_Chi_Minh` | Múi giờ hoạt động chính của khách (IANA).<br>Tên cũ vẫn nhận: `time/zone`, `time_zone` |
| `country` | Quốc gia | Chữ | vd. `United States` | Quốc gia của store. |
| `type_user` | Loại khách | Một giá trị trong danh sách | `Khách vãng lai`, `Khách đã sử dụng` | Khách vãng lai (chưa dùng app) hay khách đã sử dụng PageFly. |
| `tenure` | Thời gian dùng app | Chữ | vd. `5 năm` | Đã dùng app bao lâu. |
| `time_install` | Ngày cài app | Ngày (`2026-09-24`) | vd. `2019-09-24` | Ngày cài đặt app. |
| `time_uninstall` | Ngày gỡ app | Ngày (`2026-09-24`) | vd. `2026-09-30` | Ngày gỡ app, để trống nếu chưa gỡ. |
| `max_slot` | Số slot tối đa | Số | vd. `5` | Số slot (trang) tối đa của plan. Ghi "unlimited" nếu không giới hạn. |
| `total_pages` | Tổng số trang | Số | vd. `12` | Tổng số trang PageFly của store. |
| `num_pages_publish` | Trang đã publish | Số | vd. `4` | Số trang đang publish. |
| `num_section_publish` | Section đã publish | Số | vd. `3` | Số section đang publish. |
| `discount_code` | Mã giảm giá | Chữ | vd. `263PHE20` | Mã giảm giá đã cấp cho khách (nếu có). |
| `app_review` | Review App Store | Chữ | vd. `5s sau khi support` | Trạng thái review trên Shopify App Store. Nếu review sau khi support thì ghi "5s sau khi support".<br>Tên cũ vẫn nhận: `already_reviewed` |
| `app_review_content` | Nội dung review App | Chữ dài | vd. `Support rất nhanh` | Nội dung review trên App Store. |
| `crisp_review` | Review Crisp | Chữ | vd. `5s crisp` | Đánh giá trong Crisp.<br>Tên cũ vẫn nhận: `crips_review` |
| `crisp_review_content` | Nội dung review Crisp | Chữ dài | vd. `Sản phẩm tốt` | Nội dung đánh giá Crisp.<br>Tên cũ vẫn nhận: `crips_review_content` |

## Thông tin ticket

| Tên cột | Tên hiển thị | Kiểu | Giá trị cho phép / ví dụ | Mô tả |
|---|---|---|---|---|
| `category_ticket` * | Loại ticket | Một giá trị trong danh sách | `Feedback`, `Issue`, `Improve` | Feedback = góp ý · Issue = vấn đề khách gặp · Improve = chức năng khách muốn có.<br>Tên cũ vẫn nhận: `category` |
| `category_issue` | Nhóm issue | Một giá trị trong danh sách | `Editor`, `Style`, `Section`, `Font`, `Media`, `Animation`, `Sticky`, `Popup`, `Form`, `Mobile/Responsive`, `Flymate`, `Publish`, `Page management`, `Page size`, `Performance`, `SEO/Accessibility`, `Markets/Localization`, `Theme`, `3rd App`, `ATC`, `Cart`, `Product data`, `Analytics/Tracking`, `A/B Testing`, `Billing`, `Plan`, `Credit`, `Refund`, `Affiliate`, `Bug`, `Consultation/How-to`, `Login/Account`, `Free service`, `Unclear/Internal`, `Other` | Phân loại danh mục issue. Web tự gom vào 7 khu vực lớn (Editor & thiết kế, Publish & trang, Theme & tích hợp, Thanh toán & gói, Lỗi sản phẩm, Tư vấn & tài khoản, Khác).<br>Tên cũ vẫn nhận: `issue_area` |
| `page_issue` | Trang gặp vấn đề | Một giá trị trong danh sách | `Multi`, `Regular Page`, `Home Page`, `Product Page`, `Collection Page`, `Blog Page`, `Contact Page`, `Password Page`, `Unidentified` | Loại trang gặp vấn đề. Nhiều loại thì ghi Multi. |
| `issue_summary` * | Tóm tắt issue | Chữ dài | vd. `Flymate lỗi không build được` | Mô tả ngắn gọn issue, tối đa 50 ký tự. |
| `type_issue` | Loại xử lý | Một giá trị trong danh sách | `dev_note`, `normal` | dev_note nếu issue đã có segment dev_note từ trước, ngược lại normal. |
| `priority` | Mức ưu tiên | Một giá trị trong danh sách | `Urgent`, `High`, `Normal` | Urgent / High / Normal. |
| `team_owner` | Team phụ trách | Một giá trị trong danh sách | `CS`, `Dev`, `Billing/Refund`, `Marketing`, `Partner`, `Free service` | Team chịu trách nhiệm xử lý tiếp. |

## Thông tin xử lý

| Tên cột | Tên hiển thị | Kiểu | Giá trị cho phép / ví dụ | Mô tả |
|---|---|---|---|---|
| `escalated` | Chuyển TS | `Yes` / `No` | vd. `Yes` | Có chuyển sang TS không: Yes / No. |
| `name_pic` | PIC | Nhiều giá trị, ngăn bằng dấu phẩy | vd. `Eli, Hew` | Tên người handle, nhiều người ngăn bằng dấu phẩy. |
| `role_pic` | Vai trò PIC | Nhiều giá trị, ngăn bằng dấu phẩy | `FL`, `TS`, `Dev` | Bộ phận người handle (FL, TS, Dev), có thể kết hợp. |
| `time_cx_contact` | Khách contact lúc | Ngày giờ VN (`2026-09-14 10:49` hoặc `12:23 13/04/2026`) | vd. `12:23 13/04/2026` | Thời điểm khách gửi tin đầu tiên. |
| `time_pic_reply` | PIC phản hồi lúc | Ngày giờ VN (`2026-09-14 10:49` hoặc `12:23 13/04/2026`) | vd. `12:25 13/04/2026` | Thời điểm phản hồi khách lần đầu. |
| `time_pic_support_join` | TS/Dev join lúc | Ngày giờ VN (`2026-09-14 10:49` hoặc `12:23 13/04/2026`) | vd. `12:40 13/04/2026` | Thời điểm TS hoặc Dev join (lấy từ note TS start nếu có). |
| `time_pic_solution` | Đưa solution lúc | Ngày giờ VN (`2026-09-14 10:49` hoặc `12:23 13/04/2026`) | vd. `13:05 13/04/2026` | Thời điểm FL hoặc TS đưa ra solution. |
| `total_time_handle_fl` | Thời gian handle FL | Khoảng thời gian `ngày-giờ-phút-giây` (`0-02-15-30`) | vd. `0-00-42-10` | FL: từ lúc khách hỏi đến khi khách đồng ý solution. Định dạng ngày-giờ-phút-giây.<br>Tên cũ vẫn nhận: `total_time_handle` |
| `total_time_handle_ts` | Thời gian handle TS | Khoảng thời gian `ngày-giờ-phút-giây` (`0-02-15-30`) | vd. `0-00-22-27` | TS: từ note TS start đến note TS solution. Để trống nếu không có TS. Định dạng ngày-giờ-phút-giây. |
| `total_time_ticket` | Tổng thời gian ticket | Khoảng thời gian `ngày-giờ-phút-giây` (`0-02-15-30`) | vd. `0-01-15-00` | Từ tin nhắn đầu của khách đến tin nhắn cuối của FL. Định dạng ngày-giờ-phút-giây. |
| `time_pic_max_reply` | Lâu nhất để trả lời | Khoảng thời gian `ngày-giờ-phút-giây` (`0-02-15-30`) | vd. `0-00-12-30` | Khoảng chờ dài nhất giữa tin khách và tin trả lời của FL. Định dạng ngày-giờ-phút-giây. |
| `root_cause` | Nguyên nhân gốc | Chữ | vd. `do theme` | Nguyên nhân cốt lõi. |
| `resolution` | Kết quả xử lý | Một giá trị trong danh sách | `Đã resolved`, `Hết ca vẫn chưa giải quyết`, `Đợi TS check`, `Đợi dev check`, `Ticket cần dev note`, `Cần buy time`, `Chờ khách phản hồi` | Vấn đề đã được giải quyết hay chưa. |
| `feedback_cx_solution` | Khách phản hồi solution | Một giá trị trong danh sách | `Good`, `Tệ`, `Chưa fix cần kiểm tra lại`, `Chưa phản hồi` | Khách phản hồi ngay về solution. |
| `review_verdict` | Thời điểm mời review | Một giá trị trong danh sách | `QUALIFIED`, `RIPE`, `NOT_YET`, `DO_NOT_ASK` | QUALIFIED / RIPE = đủ điều kiện mời review · NOT_YET = chưa đến lúc · DO_NOT_ASK = không nên mời. |
| `review_pic` | Đánh giá PIC | Chữ dài | vd. `Tốt, giải thích rõ ràng` | Đánh giá thái độ làm việc của PIC: tốt hay cần cải thiện gì, giải thích có rõ không, khách có phải hỏi lại nhiều lần không. |
| `csat` | CSAT | Một giá trị trong danh sách | `Tốt`, `Khá`, `Trung bình`, `Tệ` | Mức hài lòng của khách với cách xử lý (Haiku tự đo). Nhận cả thang 1–5: 5 = Tốt, 4 = Khá, 3 = Trung bình, 1–2 = Tệ. |
| `mood_label_cx` | Mood khách | Một giá trị trong danh sách | `Excited`, `Happy`, `Neutral`, `Worried`, `Frustrated`, `Angry` | Trạng thái cảm xúc của khách.<br>Tên cũ vẫn nhận: `mood_label` |
| `mood_label_cx_end_to_end` | Mood đầu → cuối | Chữ | vd. `Neutral->Happy` | Mood lúc mới contact -> sau khi xử lý, ngăn bằng "->" hoặc "→". Ghi một giá trị (vd "happy") nghĩa là mood không đổi suốt ticket; "no-signal" = không đủ tín hiệu.<br>Tên cũ vẫn nhận: `mood_label_end_to_end`, `mood_end_to_end` |
| `review_ticket` | Nhận xét ticket | Chữ dài | vd. `Khách cảm ơn, đã mời review` | Mô tả ngắn gọn trạng thái ticket.<br>Tên cũ vẫn nhận: `review_note` |
| `upsell_signal` | Tín hiệu upsell | Chữ dài | vd. `Có, khách gói 24$ build nhiều nên lên 69$` | Có upsell được không và nên upsell thế nào. Không có thì ghi "Không". |
| `churn_risk` | Nguy cơ rời bỏ | `Yes` / `No` | vd. `No` | Yes / No. |
| `next_action` | Hành động tiếp theo | Chữ dài | vd. `Follow up sau 24h` | Việc tiếp theo phía mình cần làm. |
| `session_id` * | Session ID | Chữ | vd. `session_3452f782-…` | Session ID Crisp. Dùng làm khoá duy nhất của ticket. |
| `ticket_url` | Link ticket | Link | vd. `https://app.crisp.chat/…` | Link Crisp. |
| `review_asked` | Đã hỏi review | Chữ | vd. `FL đã hỏi` | "Đã có review từ trước" · "FL đã hỏi" · "Khách vui vẻ nhưng FL quên hỏi" · "Không phù hợp để hỏi". |
