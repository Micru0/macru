/**
 * Test script for the TextExtractor service
 * 
 * Run with:
 * npx ts-node -r tsconfig-paths/register scripts/test-text-extraction.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { TextExtractor } from '../lib/services/text-extractor';

async function main() {
  try {
    console.log('Testing TextExtractor service...');
    
    // Test with a sample text file
    console.log('\nTesting text extraction from a sample text string:');
    const sampleText = 'This is a sample text.\nIt contains multiple lines.\nWe want to extract and process this text.';
    const textBuffer = Buffer.from(sampleText, 'utf-8');
    
    const textResult = await TextExtractor.extractText(textBuffer, 'sample.txt', 'text/plain');
    console.log('Extraction successful!');
    console.log('Extracted text:', textResult.text);
    console.log('Metadata:', JSON.stringify(textResult.metadata, null, 2));
    
    // Test with actual sample.txt file from test-files directory
    const testFilePath = path.join(__dirname, 'test-files/sample.txt');
    if (fs.existsSync(testFilePath)) {
      console.log('\nTesting with sample.txt file:');
      const fileBuffer = fs.readFileSync(testFilePath);
      const fileResult = await TextExtractor.extractText(fileBuffer, 'sample.txt', 'text/plain');
      console.log('Extraction successful!');
      console.log('Metadata:', JSON.stringify(fileResult.metadata, null, 2));
      console.log('First 100 characters of text:', fileResult.text.substring(0, 100) + '...');
    }
    
    // For PDF and DOCX, you would need actual files to test with
    console.log('\nTo test PDF and DOCX extraction, you would need to:');
    console.log('1. Place sample files in the scripts/test-files directory');
    console.log('2. Uncomment and modify the code below to use those files');
    
    /*
    // Test with a sample PDF file
    const pdfPath = path.join(__dirname, 'test-files/sample.pdf');
    if (fs.existsSync(pdfPath)) {
      console.log('\nTesting PDF extraction:');
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfResult = await TextExtractor.extractText(pdfBuffer, 'sample.pdf', 'application/pdf');
      console.log('Extraction successful!');
      console.log('Metadata:', JSON.stringify(pdfResult.metadata, null, 2));
      console.log('First 100 characters of text:', pdfResult.text.substring(0, 100) + '...');
    }
    
    // Test with a sample DOCX file
    const docxPath = path.join(__dirname, 'test-files/sample.docx');
    if (fs.existsSync(docxPath)) {
      console.log('\nTesting DOCX extraction:');
      const docxBuffer = fs.readFileSync(docxPath);
      const docxResult = await TextExtractor.extractText(docxBuffer, 'sample.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      console.log('Extraction successful!');
      console.log('Metadata:', JSON.stringify(docxResult.metadata, null, 2));
      console.log('First 100 characters of text:', docxResult.text.substring(0, 100) + '...');
    }
    */
    
    // Test with an unsupported file type
    console.log('\nTesting unsupported file type handling:');
    try {
      await TextExtractor.extractText(Buffer.from('dummy content'), 'sample.jpg', 'image/jpeg');
      console.log('❌ Test failed: Expected an error for unsupported file type');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unsupported file type')) {
        console.log('✅ Test passed: Correctly rejected unsupported file type');
      } else {
        console.error('❌ Test failed with unexpected error:', error);
      }
    }
    
    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  }
}

main().catch(console.error); 