const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiry = new Date(Date.now() + 15 * 60 * 1000);
  
  await prisma.user.update({
    where: { email: 'sistemasalmacendelasmascotas@gmail.com' },
    data: { resetToken: hashedToken, resetTokenExpiry: expiry }
  });
  
  console.log('RAW_TOKEN=' + rawToken);
  console.log('EXPIRY=' + expiry.toISOString());
  process.exit(0);
})();
