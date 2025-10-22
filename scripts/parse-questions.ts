// ai generated

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// ===== CONFIGURATION SECTION =====

const START_PAGE = 1;

const PAGE_STEP = 15;

const MAX_CHUNK_SIZE = 5;

const BASE_URL = '';
const URL_PATTERN = `${BASE_URL}/{page}`;

// CSS selectors for finding questions and answers
const QUESTION_SELECTOR = '.q-list__table tr.tooltip';
const ANSWER_SELECTOR = '';

// Output file path (relative to project root). We write a plain text file
// inside `data/questions/` where each line is `question|answer` to make manual cleanup easier.
const OUTPUT_FILE = path.join('data', 'questions', 'scraped-questions-{page}.txt');

// Delay between requests (milliseconds) - be respectful to servers
const REQUEST_DELAY = 1000;

// ===== END CONFIGURATION SECTION =====

interface ParsedQuestion {
  question: string;
  answer: string;
}

interface ScrapingStats {
  totalPages: number;
  totalQuestions: number;
  successfulPages: number;
  failedPages: number;
  duplicatesSkipped: number;
}

class QuestionScraper {
  private allQuestions: ParsedQuestion[] = [];
  // Store only current chunk's questions for saving; keep global set for dedupe
  private chunkQuestions: ParsedQuestion[] = [];
  private seenQuestions = new Set<string>();
  private stats: ScrapingStats = {
    totalPages: 0,
    totalQuestions: 0,
    successfulPages: 0,
    failedPages: 0,
    duplicatesSkipped: 0
  };
  private outputPath: string;

  constructor() {

  }

  private async fetchPageContent(url: string): Promise<string | null> {
    try {
      console.log(`📄 Fetching: ${url}`);
      const response = await fetch(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`❌ Page not found (404): ${url}`);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      if (error.message.includes('404')) {
        console.log(`❌ Page not found (404): ${url}`);
        return null;
      }
      console.error(`❌ Network error: ${error.message}`);
      return null;
    }
  }

  private parseQuestionsFromHtml(html: string, pageNumber: number): ParsedQuestion[] {
    const $ = cheerio.load(html);
    const questions: ParsedQuestion[] = [];

    const questionRows = $(QUESTION_SELECTOR);

    if (questionRows.length > 0) {
      console.log(`🔍 Found ${questionRows.length} question rows in table`);

      questionRows.each((index, row) => {
        const $row = $(row);
        const cells = $row.find('td');

        if (cells.length >= 3) {
          // Second cell contains the question (inside an <a> tag)
          const questionElement = $(cells[1]).find('a');
          const questionText = questionElement.length > 0
            ? questionElement.text().trim()
            : $(cells[1]).text().trim();

          // Third cell contains the answer
          const answerText = $(cells[2]).text().trim();

          if (questionText && answerText) {
            // Filter unclear answers: only keep answers with at most 2 words,
            // skip single-letter answers and skip answers containing abbreviated
            // name parts like "Jr." (1-2 letters followed by a dot).
            if (!this.isAcceptableAnswer(answerText)) {
              console.log(`⚠️  Skipping unclear/ambiguous answer: "${answerText}"`);
            } else {
              questions.push({
                question: questionText,
                answer: answerText,
              });

              console.log(`✓ Q: ${questionText.substring(0, 50)}... A: ${answerText.substring(0, 30)}...`);
            }
          }
        }
      });
    }

    console.log(`✅ Extracted ${questions.length} questions from page ${pageNumber}`);
    return questions;
  }

