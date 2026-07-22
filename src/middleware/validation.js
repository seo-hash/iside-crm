/**
 * Middleware di validazione e sanitizzazione dei dati lead
 */
const validateLead = (req, res, next) => {
  let { nome, email, telefono, note, fonte, utm_source, utm_medium, utm_campaign } = req.body;

  // Sanitizzazione base
  nome = typeof nome === 'string' ? nome.trim() : '';
  email = typeof email === 'string' ? email.trim().toLowerCase() : '';
  telefono = typeof telefono === 'string' ? telefono.trim() : '';
  
  // Validazione Nome
  if (!nome || nome.length < 2) {
    return res.status(400).json({ error: 'Il nome deve avere almeno 2 caratteri.' });
  }

  // Validazione Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Inserisci un indirizzo email valido.' });
  }

  // Validazione Telefono (opzionale, ma se presente deve essere numerico/formato base)
  if (telefono && !/^\+?[0-9\s\-]{7,20}$/.test(telefono)) {
    return res.status(400).json({ error: 'Formato numero di telefono non valido.' });
  }

  // Aggiorna il body con i dati puliti
  req.body = {
    nome,
    email,
    telefono,
    note: (note || '').trim(),
    stato: 'Nuovo', // Stato iniziale predefinito
    fonte: fonte || 'Direct',
    utm_source: utm_source || '',
    utm_medium: utm_medium || '',
    utm_campaign: utm_campaign || '',
    timestamp: new Date().toLocaleString('it-IT')
  };

  next();
};

module.exports = { validateLead };
