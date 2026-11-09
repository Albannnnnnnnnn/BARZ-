-- BARZ¡ — Chiffres de l'appli pour Alban (page /stats) : des totaux seulement, rien de personnel.
-- À exécuter UNE fois dans Supabase : SQL Editor → New query → coller → Run. Relançable sans risque.
-- SECURITY DEFINER pour compter toutes les lignes malgré la RLS ; réservée à l'admin (is_barz_admin, supabase/feedback.sql).

CREATE OR REPLACE FUNCTION barz_admin_stats() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT is_barz_admin() THEN
    RAISE EXCEPTION 'Réservé à l''admin.';
  END IF;

  WITH activity AS (
    -- Une ligne par geste daté : noter, marquer écouté, mettre de côté, jouer, écrire dans le fil du vendredi
    SELECT user_id, created_at AS at FROM barz
    UNION ALL SELECT user_id, created_at FROM listened
    UNION ALL SELECT user_id, created_at FROM spin_list
    UNION ALL SELECT user_id, day::timestamptz FROM game_results
    UNION ALL SELECT user_id, created_at FROM friday_posts
  ),
  weeks AS (
    SELECT generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS w
  )
  SELECT jsonb_build_object(
    'members', (SELECT count(*) FROM profiles),
    'new_7d', (SELECT count(*) FROM profiles WHERE created_at > now() - interval '7 days'),
    'active_7d', (SELECT count(DISTINCT user_id) FROM activity WHERE at > now() - interval '7 days'),
    'active_30d', (SELECT count(DISTINCT user_id) FROM activity WHERE at > now() - interval '30 days'),
    'barz_7d', (SELECT count(*) FROM barz WHERE created_at > now() - interval '7 days'),
    'listened_7d', (SELECT count(*) FROM listened WHERE created_at > now() - interval '7 days'),
    'push_members', (SELECT count(DISTINCT user_id) FROM push_subscriptions),
    'push_devices', (SELECT count(*) FROM push_subscriptions),
    'follows_avg', (SELECT round(avg(n), 1) FROM (SELECT count(*) AS n FROM follows GROUP BY user_id) f),
    'members_10_follows', (SELECT count(*) FROM (SELECT user_id FROM follows GROUP BY user_id HAVING count(*) >= 10) f),
    'friends_pairs', (SELECT count(*) FROM friendships WHERE status = 'accepted'),
    'notifs_7d', (SELECT coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) FROM (SELECT kind, count(*) AS n FROM notifications WHERE created_at > now() - interval '7 days' GROUP BY kind) k),
    'weeks', (
      SELECT jsonb_agg(jsonb_build_object(
        'week', to_char(w, 'YYYY-MM-DD'),
        'active', (SELECT count(DISTINCT user_id) FROM activity WHERE at >= w AND at < w + interval '1 week'),
        'barz', (SELECT count(*) FROM barz WHERE created_at >= w AND created_at < w + interval '1 week'),
        'new', (SELECT count(*) FROM profiles WHERE created_at >= w AND created_at < w + interval '1 week')
      ) ORDER BY w)
      FROM weeks
    )
  ) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION barz_admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION barz_admin_stats() TO authenticated;
