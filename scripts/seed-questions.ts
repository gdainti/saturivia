// ai generated

import fs from 'fs';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionService } from '../src/question/question.service';
import { QUESTION_TYPE } from 'src/question/question-type';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const questionService = app.get(QuestionService);
  // Seed from plain-text files where each line is: question|answer
  // Usage:
  //   node -r tsconfig-paths/register -r ts-node/register ./scripts/seed-questions.ts [file1.txt ...] [--clean]
  // If file paths are provided they will be used. Otherwise the script will look
  // for .txt files inside the `data/questions` folder in project root.
  const args = process.argv.slice(2);
  let txtFiles: string[] = [];

  // Check for --clean / -c flag
  // npm run seed -- --clean
  const cleanFlagIndex = args.findIndex(a => a === '--clean' || a === '-c');

  const doClean = cleanFlagIndex !== -1;
  if (doClean) args.splice(cleanFlagIndex, 1);

  if (args.length > 0) {
    txtFiles = args.map(a => path.resolve(process.cwd(), a)).filter(p => fs.existsSync(p));
  } else {
    // default folder: data/questions
    const dataDir = path.resolve(process.cwd(), 'data', 'questions');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      txtFiles = files.filter(f => f.toLowerCase().endsWith('.txt')).map(f => path.resolve(dataDir, f));
    }
  }

  if (txtFiles.length === 0) {
    console.error('No .txt files found to seed. Provide file paths as arguments or place .txt files in data/questions.');
    await app.close();
    process.exit(1);
  }

  // Helper to clean strings: trim and remove surrounding quotes (including smart quotes)
  const cleanString = (input: string) => {
    if (!input) return '';
    let s = String(input).trim();
    if (!s) return '';

    // Characters we consider as surrounding quotes
    const quoteChars = new Set(['"', "'", '\u2018', '\u2019', '\u201C', '\u201D', '\u00AB', '\u00BB', '`']);

    // Strip repeated surrounding quote characters and surrounding whitespace
    let start = 0;
    let end = s.length - 1;
    while (start <= end && (s[start] === ' ' || quoteChars.has(s[start]))) start++;
    while (end >= start && (s[end] === ' ' || quoteChars.has(s[end]))) end--;
    s = s.slice(start, end + 1).trim();

    return s;
  };

  // Normalize helper: clean, collapse whitespace, trim
  const normalize = (s: string) => cleanString(s).replace(/\s+/g, ' ').trim();

  // Parse lines into { question, answer }
  const items: Array<{ question: string; answer: string }> = [];
  for (const fp of txtFiles) {
    const raw = fs.readFileSync(fp, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line || !line.trim()) continue;
      const parts = line.split('|');
      if (parts.length < 2) continue;
      const rawQuestion = parts[0];
      const rawAnswer = parts.slice(1).join('|');
      const question = cleanString(String(rawQuestion));
      const answer = cleanString(String(rawAnswer));
      if (question && answer) items.push({ question, answer });
    }
  }



  // Prefetch existing questions/answers to avoid one DB query per item
  const questionModel = (questionService as any).questionModel;

  // If --clean flag provided, drop/delete existing questions collection
  if (doClean) {
    console.log('Cleaning questions collection (removing all existing documents)...');
    try {
      await questionModel.deleteMany({}).exec();
      console.log('Questions collection cleaned.');
    } catch (err) {
      console.error('Failed to clean questions collection:', err);
      await app.close();
      process.exit(1);
    }
  }

  const existingDocs = await questionModel.find({}).select('question answer').lean().exec().catch(() => []);
  const existingQuestions = new Set<string>();
  const existingAnswers = new Set<string>();
  for (const d of existingDocs) {
    if (d.question) existingQuestions.add(normalize(String(d.question)));
    if (d.answer) existingAnswers.add(normalize(String(d.answer)));
  }

  let inserted = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;

  // Hardcoded fields that will be added to each inserted document
  const DEFAULT_LANGUAGE = 'ru';
  const DEFAULT_DIFFICULTY = undefined;
  const DEFAULT_TYPE = QUESTION_TYPE.TRIVIA;
  const DEFAULT_COMMENT = '';
  const DEFAULT_HINT = '';

  for (const item of items) {
    const { question, answer } = item;
    if (!question || !answer) {
      console.warn('Skipping invalid item', item);
      skippedInvalid++;
      continue;
    }

    const nq = normalize(String(question));
    const na = normalize(String(answer));

    if (existingQuestions.has(nq)) {
      console.warn('Skipping duplicate question text (existing):', question);
      skippedExisting++;
      continue;
    }

    try {
      await questionService.create({
        question,
        answer,
        language: DEFAULT_LANGUAGE,
        difficulty: DEFAULT_DIFFICULTY,
        type: DEFAULT_TYPE,
        comment: DEFAULT_COMMENT,
        hint: DEFAULT_HINT,
      });

      console.log('Inserted:', question);
      inserted++;

      // add to sets so we don't insert duplicates within this run
      existingQuestions.add(nq);
      existingAnswers.add(na);
    } catch (err) {
      console.error('Failed to insert question:', question, err);
    }
  }

  console.log(`Seed summary: inserted=${inserted}, skippedExisting=${skippedExisting}, skippedInvalid=${skippedInvalid}`);

  await app.close();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
