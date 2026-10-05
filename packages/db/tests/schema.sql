-- Run against a disposable migrated PostgreSQL database. Changes roll back.
BEGIN;
INSERT INTO x_post (id, text, url) VALUES ('9007199254740993', 'fixture', 'https://x.com/test/status/9007199254740993');
INSERT INTO x_post (id, text, url) VALUES ('9007199254740993', 'fixture', 'https://x.com/test/status/9007199254740993') ON CONFLICT (id) DO NOTHING;
INSERT INTO feed_run (id, target_count) VALUES ('00000000-0000-0000-0000-000000000001', 100);
INSERT INTO feed_observation (run_id, post_id, position, observed_at) VALUES ('00000000-0000-0000-0000-000000000001', '9007199254740993', 1, now());
INSERT INTO post_classification (post_id) VALUES ('9007199254740993');
DO $$
BEGIN
  IF (SELECT count(*) FROM x_post WHERE id = '9007199254740993') <> 1 THEN RAISE EXCEPTION 'post upsert failed'; END IF;
  IF (SELECT status FROM post_classification WHERE post_id = '9007199254740993') <> 'PENDING' THEN RAISE EXCEPTION 'pending default failed'; END IF;
  BEGIN
    INSERT INTO feed_observation (run_id, post_id, position, observed_at) VALUES ('00000000-0000-0000-0000-000000000001', '9007199254740993', 2, now());
    RAISE EXCEPTION 'duplicate observation accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO post_classification (post_id) VALUES ('missing');
    RAISE EXCEPTION 'missing post accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE post_classification SET status = 'CLASSIFIED' WHERE post_id = '9007199254740993';
    RAISE EXCEPTION 'incomplete classification accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE post_classification SET relevance_score = 1.1 WHERE post_id = '9007199254740993';
    RAISE EXCEPTION 'out of range score accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE feed_observation SET position = 0;
    RAISE EXCEPTION 'zero position accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE post_classification SET status = 'CLASSIFIED', topic = 'programming', tags = ARRAY['react'], relevance_score = 0.88, classifier = 'fixture', classifier_version = 'test-v1', classified_at = now() WHERE post_id = '9007199254740993';
ROLLBACK;
