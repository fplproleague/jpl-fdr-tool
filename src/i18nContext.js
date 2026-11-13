// De vertaalfunctie als React-context, voor kleine bouwstenen die diep in de boom zitten en geen `t`
// als prop krijgen (een FDR-cel, een mini-fixture). Zo kunnen ook hun tooltips vertaald worden
// zonder `t` door tien tussenliggende componenten te moeten doorgeven. FDRTool.jsx levert de waarde.
import { createContext, useContext } from 'react';

export const I18nContext = createContext({ t: (key) => key, language: 'nl' });

export function useI18n() {
  return useContext(I18nContext);
}
