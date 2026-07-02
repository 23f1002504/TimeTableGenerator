const { PrismaClient } = require("@prisma/client");

// Single shared Prisma instance across the app (recommended by Prisma docs
// to avoid exhausting DB connections in dev with hot-reloading).
const prisma = new PrismaClient();

module.exports = prisma;
