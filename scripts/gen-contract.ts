// Sinh docs/sheet-contract.md từ src/lib/schema/fields.ts để tài liệu luôn khớp code.
// Chạy: npm run contract
import { writeFileSync } from "node:fs";
import { FIELDS, GROUP_LABELS, type FieldGroup } from "../src/lib/schema/fields.ts";

const KIND: Record<string, string> = {
  text: "Chữ",
  longtext: "Chữ dài",
  datetime: "Ngày giờ VN (`2026-09-14 10:49` hoặc `12:23 13/04/2026`)",
  date: "Ngày (`2026-09-24`)",
  duration: "Khoảng thời gian `ngày-giờ-phút-giây` (`0-02-15-30`)",
  number: "Số",
  enum: "Một giá trị trong danh sách",
  multi: "Nhiều giá trị, ngăn bằng dấu phẩy",
  bool: "`Yes` / `No`",
  url: "Link",
};
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

let md = `# Hợp đồng cột: Sheet Recap ↔ Web Support Insights

> File này được sinh tự động từ \`src/lib/schema/fields.ts\` (\`npm run contract\`). Đừng sửa tay.

Bên ghi dữ liệu vào sheet cần giữ đúng các quy tắc sau:

- Hàng 1 là tên cột, **đúng tên trong cột "Tên cột"** bên dưới. Thứ tự cột không quan trọng. Cột thừa sẽ bị bỏ qua.
- Mỗi hàng là **một ticket**, khoá duy nhất là \`session_id\`. Nếu trùng session, web giữ hàng nằm dưới cùng.
- Trường **bắt buộc** (\`*\`) để trống thì hàng vẫn được nhận nhưng bị đánh dấu lỗi ở trang *Chất lượng dữ liệu*.
- Giá trị dạng danh sách không phân biệt hoa thường. Giá trị ngoài danh sách vẫn hiển thị nhưng bị cảnh báo và không được tính vào ô thống kê tương ứng.
- Mọi thời gian ghi theo **giờ Việt Nam**.

Tổng cộng **${FIELDS.length} trường**.
`;

for (const g of Object.keys(GROUP_LABELS) as FieldGroup[]) {
  md += `\n## ${GROUP_LABELS[g]}\n\n| Tên cột | Tên hiển thị | Kiểu | Giá trị cho phép / ví dụ | Mô tả |\n|---|---|---|---|---|\n`;
  for (const f of FIELDS.filter((x) => x.group === g)) {
    const values = f.values ? f.values.map((v) => `\`${v}\``).join(", ") : `vd. \`${esc(f.example)}\``;
    const aliases = f.headerAliases?.length ? `<br>Tên cũ vẫn nhận: ${f.headerAliases.map((a) => `\`${a}\``).join(", ")}` : "";
    md += `| \`${f.key}\`${f.required ? " *" : ""} | ${f.label} | ${KIND[f.kind]} | ${values} | ${esc(f.description)}${aliases} |\n`;
  }
}
writeFileSync(new URL("../docs/sheet-contract.md", import.meta.url), md);
// Hàng tiêu đề để dán thẳng vào hàng 1 của sheet mới.
writeFileSync(new URL("../docs/sheet-header.csv", import.meta.url), FIELDS.map((f) => f.key).join(",") + "\n");
console.log(`Wrote docs/sheet-contract.md (${FIELDS.length} fields)`);
