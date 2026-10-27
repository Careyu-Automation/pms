const { body } = require('express-validator');
const { passwordError } = require('../utils/passwordPolicy');

const optionalText = (field, label) => body(field)
  .optional({ values: 'falsy' })
  .trim()
  .isLength({ max: 100 })
  .withMessage(`${label} must be 100 characters or fewer.`)
  .matches(/^[\p{L}\d\s&.'/-]+$/u)
  .withMessage(`${label} contains unsupported characters.`);

const signupRules = [
  body('fullName')
    .isString()
    .withMessage('Enter your full name.')
    .trim()
    .notEmpty()
    .withMessage('Enter your full name.')
    .isLength({ min: 2, max: 150 })
    .withMessage('Name must be between 2 and 150 characters.')
    .matches(/^[\p{L}][\p{L}\s.'-]*$/u)
    .withMessage('Use letters, spaces, apostrophes, or hyphens.'),
  body('email')
    .isString()
    .withMessage('Enter your work email.')
    .trim()
    .toLowerCase()
    .notEmpty()
    .withMessage('Enter your work email.')
    .isEmail()
    .withMessage('Enter a valid work email.')
    .isLength({ max: 254 })
    .withMessage('Email is too long.'),
  body('password').custom((value) => {
    const issue = passwordError(value);
    if (issue) throw new Error(issue);
    return true;
  }),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match.');
    }
    return true;
  }),
  optionalText('department', 'Department'),
  optionalText('designation', 'Designation'),
];

const loginRules = [
  body('email')
    .isString()
    .withMessage('Enter your work email.')
    .trim()
    .toLowerCase()
    .notEmpty()
    .withMessage('Enter your work email.')
    .isEmail()
    .withMessage('Enter a valid work email.'),
  body('password')
    .isString()
    .withMessage('Enter your password.')
    .notEmpty()
    .withMessage('Enter your password.')
    .isLength({ max: 72 })
    .withMessage('Password must be at most 72 characters.'),
  body('rememberMe')
    .optional()
    .isBoolean()
    .withMessage('Remember me must be true or false.'),
];

module.exports = {
  signupRules,
  loginRules,
};
