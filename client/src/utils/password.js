export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { id: 'lower', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { id: 'number', label: 'One number', test: (value) => /\d/.test(value) },
  { id: 'special', label: 'One special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export function passwordIssue(value) {
  if (!value) return 'Create a password.';
  if (value.length > 72) return 'Use 72 characters or fewer.';
  const failed = PASSWORD_RULES.find((rule) => !rule.test(value));
  return failed ? failed.label : '';
}

export function isPasswordValid(value) {
  return Boolean(value) && value.length <= 72 && PASSWORD_RULES.every((rule) => rule.test(value));
}
