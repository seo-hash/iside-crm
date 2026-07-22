# CRM Platform - Guida alla Configurazione

Questa guida ti aiuterà a configurare il tuo CRM professionale con integrazione Google Sheets.

## 1. Configurazione Google Service Account

Per permettere all'applicazione di scrivere sul tuo foglio Google, segui questi passaggi:

1. Vai su [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un nuovo Progetto o selezionane uno esistente.
3. Abilita la **Google Sheets API**:
   - Clicca su "API e servizi" > "Libreria".
   - Cerca "Google Sheets API" e clicca su "Abilita".
4. Crea un **Service Account**:
   - Clicca su "API e servizi" > "Credenziali".
   - Clicca su "Crea credenziali" > "Account di servizio".
   - Dai un nome all'account (es. `crm-sheets-access`) e clicca su "Crea e continua".
   - Salta i ruoli opzionali e clicca su "Fine".
5. Genera la **Chiave JSON**:
   - Nella lista degli account di servizio, clicca sull'indirizzo email appena creato.
   - Vai nella scheda "Chiavi".
   - Clicca su "Aggiungi chiave" > "Crea nuova chiave".
   - Seleziona "JSON" e clicca su "Crea".
   - Verrà scaricato un file. Rinominalo in `credenziali.json` e inseriscilo nella cartella `my-crm-platform/`.
6. **Condividi il Foglio Google**:
   - Apri il file `credenziali.json` e copia l'indirizzo `client_email`.
   - Apri il tuo Foglio Google (quello che vuoi usare come database).
   - Clicca su "Condividi" in alto a destra.
   - Incolla l'indirizzo `client_email` del service account come "Editor".
   - Copia l'**ID dello Spreadsheet** dall'URL (la parte tra `/d/` e `/edit`).

## 2. Esempio Form Landing Page

Puoi inserire questo codice HTML nel tuo sito per inviare i lead al CRM:

```html
<form id="leadForm" action="http://localhost:3000/api/leads/form-submission" method="POST">
  <input type="text" name="nome" placeholder="Il tuo nome" required minlength="2">
  <input type="email" name="email" placeholder="La tua email" required>
  <input type="tel" name="telefono" placeholder="Telefono (opzionale)">
  <textarea name="note" placeholder="Note..."></textarea>
  
  <!-- Campi nascosti per tracciamento (opzionali) -->
  <input type="hidden" name="fonte" value="Sito Web">
  <input type="hidden" name="utm_source" value="google_ads">
  
  <button type="submit">Invia Candidatura</button>
</form>

<script>
  // Script opzionale per gestire l'invio via AJAX (senza ricaricare la pagina)
  document.getElementById('leadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
      const resp = await fetch(e.target.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await resp.json();
      if (resp.ok) {
        alert('Lead inviato con successo!');
        e.target.reset();
      } else {
        alert('Errore: ' + result.error);
      }
    } catch (err) {
      console.error(err);
      alert('Errore di connessione.');
    }
  });
</script>
```

## 3. Avvio e Deploy

### Locale
1. Installa le dipendenze: `npm install`
2. Configura il file `.env` con l'ID dello spreadsheet.
3. Avvia in sviluppo: `npm run dev`
4. Avvia in produzione: `npm start`

### Deploy
- Assicurati che il file `credenziali.json` sia caricato sul server.
- Utilizza un gestore di processi come `pm2` per mantenere l'app attiva: `pm2 start server.js --name "crm-api"`.