  // Return true if answer looks clear/suitable to store.
  // Rules:
  //  - After trimming, answers of length 1 are rejected.
  //  - Reject answers with 3 or more words.
  //  - Reject if any word matches an abbreviation pattern (1-2 letters followed by a dot): e.g. "Дж. Браун".
  private isAcceptableAnswer(raw: string): boolean {
    if (!raw) return false;
    const a = String(raw).replace(/\s+/g, ' ').trim();

    // After trimming, single-character answers are rejected
    if (a.length === 1) return false;

    // Remove surrounding quotes/parens commonly added
    const cleaned = a.replace(/^["'“”«»\(\)]+|["'“”«»\)]+$/g, '').trim();
    if (cleaned.length === 0) return false;

    const words = cleaned.split(' ');

    // Only allow up to 2 words
    if (words.length > 2) return false;

    // Abbreviation detection: 1-2 letters followed by a dot (Unicode letters)
    const abbrev = /^\p{L}{1,2}\.$/u;
    for (const w of words) {
      if (abbrev.test(w)) return false;
    }

    return true;
  }

  private generatePageUrl(pageNumber: number): string {
    return URL_PATTERN.replace('{page}', pageNumber.toString());
  }

  private isDuplicate(newQuestion: ParsedQuestion): boolean {
    const key = newQuestion.question.toLowerCase().trim();
    return this.seenQuestions.has(key);
  }

  private saveQuestionsToFile(pageNumber: number, chunkIndex: number): void {
    try {
      // Sanitize and write each question as a single line: question|answer
      const sanitize = (s: string) =>
        String(s)
          .replace(/\r?\n+/g, ' ')    // collapse newlines to spaces
          .replace(/\|/g, ' ')         // remove delimiter occurrences
          .replace(/\s+/g, ' ')        // collapse whitespace
          .trim();

      // Save only chunkQuestions for this chunk
      const lines = this.chunkQuestions.map(q => {
        const ques = sanitize(q.question);
        const ans = sanitize(q.answer);
        return `${ques}|${ans}`;
      });

      // Use chunkIndex in filename to avoid overwriting and to indicate range
      const filename = OUTPUT_FILE.replace('{page}', `chunk-${chunkIndex}-page-${pageNumber}`);
      this.outputPath = path.resolve(process.cwd(), filename);

      // Ensure output directory exists
      const outDir = path.dirname(this.outputPath);
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      fs.writeFileSync(this.outputPath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf-8');
      console.log(`💾 Saved ${this.chunkQuestions.length} questions to: ${this.outputPath}`);
    } catch (error) {
      console.error('❌ Error saving questions to file:', error.message);
    }
  }

  async scrapeQuestions(): Promise<void> {
    console.log('🚀 Starting question scraping...');
    console.log(`📊 Configuration:`);
    console.log(`   Base URL: ${BASE_URL}`);
    console.log(`   URL Pattern: ${URL_PATTERN}`);
    console.log(`   Start Page: ${START_PAGE}`);
    console.log(`   Page Step: ${PAGE_STEP}`);
    console.log(`   Max chunk size: ${MAX_CHUNK_SIZE}`);
    console.log(`   Question Selector: ${QUESTION_SELECTOR}`);
    console.log(`   Answer Selector: ${ANSWER_SELECTOR}`);
    console.log('');

    let consecutiveEmptyPages = 0;
    const maxConsecutiveEmpty = 3;
    let pageNumber = START_PAGE;

    // We'll run until we hit maxConsecutiveEmpty consecutive empty/error pages.
    // MAX_PAGES controls the chunk size: after processing MAX_PAGES pages, we save the chunk.
    let processedSinceChunkStart = 0;
    let chunkIndex = 0;

    while (consecutiveEmptyPages < maxConsecutiveEmpty) {
      const url = this.generatePageUrl(pageNumber);
      this.stats.totalPages++;

      try {
        const html = await this.fetchPageContent(url);

        if (!html) {
          consecutiveEmptyPages++;
          this.stats.failedPages++;
          console.log(`⚠️  Empty page ${pageNumber}, consecutive empty: ${consecutiveEmptyPages}`);
        } else {
          const questions = this.parseQuestionsFromHtml(html, pageNumber);

          if (questions.length === 0) {
            consecutiveEmptyPages++;
            console.log(`⚠️  No questions found on page ${pageNumber}, consecutive empty: ${consecutiveEmptyPages}`);
          } else {
            consecutiveEmptyPages = 0;
            this.stats.successfulPages++;

            // Add questions to chunk, checking for duplicates across entire run
            for (const question of questions) {
              if (this.isDuplicate(question)) {
                this.stats.duplicatesSkipped++;
                console.log(`🔄 Skipping duplicate: ${question.question.substring(0, 50)}...`);
              } else {
                this.chunkQuestions.push(question);
                this.allQuestions.push(question);
                this.seenQuestions.add(question.question.toLowerCase().trim());
                this.stats.totalQuestions++;
              }
            }
          }
        }

        processedSinceChunkStart++;

        // If we've reached the chunk size, save and reset chunk state
        if (processedSinceChunkStart >= MAX_CHUNK_SIZE) {
          chunkIndex++;
          this.saveQuestionsToFile(pageNumber, chunkIndex);
          // clear chunkQuestions but keep allQuestions and seenQuestions for global dedupe/stats
          this.chunkQuestions = [];
          processedSinceChunkStart = 0;
        }

        pageNumber += PAGE_STEP;

        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));

      } catch (error) {
        this.stats.failedPages++;
        consecutiveEmptyPages++;
        console.error(`❌ Error processing page ${pageNumber}:`, error.message);

        if (consecutiveEmptyPages >= maxConsecutiveEmpty) {
          console.log('⏹️  Too many consecutive errors, stopping...');
          break;
        }

        // Longer delay after error
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY * 2));
      }
    }

    // Save any remaining questions in the final chunk
    if (this.chunkQuestions.length > 0) {
      chunkIndex++;
      this.saveQuestionsToFile(pageNumber, chunkIndex);
    }

  // Save results to file (handled per-chunk during processing). Any remaining chunk was saved above.

    // Print final summary
    console.log('\n📈 Scraping Summary:');
    console.log(`   Total pages processed: ${this.stats.totalPages}`);
    console.log(`   Successful pages: ${this.stats.successfulPages}`);
    console.log(`   Failed pages: ${this.stats.failedPages}`);
    console.log(`   Total questions found: ${this.stats.totalQuestions}`);
    console.log(`   Duplicates skipped: ${this.stats.duplicatesSkipped}`);
    console.log(`   Output file: ${this.outputPath}`);
    console.log('✨ Scraping completed!');
  }
}

async function run() {
  const scraper = new QuestionScraper();

  try {
    await scraper.scrapeQuestions();
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('💥 Unexpected error:', err);
  process.exit(1);
});
