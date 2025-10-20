import fs from 'fs';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionService } from '../src/question/question.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const questionService = app.get(QuestionService);

  const filePath = path.resolve(process.cwd(), 'questions.json');
  if (!fs.existsSync(filePath)) {
    console.error('questions.json not found in project root');
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let items;
  try {
    items = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse questions.json', err);
    process.exit(1);
  }

  for (const item of items) {
    const { question, answer } = item;
    if (!question || !answer) {
      console.warn('Skipping invalid item', item);
      continue;
    }

    const existing = await (questionService as any).questionModel.findOne({ question }).exec().catch(() => null);
    if (existing) {
      console.warn('Skipping duplicate question text:', question);
      continue;
    }

    const sameAnswer = await (questionService as any).questionModel.findOne({ answer }).exec().catch(() => null);
    if (sameAnswer) {
      console.warn('Found question with same answer (warning):', answer);
    }

    await questionService.create({ question, answer });
    console.log('Inserted:', question);
  }

  await app.close();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
