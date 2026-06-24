/**
 * One-time script: Backfill existing jobs in MongoDB with domain categories
 * Run once after Phase 2 deployment to classify historical job data
 * 
 * Usage: node scripts/backfill-job-categories.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Job = require('../src/models/Job');

// Domain category keywords (same as in jobController.js)
const CATEGORY_KEYWORDS = {
  'IT/Software': {
    keywords: ['software', 'developer', 'engineer', 'frontend', 'backend', 'full stack', 'react', 'node', 'python', 'java', 'javascript', 'typescript', 'web', 'app', 'coding', 'programming', 'it', 'database', 'devops', 'cloud', 'aws', 'azure', 'tech'],
    minMatches: 1
  },
  'Design/Creative': {
    keywords: ['designer', 'design', 'ux', 'ui', 'graphic', 'creative', 'photoshop', 'figma', 'illustrator', 'branding', 'visual', 'art', 'animation'],
    minMatches: 1
  },
  'Finance/Accounting': {
    keywords: ['accountant', 'accounting', 'finance', 'financial', 'cpa', 'bookkeeper', 'auditor', 'analyst', 'tax', 'payroll', 'banking', 'investment', 'forex'],
    minMatches: 1
  },
  'Sales/Marketing': {
    keywords: ['sales', 'marketing', 'seo', 'digital marketing', 'social media', 'sales representative', 'business development', 'account executive', 'brand', 'advertising'],
    minMatches: 1
  },
  'Construction/Engineering': {
    keywords: ['construction', 'engineer', 'civil', 'structural', 'architect', 'project manager', 'contractor', 'autocad', 'bim', 'welding', 'electrical', 'mechanical', 'building'],
    minMatches: 1
  },
  'Healthcare': {
    keywords: ['nurse', 'doctor', 'physician', 'healthcare', 'medical', 'therapist', 'pharmacist', 'dentist', 'psychiatrist', 'hospital', 'clinical'],
    minMatches: 1
  },
  'Operations/Admin': {
    keywords: ['operations', 'administrator', 'admin', 'executive assistant', 'office manager', 'coordinator', 'receptionist', 'human resources', 'hr'],
    minMatches: 1
  }
};

const classifyJobCategory = (jobTitle, jobDescription) => {
  const text = `${jobTitle} ${jobDescription}`.toLowerCase();
  let bestCategory = 'Other';
  let bestScore = 0;

  for (const [category, config] of Object.entries(CATEGORY_KEYWORDS)) {
    let matches = 0;
    config.keywords.forEach(keyword => {
      if (text.includes(keyword)) matches++;
    });

    if (matches >= config.minMatches && matches > bestScore) {
      bestScore = matches;
      bestCategory = category;
    }
  }

  return bestCategory;
};

const backfill = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('📊 Starting job category backfill...');
    
    // Find all jobs
    const jobs = await Job.find({});
    console.log(`📈 Found ${jobs.length} jobs to process\n`);

    let updated = 0;
    let skipped = 0;

    for (const job of jobs) {
      // Skip if already categorized
      if (job.category && job.category !== 'Other') {
        skipped++;
        continue;
      }

      // Classify and update
      const category = classifyJobCategory(job.title, job.description);
      job.category = category;
      await job.save();

      updated++;
      if (updated % 50 === 0) {
        console.log(`  ⏳ Processed ${updated} jobs...`);
      }
    }

    console.log(`\n✅ Backfill complete:`);
    console.log(`  📂 Updated: ${updated} jobs`);
    console.log(`  ⏭️  Already categorized: ${skipped} jobs`);
    console.log(`  📊 Total: ${updated + skipped} jobs\n`);

    // Show category distribution
    const distribution = await Job.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('📂 Category distribution:');
    distribution.forEach(cat => {
      console.log(`  ${cat._id}: ${cat.count} jobs`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

backfill();
