import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { CvProfile } from "./schema.js";
import { ensureDir, pdfFileName } from "./utils.js";

type RenderResult = {
  fileName: string;
  filePath: string;
  bytes: number;
};

const COLORS = {
  ink: "#263238",
  muted: "#5f6c72",
  rule: "#d7dde1",
  accent: "#1f4e79",
};

const PAGE = {
  margin: 48,
  bottom: 790,
  width: 499,
};

function monthLabel(value: string): string {
  if (value === "Present") return value;
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en", { month: "short", year: "numeric" });
}

function dateRange(start: string, end: string): string {
  return `${monthLabel(start)} - ${monthLabel(end)}`;
}

function textWidth(doc: PDFKit.PDFDocument, text: string, size: number): number {
  doc.fontSize(size);
  return doc.widthOfString(text);
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
  if (doc.y + height > PAGE.bottom) {
    doc.addPage();
    doc.y = PAGE.margin;
  }
}

function drawRule(doc: PDFKit.PDFDocument): void {
  doc
    .moveTo(PAGE.margin, doc.y)
    .lineTo(PAGE.margin + PAGE.width, doc.y)
    .lineWidth(0.6)
    .strokeColor(COLORS.rule)
    .stroke();
  doc.moveDown(0.4);
}

function section(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 34);
  doc.moveDown(0.45);
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(COLORS.accent)
    .text(title.toUpperCase(), PAGE.margin, doc.y, {
      width: PAGE.width,
      characterSpacing: 0.4,
    });
  doc.moveDown(0.25);
  drawRule(doc);
}

function bodyText(doc: PDFKit.PDFDocument, text: string, size = 9.2): void {
  const height = doc.heightOfString(text, { width: PAGE.width, lineGap: 2 });
  ensureSpace(doc, height + 8);
  doc
    .font("Helvetica")
    .fontSize(size)
    .fillColor(COLORS.ink)
    .text(text, PAGE.margin, doc.y, {
      width: PAGE.width,
      lineGap: 2,
    });
  doc.moveDown(0.45);
}

function bullet(doc: PDFKit.PDFDocument, text: string): void {
  const bulletIndent = 14;
  const width = PAGE.width - bulletIndent;
  const height = doc.heightOfString(text, { width, lineGap: 1.5 });
  ensureSpace(doc, height + 5);

  const y = doc.y;
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink).text("-", PAGE.margin, y, {
    width: 8,
  });
  doc.text(text, PAGE.margin + bulletIndent, y, {
    width,
    lineGap: 1.5,
  });
  doc.moveDown(0.28);
}

function inlineMeta(doc: PDFKit.PDFDocument, left: string, right: string): void {
  ensureSpace(doc, 24);
  const y = doc.y;
  const rightWidth = textWidth(doc, right, 9);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.ink).text(left, PAGE.margin, y, {
    width: PAGE.width - rightWidth - 18,
  });
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text(right, PAGE.margin + PAGE.width - rightWidth, y, {
    width: rightWidth,
  });
  doc.moveDown(0.3);
}

function labelValueLine(doc: PDFKit.PDFDocument, label: string, value: string): void {
  ensureSpace(doc, 18);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.ink).text(`${label}: `, {
    continued: true,
  });
  doc.font("Helvetica").fillColor(COLORS.ink).text(value, {
    width: PAGE.width,
  });
}

function compactList(values: string[]): string {
  return values.filter(Boolean).join(", ");
}

function renderHeader(doc: PDFKit.PDFDocument, profile: CvProfile): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(23)
    .fillColor(COLORS.ink)
    .text(profile.full_name, PAGE.margin, PAGE.margin, {
      width: PAGE.width,
    });

  doc.moveDown(0.1);
  doc.font("Helvetica").fontSize(11.5).fillColor(COLORS.accent).text(profile.target_role, {
    width: PAGE.width,
  });

  const links = [profile.links.linkedin, profile.links.github, profile.links.portfolio].filter(Boolean);
  const contact = [profile.location, profile.email, profile.phone, ...links].join(" | ");
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(8.6).fillColor(COLORS.muted).text(contact, {
    width: PAGE.width,
    lineGap: 1,
  });

  doc.moveDown(0.5);
  drawRule(doc);
}

function renderSkills(doc: PDFKit.PDFDocument, profile: CvProfile): void {
  section(doc, "Skills");
  labelValueLine(doc, "Languages", compactList(profile.skills.languages));
  labelValueLine(doc, "Frameworks", compactList(profile.skills.frameworks));
  labelValueLine(doc, "Cloud and tools", compactList(profile.skills.cloud_tools));
  labelValueLine(doc, "Databases", compactList(profile.skills.databases));
  labelValueLine(doc, "Practices", compactList(profile.skills.practices));
}

function renderExperience(doc: PDFKit.PDFDocument, profile: CvProfile): void {
  section(doc, "Experience");

  for (const item of profile.experience) {
    inlineMeta(doc, `${item.role}, ${item.company}`, dateRange(item.start, item.end));
    doc.font("Helvetica").fontSize(8.7).fillColor(COLORS.muted).text(item.location, PAGE.margin, doc.y, {
      width: PAGE.width,
    });
    doc.moveDown(0.2);

    for (const itemBullet of item.bullets) {
      bullet(doc, itemBullet);
    }

    doc
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(`Technologies: ${compactList(item.technologies)}`, PAGE.margin, doc.y, {
        width: PAGE.width,
        lineGap: 1,
      });
    doc.moveDown(0.65);
  }
}

function renderProjects(doc: PDFKit.PDFDocument, profile: CvProfile): void {
  section(doc, "Projects");

  for (const project of profile.projects) {
    ensureSpace(doc, 45);
    doc.font("Helvetica-Bold").fontSize(9.6).fillColor(COLORS.ink).text(project.name, PAGE.margin, doc.y, {
      width: PAGE.width,
    });
    doc.moveDown(0.12);
    bodyText(doc, `${project.description} Technologies: ${compactList(project.technologies)}.`, 8.9);
  }
}

function renderEducation(doc: PDFKit.PDFDocument, profile: CvProfile): void {
  section(doc, "Education and Certifications");

  for (const education of profile.education) {
    const detail = education.details ? ` - ${education.details}` : "";
    bodyText(doc, `${education.degree}, ${education.institution} (${education.year})${detail}`, 9);
  }

  if (profile.certifications.length > 0) {
    bodyText(doc, `Certifications: ${compactList(profile.certifications)}`, 9);
  }
}

export async function renderCv(profile: CvProfile, outDir: string, index: number): Promise<RenderResult> {
  await ensureDir(outDir);
  const fileName = pdfFileName(index, profile.full_name, profile.target_role);
  const filePath = path.join(outDir, fileName);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE.margin,
      info: {
        Title: `${profile.full_name} CV`,
        Author: "Synthetic CV Generator",
        Subject: profile.target_role,
        Creator: "Boundary Temp CV Generator",
      },
    });
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    renderHeader(doc, profile);

    section(doc, "Profile");
    bodyText(doc, profile.summary, 9.4);

    renderSkills(doc, profile);
    renderExperience(doc, profile);
    renderProjects(doc, profile);
    renderEducation(doc, profile);

    doc.end();
  });

  const stat = await fs.promises.stat(filePath);
  return {
    fileName,
    filePath,
    bytes: stat.size,
  };
}
