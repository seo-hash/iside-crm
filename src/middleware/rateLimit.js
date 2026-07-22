/**
 * Middleware di rate limiting in memoria (semplice)
 * Per una soluzione di produzione, usare redis o express-rate-limit
 */
const rateLimitMap = new Map();

const rateLimiter = (limit, windowMs) => {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitMap.has(ip)) {
      rateLimitMap.set(ip, { count: 1, lastReset: now });
      return next();
    }

    const userData = rateLimitMap.get(ip);
    
    // Se è passato il tempo limite, resetta il conteggio
    if (now - userData.lastReset > windowMs) {
      userData.count = 1;
      userData.lastReset = now;
      return next();
    }

    // Incrementa e controlla il limite
    userData.count++;
    if (userData.count > limit) {
      return res.status(429).json({ 
        error: 'Troppe richieste. Per favore attendi prima di inviare un altro form.' 
      });
    }

    next();
  };
};

// Massimo 3 richieste ogni 60 secondi
const formSubmissionLimit = rateLimiter(3, 60 * 1000);

module.exports = { formSubmissionLimit };
