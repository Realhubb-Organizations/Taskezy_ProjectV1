import type { Property } from "@/context/AppContext";

// A property as an A4 PDF brochure (Properties table's download and
// WhatsApp icons), laid out like the reference brochure. Only
// client-relevant fields: no ids, team or lead-routing settings.
// jsPDF and the Inter font files (public/fonts) load on first use only.

const FONTS = [
  { file: "Inter_300Light.ttf", name: "Inter-Light" },
  { file: "Inter_400Regular.ttf", name: "Inter-Regular" },
  { file: "Inter_600SemiBold.ttf", name: "Inter-SemiBold" }
] as const;

let fontData: Promise<{ file: string; name: string; base64: string }[]> | null = null;

function loadFonts() {
  if (!fontData) {
    fontData = Promise.all(
      FONTS.map(async f => {
        const res = await fetch(`/fonts/${f.file}`);
        if (!res.ok) throw new Error(`Font ${f.file} failed to load`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
        return { ...f, base64: btoa(binary) };
      })
    ).catch(err => {
      fontData = null;
      throw err;
    });
  }
  return fontData;
}

// Layout follows the reference brochure (broucher-sample/Brochure_sample.pdf):
// off-white page, a left strip with "PROPERTY BROCHURE" set vertically
// between two hairlines, a dark circle top-right, and a narrow content
// column of uppercase section headings over small body text.
const PAGE_W = 595.28; // A4 in pt
const PAGE_H = 841.89;
const PAPER = "#F9F8F8";
const HAIRLINE = "#DCDCDC";
const CIRCLE = "#555555";
const INK = "#111111";
const BODY = "#3A3A3A";

const STRIP_LEFT = 18;
const STRIP_RIGHT = 87.5;
const COL_X = 218;
const COL_W = 305;
const BOTTOM = PAGE_H - 48;
const LINE_H = 13.5;

// "₹1.2 Cr+" -> "₹1.2 Cr onwards"
export function priceLabel(p: Property): string | undefined {
  if (!p.price) return undefined;
  return p.price.endsWith("+") ? `${p.price.slice(0, -1)} onwards` : p.price;
}

// "2027-12-31" -> "Dec 2027"
export function possessionLabel(date?: string): string | undefined {
  if (!date) return undefined;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function brochureFileName(p: Property): string {
  return `${p.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "property"}-brochure.pdf`;
}

export async function downloadPropertyBrochure(p: Property): Promise<void> {
  const doc = await buildBrochure(p);
  doc.save(brochureFileName(p));
}

export async function propertyBrochureFile(p: Property): Promise<File> {
  const doc = await buildBrochure(p);
  return new File([doc.output("blob")], brochureFileName(p), { type: "application/pdf" });
}

async function buildBrochure(p: Property) {
  const [{ jsPDF }, fonts] = await Promise.all([import("jspdf"), loadFonts()]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  for (const f of fonts) {
    doc.addFileToVFS(f.file, f.base64);
    doc.addFont(f.file, f.name, "normal");
  }

  const font = (name: (typeof FONTS)[number]["name"], size: number, color: string) => {
    doc.setFont(name, "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
  };

  // Paper, the two strip hairlines and the vertical title — on every page.
  const decoratePage = () => {
    doc.setFillColor(PAPER);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    doc.setDrawColor(HAIRLINE);
    doc.setLineWidth(0.6);
    doc.line(STRIP_LEFT, 0, STRIP_LEFT, PAGE_H - 26);
    doc.line(STRIP_RIGHT, 0, STRIP_RIGHT, PAGE_H - 26);

    const title = "PROPERTY BROCHURE";
    const size = 30;
    const span = 540; // bottom-to-top length of the title
    font("Inter-Light", size, INK);
    const natural = doc.getTextWidth(title);
    doc.setCharSpace(Math.max(0, (span - natural) / (title.length - 1)));
    // Rotated 90°: the text runs upward and its baseline is the right edge.
    doc.text(title, (STRIP_LEFT + STRIP_RIGHT) / 2 + size * 0.36, 602, { angle: 90 });
    doc.setCharSpace(0);
  };

  decoratePage();
  doc.setFillColor(CIRCLE);
  doc.circle(447, 36, 113, "F");

  let y = 180;
  const ensureSpace = (height: number) => {
    if (y + height > BOTTOM) {
      doc.addPage();
      decoratePage();
      y = 64;
    }
  };

  // ---- Title + contact ----
  font("Inter-SemiBold", 15.5, INK);
  const titleLines = doc.splitTextToSize(p.name.toUpperCase(), COL_W) as string[];
  doc.text(titleLines, COL_X, y, { lineHeightFactor: 1.2 });
  y += (titleLines.length - 1) * 18.6 + 20;

  if (p.contactNumber) {
    font("Inter-Regular", 7.5, BODY);
    doc.text("Contact Us at:", COL_X, y);
    doc.text(p.contactNumber, COL_X, y + LINE_H);
    y += LINE_H + 19;
  } else {
    y += 4;
  }

  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.6);
  doc.line(COL_X, y, COL_X + COL_W, y);
  y += 19;

  // ---- Sections ----
  const heading = (text: string) => {
    ensureSpace(40);
    font("Inter-SemiBold", 8, INK);
    doc.text(text.toUpperCase(), COL_X, y);
    y += 18;
  };
  // Justified like the reference (jsPDF leaves a block's last line ragged).
  const paragraph = (text: string) => {
    font("Inter-Regular", 7.5, BODY);
    const lines = doc.splitTextToSize(text, COL_W) as string[];
    ensureSpace(lines.length * LINE_H);
    doc.text(lines.join(" "), COL_X, y, { align: "justify", maxWidth: COL_W, lineHeightFactor: LINE_H / 7.5 });
    y += lines.length * LINE_H;
  };
  const plainLines = (items: string[]) => {
    font("Inter-Regular", 7.5, BODY);
    for (const item of items) {
      for (const line of doc.splitTextToSize(item, COL_W) as string[]) {
        ensureSpace(LINE_H);
        doc.text(line, COL_X, y);
        y += LINE_H;
      }
    }
  };
  const bullets = (items: string[]) => {
    font("Inter-Regular", 7.5, BODY);
    for (const item of items) {
      const lines = doc.splitTextToSize(item, COL_W - 14) as string[];
      ensureSpace(lines.length * LINE_H);
      doc.text("\u2022", COL_X + 3, y);
      lines.forEach((line, i) => doc.text(line, COL_X + 14, y + i * LINE_H));
      y += lines.length * LINE_H;
    }
  };
  const gap = () => {
    y += 10;
  };

  const description = p.description?.trim();
  if (description) {
    heading("Project Overview");
    description.split(/\n/).map(l => l.trim()).forEach(l => (l ? paragraph(l) : (y += 5)));
    gap();
  }

  const location = [[p.locality, p.location].filter(Boolean).join(", "), p.zone && `${p.zone} zone`].filter(Boolean) as string[];
  if (location.length) {
    heading("Location");
    plainLines(location);
    gap();
  }

  const usp = [p.landParcel, p.towers, p.structure].map(v => v?.trim()).filter(Boolean) as string[];
  if (usp.length) {
    heading("USP");
    bullets(usp);
    gap();
  }

  const amenities = (p.amenities ?? []).map(a => a.trim()).filter(Boolean);
  if (amenities.length) {
    heading("Key Features & Amenities");
    bullets(amenities);
    gap();
  }

  const price = priceLabel(p);
  const configuration = [
    price && `Starting Price: ${price}`,
    [p.type, p.propertyStatus].filter(Boolean).join(" · "),
    p.projectStatus && `Project Status: ${p.projectStatus}`,
    possessionLabel(p.possessionDate) && `Possession: ${possessionLabel(p.possessionDate)}`
  ].filter(Boolean) as string[];
  if (configuration.length) {
    heading("Configuration");
    plainLines(configuration);
    gap();
  }

  const links: [string, string][] = [];
  if (p.websiteUrl) links.push(["Website", p.websiteUrl]);
  if (p.mapUrl) links.push(["Location map", p.mapUrl]);
  if (p.brochureUrl) links.push(["Developer brochure", p.brochureUrl]);
  if (links.length) {
    heading("More Information");
    font("Inter-Regular", 7.5, BODY);
    for (const [label, url] of links) {
      ensureSpace(LINE_H);
      doc.text(`${label}:`, COL_X, y);
      const shown = (doc.splitTextToSize(url, COL_W - 80) as string[])[0];
      doc.textWithLink(shown, COL_X + 80, y, { url });
      y += LINE_H;
    }
  }

  doc.setProperties({ title: p.name, subject: `${p.name} — property brochure` });
  return doc;
}

/**
 * The same brochure as a WhatsApp message — WhatsApp's own *bold* and line
 * breaks, no emojis. Sent alone from a laptop (WhatsApp Web can't take the
 * PDF), and as the caption with the PDF on phones.
 */
export function propertyShareText(p: Property): string {
  const line = (label: string, value?: string) => (value ? `*${label}:* ${value}` : null);
  const header = [
    `*${p.name}*`,
    [p.developer && `by ${p.developer}`, [p.locality, p.location].filter(Boolean).join(", ")].filter(Boolean).join(" · ")
  ].filter(Boolean);
  const facts = [
    line("Price", priceLabel(p)),
    line("Type", [p.type, p.propertyStatus].filter(Boolean).join(" · ")),
    line("Configuration", p.structure),
    line("Possession", possessionLabel(p.possessionDate)),
    line("Land parcel", [p.landParcel, p.towers].filter(Boolean).join(" · ") || undefined)
  ].filter(Boolean);
  const amenities = (p.amenities ?? []).map(a => a.trim()).filter(Boolean);
  const amenityLine = amenities.length
    ? `*Amenities:* ${amenities.slice(0, 5).join(", ")}${amenities.length > 5 ? ` and ${amenities.length - 5} more` : ""}`
    : null;
  const links = [line("Location", p.mapUrl), line("Website", p.websiteUrl), line("Brochure", p.brochureUrl)].filter(Boolean);
  return [header.join("\n"), facts.join("\n"), amenityLine, links.join("\n")].filter(Boolean).join("\n\n");
}
