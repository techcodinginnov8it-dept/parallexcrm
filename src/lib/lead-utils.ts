type LeadIdentityInput = {
  name: string;
  website?: string | null;
  address?: string | null;
};

type LeadTagInput = {
  searchQuery?: string | null;
  category?: string | null;
};

type LeadTagResult = {
  businessTags: string[];
  generalBusinessTag: string;
};

const GENERAL_BUSINESS_FALLBACK = 'General Business';
const DEFAULT_TEXT_LIMIT = 255;

const BUSINESS_TAG_RULES: Array<{ tag: string; pattern: RegExp }> = [
  {
    tag: 'IT',
    pattern:
      /\b(it|software|saas|technology|tech|cyber|cloud|managed services?|msp|developer|development|digital solutions?)\b/i,
  },
  {
    tag: 'Real Estate',
    pattern:
      /\b(real estate|realty|property|properties|realtor|brokerage|estate agent|commercial real estate)\b/i,
  },
  {
    tag: 'Healthcare',
    pattern: /\b(healthcare|health care|medical|dental|clinic|hospital|pharma|therapy)\b/i,
  },
  {
    tag: 'Finance',
    pattern: /\b(finance|financial|accounting|bookkeeping|tax|insurance|mortgage)\b/i,
  },
  {
    tag: 'Legal',
    pattern: /\b(legal|law firm|attorney|lawyer|law office)\b/i,
  },
  {
    tag: 'Marketing',
    pattern: /\b(marketing|seo|advertising|branding|media|social media|ppc)\b/i,
  },
  {
    tag: 'Construction',
    pattern: /\b(construction|contractor|builder|roofing|plumbing|electrical|hvac|renovation)\b/i,
  },
  {
    tag: 'Education',
    pattern: /\b(education|school|academy|training|tutoring|course)\b/i,
  },
  {
    tag: 'Logistics',
    pattern: /\b(logistics|freight|shipping|trucking|courier|warehouse)\b/i,
  },
  {
    tag: 'Recruitment',
    pattern: /\b(recruitment|staffing|headhunter|talent|human resources|hr)\b/i,
  },
  {
    tag: 'Hospitality',
    pattern: /\b(restaurant|hotel|cafe|hospitality|catering|travel)\b/i,
  },
  {
    tag: 'Business Services',
    pattern: /\b(bpo|outsourcing|consulting|consultancy|business services?)\b/i,
  },
];

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeEmail(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeHost(rawUrl: string | null | undefined): string {
  if (!rawUrl) return '';

  const parseUrl = (value: string) => {
    try {
      return new URL(value);
    } catch {
      return new URL(`https://${value}`);
    }
  };

  try {
    return parseUrl(rawUrl).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return normalizeWhitespace(rawUrl).toLowerCase();
  }
}

function titleCaseTag(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function truncateString(value: string, maxLength: number = DEFAULT_TEXT_LIMIT): string {
  if (maxLength <= 0) return '';
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

export function normalizeOptionalString(
  value: string | null | undefined,
  maxLength: number = DEFAULT_TEXT_LIMIT
): string | null {
  if (!value || typeof value !== 'string') return null;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  return truncateString(normalized, maxLength);
}

export function normalizeWebsiteForStorage(
  rawUrl: string | null | undefined,
  maxLength: number = DEFAULT_TEXT_LIMIT
): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const parseUrl = (value: string): URL | null => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };

  const parsed = parseUrl(trimmed) ?? parseUrl(`https://${trimmed}`);
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
    return normalizeOptionalString(trimmed, maxLength);
  }

  parsed.hash = '';
  parsed.search = '';

  const compactUrl = parsed.toString();
  if (compactUrl.length <= maxLength) {
    return compactUrl;
  }

  const originOnly = parsed.origin;
  if (originOnly.length <= maxLength) {
    return originOnly;
  }

  return truncateString(compactUrl, maxLength);
}

export function buildLeadDedupeKey({ name, website, address }: LeadIdentityInput): string {
  return buildLeadDedupeCandidates({ name, website, address })[0];
}

export function buildLeadDedupeCandidates({
  name,
  website,
  address,
}: LeadIdentityInput): string[] {
  const normalizedName = normalizeWhitespace(name).toLowerCase();
  const normalizedAddress = normalizeWhitespace(address || '').toLowerCase();
  const normalizedWebsite = normalizeHost(website);
  const candidates = [
    normalizedWebsite
      ? `${normalizedName}|host:${normalizedWebsite}`
      : '',
    normalizedAddress
      ? `${normalizedName}|addr:${normalizedAddress}`
      : '',
    `${normalizedName}|${normalizedAddress || normalizedWebsite || 'no-location'}`,
    normalizedName,
  ]
    .map((value) => value.slice(0, 600))
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

export function inferLeadTags({ searchQuery, category }: LeadTagInput): LeadTagResult {
  const combinedContext = [searchQuery, category]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .trim();

  for (const rule of BUSINESS_TAG_RULES) {
    if (rule.pattern.test(combinedContext)) {
      return {
        businessTags: [rule.tag],
        generalBusinessTag: rule.tag,
      };
    }
  }

  const fallbackTag = combinedContext
    ? titleCaseTag(combinedContext)
    : GENERAL_BUSINESS_FALLBACK;

  return {
    businessTags: [fallbackTag],
    generalBusinessTag: fallbackTag,
  };
}

export function mergeUniqueStrings(...collections: Array<string[] | null | undefined>): string[] {
  const merged = new Set<string>();

  for (const collection of collections) {
    for (const value of collection || []) {
      const normalized = normalizeWhitespace(value);
      if (normalized) {
        merged.add(normalized);
      }
    }
  }

  return Array.from(merged);
}

export function mergeUniqueEmails(...collections: Array<string[] | null | undefined>): string[] {
  const merged = new Set<string>();

  for (const collection of collections) {
    for (const value of collection || []) {
      const normalized = normalizeEmail(value);
      if (normalized) {
        merged.add(normalized);
      }
    }
  }

  return Array.from(merged);
}
