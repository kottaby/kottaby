DO $$ BEGIN
    ALTER TABLE "home_work" ADD CONSTRAINT "home_work_session_id_unique" UNIQUE("session_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "reports" ADD CONSTRAINT "reports_session_id_unique" UNIQUE("session_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;