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
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_VALIDATION_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}$/i;
const IGNORED_EMAIL_PREFIXES = ['noreply@', 'no-reply@', 'example@', 'test@'];
const WEBSITE_CANDIDATE_REGEX =
  /(https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"')\]]*)?)/i;

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

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),;:!?]+$/g, '');
}

function normalizeEmailCandidate(value: string): string | null {
  if (!value) return null;

  let normalized = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/^mailto:/, '')
    .split('?')[0];

  normalized = normalized.replace(/^[<[(\s'"]+/, '');
  normalized = normalized.replace(/[>\])\s'"]+$/g, '');
  normalized = stripTrailingPunctuation(normalized);

  if (!normalized) return null;
  if (!EMAIL_VALIDATION_REGEX.test(normalized)) return null;
  if (
    normalized.endsWith('.png') ||
    normalized.endsWith('.jpg') ||
    normalized.endsWith('.jpeg') ||
    normalized.endsWith('.webp') ||
    normalized.endsWith('.svg')
  ) {
    return null;
  }
  if (IGNORED_EMAIL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return null;
  }

  return normalized;
}

function extractEmailCandidates(value: string): string[] {
  if (!value || typeof value !== 'string') return [];

  const matches = value.match(EMAIL_REGEX) ?? [];
  const candidates = [value, ...matches]
    .map((candidate) => normalizeEmailCandidate(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));

  return Array.from(new Set(candidates));
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
    const sanitizedValue = stripTrailingPunctuation(value.trim());
    if (!sanitizedValue) return null;

    try {
      return new URL(sanitizedValue);
    } catch {
      return null;
    }
  };

  const rawCandidate =
    parseUrl(trimmed) ??
    parseUrl(`https://${trimmed}`) ??
    (() => {
      const match = trimmed.match(WEBSITE_CANDIDATE_REGEX);
      if (!match?.[0]) return null;

      const candidate = stripTrailingPunctuation(match[0]);
      return parseUrl(candidate) ?? parseUrl(`https://${candidate}`);
    })();

  const parsed = rawCandidate;
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
    return null;
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
      for (const normalized of extractEmailCandidates(value)) {
        merged.add(normalized);
      }
    }
  }

  return Array.from(merged);
}
