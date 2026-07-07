const JobListing = require('../models/JobListing');

async function retrieve({ domain, keywords, location, limit = 50, offset = 0 }) {
  console.log(`jobRetrievalService: domain=${domain} keywords=[${(keywords || []).join(', ')}] location=${location} limit=${limit}`);

  const filter = { domain, isActive: true };
  const searchTerms = (keywords || []).filter(k => k.length > 2).join(' ');

  let jobs;
  if (searchTerms) {
    try {
      jobs = await JobListing.find(
        { ...filter, $text: { $search: searchTerms } },
        { score: { $meta: 'textScore' } }
      )
      .sort({ score: { $meta: 'textScore' } })
      .skip(offset)
      .limit(limit)
      .lean();
    } catch (err) {
      console.log('jobRetrievalService: text search unavailable, using regex fallback');
      const regexQueries = keywords.filter(k => k.length > 2).map(k => ({
        $or: [
          { title: { $regex: k, $options: 'i' } },
          { description: { $regex: k, $options: 'i' } }
        ]
      }));
      jobs = await JobListing.find({
        ...filter,
        $or: regexQueries.length > 0 ? regexQueries : [{ title: { $exists: true } }]
      })
      .skip(offset)
      .limit(limit)
      .lean();
    }
  } else {
    jobs = await JobListing.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
  }

  console.log(`jobRetrievalService: retrieved ${jobs.length} candidates`);
  return jobs;
}

async function retrieveById(jobId) {
  return JobListing.findById(jobId).lean();
}

module.exports = { retrieve, retrieveById };
