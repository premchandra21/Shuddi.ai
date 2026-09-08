// prisma/seed.ts
//npx prisma migrate reset.
import {
  PrismaClient,
  UserRole,
  PostStatus,
  BadgeRarity,
  // Import new Enums for Tasks
  TaskType, Difficulty, TaskCategory, TaskVerificationType,
  NGOStatus,
  MembershipStatus,
  ApplicationStatus,
  DocumentType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { hashPassword } from '../src/core-backend/auth/utils/helpers';
import { generateRubric, toPythonType } from '../src/gateway/services/verification-client.service';

dotenv.config();

// Same rubric-generation step admin.service.ts runs when an NGO/admin creates
// an individual task from the dashboard (verification-api's /rubric/generate,
// backed by Gemini). The seed was creating IndividualTask rows directly via
// Prisma and skipping this call entirely, which is why `prompt` was always
// null for seeded tasks and verification had nothing to check submissions
// against. Requires verification-api to be running (see VERIFICATION_API_URL,
// defaults to http://localhost:8000) -- if it isn't, we log a warning and
// leave prompt undefined rather than failing the whole seed.
const generateTaskPrompt = async (
  title: string,
  description: string,
  verificationType: Exclude<TaskVerificationType, 'MCQ'>
): Promise<string | undefined> => {
  try {
    const rubric = await generateRubric(title, description, toPythonType(verificationType));
    return rubric.criteria_text;
  } catch (err: any) {
    // axios throws on non-2xx, but err.message is just "Request failed with
    // status code 502" -- the actual reason (bad/expired GOOGLE_API_KEY, no
    // quota, model not enabled, etc.) is in the response body's `detail`
    // field, set by verification-api's `except Exception as e: raise
    // HTTPException(..., detail=f"Rubric generation failed: {e}")`. Surface
    // that instead of just the generic HTTP status message, or every 5xx
    // looks like "verification-api isn't running" even when it is.
    const detail = err?.response?.data?.detail ?? err?.message ?? err;
    console.warn(`⚠️  Could not generate verification prompt for "${title}": ${detail}`);
    return undefined;
  }
};

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

//npx prisma migrate reset
//npx prisma generate
//npx prisma db seed

async function main() {
  console.log('🌱 Starting seed...');

  // 2. Create Global Badges
  console.log('🏆 Creating Badges...');
  const badges = await Promise.all([
    prisma.badge.create({
      data: {
        name: 'Eco Warrior',
        description: 'First 10kg of plastic removed.',
        imageUrl: 'https://cdn-icons-png.flaticon.com/512/6270/6270295.png',
        rarity: BadgeRarity.COMMON,
        criteria: 'Remove 10kg',
      },
    }),
    prisma.badge.create({
      data: {
        name: 'Plastic Slayer',
        description: 'Completed 5 cleanups in a week.',
        imageUrl: 'https://cdn-icons-png.flaticon.com/512/4343/4343315.png',
        rarity: BadgeRarity.RARE,
        criteria: '5 contributions',
      },
    }),
    prisma.badge.create({
      data: {
        name: 'Earth Guardian',
        description: 'Top 1% of the global leaderboard.',
        imageUrl: 'https://cdn-icons-png.flaticon.com/512/1162/1162456.png',
        rarity: BadgeRarity.LEGENDARY,
        criteria: 'Global Rank #1',
      },
    }),
  ]);

  console.log("Creating campaigns")
  await prisma.campaigns.createMany({
    data: [
      {
        title: 'Plant Trees for Urban Cities',
        description:
          'Help fund tree plantation drives in urban areas to improve air quality and reduce heat.',
        isActive: true,
      },
      {
        title: 'Clean Water for Rural Communities',
        description:
          'Support initiatives that provide clean and safe drinking water to rural villages.',
        isActive: true,
      },
      {
        title: 'Waste Reduction & Recycling Program',
        description:
          'Fund community-led recycling and waste reduction programs to promote sustainability.',
        isActive: true,
      },
    ],
  });

  // 3. Create the Super Admin
  const email = "admin@shuddi.com";
  const hashedPassword = await hashPassword("superAdmin@123");
  await prisma.user.upsert({
    where: { email },
    update: {
      role: UserRole.SUPER_ADMIN,
      passwordHash: hashedPassword,
      emailVerified: true,
    },
    create: {
      email,
      passwordHash: hashedPassword,
      role: UserRole.SUPER_ADMIN,
      emailVerified: true,
    },
  });

  console.log("✅ Super Admin seeded");

  await prisma.area.createMany({
    data: [
      { name: "Bhubaneswar", code: "BBSR" },
      { name: "Cuttack", code: "CTC" },
      { name: "Puri", code: "PRI" },
      { name: "Rourkela", code: "RRK" },
      { name: "Berhampur", code: "BAM" }
    ],
    skipDuplicates: true
  });

  const areas = await prisma.area.findMany();

  const areaMap = new Map(
    areas.map((area) => [area.name, area.id])
  );

  console.log("Areas seeded successfully");

  // ===================================
  // NGO ROLES
  // ===================================

  const ngoOwnerRole = await prisma.role.upsert({
    where: { name: "NGO_OWNER" },
    update: {},
    create: {
      name: "NGO_OWNER",
      description: "Owner of NGO",
    },
  });

  const ngoManagerRole = await prisma.role.upsert({
    where: { name: "NGO_MANAGER" },
    update: {},
    create: {
      name: "NGO_MANAGER",
      description: "Manages NGO operations",
    },
  });

  const ngoVolunteerRole = await prisma.role.upsert({
    where: { name: "NGO_VOLUNTEER" },
    update: {},
    create: {
      name: "NGO_VOLUNTEER",
      description: "Volunteer",
    },
  });

  // ===================================
  // PERMISSIONS
  // ===================================

  const permissions = [
    {
      key: "CREATE_COMMUNITY_TASK",
      description: "Can create community tasks",
    },
    {
      key: "REVIEW_SUBMISSIONS",
      description: "Can review task submissions",
    },
    {
      key: "MANAGE_MEMBERS",
      description: "Can manage NGO members",
    },
    {
      key: "CREATE_REWARD",
      description: "Can create rewards",
    },
    {
      key: "MANAGE_REWARDS",
      description: "Can manage rewards",
    },
    {
      key: "CREATE_INDIVIDUAL_TASK",
      description: "Can create individual tasks",
    },
    {
      key: "MANAGE_INDIVIDUAL_TASKS",
      description: "Can manage individual tasks",
    },
    {
      key: "VIEW_ANALYTICS",
      description: "Can view NGO analytics",
    },
    {
      key: "MANAGE_NGO_SETTINGS",
      description: "Can manage NGO settings",
    },
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {},
      create: permission,
    });
  }

  const allPermissions = await prisma.permission.findMany();

  const permissionMap = new Map(
    allPermissions.map((p) => [p.key, p.id])
  );

  const ownerPermissions = [
    "CREATE_COMMUNITY_TASK",
    "REVIEW_SUBMISSIONS",
    "MANAGE_MEMBERS",

    "CREATE_REWARD",
    "MANAGE_REWARDS",

    "CREATE_INDIVIDUAL_TASK",
    "MANAGE_INDIVIDUAL_TASKS",

    "VIEW_ANALYTICS",

    "MANAGE_NGO_SETTINGS",
  ];

  const managerPermissions = [
    "CREATE_COMMUNITY_TASK",
    "REVIEW_SUBMISSIONS",

    "CREATE_REWARD",

    "CREATE_INDIVIDUAL_TASK",

    "VIEW_ANALYTICS",
  ];

  for (const permissionKey of ownerPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ngoOwnerRole.id,
          permissionId: permissionMap.get(permissionKey)!,
        },
      },
      update: {},
      create: {
        roleId: ngoOwnerRole.id,
        permissionId: permissionMap.get(permissionKey)!,
      },
    });
  }

  for (const permissionKey of managerPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ngoManagerRole.id,
          permissionId: permissionMap.get(permissionKey)!,
        },
      },
      update: {},
      create: {
        roleId: ngoManagerRole.id,
        permissionId: permissionMap.get(permissionKey)!,
      },
    });
  }



  const bhubaneswarArea = await prisma.area.findUnique({
    where: {
      code: "BBSR",
    },
  });

  const puriArea = await prisma.area.findUnique({
    where: {
      code: "PRI",
    },
  });

  const ngoOwner = await prisma.user.upsert({
    where: {
      email: "owner@greenodisha.org",
    },
    update: {},
    create: {
      email: "owner@greenodisha.org",
      passwordHash:
        "$2b$10$wKA5lqQNJAIN48dUWLph0.aUaQ0FuaYDS62BCMPWb8uYtRxwuODW6",
      role: UserRole.ADMIN,
      status: "ACTIVE",
      emailVerified: true,

      profile: {
        create: {
          username: "green_owner",
          displayName: "NGO Owner",
          country: "India",
          state: "Odisha",
          city: "Bhubaneswar",
        },
      },
    },
  });

  const ngo = await prisma.nGO.create({
    data: {
      name: "Green Odisha Foundation",
      status: NGOStatus.APPROVED,
      areaId: bhubaneswarArea!.id,
      ownerId: ngoOwner.id,
    },
  });


  // 5. Citizens Data
  const citizensData = [
    {
      email: "rahul@shuddi.ai",
      username: "rahul_clean",
      displayName: "Rahul Verma",
      city: "Mumbai",
      state: "Maharashtra",
      area: "Bhubaneswar",
      posts: ["Post 1", "Post 2"],
    },

    {
      email: "priya@shuddi.ai",
      username: "priya_green",
      displayName: "Priya Sharma",
      city: "Bangalore",
      state: "Karnataka",
      area: "Bhubaneswar",
      posts: ["Post 1"],
    },

    {
      email: "amit@shuddi.ai",
      username: "amit_zero",
      displayName: "Amit Patel",
      city: "Ahmedabad",
      state: "Gujarat",
      area: "Cuttack",
      posts: ["Post 1", "Post 2", "Post 3"],
    },

    {
      email: "sneha@shuddi.ai",
      username: "sneha_hyd",
      displayName: "Sneha Reddy",
      city: "Hyderabad",
      state: "Telangana",
      area: "Puri",
      posts: ["Post 1"],
    },

    {
      email: "vikram@shuddi.ai",
      username: "vikram_jpr",
      displayName: "Vikram Singh",
      city: "Jaipur",
      state: "Rajasthan",
      area: "Rourkela",
      posts: ["Post 1"],
    },

    {
      email: "anjali@shuddi.ai",
      username: "anjali_kol",
      displayName: "Anjali Das",
      city: "Kolkata",
      state: "West Bengal",
      area: "Berhampur",
      posts: ["Post 1", "Post 2"],
    },

    {
      email: "arjun@shuddi.ai",
      username: "arjun_chennai",
      displayName: "Arjun Nair",
      city: "Chennai",
      state: "Tamil Nadu",
      area: "Bhubaneswar",
      posts: ["Post 1"],
    },
  ];

  // 6. Loop and Create Users with Full Dashboard Stats
  for (let i = 0; i < citizensData.length; i++) {
    const data = citizensData[i];
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: "$2b$10$wKA5lqQNJAIN48dUWLph0.aUaQ0FuaYDS62BCMPWb8uYtRxwuODW6",
        role: UserRole.CITIZEN,
        status: 'ACTIVE',
        emailVerified: true,
        areaId: areaMap.get(data.area),
        profile: {
          create: {
            username: data.username,
            displayName: data.displayName,
            country: 'India',
            state: data.state,
            city: data.city,
          },
        },
        stats: {
          create: {
            xp: Math.floor(Math.random() * 2000),
            level: Math.floor(Math.random() * 10) + 1,
            totalContributions: data.posts.length,
            totalWeightRemoved: Math.random() * 50,
            nextMilestone: 100.0,
            currentStreak: Math.floor(Math.random() * 10),
            longestStreak: 12,
            rewardPoints: Math.floor(Math.random() * 500),
            globalRank: i + 2,
            region: data.city,
            regionalRank: 1,
            actionsLast7Days: Math.floor(Math.random() * 15),
            engagementLevel: Math.random() * 5.0
          },
        },
        posts: {
          create: data.posts.map(content => ({ content, status: PostStatus.PUBLISHED })),
        },
      },
    });


    // 7. Assign a random badge to each user
    await prisma.userBadge.create({
      data: {
        userId: user.id,
        badgeId: badges[i % badges.length].id,
      },
    });

    console.log(`✅ Created Citizen & Stats: ${data.email}`);
  }



  await prisma.nGOMember.create({
    data: {
      ngoId: ngo.id,
      userId: ngoOwner.id,
      roleId: ngoOwnerRole.id,
      status: MembershipStatus.ACTIVE,
    },
  });

  const ngoApplication = await prisma.nGOApplication.create({
    data: {
      userId: ngoOwner.id,
      name: "Helping Hands Foundation",
      description: "Works on sustainability initiatives",
      areaId: bhubaneswarArea!.id,
      status: ApplicationStatus.PENDING,
    },
  });

  await prisma.nGODocument.createMany({
    data: [
      {
        applicationId: ngoApplication.id,
        type: DocumentType.REGISTRATION_CERTIFICATE,
        url: "https://example.com/certificate.pdf",
      },
      {
        applicationId: ngoApplication.id,
        type: DocumentType.PAN_CARD,
        url: "https://example.com/pan.pdf",
      },
    ],
  });
  // 2. Seed campaigns (dummy data for Razorpay testing)

  // ----------------------------
  // INDIVIDUAL TASK 1 (One-time)
  // ----------------------------
  const task1Prompt = await generateTaskPrompt(
    "Plant a Tree",
    "Plant a tree in your locality and upload proof.",
    TaskVerificationType.IMAGE
  );

  const task1 = await prisma.task.create({
    data: {
      type: TaskType.INDIVIDUAL,
      title: "Plant a Tree",
      description: "Plant a tree in your locality and upload proof.",
      baseScore: 50,
      individualTask: {
        create: {
          difficulty: Difficulty.EASY,
          category: TaskCategory.SUSTAINABILITY,
          verificationType: TaskVerificationType.IMAGE,
          cooldownDays: null, // one-time
          isDaily: false,
          requirements: {
            description: "Upload an image while planting the tree",
          },
          educationalLink: "https://en.wikipedia.org/wiki/Tree_planting",
          factContent: "Planting trees helps absorb CO2 and improves air quality.",
          prompt: task1Prompt,
        },
      },
    },
  });

  // ----------------------------
  // INDIVIDUAL TASK 2 (Repeatable after 7 days)
  // ----------------------------
  const task2 = await prisma.task.create({
    data: {
      type: TaskType.INDIVIDUAL,
      title: "Waste Segregation Awareness",
      description: "Learn about waste segregation and answer a short quiz.",
      baseScore: 30,
      individualTask: {
        create: {
          difficulty: Difficulty.EASY,
          category: TaskCategory.EDUCATION,
          verificationType: TaskVerificationType.MCQ,
          cooldownDays: 7, // 🔥 repeatable
          isDaily: false,
          requirements: {
            question: "Which bin is used for biodegradable waste?",
          },
          educationalLink: "https://swachhbharatmission.gov.in",
          factContent: "Segregating waste reduces landfill burden.",
        },
      },
    },
  });

  const wasteTask = await prisma.individualTask.findUnique({
    where: {
      taskId: task2.id,
    },
  });

  await prisma.mCQQuestion.createMany({
    data: [
      {
        taskId: wasteTask!.id,
        question: "Which bin is used for biodegradable waste?",
        options: ["Green", "Blue", "Red", "Black"],
        correct: "Green",
      },
      {
        taskId: wasteTask!.id,
        question: "Which waste is recyclable?",
        options: ["Plastic Bottle", "Food Waste", "Leaves", "Banana Peel"],
        correct: "Plastic Bottle",
      },
    ],
  });

  // ----------------------------
  // INDIVIDUAL TASK 3 (Hard + 15 day cooldown)
  // ----------------------------
  const task3Prompt = await generateTaskPrompt(
    "Community Clean Drive",
    "Organize or participate in a local clean-up drive.",
    TaskVerificationType.IMAGE
  );

  const task3 = await prisma.task.create({
    data: {
      type: TaskType.INDIVIDUAL,
      title: "Community Clean Drive",
      description: "Organize or participate in a local clean-up drive.",
      baseScore: 100,
      individualTask: {
        create: {
          difficulty: Difficulty.HARD,
          category: TaskCategory.SUSTAINABILITY,
          verificationType: TaskVerificationType.IMAGE,
          cooldownDays: 15,
          isDaily: false,
          requirements: {
            description: "Upload before and after images of the cleaned area",
          },
          factContent: "Clean environments reduce disease spread.",
          prompt: task3Prompt,
        },
      },
    },
  });

  // ----------------------------
  // DAILY TASK 1
  // ----------------------------
  const task4Prompt = await generateTaskPrompt(
    "Drink 2L Water",
    "Stay hydrated and track your daily water intake.",
    TaskVerificationType.TEXT
  );

  const task4 = await prisma.task.create({
    data: {
      type: TaskType.INDIVIDUAL,
      title: "Drink 2L Water",
      description: "Stay hydrated and track your daily water intake.",
      baseScore: 10,
      individualTask: {
        create: {
          difficulty: Difficulty.EASY,
          category: TaskCategory.COMMUNITY,
          verificationType: TaskVerificationType.TEXT,
          cooldownDays: 1,
          isDaily: true,
          requirements: {
            description: "Enter how much water you drank today",
          },
          factContent: "Proper hydration improves brain function and energy levels.",
          prompt: task4Prompt,
        },
      },
    },
  });

  // ----------------------------
  // DAILY TASK 2
  // ----------------------------
  const task5Prompt = await generateTaskPrompt(
    "Walk 5,000 Steps",
    "Complete at least 5,000 steps today.",
    TaskVerificationType.TEXT
  );

  const task5 = await prisma.task.create({
    data: {
      type: TaskType.INDIVIDUAL,
      title: "Walk 5,000 Steps",
      description: "Complete at least 5,000 steps today.",
      baseScore: 15,
      individualTask: {
        create: {
          difficulty: Difficulty.MEDIUM,
          category: TaskCategory.COMMUNITY,
          verificationType: TaskVerificationType.TEXT,
          cooldownDays: 1,
          isDaily: true,
          requirements: {
            description: "Upload step count screenshot or enter manually",
          },
          factContent: "Walking daily reduces risk of heart disease.",
          prompt: task5Prompt,
        },
      },
    },
  });

  // ----------------------------
  // DAILY TASK 3
  // ----------------------------
  const task6Prompt = await generateTaskPrompt(
    "Avoid Single-use Plastic",
    "Avoid using plastic items for a day.",
    TaskVerificationType.TEXT
  );

  const task6 = await prisma.task.create({
    data: {
      type: TaskType.INDIVIDUAL,
      title: "Avoid Single-use Plastic",
      description: "Avoid using plastic items for a day.",
      baseScore: 20,
      individualTask: {
        create: {
          difficulty: Difficulty.MEDIUM,
          category: TaskCategory.SUSTAINABILITY,
          verificationType: TaskVerificationType.TEXT,
          cooldownDays: 1,
          isDaily: true,
          requirements: {
            description: "Describe how you avoided plastic today",
          },
          factContent: "Plastic waste takes hundreds of years to decompose.",
          prompt: task6Prompt,
        },
      },
    },
  });

  // ----------------------------
  // COMMUNITY TASK 1
  // ----------------------------
  // const task7 = await prisma.task.create({
  //   data: {
  //     type: TaskType.COMMUNITY,
  //     title: "Beach Cleanup Drive",
  //     description: "Join the beach cleanup initiative organized by the NGO.",
  //     baseScore: 100,
  //     startAt: new Date(Date.now() - 1000 * 60 * 60), // started 1 hour ago
  //     endAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // ends tomorrow
  //     communityTask: {
  //       create: {
  //         maxParticipants: 50,
  //         minParticipants: 10,
  //         locationName: "Puri Beach",
  //         ngoId: ngo.id,
  //         areaId: puriArea!.id,
  //       }
  //     }
  //   }
  // });

  // ----------------------------
  // COMMUNITY TASK 2
  // ----------------------------
  // const task8 = await prisma.task.create({
  //   data: {
  //     type: TaskType.COMMUNITY,
  //     title: "Tree Plantation Camp",
  //     description: "Participate in a large-scale plantation drive.",
  //     baseScore: 80,
  //     startAt: new Date(Date.now() - 1000 * 60 * 60), // started 1 hour ago
  //     endAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // ends tomorrow
  //     communityTask: {
  //       create: {
  //         maxParticipants: 100,
  //         minParticipants: 20,
  //         locationName: "KIIT Campus",
  //         ngoId: ngo.id,
  //         areaId: bhubaneswarArea!.id,
  //       }
  //     }
  //   }
  // });
  console.log({ task1, task2, task3, task4, task5, task6, });

  await prisma.actionLog.createMany({
    data: [
      {
        ngoId: ngo.id,
        action: "NGO_CREATED",
        details: "NGO approved and onboarded",
      },
      {
        ngoId: ngo.id,
        action: "FIRST_TASK_CREATED",
        details: "Community task seeded",
      },
    ],
  });

  await prisma.reward.createMany({
    data: [
      {
        name: "Eco-Friendly Tote Bag",
        description: "Made from recycled materials",
        credits: 200,
        icon: "bag",
      },
      {
        name: "Reusable Water Bottle",
        description: "Reduce plastic waste",
        credits: 150,
        icon: "bottle",
      },
      {
        name: "Plant a Tree",
        description: "We plant a tree on your behalf",
        credits: 500,
        icon: "tree",
      },
      {
        name: "Organic Notebook",
        description: "Notebook made from recycled paper",
        credits: 120,
        icon: "notebook",
      }
    ]
  });

  console.log("Rewards seeded successfully 🌱");


  console.log('🌱 Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });