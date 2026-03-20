/**
 * Official OMI zone codes for Milan with human-readable descriptions.
 * Zones without an official description are kept as empty string placeholders.
 */
const ZONE_OMI: Record<string, string> = {
  B12: "Centro Storico - Duomo, San Babila, Montenapoleone",
  B13: "Centro Storico - Università Statale, San Lorenzo",
  B15: "Centro Storico - Brera",
  B16: "Centro Storico - Sant'Ambrogio, Cadorna, Via Dante",
  B17: "Parco Sempione, Arco della Pace, Corso Magenta",
  B18: "Turati, Moscova, Corso Venezia",
  B19: "Venezia, Porta Vittoria, Porta Romana",
  B20: "Porta Vigentina, Porta Romana",
  B21: "Porta Ticinese, Porta Genova, Via San Vittore",
  C12: "Pisani, Buenos Aires, Regina Giovanna",
  C13: "City Life",
  C14: "Porta Nuova",
  C15: "Stazione Centrale, Viale Stelvio",
  C16: "Cenisio, Farini, Sarpi",
  C17: "Sempione, Pagano, Washington",
  C18: "Solari, Porta Genova, Ascanio Sforza",
  C19: "Tabacchi, Sarfatti, Crema",
  C20: "Libia, XXII Marzo, Indipendenza",
  D10: "Parco Lambro, Feltre, Udine",
  D12: "Piola, Argonne, Corsica",
  D13: "Lambrate, Rubattino, Rombon",
  D15: "Forlanini, Mecenate, Ortomercato, Santa Giulia",
  D16: "Tito Livio, Tertulliano, Longanesi",
  D18: "Marocchetti, Vigentino, Chiesa Rossa",
  D20: "Ortles, Spadolini, Bazzi",
  D21: "Barona, Famagosta, Faenza",
  D24: "Segesta, Aretusa, Vespri Siciliani",
  D25: "Lorenteggio, Inganni, Bisceglie, San Carlo B.",
  D28: "Ippodromo, Caprilli, Monte Stella",
  D30: "Musocco, Certosa, Expo, C.na Merlata",
  D31: "Bovisa, Bausan, Imbonati",
  D32: "Bovisasca, Affori, P. Rossi, Comasina",
  D33: "Niguarda, Bignami, Parco Nord",
  D34: "Sarca, Bicocca",
  D35: "Monza, Crescenzago, Gorla, Quartiere Adriano",
  D36: "Maggiolina, Parco Trotter, Leoncavallo",
  E5:  "Baggio, Q. Romano, Muggiano",
  E6:  "Gallaratese, Lampugnano, P. Trenno, Bonola",
  E7:  "Missaglia, Gratosoglio",
  E8:  "Quarto Oggiaro, Sacco",
  R2:  "Ronchetto, Chiaravalle, Ripamonti",
};

/**
 * Returns a formatted label for an OMI zone code.
 * Examples:
 *   getZonaLabel("B17") → "B17 - Parco Sempione, Arco della Pace, Corso Magenta"
 *   getZonaLabel("D25") → "D25"   (no description available)
 *   getZonaLabel("XYZ") → "XYZ"   (unknown code)
 */
export function getZonaLabel(codice: string): string {
  const descrizione = ZONE_OMI[codice];
  if (descrizione === undefined || descrizione === "") return codice;
  return `${codice} - ${descrizione}`;
}

/**
 * Returns all known OMI zone codes, sorted alphabetically.
 */
export function getAllZoneCodes(): string[] {
  return Object.keys(ZONE_OMI).sort();
}
