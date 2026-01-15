/**
 * Extracts company domain from email address
 * e.g., "john@acme.com" -> "acme.com"
 */
export function extractDomainFromEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return '';
  }
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return domain;
}

/**
 * Extracts company name from email domain
 * e.g., "john@acme.com" -> "acme"
 * Handles common email providers specially
 */
export function extractCompanyFromEmail(email: string): string {
  const domain = extractDomainFromEmail(email);
  if (!domain) return '';

  // Common personal email providers - return domain as-is
  const personalProviders = [
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'icloud.com',
    'aol.com',
    'protonmail.com',
    'mail.com',
  ];

  if (personalProviders.includes(domain)) {
    return domain;
  }

  // For business domains, return the full domain
  return domain;
}

/**
 * Get unique company domains from a list of emails
 */
export function getUniqueCompanies(emails: string[]): string[] {
  const companies = emails
    .map(extractCompanyFromEmail)
    .filter((company) => company !== '');

  return [...new Set(companies)];
}
