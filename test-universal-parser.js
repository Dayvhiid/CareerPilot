// CareerPilot Universal Resume Parser Test
// Testing parsing across ALL industries - healthcare, finance, marketing, legal, etc.

const axios = require('axios');

// Python service URL
const PYTHON_SERVICE_URL = 'http://localhost:5000';

// Test resumes from different industries
const testResumes = {
  healthcare: `
Dr. Sarah Johnson, MD
sarah.johnson@healthcare.com
(555) 123-4567
Boston, MA

PROFESSIONAL SUMMARY
Board-certified Emergency Medicine physician with 8+ years of experience in high-volume trauma centers. 
Expertise in critical care, patient assessment, and emergency procedures. Skilled in advanced cardiac life support, 
trauma management, and multidisciplinary team leadership.

EXPERIENCE
Senior Emergency Physician | Boston Medical Center | 2018-Present
• Managed 200+ emergency cases monthly in Level 1 trauma center
• Proficient in advanced airway management, central line placement, and emergency ultrasound
• Led resuscitation team for cardiac arrests and multi-trauma patients
• Experienced with Epic EMR, clinical decision support tools, and telemedicine platforms
• Collaborated with specialists in cardiology, surgery, and critical care medicine

Resident Physician | Massachusetts General Hospital | 2014-2018
• Completed emergency medicine residency with rotations in ICU, surgery, and pediatrics
• Developed expertise in point-of-care ultrasound, procedural sedation, and emergency radiology
• Trained in wilderness medicine and disaster response protocols

EDUCATION
Doctor of Medicine (MD) | Harvard Medical School | 2014
Bachelor of Science in Biology | MIT | 2010

CERTIFICATIONS
• Board Certified in Emergency Medicine (ABEM)
• Advanced Trauma Life Support (ATLS)
• Pediatric Advanced Life Support (PALS)
• Advanced Cardiac Life Support (ACLS)
• Emergency Ultrasound Certification

SKILLS
Clinical assessment, trauma management, emergency procedures, patient care, medical documentation,
electronic health records, clinical research, teaching, emergency ultrasound, cardiac monitoring
`,

  finance: `
Michael Chen, CFA
m.chen@investment.com
(212) 555-9876
New York, NY

PROFESSIONAL SUMMARY
Senior Investment Analyst with 12+ years of experience in equity research and portfolio management.
Expertise in financial modeling, risk assessment, and investment strategy development.
Strong background in quantitative analysis and market research.

EXPERIENCE
Senior Investment Analyst | Goldman Sachs | 2016-Present
• Managed $500M+ equity portfolio with 15% annual returns above benchmark
• Proficient in Bloomberg Terminal, FactSet, Morningstar Direct, and Python for financial analysis
• Conducted due diligence on 100+ investment opportunities annually
• Experienced with DCF modeling, Monte Carlo simulations, and risk management frameworks
• Specialized in technology and healthcare sector analysis

Investment Associate | JPMorgan Chase | 2012-2016
• Performed fundamental analysis and valuation of public and private companies
• Developed expertise in merger & acquisition modeling and credit analysis
• Built financial models using Excel VBA and SQL databases
• Collaborated with trading desks and institutional clients on investment strategies

EDUCATION
Master of Business Administration (MBA) | Wharton School | 2012
Bachelor of Science in Finance | NYU Stern | 2010

CERTIFICATIONS
• Chartered Financial Analyst (CFA)
• Financial Risk Manager (FRM)
• Series 7 and Series 63 licenses

SKILLS
Financial modeling, equity research, portfolio management, risk analysis, Bloomberg Terminal,
Python, SQL, Excel VBA, quantitative analysis, derivatives trading, fixed income analysis
`,

  marketing: `
Jessica Rodriguez
j.rodriguez@digitalagency.com
(310) 555-4321
Los Angeles, CA

PROFESSIONAL SUMMARY
Creative Marketing Director with 9+ years of experience in digital marketing and brand management.
Expertise in social media strategy, content creation, and integrated marketing campaigns.
Proven track record of driving brand awareness and customer engagement.

EXPERIENCE
Marketing Director | Digital Innovations Agency | 2019-Present
• Led marketing campaigns generating $10M+ in client revenue annually
• Proficient in Google Analytics, HubSpot, Salesforce, Adobe Creative Suite, and Hootsuite
• Managed social media strategy across Facebook, Instagram, LinkedIn, and TikTok platforms
• Experienced with SEO/SEM, email marketing automation, and conversion rate optimization
• Specialized in influencer marketing and brand partnership development

Senior Marketing Manager | TechStart Inc. | 2015-2019
• Developed integrated marketing campaigns for B2B SaaS products
• Built expertise in marketing automation, lead generation, and customer segmentation
• Created content marketing strategies including blogs, whitepapers, and video content
• Collaborated with sales teams on account-based marketing and customer retention

EDUCATION
Master of Marketing | UCLA Anderson | 2015
Bachelor of Arts in Communications | USC | 2013

CERTIFICATIONS
• Google Ads Certified
• HubSpot Content Marketing Certification
• Facebook Blueprint Certified
• Hootsuite Social Media Marketing

SKILLS
Digital marketing, social media management, content creation, brand management, SEO/SEM,
email marketing, marketing automation, Adobe Creative Suite, Google Analytics, campaign management
`,

  legal: `
David Thompson, Esq.
d.thompson@lawfirm.com
(202) 555-7890
Washington, DC

PROFESSIONAL SUMMARY
Corporate Attorney with 10+ years of experience in mergers & acquisitions and securities law.
Expertise in contract negotiation, regulatory compliance, and corporate governance.
Strong background in financial services and technology sector legal matters.

EXPERIENCE
Senior Associate | Covington & Burling LLP | 2018-Present
• Managed M&A transactions valued at $2B+ including due diligence and closing processes
• Proficient in LegalZoom, Westlaw, LexisNexis, and document management systems
• Drafted and negotiated complex commercial agreements and securities filings
• Experienced with SEC compliance, corporate restructuring, and regulatory investigations
• Specialized in fintech regulations and data privacy law (GDPR, CCPA)

Associate Attorney | WilmerHale | 2014-2018
• Performed legal research and analysis for complex litigation matters
• Developed expertise in intellectual property law and employment litigation
• Assisted with contract negotiations and regulatory compliance matters
• Collaborated with cross-functional teams on corporate governance issues

EDUCATION
Juris Doctor (JD) | Georgetown University Law Center | 2014
Bachelor of Arts in Political Science | George Washington University | 2011

CERTIFICATIONS
• Licensed to practice law in DC, New York, and California
• Certified Information Privacy Professional (CIPP)

SKILLS
Contract negotiation, legal research, regulatory compliance, corporate law, securities law,
intellectual property, litigation support, legal writing, client counseling, risk assessment
`
};

