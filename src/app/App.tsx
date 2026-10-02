/**
 * The app component (step 5.1d): the ONE services provider around the plain window. Chemistry logic never lives here.
 */
import { AppProvider, type AppContextValue } from './window/context';
import { Window } from './window/window';

export function App(props: { readonly value: AppContextValue }) {
  return (
    <AppProvider value={props.value}>
      <Window />
    </AppProvider>
  );
}
