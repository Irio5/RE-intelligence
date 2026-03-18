# RE Intelligence

## Cosa è
Servizio B2C per chi vuole comprare casa. Dashboard di business 
intelligence sulle transazioni immobiliari reali, con analisi 
esplicative che interpretano i dati e guidano l'utente nella 
comprensione del mercato.
Fase 1: Milano. Obiettivo: estendibile a tutta Italia.

## Per chi è
Acquirenti privati che vogliono capire il mercato prima di fare 
un'offerta: prezzi reali per zona, trend, confronti, stima del 
prezzo giusto. L'app non mostra solo numeri e grafici, ma spiega 
cosa significano con frasi chiare e contestualizzate.

---

## Dati disponibili
Database transazioni immobiliari, ultimi 5 anni, partenza da Milano.
Fonte: CSV caricato su Supabase.

### Campi
- anno: anno della transazione (int, es. 2021)
- attoid: UUID identificativo unico della transazione
- cat: categoria catastale senza barra (es. A03, A02)
- mese: mese della transazione (int, 1-12)
- metratura: FORMATO MISTO — può essere "X mq" o "X vani" o "X.5 vani"
- posizione: coordinate GPS come stringa "longitudine, latitudine"
- prezzo: prezzo di vendita in euro (int)
- tipo: "Residenziale singolo" o "Residenziale multiplo"
- zonaOMI: codice zona OMI (es. D18)
- garage: FALSE oppure metratura garage come lista (es. ['25 mq'])
- cantina: FALSE oppure metratura cantina come lista (es. ['12 mq'])

### Conversione metratura
Dove il campo metratura è in vani, convertire in mq stimati 
con fattore 1 vano = 20 mq (es. "3.5 vani" = 70 mq).
Segnalare sempre all'utente quando un dato è basato su stima 
e non su mq reali.

---

## Funzionalità core

### 1. Mappa prezzi per zona OMI
Mappa interattiva (Leaflet) di Milano con le zone OMI colorate 
in base al prezzo medio €/mq. Scala cromatica dal verde (più 
economico) al rosso (più caro). Cliccando su una zona si vedono: 
prezzo medio €/mq, numero transazioni, trend rispetto all'anno 
precedente. Frase esplicativa sotto la mappa tipo: "La zona D18 
ha un prezzo medio di 3.200 €/mq, in crescita del 5% rispetto 
al 2023. È tra le zone più accessibili del quadrante sud-est."

### 2. Stima prezzo giusto
L'utente inserisce: zona OMI, metratura in mq, categoria catastale, 
garage (sì/no), cantina (sì/no). L'app calcola una stima del prezzo 
giusto basata sulle transazioni reali comparabili nel database.

Mostrare:
- Prezzo stimato, range min-max (percentile 25° e 75°), numero 
  transazioni usate per il calcolo
- Barra orizzontale colorata con gradiente dal rosso (costoso) al 
  verde (conveniente). Sulla barra tre indicatori posizionati:
  - Prezzo medio di mercato
  - Miglior prezzo (transazione più bassa comparabile)
  - Prezzo target dell'utente (se inserito)

Frase esplicativa tipo: "Per un A03 di 70 mq in zona D18, il prezzo 
medio è 210.000 €. Il 50% delle transazioni simili è stato chiuso 
tra 185.000 € e 240.000 €. Avere un garage aggiunge mediamente 
il 12% al valore."

Nota sotto la barra per le fasce di prezzo più basse: 
"Performance comprese all'interno dei due rettangoli più alti sono 
generalmente possibili solo per immobili da ristrutturare, che 
godono di incentivi fiscali notevoli."

### 3. Distribuzione prezzi zona
Selezionata una zona OMI, mostrare un istogramma (Recharts) della 
distribuzione dei prezzi €/mq di tutte le transazioni in quella zona. 
Asse X = fascia di prezzo €/mq, asse Y = numero transazioni.