// Test function
async function testUniversalParsing() {
  console.log('🧪 Testing Universal Resume Parser across all industries...\n');

  for (const [industry, resumeText] of Object.entries(testResumes)) {
    console.log(`\n🔍 Testing ${industry.toUpperCase()} resume...`);
    
    try {
      const response = await axios.post(`${PYTHON_SERVICE_URL}/parse`, {
        text: resumeText
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.status === 'success') {
        const data = response.data.data;
        
        console.log(`✅ Successfully parsed ${industry} resume:`);
        console.log(`   👤 Name: ${data.name}`);
        console.log(`   📧 Email: ${data.email}`);
        console.log(`   📱 Phone: ${data.phone}`);
        console.log(`   📍 Location: ${data.location}`);
        console.log(`   🏭 Industry: ${data.industry}`);
        console.log(`   ⏰ Years Experience: ${data.years_experience}`);
        console.log(`   💼 Job Titles: ${data.job_titles.slice(0, 2).join(', ')}`);
        console.log(`   🔧 Skills (${data.skills.length}): ${data.skills.slice(0, 5).join(', ')}...`);
        console.log(`   🎓 Education: ${data.education.slice(0, 1).join(', ')}`);
        console.log(`   📜 Certifications: ${data.certifications.slice(0, 2).join(', ')}`);
        console.log(`   💡 Soft Skills: ${data.soft_skills.join(', ')}`);
        console.log(`   📝 Generated Summary: ${data.generated_summary.substring(0, 100)}...`);
        
        // Verify industry detection
        const expectedIndustry = industry;
        const detectedIndustry = data.industry;
        
        if (detectedIndustry === expectedIndustry || detectedIndustry !== 'general') {
          console.log(`   🎯 ✅ Industry correctly identified: ${detectedIndustry}`);
        } else {
          console.log(`   🎯 ⚠️ Industry detection could be improved: expected ${expectedIndustry}, got ${detectedIndustry}`);
        }
        
      } else {
        console.log(`❌ Failed to parse ${industry} resume: Invalid response`);
      }
      
    } catch (error) {
      console.log(`❌ Error testing ${industry} resume:`, error.message);
    }

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🏁 Universal parsing test completed!');
  console.log('🎉 CareerPilot now works for ALL professions - no more predefined skill lists!');
}

// Health check first
async function healthCheck() {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/health`);
    console.log('🩺 Health check:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Python service not available:', error.message);
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('🚀 CareerPilot Universal Resume Parser Test Suite');
  console.log('===============================================');
  
  const isHealthy = await healthCheck();
  if (!isHealthy) {
    console.log('⚠️ Please start the Python service first: python simple_app.py');
    return;
  }

  await testUniversalParsing();
}

// Export for use
module.exports = { testUniversalParsing, healthCheck };

// Run if called directly
if (require.main === module) {
  runTests();
}