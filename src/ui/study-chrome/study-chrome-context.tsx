/** The rule for what a student sees, given to the components below the window. Without a provider it is Studio's (everything shown). */
import { createContext, useContext, type ReactNode } from 'react';
import { STUDIO_CHROME, type StudyChrome } from './study-chrome';

const StudyChromeContext = createContext<StudyChrome>(STUDIO_CHROME);

export function StudyChromeProvider(props: { readonly value: StudyChrome; readonly children: ReactNode }) {
  return <StudyChromeContext.Provider value={props.value}>{props.children}</StudyChromeContext.Provider>;
}

export const useStudyChrome = (): StudyChrome => useContext(StudyChromeContext);
