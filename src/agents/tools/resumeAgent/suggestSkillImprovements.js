const { logger } = require('../../../config/logger');

const INDUSTRY_TRENDS = {
  'Software Engineering': ['TypeScript', 'Docker', 'Kubernetes', 'AWS', 'CI/CD', 'GraphQL', 'Rust', 'Go'],
  'Data / Analytics': ['Python', 'SQL', 'Machine Learning', 'TensorFlow', 'PyTorch', 'Spark', 'Airflow', 'dbt'],
  'Design / UX': ['Figma', 'Design Systems', 'User Research', 'Prototyping', 'Accessibility', 'Motion Design'],
  'Product Management': ['Data Analysis', 'A/B Testing', 'User Research', 'Roadmapping', 'Agile', 'SQL'],
  Marketing: ['SEO', 'Content Strategy', 'Analytics', 'CRM', 'Marketing Automation', 'Social Media'],
  'DevOps / SRE': ['Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Prometheus', 'Grafana', 'Linux'],
};

function suggestSkillImprovements({ extractedData, targetDomain }) {
  if (!extractedData) throw new Error('extractedData is required');

  const currentSkills = new Set((extractedData.skills || []).map((s) => s.toLowerCase().trim()));
  const domain = targetDomain || extractedData.domain || null;

  const suggestions = [];

  if (domain && INDUSTRY_TRENDS[domain]) {
    for (const skill of INDUSTRY_TRENDS[domain]) {
      if (!currentSkills.has(skill.toLowerCase())) {
        suggestions.push({
          skill,
          reason: `Highly sought after in ${domain}`,
          priority: currentSkills.size < 10 ? 'high' : 'medium',
        });
      }
    }
  }

  const others = [];
  for (const [d, skills] of Object.entries(INDUSTRY_TRENDS)) {
    if (d !== domain) {
      for (const skill of skills) {
        if (!currentSkills.has(skill.toLowerCase())) {
          others.push({
            skill,
            reason: `Valuable skill in ${d}`,
            priority: 'low',
          });
        }
      }
    }
  }

  suggestions.push(...others.slice(0, 10));

  const grouped = {
    high: suggestions.filter((s) => s.priority === 'high'),
    medium: suggestions.filter((s) => s.priority === 'medium'),
    low: suggestions.filter((s) => s.priority === 'low'),
  };

  logger.debug(`[suggestSkillImprovements] ${suggestions.length} suggestions for domain=${domain}`);
  return { suggestions: suggestions.slice(0, 20), grouped, targetDomain: domain };
}

module.exports = suggestSkillImprovements;
