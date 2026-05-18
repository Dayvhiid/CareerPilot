// Test the Advanced Resume Parser
const AdvancedResumeParser = require('./src/controllers/AdvancedResumeParser');

const sampleResumeText = `
John Smith
Software Engineer
john.smith@email.com
(555) 123-4567
New York, NY

PROFESSIONAL SUMMARY
Experienced Full Stack Developer with 5+ years of experience in building scalable web applications using modern technologies.

TECHNICAL SKILLS
• JavaScript, TypeScript, Python, Java
• React, Angular, Node.js, Express
• MongoDB, PostgreSQL, Redis
• AWS, Docker, Kubernetes
• Git, CI/CD, Agile

EXPERIENCE
Senior Software Developer - Tech Corp (2020-2024)
• Developed and maintained web applications using React and Node.js
• Led a team of 3 developers
• Implemented microservices architecture

Software Developer - StartupXYZ (2018-2020)
• Built full-stack applications using MEAN stack
• Collaborated with cross-functional teams

EDUCATION
Bachelor of Science in Computer Science
University of Technology, 2018

CERTIFICATIONS
• AWS Certified Solutions Architect
• Scrum Master Certification

LANGUAGES
English (Native), Spanish (Fluent)
`;

async function testParser() {
    console.log('🧪 Testing Advanced Resume Parser...\n');
    
    const parser = new AdvancedResumeParser();
    const result = await parser.parseResume(sampleResumeText);
    
    console.log('\n📋 EXTRACTION RESULTS:');
    console.log('='.repeat(50));
    console.log('Name:', result.name);
    console.log('Email:', result.email);
    console.log('Phone:', result.phone);
    console.log('Location:', result.location);
    console.log('Years Experience:', result.yearsOfExperience);
    console.log('Current Job Title:', result.currentJobTitle);
    console.log('Skills Count:', result.skills.length);
    console.log('Skills:', result.skills.slice(0, 10));
    console.log('Soft Skills:', result.softSkills);
    console.log('Job Titles:', result.jobTitles);
    console.log('Companies:', result.companies);
    console.log('Education:', result.education);
    console.log('Languages:', result.languages);
    console.log('Certifications:', result.certifications);
    console.log('\n✨ Generated Summary:');
    console.log(result.generatedSummary);
    console.log('\n' + '='.repeat(50));
}

testParser().catch(console.error);