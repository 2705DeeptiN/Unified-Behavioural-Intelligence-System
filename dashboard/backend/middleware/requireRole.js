/**
 * Role-gate middleware. Use:
 *   router.use(requireRole('teacher'))           // only teachers
 *   router.use(requireRole('hod', 'admin'))      // HOD or admin
 *
 * Reads the user's role from the JWT (auth middleware must run first).
 * Returns 403 if the role isn't on the allowed list.
 */
module.exports = function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.user && req.user.role;
    if (!role) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    if (!allowed.includes(role)) {
      return res.status(403).json({
        message: `This action requires one of: ${allowed.join(', ')}. Your role is ${role}.`,
      });
    }
    next();
  };
};
