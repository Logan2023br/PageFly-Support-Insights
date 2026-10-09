import "server-only";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatVnDateTime } from "@/lib/data/parse";
import { ARCHIVE_GRAIN_LABEL } from "./periods";
import type { ReportSnapshot, SnapshotMetric, SnapshotTable } from "./snapshot";

// Font có đủ dấu tiếng Việt (Be Vietnam Pro, SIL OFL — assets/fonts/OFL.txt).
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
Font.register({
  family: "BeVietnamPro",
  fonts: [
    { src: path.join(FONT_DIR, "BeVietnamPro_400Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "BeVietnamPro_600SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(FONT_DIR, "BeVietnamPro_700Bold.ttf"), fontWeight: 700 },
  ],
});
// Không ngắt từ giữa chừng (tiếng Việt không có quy tắc gạch nối).
Font.registerHyphenationCallback((word) => [word]);

const C = {
  ink: "#1b1530",
  body: "#3d3654",
  muted: "#77708f",
  faint: "#a59fba",
  line: "#e6e2f0",
  soft: "#f6f4fb",
  primary: "#6c3cf0",
  good: "#13875f",
  bad: "#c8372d",
  warn: "#b7791f",
};

const s = StyleSheet.create({
  page: { fontFamily: "BeVietnamPro", fontSize: 8.5, color: C.body, paddingTop: 36, paddingBottom: 44, paddingHorizontal: 36 },
  band: { backgroundColor: C.ink, borderRadius: 10, padding: 18, marginBottom: 14 },
  eyebrow: { color: "#b9a4ff", fontSize: 7.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: "#ffffff", fontSize: 19, fontWeight: 700, marginTop: 4 },
  subtitle: { color: "#d8d2ee", fontSize: 9, marginTop: 4 },
  meta: { color: "#a59fba", fontSize: 7.5, marginTop: 8 },
  h2: { fontSize: 11.5, fontWeight: 700, color: C.ink, marginTop: 14, marginBottom: 6 },
  note: { fontSize: 7.5, color: C.muted, marginBottom: 5, marginTop: -3 },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { width: "31.8%", borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 9 },
  cardLabel: { fontSize: 7.5, color: C.muted, fontWeight: 600 },
  cardValue: { fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 3 },
  cardFoot: { fontSize: 7.2, color: C.faint, marginTop: 3 },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line },
  th: { backgroundColor: C.soft, fontSize: 7, fontWeight: 600, color: C.muted, textTransform: "uppercase", paddingVertical: 5, paddingHorizontal: 6 },
  td: { fontSize: 8, paddingVertical: 4.5, paddingHorizontal: 6 },
  section: { backgroundColor: C.soft, color: C.primary, fontSize: 7.5, fontWeight: 700, textTransform: "uppercase", paddingVertical: 4, paddingHorizontal: 6 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.faint },
});

const toneColor = (m: SnapshotMetric) => (m.tone === "good" ? C.good : m.tone === "bad" ? C.bad : C.muted);
const alertText = (m: SnapshotMetric) => (m.alert === "critical" ? "Báo động" : m.alert === "warning" ? "Cần theo dõi" : m.tone === "good" ? "Tốt lên" : "");

