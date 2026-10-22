// API endpoint pour releases liées
import type { APIRoute } from 'astro';
import { getSupabaseServer } from '../../../lib/supabase';

export const GET: APIRoute = async ({ url }) => {
  const artistId = url.searchParams.get('artist_id');
  const labelId = url.searchParams.get('label_id');
  const genres = url.searchParams.get('genres')?.split(',').filter(Boolean) || [];
  const exclude = url.searchParams.get('exclude');
  const limit = parseInt(url.searchParams.get('limit') || '6');

  if (!artistId && !labelId && genres.length === 0) {
    return new Response(JSON.stringify({ releases: [] }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = getSupabaseServer();

  let query = supabase
    .from('releases')
    .select(`
      id, title, slug, cover_url, release_type, genres, release_date,
      artist:artists!artist_id(id, name, slug, image_url)
    `)
    .order('release_date', { ascending: false })
    .limit(limit);

  if (exclude) {
    query = query.neq('id', exclude);
  }

  // Construire la requête avec OR pour combiner plusieurs critères
  const conditions: string[] = [];

  if (artistId) {
    conditions.push(`artist_id.eq.${artistId}`);
  }
  if (labelId) {
    conditions.push(`label_id.eq.${labelId}`);
  }
  if (genres.length > 0) {
    // Pour chaque genre, on cherche les releases qui le contiennent
    genres.forEach(g => {
      conditions.push(`genres.cs.{${g}}`);
    });
  }

  if (conditions.length > 0) {
    query = query.or(conditions.join(','));
  }

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ releases: data || [] }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // Cache 1h
    },
  });
};