export function newsEnabled() {
  try { return localStorage.getItem('tinygods.news') !== '0'; }
  catch { return true; }
}
