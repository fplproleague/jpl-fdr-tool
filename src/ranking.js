// Gedeelde rangnummering voor de ranglijsten op Bonuspunten en Kaarten.
//
// Tot nu toe was de rang gewoon de rijpositie: de eerste rij 1, de tweede 2, enzovoort. Bij gelijke
// waarden geeft dat een verschil dat er niet is — twee spelers met allebei 4 gele kaarten stonden op
// 3 en 4, en welke van de twee op 3 stond hing af van een tiebreaker die nergens zichtbaar is (de
// alfabetische volgorde van hun naam). Je las dus een verschil in de nummering dat je niet terugvond
// in de cijfers ernaast.
//
// Hier staat de sportieve standaard ("competition ranking", 1-2-2-4): gelijke waarde = gelijke rang,
// en de volgende rang slaat evenveel plaatsen over als er gedeeld werden. Zo blijft de rang van
// iedereen eronder hetzelfde als bij een doorlopende nummering — een speler op plaats 10 staat op 10,
// of er nu een ex aequo boven hem staat of niet.

// `valueOf` haalt de waarde waarop gerangschikt is uit een entry. Dat moet dezelfde waarde zijn als
// waarop de lijst gesorteerd staat én die de gebruiker in de rij ziet staan; anders krijgen twee rijen
// met hetzelfde zichtbare cijfer alsnog een andere rang. De lijst moet al gesorteerd binnenkomen.
export function assignCompetitionRanks(sorted, valueOf) {
  let vorigeWaarde;
  let vorigeRang = 0;
  return sorted.map((entry, index) => {
    const waarde = valueOf(entry);
    // Object.is i.p.v. ===: vangt ook een lijst waarin een ontbrekende statistiek als NaN binnenkomt,
    // zodat twee even onbekende waarden niet elk een eigen rang krijgen.
    const rank = index > 0 && Object.is(waarde, vorigeWaarde) ? vorigeRang : index + 1;
    vorigeWaarde = waarde;
    vorigeRang = rank;
    return { ...entry, rank };
  });
}
