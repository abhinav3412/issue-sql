const COUNTRY_PHONE_LENGTHS = {
  IN: { min: 10, max: 10 },
  US: { min: 10, max: 10 },
  CA: { min: 10, max: 10 },
  GB: { min: 10, max: 10 },
  AE: { min: 9, max: 9 },
  SA: { min: 9, max: 9 },
  AU: { min: 9, max: 9 },
  DE: { min: 10, max: 11 },
  FR: { min: 9, max: 9 },
  IT: { min: 9, max: 10 },
  ES: { min: 9, max: 9 },
  NL: { min: 9, max: 9 },
  BE: { min: 8, max: 9 },
  CH: { min: 9, max: 9 },
  AT: { min: 10, max: 13 },
  PL: { min: 9, max: 9 },
  RU: { min: 10, max: 10 },
  JP: { min: 10, max: 11 },
  KR: { min: 9, max: 11 },
  CN: { min: 11, max: 11 },
  HK: { min: 8, max: 8 },
  SG: { min: 8, max: 8 },
  MY: { min: 9, max: 10 },
  TH: { min: 9, max: 10 },
  ID: { min: 9, max: 11 },
  PH: { min: 10, max: 10 },
  VN: { min: 9, max: 10 },
  PK: { min: 10, max: 10 },
  BD: { min: 10, max: 10 },
  LK: { min: 9, max: 9 },
  NP: { min: 10, max: 10 },
  ZA: { min: 9, max: 9 },
  EG: { min: 10, max: 10 },
  NG: { min: 10, max: 10 },
  KE: { min: 9, max: 10 },
  GH: { min: 9, max: 9 },
  BR: { min: 10, max: 11 },
  MX: { min: 10, max: 10 },
  AR: { min: 10, max: 10 },
  CL: { min: 9, max: 9 },
  CO: { min: 10, max: 10 },
  PE: { min: 9, max: 9 },
  PT: { min: 9, max: 9 },
  SE: { min: 7, max: 10 },
  NO: { min: 8, max: 8 },
  DK: { min: 8, max: 8 },
  FI: { min: 9, max: 10 },
  IE: { min: 9, max: 9 },
  NZ: { min: 8, max: 10 },
  IL: { min: 9, max: 9 },
  TR: { min: 10, max: 10 },
  GR: { min: 10, max: 10 },
  CZ: { min: 9, max: 9 },
  RO: { min: 9, max: 9 },
  HU: { min: 9, max: 9 },
  UA: { min: 9, max: 9 },
  QA: { min: 8, max: 8 },
  KW: { min: 8, max: 8 },
  BH: { min: 8, max: 8 },
  OM: { min: 8, max: 8 },
  JO: { min: 9, max: 9 },
  LB: { min: 7, max: 8 },
  IQ: { min: 10, max: 10 },
  IR: { min: 10, max: 10 },
  AF: { min: 9, max: 9 },
  MM: { min: 8, max: 10 },
  KZ: { min: 10, max: 10 },
  UZ: { min: 9, max: 9 },
  CY: { min: 8, max: 8 },
  LU: { min: 9, max: 9 },
  MT: { min: 8, max: 8 },
  EE: { min: 7, max: 8 },
  LV: { min: 8, max: 8 },
  LT: { min: 8, max: 8 },
  SK: { min: 9, max: 9 },
  SI: { min: 8, max: 8 },
  HR: { min: 8, max: 9 },
  BG: { min: 8, max: 9 },
  RS: { min: 8, max: 9 },
  IS: { min: 7, max: 9 },
  EC: { min: 9, max: 9 },
  VE: { min: 10, max: 10 },
  CR: { min: 8, max: 8 },
  PA: { min: 8, max: 8 },
  GT: { min: 8, max: 8 },
  CU: { min: 8, max: 8 },
  PR: { min: 10, max: 10 },
  DO: { min: 10, max: 10 },
  JM: { min: 10, max: 10 },
  ET: { min: 9, max: 9 },
  TZ: { min: 9, max: 9 },
  UG: { min: 9, max: 9 },
  MA: { min: 9, max: 9 },
  TN: { min: 8, max: 8 },
  LY: { min: 9, max: 9 },
  SD: { min: 9, max: 9 },
  DZ: { min: 9, max: 9 },
  ZW: { min: 9, max: 9 },
  MZ: { min: 8, max: 9 },
  MU: { min: 8, max: 8 },
  BW: { min: 8, max: 8 },
  NA: { min: 9, max: 9 },
  AO: { min: 9, max: 9 },
  SN: { min: 9, max: 9 },
  CI: { min: 8, max: 10 },
  CM: { min: 9, max: 9 },
};

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getCountryPhoneRule(iso2) {
  return COUNTRY_PHONE_LENGTHS[String(iso2 || "").toUpperCase()] || { min: 6, max: 14 };
}

function buildInternationalPhone(dialCode, nationalNumber) {
  const cleanDial = String(dialCode || "").trim().replace(/[^\d+]/g, "");
  const cleanNational = normalizeDigits(nationalNumber);
  const dial = cleanDial.startsWith("+") ? cleanDial : `+${cleanDial.replace(/\D/g, "")}`;
  return `${dial}${cleanNational}`;
}

function validatePhoneByCountry({ countryIso2, dialCode, nationalNumber }) {
  const digits = normalizeDigits(nationalNumber);
  const rule = getCountryPhoneRule(countryIso2);
  if (!digits) {
    return { valid: false, message: "Phone number is required", digits };
  }
  if (digits.length < rule.min || digits.length > rule.max) {
    const expected =
      rule.min === rule.max ? `${rule.min}` : `${rule.min} to ${rule.max}`;
    return {
      valid: false,
      message: `Phone number must be ${expected} digits for selected country`,
      digits,
    };
  }
  return { valid: true, message: "", digits, fullPhone: buildInternationalPhone(dialCode, digits) };
}

module.exports = {
  COUNTRY_PHONE_LENGTHS,
  getCountryPhoneRule,
  normalizeDigits,
  buildInternationalPhone,
  validatePhoneByCountry,
};
