// API publique de Deezer depuis le navigateur : JSONP (<script> + fonction de rappel globale), car l'API
// n'accepte pas fetch depuis un autre site. Utilisé par la page album et le top 5 du profil.
export function deezerJsonp<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `barzDeezer${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    const done = () => {
      clearTimeout(timer);
      delete (window as any)[name];
      script.remove();
    };
    const timer = setTimeout(() => (done(), reject(new Error('Deezer ne répond pas'))), 8000);
    (window as any)[name] = (data: T) => (done(), resolve(data));
    script.onerror = () => (done(), reject(new Error('Deezer injoignable')));
    script.src = `https://api.deezer.com${path}${path.includes('?') ? '&' : '?'}output=jsonp&callback=${name}`;
    document.head.append(script);
  });
}
