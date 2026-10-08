import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { MAX_TEXT } from '../shared/analysis.js';

export async function extractResume(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Choose a non-empty resume file.');
  if (buffer.length > 5 * 1024 * 1024) throw new Error('Resume files must be 5 MB or smaller.');
  const extension = filename.split('.').pop().toLowerCase();
  let text;
  let pages = null;
  if (extension === 'pdf') {
    if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('This file is not a valid PDF.');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = result.text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '');
      pages = result.total;
    } finally { await parser.destroy(); }
  } else if (extension === 'docx') {
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('This file is not a valid DOCX.');
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files).filter(file => !file.dir);
    if (!zip.file('word/document.xml') || entries.length > 1000) throw new Error('This file is not a supported DOCX resume.');
    let expandedSize = 0;
    for (const entry of entries) {
      await pipeline(entry.nodeStream(), new Writable({ write(chunk, encoding, callback) {
        expandedSize += chunk.length;
        callback(expandedSize > 20 * 1024 * 1024 ? new Error('The DOCX file expands beyond the 20 MB safety limit. Upload a simpler resume.') : null);
      } }));
    }
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (extension === 'txt') {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (text.includes('\u0000')) throw new Error('Upload a UTF-8 text resume.');
  } else throw new Error('Upload a PDF, DOCX, or UTF-8 TXT file.');
  text = text.trim();
  if (text.length < 80) throw new Error('Not enough readable text was found. Scanned PDFs need OCR; upload a text-based PDF, DOCX, or paste your resume.');
  if (text.length > MAX_TEXT) throw new Error('The extracted resume exceeds 30,000 characters. Use a shorter file.');
  return { text, pages };
}

export async function createDocx(text) {
  const sections = [{ children: text.split('\n').map(line => new Paragraph({
    spacing: { after: line.trim() ? 90 : 60 },
    children: [new TextRun({ text: line, font: 'Calibri', size: 22, bold: /^[A-Z][A-Z &/]{2,}$/.test(line.trim()) })],
  })) }];
  return Packer.toBuffer(new Document({ sections, title: 'Resume', creator: 'Align' }));
}
