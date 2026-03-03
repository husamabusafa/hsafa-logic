import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/spaces/schema.prisma",
  datasource: {
    url: env("SPACES_DATABASE_URL"),
  },
});
