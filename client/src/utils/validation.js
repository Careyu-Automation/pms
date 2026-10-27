import { isPasswordValid } from './password';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u;
const TEXT_PATTERN = /^[\p{L}\d\s&.'/-]+$/u;

export function nameIssue(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return 'Enter your full name.';
  if (trimmed.length > 150) return 'Name must be 150 characters or fewer.';
  if (!NAME_PATTERN.test(trimmed)) return 'Use letters, spaces, apostrophes, or hyphens.';
  return '';
}

export function emailIssue(value) {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter your work email.';
  if (trimmed.length > 254 || !EMAIL_PATTERN.test(trimmed)) return 'Enter a valid work email.';
  return '';
}

function optionalTextIssue(value, label) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > 100) return `${label} must be 100 characters or fewer.`;
  if (!TEXT_PATTERN.test(trimmed)) return `${label} contains unsupported characters.`;
  return '';
}

export function validateLogin(values) {
  const errors = {};
  const email = emailIssue(values.email);
  if (email) errors.email = email;
  if (!values.password) errors.password = 'Enter your password.';
  else if (values.password.length > 72) errors.password = 'Password must be at most 72 characters.';
  return errors;
}

export function validateSignup(values) {
  const errors = {};
  const name = nameIssue(values.fullName);
  if (name) errors.fullName = name;
  const email = emailIssue(values.email);
  if (email) errors.email = email;
  if (!values.password) errors.password = 'Create a password.';
  else if (!isPasswordValid(values.password)) errors.password = 'Password does not meet the requirements.';
  if (!values.confirmPassword) errors.confirmPassword = 'Confirm your password.';
  else if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  const department = optionalTextIssue(values.department, 'Department');
  if (department) errors.department = department;
  const designation = optionalTextIssue(values.designation, 'Designation');
  if (designation) errors.designation = designation;
  return errors;
}
