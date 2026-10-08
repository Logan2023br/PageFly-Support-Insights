// Gộp tên nhân sự: mỗi người chỉ hiển thị MỘT tên.
//
// Tự động: tên một chữ (vd. "Eli") gộp vào tên đầy đủ DUY NHẤT bắt đầu bằng chữ đó ("Eli Nguyen").
// Không phân biệt hoa/thường. Nếu có ≥ 2 tên đầy đủ cùng bắt đầu bằng chữ đó thì không tự gộp.
//
// Thủ công: khai báo bên dưới khi cần gộp trường hợp tự động không bắt được, hoặc chọn tên hiển thị.
// Khoá = tên viết trong sheet (không phân biệt hoa/thường), giá trị = tên muốn hiển thị.
export const NAME_ALIASES: Record<string, string> = {
  // "Eli": "Eli Nguyen",
};

/** Giá trị không phải tên người, giữ nguyên, không gộp. */
export const NOT_A_PERSON = ["dev team", "tony (affiliate)"];
