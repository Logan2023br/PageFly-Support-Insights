# PageFly Support Insights

Web nội bộ đọc sheet Recap (ticket FL tự xử lý và ticket chuyển TS), rồi hiển thị thống kê, danh sách chi tiết và báo cáo theo team cho CS, Dev, Marketing, Partner.

## Chạy local

```bash
npm install
cp .env.example .env.local   # điền ANTHROPIC_API_KEY, chọn DATA_SOURCE
npm run dev                  # http://localhost:3000
```

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy dev |
| `npm run build && npm start` | Chạy bản production |
| `npm test` | Test lõi (parse, chuẩn hoá, kỳ so sánh, luật báo động) |
| `npm run typecheck` / `npm run lint` | Kiểm tra kiểu / lint |
| `npm run contract` | Sinh lại `docs/sheet-contract.md` và `docs/sheet-header.csv` từ schema |

## Nguồn dữ liệu

- `DATA_SOURCE=mock`: dữ liệu giả lập đúng 49 cột trong hợp đồng, dùng khi sheet chưa có đủ cột.
- `DATA_SOURCE=sheet` + `SHEET_ID`: đọc sheet thật. Có 2 cách đọc:
  - **Service Account** (khuyến nghị): đặt `GOOGLE_SERVICE_ACCOUNT_EMAIL` và `GOOGLE_SERVICE_ACCOUNT_KEY`, rồi share sheet quyền Viewer cho email đó.
  - **CSV công khai**: không cần credential, nhưng sheet phải bật "Anyone with the link can view".
- Trang tự cập nhật **mỗi 30 giây** (giữ nguyên bộ lọc, tạm dừng khi tab bị ẩn). Server đọc sheet tối đa 30 giây/lần và dùng chung cho mọi người xem, nên 150 người mở cùng lúc vẫn chỉ đọc sheet 1 lần. Đổi bằng `DATA_CACHE_SECONDS` và `NEXT_PUBLIC_AUTO_REFRESH_SECONDS`. Nút **Đồng bộ ngay** để tải lại tức thì.
- Header sheet cũ (`store`, `plan`, `category`, `issue_area`, `mood_label`, …) vẫn được nhận nhờ alias.
- Một `session_id` được recap nhiều lần sẽ gộp thành **1 ticket**, giữ recap mới nhất.

Bên ghi dữ liệu cần làm theo **[docs/sheet-contract.md](docs/sheet-contract.md)**. Hàng tiêu đề để dán vào sheet mới nằm ở `docs/sheet-header.csv`.

## Màn hình

| Menu | Nội dung |
|---|---|
| **Thống kê** `/` | Lọc thời gian (hôm nay / 7 / 30 / 90 ngày / toàn bộ / tuỳ chọn), tab All·Feedback·Issue·Improve, ô KPI (bấm để xem bản tóm tắt + danh sách), tóm tắt ticket / FL / khách hàng, biểu đồ, nhận định AI, **Compare** |
| **Chi tiết** `/tickets` | Bảng 49 cột (6 bộ cột), tìm kiếm, 23 bộ lọc có đếm số, sắp xếp, ngăn chi tiết ticket, xuất Excel/CSV đúng bộ lọc |
| **Báo cáo** `/reports/{cs,dev,marketing}` | Bảng chỉ số theo tuần / tháng / quý / toàn bộ kiểu spreadsheet, các bảng danh sách, nhận định AI, xuất Excel nhiều sheet |
| **Khách hàng** `/customers` | Mỗi store là một khách: số lần liên hệ, khách mới / quay lại, nhóm khách (Nguy cơ cao, Cần chăm sóc, Tiềm năng upsell, Ổn định), biểu đồ đường theo thời gian, phân bố plan / khu vực / thời gian dùng app. Bấm vào store để xem hồ sơ, điểm sức khoẻ kèm lý do, upsell, việc cần làm tiếp và lịch sử mọi lần liên hệ |
| **Đội ngũ** `/team` | 2 nút **Front-line** / **Technical**: Điểm chất lượng 0–100 của team, biểu đồ đường theo ngày/tuần/tháng (chọn chỉ số), bảng xếp hạng có sparkline. Bấm vào tên để xem chi tiết từng người: điểm, hạng, đường cá nhân so với trung bình team, điểm mạnh / cần cải thiện, nhận xét PIC, ticket |
| **Chất lượng dữ liệu** `/data-quality` | Cột thiếu/lạ, dòng sai định dạng, tỷ lệ điền từng trường, hợp đồng cột |

Mọi bộ lọc nằm trên URL, nên gửi link là người nhận thấy đúng màn hình đó.

## Đăng nhập & tài khoản