Sull'istogramma evidenziare con linee verticali colorate:
- Percentile 10° (verde) — sotto questo è un affare raro
- Percentile 50° / mediana (giallo) — il prezzo tipico
- Percentile 90° (rosso) — sopra questo si paga un premio alto
- Prezzo target dell'utente (se inserito) come linea tratteggiata

Le fasce tra i percentili colorate con sfondo semitrasparente 
così l'utente vede immediatamente in quale fascia cade il prezzo 
che gli chiedono.

Frase esplicativa tipo: "In zona D18 il prezzo più frequente è 
tra 2.800 e 3.200 €/mq. Il 10% delle transazioni è stato chiuso 
sotto 2.200 €/mq — sotto questa soglia sono veri affari. La 
mediana è 3.050 €/mq. Ti chiedono 3.400 €/mq: sei nella fascia 
alta, sopra il 72% delle compravendite della zona."

### 4. Transazioni simili (comps)
L'utente inserisce i parametri dell'immobile che sta valutando 
(zona OMI, metratura, categoria catastale, garage, cantina). 
L'app trova e mostra le transazioni più simili nel database, 
ordinate per somiglianza.

Mostrare come tabella con colonne: data (mese/anno), prezzo, 
mq, €/mq, categoria, garage, cantina, zona OMI. 
Evidenziare in verde le transazioni con €/mq sotto la mediana, 
in rosso quelle sopra.

Criteri di somiglianza (in ordine di peso):
- Stessa zona OMI
- Metratura simile (±20%)
- Stessa categoria catastale
- Stessi accessori (garage/cantina)

Frase esplicativa tipo: "Abbiamo trovato 23 transazioni simili 
alla tua ricerca. Il prezzo medio è stato 215.000 €, con un 
€/mq medio di 3.070. Le 5 transazioni più recenti mostrano un 
trend in leggera crescita (+3% rispetto a 12 mesi fa).
Queste saranno le tue prove oggettive per negoziare."

### 5. Trend €/mq nel tempo
Grafico scatter plot (Recharts). Asse X = tempo (mese/anno), 
asse Y = €/mq. Ogni punto è una singola transazione. 
L'utente seleziona una o più zone OMI da visualizzare.

Sovrapposta ai punti, una linea di tendenza (media mobile) che 
mostra l'andamento generale. Se l'utente seleziona più zone, 
ogni zona ha un colore diverso con la propria linea di tendenza.

Filtri: periodo temporale, categoria catastale, range metratura.

Frase esplicativa tipo: "In zona D18 il prezzo medio €/mq è 
passato da 2.800 nel 2021 a 3.200 nel 2025, una crescita del 
14% in 4 anni (+3,3% annuo). Negli ultimi 6 mesi il trend si 
è stabilizzato. Zona C1 nello stesso periodo è cresciuta del 
22%, suggerendo una pressione maggiore verso il centro."

### 6. Premium garage e cantina
Analisi dell'impatto sul prezzo €/mq di avere garage e/o cantina.
Per la zona OMI selezionata, mostrare un grafico a barre 
raggruppate (Recharts) con 4 categorie:
- Senza garage né cantina
- Solo garage
- Solo cantina
- Garage + cantina

Ogni barra mostra il prezzo medio €/mq di quella categoria.
Differenza percentuale rispetto alla categoria base (senza 
garage né cantina) evidenziata sopra ogni barra.

Frase esplicativa tipo: "In zona D18, un immobile con garage 
vale mediamente il 10% in più rispetto a uno senza (3.350 vs 
3.050 €/mq). La cantina aggiunge circa il 4%. Averli entrambi 
porta un premio complessivo del 13%, ma attenzione: il premium 
del garage si sta riducendo negli ultimi 2 anni, passando dal 
14% al 10%."

### 7. Confronto zone
L'utente seleziona 2 o più zone OMI da confrontare. 
Mostrare una tabella comparativa con per ogni zona:
- Prezzo medio €/mq
- Mediana €/mq
- Numero transazioni nel periodo
- Trend % rispetto all'anno precedente
- % transazioni con garage
- % transazioni con cantina
- Categoria catastale prevalente

