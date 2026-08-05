/**
 * File extraction for the Brain's knowledge base.
 *
 * Converts common binary / office uploads into plain text so their contents
 * can be chunked, embedded, and retrieved (RAG). Falls back to a raw UTF-8
 * decode for plain text formats. Extraction failures are caught and reported
 * so the Brain can honestly acknowledge a file it couldn't read rather than
 * hallucinate.
 */
import { createLogger } from '@/lib/logging/logger';

const extractLogger = createLogger('brain:extract');

export interface ExtractionResult {
  content: string;
  extractedBy: string;
  pageCount?: number;
  error?: string;
}

const MAX_EXTRACT_CHARS = 50_000;

/** Extract text from a PDF buffer using pdf-parse (v2 class API). */
async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      content: (result.text || '').trim().slice(0, MAX_EXTRACT_CHARS),
      extractedBy: 'pdf',
      pageCount: result.total,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/** Extract text from a DOCX buffer using mammoth. */
async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = await import('mammoth');
  const parsed = await mammoth.extractRawText({ buffer });
  return {
    content: (parsed.value || '').trim().slice(0, MAX_EXTRACT_CHARS),
    extractedBy: 'docx',
  };
}

/** Extract the first N cells of every sheet from an XLSX buffer using xlsx. */
async function extractXlsx(buffer: Buffer): Promise<ExtractionResult> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) parts.push(`[Sheet: ${sheetName}]\n${csv}`);
  }
  const content = parts.join('\n\n').slice(0, MAX_EXTRACT_CHARS);
  if (!content.trim()) return { content: '', extractedBy: 'xlsx' };
  return { content, extractedBy: 'xlsx' };
}

/** Fall back to raw UTF-8 decode (text formats). */
function extractRaw(buffer: Buffer): ExtractionResult {
  const decoded = buffer.toString('utf-8');
  return { content: decoded.trim().slice(0, MAX_EXTRACT_CHARS), extractedBy: 'raw' };
}

/**
 * Extract plain text from an uploaded file by MIME type / extension.
 * Returns empty content (no throw) when the format can't be parsed so callers
 * can degrade gracefully.
 */
export async function extractFileText(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  try {
    switch (mimeType) {
      case 'application/pdf':
        return await extractPdf(buffer);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await extractDocx(buffer);
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return await extractXlsx(buffer);
      default:
        return extractRaw(buffer);
    }
  } catch (err) {
    extractLogger.warn('Extraction failed; falling back to raw decode', { mimeType });
    extractLogger.error('Extraction error', err);
    return { content: '', extractedBy: mimeType, error: 'Extraction failed.' };
  }
}