function ReportDoc({ r }: { r: ReportSnapshot }) {
  const grain = ARCHIVE_GRAIN_LABEL[r.period.grain].toLowerCase();
  return (
    <Document title={`Báo cáo ${grain} ${r.teamTitle} · ${r.period.label}`} author="PageFly Insights" subject={`Báo cáo ${r.teamTitle}`}>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.eyebrow}>PageFly Support Insights · Báo cáo {grain}</Text>
          <Text style={s.title}>
            {r.teamTitle} · {r.period.label}
          </Text>
          <Text style={s.subtitle}>
            Kỳ báo cáo {r.period.from.split("-").reverse().join("/")} – {r.period.to.split("-").reverse().join("/")} · so với {r.previous.label} · Dành cho {r.audience}
          </Text>
          <Text style={s.meta}>
            {r.totals.tickets} ticket · {r.totals.stores} store (kỳ trước {r.totals.prevTickets} ticket) · {r.auto === false ? "Tạo thủ công" : "Tạo tự động"} lúc {formatVnDateTime(r.generatedAt)} · Nguồn: {r.sourceLabel}
          </Text>
        </View>

        <Text style={s.h2}>Chỉ số chính</Text>
        <View style={s.cards}>
          {r.headline.map((m) => (
            <View key={m.label} style={[s.card, m.alert === "critical" ? { borderColor: "#f1b5b0" } : {}]} wrap={false}>
              <Text style={s.cardLabel}>{m.label}</Text>
              <Text style={s.cardValue}>{m.current}</Text>
              <Text style={s.cardFoot}>
                {m.delta ? <Text style={{ color: toneColor(m), fontWeight: 600 }}>{m.delta} </Text> : null}
                kỳ trước {m.previous}
                {m.alert ? <Text style={{ color: m.alert === "critical" ? C.bad : C.warn, fontWeight: 600 }}> · {alertText(m)}</Text> : null}
              </Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Toàn bộ chỉ số</Text>
        <View style={s.table}>
          <View style={s.tr} fixed>
            {["Chỉ số", "Kỳ này", "Kỳ trước", "Thay đổi", "Đánh giá"].map((h, i) => (
              <Text key={h} style={[s.th, { flex: i === 0 ? 3 : 1.1, textAlign: i === 0 ? "left" : "right" }]}>
                {h}
              </Text>
            ))}
          </View>
          {r.sections.map((sec) => (
            <View key={sec.title}>
              <Text style={s.section}>{sec.title}</Text>
              {sec.metrics.map((m) => (
                <View key={m.label} style={s.tr} wrap={false}>
                  <Text style={[s.td, { flex: 3, color: C.ink, fontWeight: 600 }]}>{m.label}</Text>
                  <Text style={[s.td, { flex: 1.1, textAlign: "right", color: C.ink, fontWeight: 600 }]}>{m.current}</Text>
                  <Text style={[s.td, { flex: 1.1, textAlign: "right" }]}>{m.previous}</Text>
                  <Text style={[s.td, { flex: 1.1, textAlign: "right", color: toneColor(m) }]}>{m.delta ?? "—"}</Text>
                  <Text style={[s.td, { flex: 1.1, textAlign: "right", color: m.alert === "critical" ? C.bad : m.alert ? C.warn : C.good, fontWeight: 600 }]}>{alertText(m)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {r.tables.map((t) => (
          <PdfTable key={t.title} t={t} />
        ))}

        <View style={s.footer} fixed>
          <Text>
            PageFly Insights · {r.teamTitle} · {r.period.label}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Trang ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function PdfTable({ t }: { t: SnapshotTable }) {
  const widths = t.widths ?? t.columns.map(() => 1);
  return (
    <View>
      <View wrap={false}>
        <Text style={s.h2}>{t.title}</Text>
        {t.note ? <Text style={s.note}>{t.note}</Text> : null}
      </View>
      {t.rows.length ? (
        <View style={s.table}>
          <View style={s.tr} fixed>
            {t.columns.map((c, i) => (
              <Text key={i} style={[s.th, { flex: widths[i] }]}>
                {c}
              </Text>
            ))}
          </View>
          {t.rows.map((row, ri) => (
            <View key={ri} style={[s.tr, ri === t.rows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              {row.map((cell, ci) => (
                <Text key={ci} style={[s.td, { flex: widths[ci] }, ci === 0 ? { color: C.ink, fontWeight: 600 } : {}]}>
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 8, color: C.faint }}>Kỳ này không có dữ liệu.</Text>
      )}
    </View>
  );
}

export function renderReportPdf(r: ReportSnapshot): Promise<Buffer> {
  return renderToBuffer(<ReportDoc r={r} />);
}
