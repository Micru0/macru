declare module 'pdf-parse' {
  interface PDFInfo {
    Title?: string;
    Author?: string;
    Subject?: string;
    CreationDate?: string;
    ModDate?: string;
    Creator?: string;
    Producer?: string;
    [key: string]: any;
  }

  interface PDFData {
    text: string;
    info: PDFInfo;
    metadata: any;
    version: string;
    numpages: number;
  }

  function parse(
    dataBuffer: Buffer,
    options?: {
      pagerender?: (pageData: any) => string | null;
      max?: number;
      version?: string;
    }
  ): Promise<PDFData>;

  export = parse;
} 