- Mọi trang và API đều cần đăng nhập bằng **username + mật khẩu**. Người chưa đăng nhập bị chuyển về `/login`, API trả 401.
- **Admin gốc** khai báo trong `.env.local`: `ADMIN_USERNAME`, `ADMIN_PASSWORD`. Tài khoản này luôn đăng nhập được, dùng để tạo các tài khoản khác.
- Menu **Tài khoản** (chỉ admin thấy): thêm, đổi mật khẩu, đổi quyền (Admin / Thành viên), xoá tài khoản. Không xoá được chính mình. Tài khoản bị xoá sẽ bị đăng xuất ở lần tải trang tiếp theo.
- Mật khẩu lưu dạng băm scrypt. Phiên đăng nhập là cookie httpOnly ký bằng `AUTH_SECRET`, kéo dài 7 ngày. Sai mật khẩu 5 lần thì khoá 10 phút.
- **Nơi lưu tài khoản**:
  - Chạy local: file `data/users.json` (không commit).
  - Trên Vercel: **bắt buộc** thêm Upstash Redis (Vercel → Storage → Upstash Redis). Bước này tự thêm `KV_REST_API_URL` và `KV_REST_API_TOKEN`. Nếu chưa thêm thì chỉ admin gốc đăng nhập được.

## Deploy lên Vercel

1. `npx vercel login`, rồi `npx vercel link`.
2. Thêm biến môi trường (Production): `AUTH_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DATA_SOURCE=sheet`, `SHEET_ID`, `SHEET_TAB`.
3. Vercel → Storage → tạo **Upstash Redis** và gắn vào project.
4. `npx vercel --prod`.

## Compare & báo động

Compare tự lấy **khoảng liền trước có cùng số ngày**: 7 ngày so với 7 ngày trước đó; 20–23 so với 16–19. Trong modal Compare có thể đổi kỳ so sánh.

Luật báo động nằm ở `judge()` trong `src/lib/metrics/compute.ts`:

- **Đếm số**: xấu đi ≥20% **và** ≥3 case → *Theo dõi*; ≥50% và ≥5 case → *Báo động*. Riêng chỉ số critical (churn, angry, urgent, refund, gỡ app, mood xấu đi) chỉ cần tăng ≥2 là *Báo động*.
- **Tỷ lệ**: xấu đi ≥5 điểm % → *Theo dõi*; ≥10 điểm % → *Báo động*.
- **Thời gian / tiền**: xấu đi ≥15% → *Theo dõi*; ≥40% → *Báo động*.

Mỗi ô có câu nhận định theo luật kèm bằng chứng (số khách gỡ app, churn, angry…). Claude Haiku viết thêm nhận định cho từng chỉ số bị báo động.

## Điểm chất lượng (Đội ngũ) & sức khoẻ khách

Công thức nằm ở `src/lib/metrics/performance.ts` và `src/lib/customers.ts`. Web hiển thị luôn công thức và từng thành phần điểm.

- **Front-line**: phản hồi đầu 25% · resolved 20% · CSAT 20% · mood kết thúc 15% · tự xử lý issue 10% · hỏi review 10%.
- **Technical**: khách chờ TS join 25% · resolved 25% · thời gian handle 20% · CSAT 15% · mood kết thúc 15%.
- Thành phần nào sheet chưa có dữ liệu thì bỏ qua và chia lại trọng số; web ghi rõ "dựa trên X/Y thành phần".
- Người có dưới 5 ticket bị đánh dấu "ít mẫu" và xếp cuối bảng.
- **Sức khoẻ khách**: bắt đầu từ 100, rồi trừ/cộng điểm:
  - churn risk −35 · đã gỡ app −30
  - mood cuối Angry −20 / Frustrated −12 / Worried −6
  - lần cuối chưa giải quyết −10/−15 · CSAT cuối Tệ −10
  - liên hệ > 2 lần trong 30 ngày: −5 mỗi lần
  - đã review 5 sao +5

## AI (Claude Haiku)

- Mọi con số do code tính. Server tự tính lại từ bộ lọc rồi mới gửi cho Haiku, trình duyệt không gửi số liệu lên.
- Đầu ra là JSON có cấu trúc (structured outputs). Kết quả cache 6 giờ theo nội dung dữ liệu, nên mở lại cùng một bộ lọc không tốn thêm tiền.
- API key chỉ nằm ở server (`.env.local`).

## Kiến trúc

```
src/lib/schema/fields.ts   Hợp đồng 49 cột: tên, kiểu, giá trị hợp lệ, alias
src/lib/data/              Đọc sheet / mock → parse → chuẩn hoá → Ticket (+ trường suy ra)
src/lib/query.ts           Bộ lọc trên URL, kỳ & kỳ so sánh, facet
src/lib/metrics/           Chỉ số (defs), so sánh & báo động (compute), FL/TS/Dev (people), tóm tắt (summaries)
src/lib/reports.ts         Định nghĩa báo cáo CS / Dev / Marketing
src/lib/ai/insights.ts     Gọi Haiku + cache
src/app/                   Các trang + API: /api/insights, /api/export, /api/refresh
```

Thêm chỉ số mới: khai báo trong `src/lib/metrics/defs.ts`, sau đó thêm key vào `TILE_SETS` (`src/lib/dashboard.ts`) hoặc `ROWS` (`src/lib/reports.ts`).

## Chưa làm (theo thống nhất)

- **Ẩn dữ liệu nhạy cảm theo quyền**: trường `review_pic` đã được gắn `sensitive`, chưa ẩn với tài khoản Thành viên.
