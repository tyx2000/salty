ALTER TABLE "messages" ALTER COLUMN "content_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "content_nonce" DROP NOT NULL;