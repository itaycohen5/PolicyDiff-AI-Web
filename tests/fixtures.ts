// A tiny text PDF with valid offsets. Quotes and backslashes are escaped as PDF literals.
export function textPdf(lines: string[]) {
  const text = lines.map((line, index) => (index ? "0 -20 Td " : "") +
    "(" + line.replace(/[()\\]/g, "\\$&") + ") Tj").join("\n");
  const stream = "BT /F1 11 Tf 50 700 Td\n" + text + "\nET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(stream) + " >>\nstream\n" + stream + "endstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, index) => {
    const offset = Buffer.byteLength(pdf);
    pdf += (index + 1) + " 0 obj\n" + body + "\nendobj\n";
    return offset;
  });
  const start = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n" + offsets.map((offset) =>
    String(offset).padStart(10, "0") + " 00000 n \n").join("") +
    "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + start + "\n%%EOF\n";
  return Buffer.from(pdf);
}
