import { defineConfig } from "@prisma/client";

export default defineConfig({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "postgresql://test_user:password@localhost:5432/nexo",
    },
  },
});
