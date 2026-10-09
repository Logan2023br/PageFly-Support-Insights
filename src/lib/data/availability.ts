// Cột nào trong hợp đồng mà sheet hiện tại CHƯA có. Chỉ số phụ thuộc cột thiếu sẽ hiện "—" thay vì 0,
// để không bị hiểu nhầm là "không có case nào". Được cập nhật mỗi lần tải dataset.

let missing = new Set<string>();

export function setMissingFields(fields: string[]) {
  missing = new Set(fields);
}

export function missingOf(fields: readonly string[] | undefined): string[] {
  return (fields ?? []).filter((f) => missing.has(f));
}
