import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

async function main() {
  // --- Roles
  const roleDefs = [
    { key: 'admin' as const, name: 'Admin' },
    { key: 'instructor' as const, name: 'Instructor' },
    { key: 'student' as const, name: 'Student' },
  ];
  for (const r of roleDefs) {
    await prisma.role.upsert({ where: { key: r.key }, update: {}, create: r });
  }

  // --- Demo users (password: Passw0rd123)
  const passwordHash = await hash('Passw0rd123');
  const demoUsers = [
    { name: 'Admin User', email: 'admin@webhackacademy.com', role: 'admin' as const },
    { name: 'Alicia Moreno', email: 'instructor@webhackacademy.com', role: 'instructor' as const },
    { name: 'Rahul Kaushik', email: 'student@webhackacademy.com', role: 'student' as const },
  ];
  for (const u of demoUsers) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: u.role } });
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash,
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: role.id } },
      },
    });
  }

  const instructor = await prisma.user.findUniqueOrThrow({
    where: { email: 'instructor@webhackacademy.com' },
  });

  // --- Categories
  const categoryDefs = [
    { name: 'Development', slug: 'development' },
    { name: 'Design', slug: 'design' },
    { name: 'Data', slug: 'data' },
    { name: 'Security', slug: 'security' },
    { name: 'Business', slug: 'business' },
  ];
  for (const c of categoryDefs) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }
  const development = await prisma.category.findUniqueOrThrow({ where: { slug: 'development' } });
  const design = await prisma.category.findUniqueOrThrow({ where: { slug: 'design' } });

  // --- Sample published courses (idempotent by slug)
  const courseDefs = [
    {
      slug: 'fullstack-web-development',
      title: 'Full-Stack Web Development',
      subtitle: 'Ship production web apps with React & Node.',
      categoryId: development.id,
      level: 'intermediate' as const,
      priceCents: 4900,
      description:
        'A practical, project-based path from fundamentals to shipping full-stack applications with React, Node and PostgreSQL.',
      outcomes: ['Build full-stack apps', 'Design REST APIs', 'Deploy to production'],
      requirements: ['Basic JavaScript', 'A computer with internet'],
    },
    {
      slug: 'product-design-masterclass',
      title: 'Product Design Masterclass',
      subtitle: 'From wireframe to polished, shippable product UI.',
      categoryId: design.id,
      level: 'beginner' as const,
      priceCents: 0,
      description:
        'Learn the end-to-end product design process: research, wireframing, visual design and handoff.',
      outcomes: ['Design polished UIs', 'Run a design process', 'Build a portfolio piece'],
      requirements: ['No prior experience required'],
    },
  ];

  for (const c of courseDefs) {
    const existing = await prisma.course.findUnique({ where: { slug: c.slug } });
    if (existing) continue;
    await prisma.course.create({
      data: {
        slug: c.slug,
        title: c.title,
        subtitle: c.subtitle,
        description: c.description,
        outcomes: c.outcomes,
        requirements: c.requirements,
        categoryId: c.categoryId,
        instructorId: instructor.id,
        level: c.level,
        priceCents: c.priceCents,
        currency: 'USD',
        status: 'published',
        publishedAt: new Date(),
        durationSeconds: 6 * 3600,
        modules: {
          create: [
            {
              title: 'Getting Started',
              position: 1,
              lessons: {
                create: [
                  { title: 'Welcome & setup', type: 'video', position: 1, durationSeconds: 360, isPreview: true },
                  { title: 'Core concepts', type: 'video', position: 2, durationSeconds: 540 },
                ],
              },
            },
            {
              title: 'Building the Project',
              position: 2,
              lessons: {
                create: [
                  { title: 'Project walkthrough', type: 'video', position: 1, durationSeconds: 720 },
                  { title: 'Module quiz', type: 'quiz', position: 2, durationSeconds: 600 },
                ],
              },
            },
          ],
        },
      },
    });
  }

  console.log('✔ Seed complete.');
  console.log('  Users (password Passw0rd123): admin@ / instructor@ / student@webhackacademy.com');
  console.log(`  Categories: ${categoryDefs.length} · Courses: ${courseDefs.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
