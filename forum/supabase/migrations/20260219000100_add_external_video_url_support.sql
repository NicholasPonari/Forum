-- Add external video support to issues table
ALTER TABLE public.issues
ADD COLUMN IF NOT EXISTS external_video_url text;

-- Expand allowed media types to include external video posts
DO $$
DECLARE
	constraint_name text;
BEGIN
	SELECT con.conname
	INTO constraint_name
	FROM pg_constraint con
	JOIN pg_class rel ON rel.oid = con.conrelid
	JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
	WHERE nsp.nspname = 'public'
		AND rel.relname = 'issues'
		AND con.contype = 'c'
		AND pg_get_constraintdef(con.oid) ILIKE '%media_type%';

	IF constraint_name IS NOT NULL THEN
		EXECUTE format('ALTER TABLE public.issues DROP CONSTRAINT %I', constraint_name);
	END IF;
END;
$$;

ALTER TABLE public.issues
ADD CONSTRAINT issues_media_type_check
CHECK (media_type IS NULL OR media_type IN ('photo', 'video', 'external_video'));

-- Keep media lookups fast for mixed-media feeds
CREATE INDEX IF NOT EXISTS idx_issues_external_video_url
ON public.issues (external_video_url)
WHERE external_video_url IS NOT NULL;
