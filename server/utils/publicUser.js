function toPublicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    department: row.department,
    designation: row.designation,
    isActive: row.is_active,
    accountStatus: row.account_status || 'ACTIVE',
    mustChangePassword: Boolean(row.must_change_password),
    role: {
      id: row.role_id,
      code: row.role_code,
      name: row.role_name,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

module.exports = { toPublicUser };
