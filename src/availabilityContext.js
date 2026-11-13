// De beschikbaarheid (src/availability.js) als React-context, zodat PlayerCell en andere kleine
// bouwstenen ze overal kunnen tonen zonder dat elke tab ze als prop moet doorgeven. FDRTool.jsx levert
// de opzoekfunctie, gebouwd uit de spelersdatabank en de Verwachte XI's.
import { createContext, useContext } from 'react';

const noLookup = () => null;

export const AvailabilityContext = createContext(noLookup);

// Status van één speler ({ kind, tone, labelKey, titleKey, vars } of null).
export function useAvailability(name, clubCode) {
  return useContext(AvailabilityContext)(name, clubCode);
}

// De opzoekfunctie zelf, voor lijsten die zelf moeten filteren.
export function useAvailabilityLookup() {
  return useContext(AvailabilityContext);
}
