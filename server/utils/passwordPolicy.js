function passwordError(value) {
  if (typeof value !== 'string' || value.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (value.length > 72) {
    return 'Password must be at most 72 characters.';
  }
  if (!/[A-Z]/.test(value)) {
    return 'Password must include an uppercase letter.';
  }
  if (!/[a-z]/.test(value)) {
    return 'Password must include a lowercase letter.';
  }
  if (!/\d/.test(value)) {
    return 'Password must include a number.';
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    return 'Password must include a special character.';
  }
  return null;
}

module.exports = { passwordError };
