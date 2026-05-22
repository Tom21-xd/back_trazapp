export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRATION || '1h',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10,
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL, 10) || 60,
    limit: parseInt(process.env.THROTTLE_LIMIT, 10) || 120,
  },
  push: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
    vapidSubject:
      process.env.VAPID_SUBJECT || 'mailto:trazapp@florencia.gov.co',
  },
  mail: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'TrazApp <no-reply@trazapp.local>',
  },
  retention: {
    // Días tras los cuales se purgan datos (0 = no purgar esa categoría).
    notificationsReadDays:
      parseInt(process.env.RETENTION_NOTIFICATIONS_READ_DAYS, 10) || 60,
    notificationsAllDays:
      parseInt(process.env.RETENTION_NOTIFICATIONS_DAYS, 10) || 180,
    auditDays: parseInt(process.env.RETENTION_AUDIT_DAYS, 10) || 365,
  },
});
