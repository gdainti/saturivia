// ai generated
// Script to mark questions containing specific Russian substrings as deleted

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionService } from '../src/question/question.service';

// Substrings to search for in questions
// Note: Some text may have mixed Latin/Cyrillic characters, so we include variations
const TARGET_SUBSTRINGS = [
  'из перечислен',
  'из этого',
  'из этих'
];

async function run() {
  // Check for --dry-run flag
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || args.includes('-d');
  const app = await NestFactory.createApplicationContext(AppModule);
  const questionService = app.get(QuestionService);

  // Get access to the question model directly
  const questionModel = (questionService as any).questionModel;

  console.log('Starting to search for questions containing target substrings...');
  console.log('Target substrings:', TARGET_SUBSTRINGS);

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
  }

  let totalUpdated = 0;
  let matchingCount = 0;

  try {
    // Find all questions that are not already deleted and contain any of the target substrings
    const query = {
      isDeleted: { $ne: true }, // Only get questions that are not already deleted
      $or: TARGET_SUBSTRINGS.map(substring => ({
        question: { $regex: new RegExp(substring, 'i') } // Case-insensitive search
      }))
    };

    // First, count how many questions match
    matchingCount = await questionModel.countDocuments(query).exec();
    console.log(`Found ${matchingCount} questions matching the criteria`);

    if (matchingCount === 0) {
      console.log('No questions found to update.');
      await app.close();
      process.exit(0);
    }

    // Get the matching questions to show which ones will be updated
    const matchingQuestions = await questionModel.find(query).select('_id question').lean().exec();

    console.log(`\nQuestions that ${isDryRun ? 'would be' : 'will be'} marked as deleted:`);
    matchingQuestions.forEach((q, index) => {
      console.log(`${index + 1}. [${q._id}] ${q.question.substring(0, 100)}${q.question.length > 100 ? '...' : ''}`);
    });

    if (isDryRun) {
      console.log(`\n🔍 DRY RUN: Would mark ${matchingCount} questions as deleted (no changes made)`);
      totalUpdated = 0;
    } else {
      // Update all matching questions to set isDeleted = true
      const updateResult = await questionModel.updateMany(
        query,
        { $set: { isDeleted: true } }
      ).exec();

      totalUpdated = updateResult.modifiedCount;
      console.log(`\nSuccessfully marked ${totalUpdated} questions as deleted.`);
    }

    // Show breakdown by substring
    if (!isDryRun) {
      console.log('\nBreakdown by substring:');
      for (const substring of TARGET_SUBSTRINGS) {
        const count = await questionModel.countDocuments({
          isDeleted: true,
          question: { $regex: new RegExp(substring, 'i') }
        }).exec();
        console.log(`  "${substring}": ${count} questions`);
      }
    } else {
      console.log('\nBreakdown by substring (dry run):');
      for (const substring of TARGET_SUBSTRINGS) {
        const count = await questionModel.countDocuments({
          isDeleted: { $ne: true },
          question: { $regex: new RegExp(substring, 'i') }
        }).exec();
        console.log(`  "${substring}": ${count} questions would be marked as deleted`);
      }
    }

  } catch (error) {
    console.error('Error occurred while updating questions:', error);
    await app.close();
    process.exit(1);
  }

  if (isDryRun) {
    console.log(`\n🔍 DRY RUN completed. ${matchingCount} questions would be marked as deleted.`);
    console.log('Run without --dry-run flag to actually perform the updates.');
  } else {
    console.log(`\nOperation completed. Total questions marked as deleted: ${totalUpdated}`);
  }

  await app.close();
  process.exit(0);
}

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});