export function fmtDate(iso) {
  if (!iso) return 'Not set';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

// "Auto" = the nearest unreleased version by target date; falls back to the
// first unreleased version, then the first version at all.
export function pickAutoVersion(versions) {
  const open = versions.filter(v => !v.released);
  const dated = open.filter(v => v.releaseDate).sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));
  if (dated.length) return dated[0].id;
  if (open.length) return open[0].id;
  return versions[0]?.id ?? null;
}
