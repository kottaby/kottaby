/**
 * E2E fixture: provision a second admin actor for cross-user observation tests.
 * Uses the same RegistrationService.createAdminUser path as the seeders.
 */
import { Gender } from "@/backend/enum/users/gender.enum";
import { RegistrationService } from "@/backend/services";

async function main() {
  try {
    const admin = await RegistrationService.createAdminUser(
      {
        fullName: "Super Admin Two",
        email: "admin2@app.local",
        phone: "+201000000006",
        country: "Egypt",
        password: "adminpassword123",
        gender: Gender.Male,
        role: "admin",
      },
      "en"
    );
    console.log("CREATED admin2:", admin.email, "id:", (admin as { id?: number }).id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists") || msg.includes("23505")) {
      console.log("admin2 already exists — continuing");
    } else {
      throw err;
    }
  }
  process.exit(0);
}

void main();