Affiancare alla tabella un radar chart (Recharts) che 
visualizza le zone su più assi: prezzo, trend, volume 
transazioni, accessori. L'utente vede a colpo d'occhio 
i punti di forza e debolezza di ogni zona.

Frase esplicativa tipo: "Zona D18 vs zona C1: D18 costa 
il 28% in meno (3.050 vs 4.250 €/mq) ma ha meno 
transazioni (-40%), segnale di un mercato meno liquido. 
Il trend di crescita di D18 (+3,3% annuo) è però superiore 
a C1 (+2,1%), suggerendo un potenziale di rivalutazione. 
Se cerchi valore a lungo termine, D18 offre un ingresso 
più accessibile con margine di crescita."

### 8. Impatto categoria catastale
Per la zona OMI selezionata, mostrare un grafico a barre 
(Recharts) con le categorie catastali sull'asse X e il 
prezzo medio €/mq sull'asse Y. Ogni barra mostra anche 
il numero di transazioni come etichetta.

Affiancare un grafico a barre orizzontali che mostra la 
distribuzione percentuale delle transazioni per categoria 
catastale nella zona.

Sezione didattica chiara per l'utente:
"Cos'è la categoria catastale? È la classificazione che 
lo Stato dà a un immobile. Non è solo un'etichetta — 
determina quanto paghi di tasse ogni anno (IMU, TARI) 
e il valore catastale su cui si calcolano imposte di 
acquisto."
- A/2 (civile): immobile di buon livello, rendita 
  catastale più alta → tasse annuali più alte
- A/3 (economica): standard, rendita media → tasse 
  nella norma
- A/4 (popolare): livello base, rendita bassa → tasse 
  più basse

Grafico premium a barre raggruppate che confronta 
direttamente A/2 vs A/3 vs A/4 nella stessa zona:
- Prezzo medio €/mq per ciascuna
- Differenza % rispetto alla categoria più economica
- Indicazione del costo fiscale annuo stimato per 
  ciascuna (IMU + TARI indicativi)

Frase esplicativa tipo: "In zona D18, un A/2 costa in 
media 3.600 €/mq contro i 3.050 di un A/3: paghi il 
18% in più all'acquisto. Ma attenzione: un A/2 costa 
di più anche dopo. Le tasse annuali (IMU, TARI) su un 
A/2 di 70 mq possono superare quelle di un A/3 
equivalente di 400-600 € l'anno. Su 10 anni sono 
4.000-6.000 € in più. Valuta se il livello di finitura 
giustifica davvero questo doppio sovrapprezzo."

---

## Tech Stack
- Framework: Next.js 14+ con App Router, React, TypeScript
- Stile e componenti UI: Tailwind CSS + shadcn/ui
- Grafici: Recharts
- Mappe: Leaflet (react-leaflet) con tiles OpenStreetMap
- Database: Supabase (PostgreSQL cloud)
- Accesso dati: supabase-js (client diretto, no ORM)
- Autenticazione: Supabase Auth
- Deploy: Vercel (frontend) + Supabase (database)

---

## Convenzioni
- UI e testi utente tutto in italiano
- Commenti nel codice in inglese
- Ogni componente in file separato
- API routes in /app/api/
- Componenti riutilizzabili in /components/ui/
- Componenti specifici dashboard in /components/dashboard/
- Tipi TypeScript in /types/
- Utilities e funzioni di calcolo in /lib/
- Client Supabase inizializzato in /lib/supabase.ts
- Le frasi esplicative sono parte integrante di ogni vista, 
  non opzionali. Devono essere generate dinamicamente in 
  base ai dati reali, non statiche.
- Ogni dato basato su stima (es. mq convertiti da vani) 
  deve essere segnalato all'utente con un indicatore visivo.
