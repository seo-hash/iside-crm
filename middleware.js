export default function middleware(req) {
  const authHeader = req.headers.get('authorization');

  // Recupera le variabili e puliscile da eventuali spazi invisibili
  const expectedUser = (process.env.BASIC_AUTH_USER || '').trim();
  const expectedPwd = (process.env.BASIC_AUTH_PASSWORD || '').trim();

  if (authHeader) {
    try {
      const auth = authHeader.split(' ')[1];
      const decoded = atob(auth);
      const index = decoded.indexOf(':');
      
      if (index !== -1) {
        const user = decoded.slice(0, index);
        const pwd = decoded.slice(index + 1);

        if (user === expectedUser && pwd === expectedPwd) {
          return new Response(null, {
            headers: { 'x-middleware-next': '1' },
          });
        }
      }
    } catch (e) {
      console.error("Errore decodifica auth");
    }
  }

  // Se i dati mancano o sono sbagliati, forza il popup
  return new Response('Autenticazione richiesta', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Area Riservata", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: '/(.*)',
};