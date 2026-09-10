import { db } from "@/backend/db";
import { teacher } from "@/backend/db/schema/teachers/teacher";

const rows = await db.select().from(teacher);
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
