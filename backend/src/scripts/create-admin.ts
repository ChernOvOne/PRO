import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createAdmin() {
  const args: Record<string,string> = {}
  process.argv.slice(2).forEach(arg => {
    const [k, v] = arg.replace('--','').split('=')
    args[k] = v
  })

  const email    = args.email    || process.env.ADMIN_EMAIL
  const password = args.password || process.env.ADMIN_PASSWORD

  if (!email || !password) {
    console.error('Usage: node create-admin.js --email=admin@example.com --password=secret')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    await prisma.user.update({
      where: { email },
      data:  {
        role:         'ADMIN',
        passwordHash: await bcrypt.hash(password, 12),
      },
    })
    console.log(`✅ Existing user ${email} promoted to ADMIN`)
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role:         'ADMIN',
      },
    })
    console.log(`✅ Admin account created: ${email}`)
  }

  await prisma.$disconnect()
}

createAdmin().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
