export type PhoneValidationInput = {
  countryIso2: string;
  dialCode: string;
  nationalNumber: string;
};

export type PhoneValidationResult = {
  valid: boolean;
  message: string;
  digits: string;
  fullPhone?: string;
};

export function validatePhoneByCountry(input: PhoneValidationInput): PhoneValidationResult;
export function buildInternationalPhone(dialCode: string, nationalNumber: string): string;
export function normalizeDigits(value: string): string;
